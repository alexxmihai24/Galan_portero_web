// npm test   (lógica pura: no toca Supabase ni Stripe)
// Los permisos de la base de datos se prueban contra Supabase con `npm run probar:supabase`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPedido, ErrorPedido, ENVIO_CENT } from '../src/lib/pedido.ts';
import * as auth from '../src/lib/auth.ts';

const catalogo = new Map([
  [1, { sku: 1, nombre: 'Solera Fundador', formato: 'Botella 50 cl', precio_cent: 1700, stock: null, activo: true }],
  [2, { sku: 2, nombre: 'Cosecha', formato: 'Botella 75 cl', precio_cent: 1100, stock: 3, activo: true }],
  [3, { sku: 3, nombre: 'Retirado', formato: 'Botella', precio_cent: 500, stock: null, activo: false }],
]);

test('calcula con precios del servidor, no del navegador, y cobra envío por debajo de 100 €', () => {
  const c = calcularPedido([{ sku: 1, unidades: 2, precio_cent: 1 }], catalogo);
  assert.equal(c.subtotal_cent, 3400);
  assert.equal(c.envio_cent, ENVIO_CENT);
  assert.equal(c.total_cent, 3400 + ENVIO_CENT);
});

test('envío gratis desde 100 € y junta líneas repetidas', () => {
  const c = calcularPedido([{ sku: 1, unidades: 3 }, { sku: 1, unidades: 3 }], catalogo);
  assert.equal(c.lineas.length, 1);
  assert.equal(c.lineas[0]!.unidades, 6);
  assert.equal(c.subtotal_cent, 10200);
  assert.equal(c.envio_cent, 0);
});

test('rechaza cesta vacía, unidades raras, productos retirados y falta de stock', () => {
  assert.throws(() => calcularPedido([], catalogo), ErrorPedido);
  assert.throws(() => calcularPedido('x', catalogo), ErrorPedido);
  assert.throws(() => calcularPedido(null, catalogo), ErrorPedido);
  assert.throws(() => calcularPedido([{ sku: 1, unidades: 0 }], catalogo), ErrorPedido);
  assert.throws(() => calcularPedido([{ sku: 1, unidades: -2 }], catalogo), ErrorPedido);
  assert.throws(() => calcularPedido([{ sku: 1, unidades: 1.5 }], catalogo), ErrorPedido);
  assert.throws(() => calcularPedido([{ sku: '1 OR 1=1', unidades: 1 }], catalogo), ErrorPedido);
  assert.throws(() => calcularPedido([{ sku: 3, unidades: 1 }], catalogo), /ya no está a la venta/);
  assert.throws(() => calcularPedido([{ sku: 99, unidades: 1 }], catalogo), ErrorPedido);
  assert.throws(() => calcularPedido([{ sku: 2, unidades: 4 }], catalogo), /Solo quedan 3/);
  assert.throws(() => calcularPedido([{ sku: 1, unidades: 100 }], catalogo), /Máximo/);
  assert.throws(() => calcularPedido(Array.from({ length: 51 }, () => ({ sku: 1, unidades: 1 })), catalogo), /Demasiadas/);
});

test('rutaSegura solo deja volver a rutas de esta web', () => {
  assert.equal(auth.rutaSegura('/cesta'), '/cesta');
  assert.equal(auth.rutaSegura('/cuenta/pedidos/12?pagado=1#arriba'), '/cuenta/pedidos/12?pagado=1#arriba');
  assert.equal(auth.rutaSegura(null), '/cuenta');
  assert.equal(auth.rutaSegura('', '/admin'), '/admin');
  // Todas estas acaban en otra web si se mandan tal cual al navegador.
  const ataques = [
    '//malo.com',
    '///malo.com',
    'https://malo.com',
    'http:malo.com',
    'javascript:alert(1)',
    '/\\malo.com',
    '/\t/malo.com', // el navegador quita el tabulador: //malo.com (fallo real de la versión anterior)
    '/\n/malo.com',
    '/\r/malo.com',
    '/.//malo.com',
    '/%2e//malo.com',
    '\\\\malo.com',
    ' /malo',
  ];
  for (const a of ataques) {
    const r = auth.rutaSegura(a);
    assert.equal(new URL(r, 'https://bodegasgalanportero.com').origin, 'https://bodegasgalanportero.com', `${JSON.stringify(a)} -> ${r}`);
    assert.ok(!r.startsWith('//'), `${JSON.stringify(a)} -> ${r}`);
  }
  // Codificado sigue siendo una ruta interna, inofensiva.
  assert.equal(new URL(auth.rutaSegura('/%2F%2Fmalo.com'), 'https://x.es').host, 'x.es');
});

test('el rol de admin solo sale de app_metadata, nunca de user_metadata', () => {
  const base = { id: 'u1', email: 'ana@correo.es' };
  assert.equal(auth.usuarioDe({ ...base, app_metadata: { rol: 'admin' } }).rol, 'admin');
  assert.equal(auth.usuarioDe({ ...base, user_metadata: { rol: 'admin' } }).rol, 'cliente');
  assert.equal(auth.usuarioDe({ ...base, app_metadata: { rol: 'ADMIN' } }).rol, 'cliente');
  assert.equal(auth.usuarioDe({ ...base, app_metadata: { rol: ['admin'] } }).rol, 'cliente');
  assert.equal(auth.usuarioDe({ ...base, user_metadata: { nombre: '  Ana  ' } }).nombre, 'Ana');
  assert.equal(auth.usuarioDe(base).nombre, 'ana', 'sin nombre, la parte del correo');
});

test('freno de fuerza bruta: 5 fallos bloquean 15 minutos', () => {
  const email = `freno-${Date.now()}@correo.es`;
  const t0 = Date.now();
  for (let i = 0; i < 4; i++) auth.anotarFallo(email, t0);
  assert.equal(auth.bloqueado(email, t0), false);
  auth.anotarFallo(email, t0);
  assert.equal(auth.bloqueado(email, t0), true);
  assert.equal(auth.bloqueado(email, t0 + 16 * 60_000), false, 'pasada la ventana se libera');
  auth.anotarFallo(email, t0);
  auth.olvidarFallos(email);
  assert.equal(auth.bloqueado(email, t0), false);
});

test('registro: valida correo, nombre y contraseña (8 a 72 bytes)', () => {
  assert.deepEqual(auth.validarRegistro({ email: ' Ana@Correo.ES ', nombre: ' Ana ', password: 'uva-pasa-1950' }), {
    email: 'ana@correo.es',
    nombre: 'Ana',
    password: 'uva-pasa-1950',
  });
  assert.throws(() => auth.validarRegistro({ email: 'mal', nombre: 'Ana', password: 'uva-pasa-1950' }), auth.ErrorAuth);
  assert.throws(() => auth.validarRegistro({ email: 'a@b.es', nombre: 'A', password: 'uva-pasa-1950' }), /nombre/);
  assert.throws(() => auth.validarClave('corta'), /8 caracteres/);
  assert.throws(() => auth.validarClave('ñ'.repeat(40)), /larga/, '80 bytes en UTF-8');
  assert.doesNotThrow(() => auth.validarClave('a'.repeat(72)));
});

test('cambiar contraseña sin la actual: solo con un enlace de recuperación de hace menos de 15 min', () => {
  const ahora = Date.now();
  const s = Math.floor(ahora / 1000);
  assert.equal(auth.recuperacionReciente([{ method: 'recovery', timestamp: s - 60 }], ahora), true);
  assert.equal(auth.recuperacionReciente([{ method: 'otp', timestamp: s - 60 }], ahora), true);
  assert.equal(auth.recuperacionReciente([{ method: 'recovery', timestamp: s - 16 * 60 }], ahora), false);
  assert.equal(auth.recuperacionReciente([{ method: 'password', timestamp: s }], ahora), false);
  assert.equal(auth.recuperacionReciente(undefined, ahora), false);
  assert.equal(auth.recuperacionReciente(['otp'], ahora), false, 'sin hora no se puede saber si es reciente');
});

test('los errores de Supabase se traducen sin revelar detalles internos', () => {
  assert.match(auth.mensajeAuth({ code: 'invalid_credentials' }), /incorrectos/);
  assert.match(auth.mensajeAuth({ status: 429 }), /Espera/);
  assert.match(auth.mensajeAuth({ code: 'algo_raro', status: 500 }), /Inténtalo de nuevo/);
});

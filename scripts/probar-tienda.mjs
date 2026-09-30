// Prueba de extremo a extremo de la tienda en un navegador de verdad, contra el Supabase de .env.
//   npm run dev   (en otra terminal)
//   npm run probar [-- http://localhost:4321]
// No envía correos: los enlaces de confirmar cuenta y recuperar contraseña se generan con la API de
// administración. Todo lo que crea (cliente prueba+…@ejemplo.es, pedidos, precio cambiado) se deshace al final.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { borrarUsuarios, cambiarRol, CLAVE, confirmarPago, correoPrueba, crearPedido, recordarProductos, servicio } from './lib-pruebas.mjs';

const base = process.argv[2] ?? 'http://localhost:4321';
const email = correoPrueba('e2e');
const CLAVE_NUEVA = 'Solera-de-1950!';
const nav = await chromium.launch();
const contexto = await nav.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(e.message));

let paso = 0;
const ok = (texto) => console.log(`  ✔ ${++paso}. ${texto}`);
// Los precios llevan espacio no separable antes del €.
const texto = async (loc) => (await loc.textContent()).replace(/\s+/g, ' ').trim();
const contador = () => pagina.locator('.boton-cesta [data-cesta-contador]').textContent();
const ir = (ruta) => pagina.goto(base + ruta, { waitUntil: 'networkidle' });
const entrar = async (clave = CLAVE, volver = '') => {
  await ir('/cuenta/entrar' + volver);
  await pagina.getByLabel('Correo electrónico').fill(email);
  await pagina.getByLabel('Contraseña').fill(clave);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  await pagina.waitForLoadState('networkidle');
};
const salir = async () => {
  await ir('/cuenta');
  await pagina.getByRole('button', { name: 'Cerrar sesión' }).click();
  await pagina.waitForURL(base + '/');
};
/** Enlace de un solo uso como el del correo (sin enviarlo). */
const enlace = async (tipo) => {
  const { data, error } = await servicio.auth.admin.generateLink(
    tipo === 'signup' ? { type: 'signup', email, password: CLAVE, options: { data: { nombre: 'Cliente de Prueba' } } } : { type: 'recovery', email },
  );
  if (error) throw new Error(`generateLink ${tipo}: ${error.message}`);
  return { usuario: data.user, token: data.properties.hashed_token };
};

let usuario;
let restaurarProductos = async () => {};
try {
  await ir('/'); // la primera lectura del catálogo da de alta los productos en Supabase
  restaurarProductos = await recordarProductos([321, 343]);
  await pagina.locator('.bloque [data-anadir]').first().click();
  assert.equal(await contador(), '1');
  await pagina.locator('[data-aviso-cesta]').waitFor({ state: 'visible' });
  ok('portada: añadir desde 5 Essences sube el contador y avisa');

  await ir('/vinos/pedro-ximenez-solera-fundador');
  await pagina.getByRole('radio', { name: /^Caja de 6/ }).check();
  assert.equal(await texto(pagina.locator('[data-total]')), '102,00 €');
  await pagina.locator('.compra__boton').click();
  assert.equal(await contador(), '2');
  ok('ficha: elegir caja de 6 recalcula el total y la añade');

  await pagina.locator('.boton-cesta').click();
  const panel = pagina.locator('dialog[data-cesta]');
  await panel.locator('[data-linea]').nth(1).waitFor();
  assert.equal(await panel.locator('[data-linea]').count(), 2);
  assert.equal(await panel.locator('[data-cesta-envio-coste]').textContent(), 'Gratis');
  const antes = await texto(panel.locator('[data-cesta-subtotal]'));
  await panel.locator('[data-linea]').first().locator('[data-quitar]').click();
  await panel.locator('[data-linea]').first().locator('[data-mas]').click();
  assert.equal(await texto(panel.locator('[data-cesta-subtotal]')), '204,00 €', `antes: ${antes}`);
  ok('panel de la cesta: totales, envío gratis, quitar y sumar');

  await panel.locator('[data-pagar]').click();
  await pagina.waitForURL(/\/cuenta\/entrar\?volver=(%2F|\/)cesta/);
  ok('pagar sin sesión lleva a entrar (y guarda volver=/cesta)');

  // Registro: la validación del servidor no depende del navegador (y no llega a Supabase).
  const sinEdad = await fetch(base + '/cuenta/registro', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ nombre: 'X Y', email, password: CLAVE, privacidad: 'si' }),
  });
  assert.equal(sinEdad.status, 400);
  assert.match(await sinEdad.text(), /mayor de 18/);
  ok('registro: el servidor rechaza a quien no marca que es mayor de edad');

  // Confirmar la cuenta con el enlace del correo.
  const alta = await enlace('signup');
  usuario = alta.usuario;
  await entrar();
  assert.match(await pagina.locator('.caja-cuenta [role=alert]').textContent(), /confirma tu correo/i);
  await ir(`/cuenta/confirmar?token_hash=${alta.token}&type=email`);
  assert.ok(pagina.url().includes('/cuenta/confirmar'), 'abrir el enlace NO confirma (antivirus del correo)');
  await pagina.getByRole('button', { name: /Confirmar mi correo/ }).click();
  await pagina.waitForURL(base + '/cuenta?bienvenida=1');
  await pagina.getByText('Correo confirmado').waitFor();
  ok('sin confirmar no se entra; el enlace del correo pide un clic y deja la sesión abierta');

  await ir(`/cuenta/confirmar?token_hash=${alta.token}&type=email`);
  await pagina.getByRole('button', { name: /Confirmar mi correo/ }).click();
  await pagina.getByText('ya no vale').waitFor();
  ok('el mismo enlace no sirve dos veces');

  const cookies = (await contexto.cookies()).filter((c) => c.name.startsWith('sb-'));
  assert.ok(cookies.length > 0 && cookies.every((c) => c.httpOnly && c.sameSite === 'Lax'), JSON.stringify(cookies.map((c) => [c.name, c.httpOnly, c.sameSite])));
  const privada = await pagina.goto(base + '/cuenta');
  assert.match(privada.headers()['cache-control'] ?? '', /no-store/);
  ok('cookies de sesión httpOnly + SameSite=Lax; /cuenta con Cache-Control: no-store');

  await ir('/cesta');
  await pagina.locator('.cesta-pagina [data-pagar]').click();
  const error = pagina.locator('.cesta-pagina [data-cesta-error]');
  await error.waitFor({ state: 'visible' });
  const mensaje = await texto(error);
  assert.ok(/Stripe|pago/.test(mensaje), mensaje);
  ok(`pagar con sesión llega al servidor («${mensaje.slice(0, 60)}…»)`);

  // Pedido pagado, como lo dejaría el webhook de Stripe.
  const { id, sesion } = await crearPedido(usuario, [{ sku: 321, nombre: 'Solera Fundador', formato: 'Botella 50 cl', unidades: 2, precio_cent: 1700 }]);
  assert.equal(await confirmarPago(sesion, 'Cliente de Prueba', 'Calle Real 1, 14550 Montilla, ES'), true);

  await ir('/cuenta');
  await pagina.getByText(`Pedido nº ${id}`).waitFor();
  assert.ok(await pagina.getByText('Pagado · preparando').isVisible());
  assert.ok(await pagina.locator('.comprado__nombre', { hasText: 'Solera Fundador' }).isVisible());
  ok('mi cuenta: lista el pedido pagado y «Tus vinos»');

  await pagina.getByText(`Pedido nº ${id}`).click();
  await pagina.waitForURL(base + `/cuenta/pedidos/${id}`);
  assert.ok(await pagina.getByText('Calle Real 1, 14550 Montilla, ES').isVisible());
  const unidadesEnCesta = () => pagina.evaluate(() => JSON.parse(localStorage.getItem('gp-cesta') ?? '[]').reduce((n, l) => n + l.unidades, 0));
  const enCesta = await unidadesEnCesta();
  await pagina.getByRole('button', { name: 'Volver a pedir' }).click();
  assert.equal(await unidadesEnCesta(), enCesta + 2);
  ok('detalle del pedido: dirección y «Volver a pedir» a la cesta');

  assert.equal((await pagina.goto(base + `/cuenta/pedidos/${id + 100000}`)).status(), 404);
  assert.equal((await pagina.goto(base + '/cuenta/pedidos/abc')).status(), 404);
  ok('un pedido que no es tuyo (o no existe) da 404');

  assert.equal((await pagina.goto(base + '/admin')).status(), 403);
  assert.equal((await pagina.goto(base + '/admin/productos')).status(), 403);
  ok('un cliente no puede entrar al panel (403)');

  await cambiarRol(usuario.id, true);
  await ir('/admin');
  assert.ok(await pagina.getByRole('cell', { name: `nº ${id}` }).isVisible());
  await ir(`/admin/pedidos/${id}`);
  await pagina.getByRole('button', { name: 'Marcar como enviado' }).click();
  await pagina.getByText('Estado cambiado a «Enviado»').waitFor();
  await ir(`/cuenta/pedidos/${id}`);
  assert.ok(await pagina.locator('.detalle__cabeza .estado--enviado').isVisible());
  ok('dar admin (app_metadata) vale sin volver a entrar; marca enviado y el cliente lo ve');

  await ir('/admin/productos');
  await pagina.locator('#p-343-precio').fill('12.50');
  await pagina.locator('#p-343 button').click();
  await pagina.waitForURL(/guardado=343/);
  assert.equal(await pagina.locator('#p-343-precio').inputValue(), '12.50');
  await ir('/vinos/pedro-ximenez-5-essences');
  assert.ok(await pagina.locator('.formato__precio', { hasText: /12,50/ }).first().isVisible());
  await restaurarProductos();
  ok('admin: cambiar un precio se refleja en la ficha (y se deja como estaba)');

  await ir('/admin/clientes');
  assert.ok(await pagina.getByText(email).isVisible());
  ok('admin: lista de clientes');

  await cambiarRol(usuario.id, false);
  assert.equal((await pagina.goto(base + '/admin')).status(), 403);
  ok('quitar el admin surte efecto en la siguiente página');

  // --- seguridad -------------------------------------------------------------------------------
  const json = { 'content-type': 'application/json' };
  const webhook = (await fetch(base + '/api/stripe/webhook', { method: 'POST', headers: json, body: '{}' })).status;
  assert.ok([400, 503].includes(webhook), String(webhook));
  const ajeno = await fetch(base + '/api/checkout', { method: 'POST', headers: { ...json, origin: 'https://malo.example' }, body: '{}' });
  assert.equal(ajeno.status, 403);
  const formularioAjeno = await fetch(base + '/cuenta/entrar', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://malo.example' },
    body: 'email=a&password=b',
  });
  assert.equal(formularioAjeno.status, 403);
  ok(`checkout y formularios rechazan otros orígenes (403); el webhook sin firma válida no pasa (${webhook})`);

  await salir();
  for (const ruta of ['/%61dmin', '/admin/', '/cuenta/pedidos/1', '/%63uenta']) {
    const r = await fetch(base + ruta, { redirect: 'manual' });
    assert.ok([302, 303].includes(r.status) && r.headers.get('location').includes('/cuenta/entrar'), `${ruta}: ${r.status}`);
  }
  ok('sin sesión, /admin y /cuenta (también codificadas) llevan a entrar');

  // Redirección abierta: el tabulador pasaba el filtro antiguo y el navegador acababa en otra web.
  await entrar(CLAVE, '?volver=%2F%09%2Fmalo.example');
  assert.equal(new URL(pagina.url()).origin, base, pagina.url());
  ok(`entrar con ?volver=/<tab>/malo.example se queda en la web (${new URL(pagina.url()).pathname})`);

  await ir('/cuenta/clave');
  assert.ok(pagina.url().includes('/cuenta/recuperar?aviso=caducado'), pagina.url());
  ok('con una sesión de contraseña (o robada) no se puede cambiar la contraseña sin un enlace del correo');
  await salir();

  // Recuperar contraseña con el enlace del correo.
  const recuperar = await fetch(base + '/cuenta/recuperar', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base },
    body: new URLSearchParams({ email: correoPrueba('no-existe') }),
  });
  assert.match(await recuperar.text(), /Si hay una cuenta/);
  const { token } = await enlace('recovery');
  await ir(`/cuenta/confirmar?token_hash=${token}&type=recovery`);
  await pagina.getByRole('button', { name: 'Elegir contraseña nueva' }).click();
  await pagina.waitForURL(base + '/cuenta/clave');
  await pagina.getByLabel('Contraseña nueva').fill(CLAVE_NUEVA);
  await pagina.getByLabel('Repítela').fill(CLAVE_NUEVA);
  await pagina.getByRole('button', { name: 'Guardar la contraseña' }).click();
  await pagina.waitForURL(base + '/cuenta?aviso=clave');
  await salir();
  await entrar(CLAVE);
  assert.match(await pagina.locator('.caja-cuenta [role=alert]').textContent(), /incorrectos/);
  await entrar(CLAVE_NUEVA);
  assert.equal(new URL(pagina.url()).pathname, '/cuenta');
  ok('recuperar contraseña: no revela si el correo existe; el enlace lleva a elegir otra; la antigua deja de valer');

  await salir();
  await ir('/cuenta');
  assert.ok(pagina.url().includes('/cuenta/entrar'));
  ok('cerrar sesión y /cuenta vuelve a pedir entrar');

  assert.deepEqual(errores, [], 'errores de JavaScript en la página');
  console.log(`\nTodo bien: ${paso} comprobaciones.`);
} finally {
  await restaurarProductos().catch(() => {});
  await borrarUsuarios([usuario ?? (await servicio.auth.admin.listUsers()).data.users.find((u) => u.email === email)]);
  await nav.close();
}

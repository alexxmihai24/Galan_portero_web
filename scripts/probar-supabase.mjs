// Comprueba contra el proyecto de Supabase que los permisos (RLS, privilegios, funciones) y la
// lógica de pedidos hacen lo que dice supabase/schema.sql. No necesita la web arrancada.
//   npm run probar:supabase
// Crea dos clientes de prueba (prueba+…@ejemplo.es, ya confirmados: no se envía ningún correo) y un
// producto de prueba (SKU 990001); al terminar lo borra todo.
import assert from 'node:assert/strict';
import { usuarioDe } from '../src/lib/auth.ts';
import {
  anonimo,
  borrarUsuarios,
  confirmarPago,
  correoPrueba,
  crearPedido,
  crearUsuario,
  servicio,
  sesionDe,
} from './lib-pruebas.mjs';

const SKU = 990001;
let paso = 0;
const ok = (texto) => console.log(`  ✔ ${++paso}. ${texto}`);
/** La operación tiene que fallar o no devolver nada (según el caso, Postgres niega o RLS filtra). */
const negado = (r, que) => assert.ok(r.error || (Array.isArray(r.data) && r.data.length === 0) || r.data === null, `${que}: ${JSON.stringify(r.data)}`);
const prohibido = (r, que) => assert.ok(r.error, `${que} debería dar error y ha devuelto ${JSON.stringify(r.data)}`);

let ana, luis;
try {
  // --- visitante anónimo (clave publicable, sin sesión) ---------------------------------------
  const anon = anonimo();
  const cat = await anon.from('productos').select('sku, precio_cent').limit(3);
  assert.ifError(cat.error);
  ok(`anónimo lee el catálogo (${cat.data.length} filas de muestra)`);
  negado(await anon.from('pedidos').select('*'), 'anónimo lee pedidos');
  negado(await anon.from('lineas').select('*'), 'anónimo lee líneas');
  negado(await anon.from('perfiles').select('*'), 'anónimo lee perfiles');
  prohibido(await anon.from('productos').update({ precio_cent: 1 }).eq('sku', 321).select(), 'anónimo cambia precios');
  prohibido(await anon.from('productos').insert({ sku: SKU + 1, precio_cent: 1 }), 'anónimo crea productos');
  prohibido(await anon.rpc('crear_pedido', { p_usuario: null, p_email: 'x', p_subtotal: 0, p_envio: 0, p_lineas: [] }), 'anónimo llama crear_pedido');
  prohibido(await anon.rpc('confirmar_pago', { p_sesion: 'x', p_nombre: null, p_direccion: null }), 'anónimo llama confirmar_pago');
  ok('anónimo NO lee pedidos, líneas ni perfiles, NO cambia productos y NO puede llamar a las funciones');

  // --- dos clientes ----------------------------------------------------------------------------
  ana = await crearUsuario(correoPrueba('ana'), { nombre: 'Ana Prueba' });
  luis = await crearUsuario(correoPrueba('luis'), { nombre: 'Luis Prueba' });
  const perfil = await servicio.from('perfiles').select('email, nombre, admin').eq('id', ana.id).single();
  assert.deepEqual(perfil.data, { email: ana.email, nombre: 'Ana Prueba', admin: false });
  ok('al crear una cuenta se crea su perfil (trigger) con admin = false');

  await servicio.from('productos').upsert({ sku: SKU, precio_cent: 1000, stock: 10, activo: true });
  const linea = { sku: SKU, nombre: 'Vino de prueba', formato: 'Botella', unidades: 3, precio_cent: 1000 };
  const pLuis = await crearPedido(luis, [linea]);
  await confirmarPago(pLuis.sesion);

  const sbAna = await sesionDe(ana.email);
  negado(await sbAna.from('pedidos').select('*').eq('id', pLuis.id), 'Ana lee el pedido de Luis');
  negado(await sbAna.from('lineas').select('*').eq('pedido_id', pLuis.id), 'Ana lee las líneas de Luis');
  negado(await sbAna.from('perfiles').select('*'), 'Ana lee perfiles');
  ok('un cliente NO ve pedidos, líneas ni perfiles de otros');

  const sbLuis = await sesionDe(luis.email);
  const suyo = await sbLuis.from('pedidos').select('id, estado, lineas(unidades)').eq('id', pLuis.id).single();
  assert.ifError(suyo.error);
  assert.equal(suyo.data.estado, 'pagado');
  assert.equal(suyo.data.lineas[0].unidades, 3);
  ok('cada cliente SÍ ve sus pedidos con sus líneas');

  prohibido(await sbLuis.from('pedidos').update({ estado: 'entregado', total_cent: 0 }).eq('id', pLuis.id).select(), 'Luis cambia su pedido');
  prohibido(await sbLuis.from('pedidos').insert({ usuario_id: luis.id, email: luis.email, subtotal_cent: 0, envio_cent: 0, total_cent: 0 }), 'Luis crea un pedido a mano');
  prohibido(await sbLuis.from('pedidos').delete().eq('id', pLuis.id).select(), 'Luis borra su pedido');
  prohibido(await sbLuis.rpc('confirmar_pago', { p_sesion: 'x', p_nombre: null, p_direccion: null }), 'Luis llama confirmar_pago');
  prohibido(await sbLuis.from('productos').update({ precio_cent: 1 }).eq('sku', SKU).select(), 'Luis cambia precios');
  ok('un cliente NO puede tocar su pedido (estado, importe), crear pedidos, borrar, pagar por su cuenta ni cambiar precios');

  // user_metadata lo escribe el propio usuario: no puede servir para hacerse admin.
  const intento = await sbAna.auth.updateUser({ data: { rol: 'admin' } });
  assert.ifError(intento.error);
  const { data: fresca } = await servicio.auth.admin.getUserById(ana.id);
  assert.equal(fresca.user.user_metadata.rol, 'admin', 'el intento sí queda en user_metadata');
  assert.equal(usuarioDe(fresca.user).rol, 'cliente');
  assert.equal((await servicio.from('perfiles').select('admin').eq('id', ana.id).single()).data.admin, false);
  ok('un cliente que se pone rol=admin en user_metadata sigue siendo cliente (la web solo mira app_metadata)');

  // --- pagos ------------------------------------------------------------------------------------
  const stock = async () => (await servicio.from('productos').select('stock').eq('sku', SKU).single()).data.stock;
  assert.equal(await stock(), 7, 'el pago de Luis descontó 3');
  const pAna = await crearPedido(ana, [{ ...linea, unidades: 2 }]);
  assert.equal(await confirmarPago(pAna.sesion, 'Ana Prueba', 'Calle Sol 3, 14550 Montilla, ES'), true);
  assert.equal(await confirmarPago(pAna.sesion), false);
  assert.equal(await confirmarPago(pAna.sesion), false);
  assert.equal(await stock(), 5);
  const pagado = (await servicio.from('pedidos').select('estado, envio_direccion, pagado').eq('id', pAna.id).single()).data;
  assert.equal(pagado.estado, 'pagado');
  assert.equal(pagado.envio_direccion, 'Calle Sol 3, 14550 Montilla, ES');
  ok('confirmar_pago es idempotente: 3 avisos del mismo pago → pagado una vez y stock descontado una vez (7 → 5)');

  const a = await crearPedido(ana, [linea]);
  const simultaneos = await Promise.all([confirmarPago(a.sesion), confirmarPago(a.sesion), confirmarPago(a.sesion)]);
  assert.equal(simultaneos.filter(Boolean).length, 1, `a la vez: ${simultaneos}`);
  assert.equal(await stock(), 2);
  ok('tres confirmaciones A LA VEZ (webhook + vuelta de Stripe) → solo una cuenta (5 → 2)');

  const cancelado = await crearPedido(ana, [{ ...linea, unidades: 1 }]);
  await servicio.from('pedidos').update({ estado: 'cancelado' }).eq('id', cancelado.id);
  assert.equal(await confirmarPago(cancelado.sesion), true, 'cancelado a mano pero cobrado: vale');
  await servicio.from('pedidos').update({ estado: 'cancelado' }).eq('id', cancelado.id);
  assert.equal(await confirmarPago(cancelado.sesion), false, 'pagado y luego cancelado: no resucita');
  assert.equal(await stock(), 1);
  const agotado = await crearPedido(ana, [{ ...linea, unidades: 5 }]);
  await confirmarPago(agotado.sesion);
  assert.equal(await stock(), 0, 'nunca baja de 0');
  ok('pedido cancelado mientras se pagaba → pagado; pagado y cancelado → no vuelve; el stock no baja de 0');

  const vacio = await servicio.rpc('crear_pedido', { p_usuario: ana.id, p_email: ana.email, p_subtotal: 0, p_envio: 0, p_lineas: [] });
  prohibido(vacio, 'pedido sin líneas');
  const malo = await servicio.rpc('crear_pedido', { p_usuario: ana.id, p_email: ana.email, p_subtotal: 100, p_envio: 0, p_lineas: [{ ...linea, unidades: 0 }] });
  prohibido(malo, 'línea con 0 unidades');
  const huerfanos = await servicio.from('pedidos').select('id, lineas(id)').eq('usuario_id', ana.id);
  assert.ok(huerfanos.data.every((p) => p.lineas.length > 0), 'ningún pedido se quedó sin líneas');
  ok('crear_pedido es todo o nada: sin líneas o con líneas inválidas no deja pedidos a medias');

  console.log(`\nPermisos y pedidos correctos: ${paso} comprobaciones.`);
} finally {
  await borrarUsuarios([ana, luis]);
  await servicio.from('productos').delete().eq('sku', SKU);
}

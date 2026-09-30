// Comprueba el webhook de Stripe con eventos firmados de verdad (sin llamar a Stripe).
// El servidor tiene que usar el MISMO secreto de webhook que se pasa aquí:
//   STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_prueba npx astro dev --port 4322
//   npm run probar:webhook -- http://localhost:4322 whsec_prueba
// Crea un cliente, dos pedidos y un producto de prueba (SKU 990002) en Supabase y los borra al final.
import Stripe from 'stripe';
import assert from 'node:assert/strict';
import { borrarUsuarios, correoPrueba, crearPedido, crearUsuario, servicio } from './lib-pruebas.mjs';

const [base = 'http://localhost:4322', secreto = 'whsec_prueba'] = process.argv.slice(2);
const SKU = 990002;
const stripe = new Stripe('sk_test_x');

const enviar = async (evento, firma = true) => {
  const cuerpo = JSON.stringify(evento);
  const cabecera = firma ? stripe.webhooks.generateTestHeaderString({ payload: cuerpo, secret: secreto }) : 't=1,v1=falsa';
  return fetch(base + '/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': cabecera, 'content-type': 'application/json' },
    body: cuerpo,
  });
};
const evento = (tipo, objeto) => ({ id: `evt_${Date.now()}`, object: 'event', type: tipo, data: { object: objeto } });
const pedido = async (id) => (await servicio.from('pedidos').select('estado, envio_direccion').eq('id', id).single()).data;
const stock = async () => (await servicio.from('productos').select('stock').eq('sku', SKU).single()).data.stock;

let cliente;
try {
  cliente = await crearUsuario(correoPrueba('webhook'), { nombre: 'Webhook' });
  await servicio.from('productos').upsert({ sku: SKU, precio_cent: 10200, stock: 10, activo: true });
  const linea = { sku: SKU, nombre: 'Vino de prueba', formato: 'Caja 6 botellas', unidades: 3, precio_cent: 10200 };
  const p1 = await crearPedido(cliente, [linea], 0);

  assert.equal((await enviar(evento('checkout.session.completed', { id: p1.sesion, payment_status: 'paid' }), false)).status, 400);
  assert.equal((await pedido(p1.id)).estado, 'pendiente');
  console.log('  ✔ firma falsa → 400 y el pedido sigue pendiente');

  const noPagado = { id: p1.sesion, object: 'checkout.session', payment_status: 'unpaid' };
  assert.equal((await enviar(evento('checkout.session.completed', noPagado))).status, 200);
  assert.equal((await pedido(p1.id)).estado, 'pendiente');
  console.log('  ✔ sesión completada pero sin cobrar (pago diferido) → sigue pendiente');

  const pagado = {
    id: p1.sesion,
    object: 'checkout.session',
    payment_status: 'paid',
    customer_details: { name: 'Webhook' },
    collected_information: {
      shipping_details: { name: 'Ana Webhook', address: { line1: 'Calle Sol 3', postal_code: '14550', city: 'Montilla', country: 'ES' } },
    },
  };
  assert.equal((await enviar(evento('checkout.session.completed', pagado))).status, 200);
  assert.equal((await enviar(evento('checkout.session.completed', pagado))).status, 200); // Stripe reintenta
  assert.equal((await enviar(evento('checkout.session.async_payment_succeeded', pagado))).status, 200);
  const p = await pedido(p1.id);
  assert.equal(p.estado, 'pagado');
  assert.equal(p.envio_direccion, 'Calle Sol 3, 14550 Montilla, ES');
  assert.equal(await stock(), 7);
  console.log('  ✔ evento firmado → pagado, dirección guardada y stock 10 → 7 (una sola vez aunque llegue tres veces)');

  const p2 = await crearPedido(cliente, [{ ...linea, unidades: 1 }]);
  assert.equal((await enviar(evento('checkout.session.expired', { id: p2.sesion, object: 'checkout.session', payment_status: 'unpaid' }))).status, 200);
  assert.equal((await pedido(p2.id)).estado, 'cancelado');
  assert.equal((await enviar(evento('checkout.session.expired', { id: p1.sesion, object: 'checkout.session' }))).status, 200);
  assert.equal((await pedido(p1.id)).estado, 'pagado', 'un aviso de caducidad no cancela un pedido ya pagado');
  console.log('  ✔ sesión caducada → pedido cancelado; nunca cancela uno ya pagado');
  console.log('\nWebhook correcto.');
} finally {
  await borrarUsuarios([cliente]);
  await servicio.from('productos').delete().eq('sku', SKU);
}

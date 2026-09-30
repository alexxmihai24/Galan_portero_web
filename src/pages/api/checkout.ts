import type { APIRoute } from 'astro';
import { articulos } from '../../lib/catalogo.ts';
import { calcularPedido, ErrorPedido } from '../../lib/pedido.ts';
import { asignarSesionStripe, borrarPendiente, crearPedido } from '../../lib/pedidos.ts';
import { stripe } from '../../lib/stripe.ts';
import { supabaseConfigurado } from '../../lib/supabase.ts';

export const prerender = false;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals, url }) => {
  // La cookie de sesion es SameSite=Lax; ademas se exige que la peticion venga de esta web.
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Origen no permitido.' }, 403);

  if (!supabaseConfigurado) return json({ error: 'La tienda no está disponible ahora mismo. Inténtalo más tarde.' }, 503);
  const usuario = locals.usuario; // validado con Supabase Auth en el middleware
  if (!usuario) return json({ error: 'Entra en tu cuenta para pagar.', entrar: '/cuenta/entrar?volver=/cesta' }, 401);
  if (!stripe) {
    return json(
      { error: 'El pago con tarjeta todavía no está configurado en esta tienda (falta la clave de Stripe).' },
      503,
    );
  }

  let cuerpo: { lineas?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'Petición no válida.' }, 400);
  }

  const noDisponible = (e: unknown) => {
    console.error('Checkout sin base de datos:', (e as Error).message);
    return json({ error: 'No hemos podido preparar el pago. Inténtalo de nuevo en unos minutos.' }, 503);
  };

  let calculo;
  let pedidoId;
  try {
    // Precios leídos ahora mismo de la BD (sin caché): el navegador solo aporta SKU y unidades.
    calculo = calcularPedido(cuerpo?.lineas, await articulos(true));
    pedidoId = await crearPedido(usuario, calculo);
  } catch (e) {
    if (e instanceof ErrorPedido) return json({ error: e.message }, 400);
    return noDisponible(e);
  }

  let sesion;
  try {
    sesion = await stripe.checkout.sessions.create({
      mode: 'payment',
      locale: 'es',
      customer_email: usuario.email,
      client_reference_id: String(pedidoId),
      metadata: { pedido_id: String(pedidoId) },
      line_items: calculo.lineas.map((l) => ({
        quantity: l.unidades,
        price_data: {
          currency: 'eur',
          unit_amount: l.precio_cent,
          product_data: { name: `${l.nombre} · ${l.formato}` },
        },
      })),
      shipping_address_collection: { allowed_countries: ['ES'] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            display_name: calculo.envio_cent === 0 ? 'Envío gratis a península' : 'Envío a península',
            fixed_amount: { amount: calculo.envio_cent, currency: 'eur' },
          },
        },
      ],
      success_url: `${url.origin}/cuenta/pedidos/${pedidoId}?pagado=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}/cesta?cancelado=1`,
    });
  } catch (e) {
    await borrarPendiente(pedidoId).catch(() => {});
    console.error('Stripe no ha creado la sesión de pago:', (e as Error).message);
    return json({ error: 'No hemos podido conectar con el sistema de pago. Inténtalo de nuevo en unos minutos.' }, 502);
  }
  try {
    await asignarSesionStripe(pedidoId, sesion.id);
  } catch (e) {
    // Un pago que no se pudiera enlazar con su pedido se cobraría sin quedar registrado:
    // se anula la sesión de Stripe antes de que el cliente llegue a pagarla.
    await stripe.checkout.sessions.expire(sesion.id).catch(() => {});
    return noDisponible(e);
  }
  return json({ url: sesion.url });
};

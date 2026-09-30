import type { APIRoute } from 'astro';
import type Stripe from 'stripe';
import { cancelarPendiente } from '../../../lib/pedidos.ts';
import { registrarSiPagada, secretoWebhook, stripe } from '../../../lib/stripe.ts';

export const prerender = false;

/**
 * Stripe avisa aqui cuando se paga. Configurar en el panel de Stripe (o con
 * `stripe listen --forward-to localhost:4321/api/stripe/webhook`) los eventos:
 * checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!stripe || !secretoWebhook) return new Response('Webhook no configurado', { status: 503 });

  let evento: Stripe.Event;
  try {
    // La firma se comprueba contra el cuerpo exacto: por eso se lee como texto.
    evento = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get('stripe-signature') ?? '',
      secretoWebhook,
    );
  } catch {
    return new Response('Firma no válida', { status: 400 });
  }

  switch (evento.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await registrarSiPagada(evento.data.object);
      break;
    case 'checkout.session.expired':
      await cancelarPendiente(evento.data.object.id);
      break;
  }
  return new Response('ok');
};

import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from 'astro:env/server';
import { confirmarPago } from './pedidos.ts';

/** null si no hay clave: la web funciona igual, pero "Pagar" avisa de que falta configurarlo. */
export const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
export const secretoWebhook = STRIPE_WEBHOOK_SECRET ?? null;

/** Nombre y direccion de envio que el cliente escribio en Stripe Checkout. */
export function datosEnvio(s: Stripe.Checkout.Session) {
  const envio = s.collected_information?.shipping_details;
  const d = envio?.address;
  const direccion = d
    ? [d.line1, d.line2, [d.postal_code, d.city].filter(Boolean).join(' '), d.state, d.country].filter(Boolean).join(', ')
    : null;
  return { nombre: envio?.name ?? s.customer_details?.name ?? null, direccion };
}

/** Si la sesion de Checkout esta pagada, marca el pedido como pagado (idempotente). */
export async function registrarSiPagada(s: Stripe.Checkout.Session): Promise<boolean> {
  if (s.payment_status !== 'paid') return false;
  return confirmarPago(s.id, datosEnvio(s));
}

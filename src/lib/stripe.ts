import Stripe from 'stripe';
import { CORREO_PEDIDOS, CORREO_REMITENTE, RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from 'astro:env/server';
import { correoBodega, correoCliente, type Correo } from './correo.ts';
import { confirmarPago, pedidoAdmin } from './pedidos.ts';

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

/**
 * Si la sesion de Checkout esta pagada, marca el pedido como pagado (idempotente) y, solo la
 * primera vez (confirmar_pago devuelve true una sola vez), avisa por correo a la bodega y al cliente.
 */
export async function registrarSiPagada(s: Stripe.Checkout.Session): Promise<boolean> {
  if (s.payment_status !== 'paid') return false;
  const nuevo = await confirmarPago(s.id, datosEnvio(s));
  if (nuevo) await avisarPorCorreo(Number(s.client_reference_id), s.success_url);
  return nuevo;
}

// Resend (integración del Marketplace de Vercel). Sin dominio verificado solo envía desde
// onboarding@resend.dev y a la dirección de la cuenta de Resend.
async function enviar(para: string[], c: Correo, responderA: string | undefined, clave: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': clave },
    body: JSON.stringify({
      from: CORREO_REMITENTE ?? 'Bodegas Galán Portero <onboarding@resend.dev>',
      to: para,
      reply_to: responderA,
      ...c,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

/** Nunca lanza: un correo que falla no puede deshacer un pago (el pedido sigue en /admin/pedidos). */
async function avisarPorCorreo(pedidoId: number, successUrl: string | null) {
  if (!RESEND_API_KEY) return;
  try {
    const p = await pedidoAdmin(pedidoId);
    if (!p) return;
    const origen = successUrl ? new URL(successUrl).origin : '';
    const bodega = CORREO_PEDIDOS?.split(',').map((c) => c.trim()).filter(Boolean) ?? [];
    const envios = await Promise.allSettled([
      bodega.length ? enviar(bodega, correoBodega(p, origen), p.email, `pedido-${p.id}-bodega`) : null,
      enviar([p.email], correoCliente(p, origen), bodega[0], `pedido-${p.id}-cliente`),
    ]);
    for (const e of envios) if (e.status === 'rejected') console.error(`Correo del pedido ${p.id}:`, (e.reason as Error).message);
  } catch (e) {
    console.error(`Correos del pedido ${pedidoId}:`, (e as Error).message);
  }
}

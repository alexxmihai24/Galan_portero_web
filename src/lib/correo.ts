// Correos de un pedido pagado: aviso a la bodega y confirmación al cliente.
// Puro (sin red ni claves) para poder probarlo con `npm test`; el envío está en stripe.ts.
import { euros } from './pedido.ts';
import type { PedidoConLineas } from './pedidos.ts';

export type Correo = { subject: string; html: string; text: string };

const BODEGA = 'Bodegas Galán Portero · Av. del Marqués de la Vega de Armijo, 76 · 14550 Montilla (Córdoba) · 957 66 42 37';

/** Nombre, dirección y vinos los escribe el cliente (o vienen de Stripe): siempre escapados. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function lineasHtml(p: PedidoConLineas): string {
  const fila = (a: string, b: string, fuerte = false) =>
    `<tr><td style="padding:6px 0;${fuerte ? 'font-weight:700;' : ''}">${a}</td><td style="padding:6px 0;text-align:right;white-space:nowrap;${fuerte ? 'font-weight:700;' : ''}">${b}</td></tr>`;
  return `<table role="presentation" width="100%" style="border-collapse:collapse;border-top:1px solid #ddd2c0;margin:16px 0">
${p.lineas.map((l) => fila(`${esc(l.nombre)} · ${esc(l.formato)} × ${l.unidades}`, euros(l.precio_cent * l.unidades))).join('\n')}
<tr><td colspan="2" style="border-top:1px solid #ddd2c0"></td></tr>
${fila('Subtotal', euros(p.subtotal_cent))}
${fila('Envío', p.envio_cent ? euros(p.envio_cent) : 'Gratis')}
${fila('Total (IVA incluido)', euros(p.total_cent), true)}
</table>`;
}

const lineasTexto = (p: PedidoConLineas) =>
  [
    ...p.lineas.map((l) => `- ${l.nombre} · ${l.formato} × ${l.unidades}: ${euros(l.precio_cent * l.unidades)}`),
    `Subtotal: ${euros(p.subtotal_cent)}`,
    `Envío: ${p.envio_cent ? euros(p.envio_cent) : 'Gratis'}`,
    `Total (IVA incluido): ${euros(p.total_cent)}`,
  ].join('\n');

const destino = (p: PedidoConLineas) => [p.envio_nombre, p.envio_direccion].filter(Boolean).join(', ') || '(sin dirección)';

function marco(titulo: string, cuerpo: string, boton: { texto: string; href: string }): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f6f2ea;color:#171412;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="margin:0 0 24px;font-family:Georgia,serif;font-size:14px;letter-spacing:2px;text-transform:uppercase">Bodegas Galán Portero</p>
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2">${titulo}</h1>
${cuerpo}
<p style="margin:28px 0"><a href="${esc(boton.href)}" style="display:inline-block;background:#171412;color:#f6f2ea;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${boton.texto}</a></p>
<p style="margin:32px 0 0;font-size:12px;color:#6b6258">${BODEGA.replace('957 66 42 37', '957&nbsp;66&nbsp;42&nbsp;37')}<br>Venta de alcohol solo a mayores de 18 años.</p>
</div></body></html>`;
}

export function correoBodega(p: PedidoConLineas, origen: string): Correo {
  const href = `${origen}/admin/pedidos/${p.id}`;
  const cliente = p.envio_nombre || p.cliente || p.email;
  return {
    subject: `Nuevo pedido nº ${p.id} · ${euros(p.total_cent)}`,
    html: marco(
      `Nuevo pedido nº ${p.id}`,
      `<p style="margin:0">Pagado con tarjeta. Hay que prepararlo y enviarlo.</p>
<p style="margin:16px 0 0"><strong>Cliente:</strong> ${esc(cliente)} · <a href="mailto:${esc(p.email)}" style="color:#171412">${esc(p.email)}</a><br>
<strong>Enviar a:</strong> ${esc(destino(p))}</p>
${lineasHtml(p)}
<p style="margin:0;color:#4a423a">Al enviarlo, márcalo como «enviado» en el panel. Si respondes a este correo, le escribes al cliente.</p>`,
      { texto: 'Abrir el pedido en el panel', href },
    ),
    text: `Nuevo pedido nº ${p.id} (pagado). Hay que prepararlo y enviarlo.

Cliente: ${cliente} <${p.email}>
Enviar a: ${destino(p)}

${lineasTexto(p)}

Panel: ${href}`,
  };
}

export function correoCliente(p: PedidoConLineas, origen: string): Correo {
  const href = `${origen}/cuenta/pedidos/${p.id}`;
  const nombre = p.envio_nombre?.split(' ')[0] || p.cliente?.split(' ')[0];
  return {
    subject: `Tu pedido nº ${p.id} está confirmado`,
    html: marco(
      `¡Gracias${nombre ? `, ${esc(nombre)}` : ''}!`,
      `<p style="margin:0">Hemos recibido el pago de tu pedido nº ${p.id}. Lo preparamos en la bodega, en Montilla.</p>
<p style="margin:16px 0 0"><strong>Envío a:</strong> ${esc(destino(p))}</p>
${lineasHtml(p)}
<p style="margin:0;color:#4a423a">¿Alguna duda? Responde a este correo y te contestamos desde la bodega.</p>`,
      { texto: 'Ver mi pedido', href },
    ),
    text: `¡Gracias${nombre ? `, ${nombre}` : ''}! Hemos recibido el pago de tu pedido nº ${p.id}. Lo preparamos en la bodega, en Montilla.

Envío a: ${destino(p)}

${lineasTexto(p)}

Ver tu pedido: ${href}
¿Alguna duda? Responde a este correo.

${BODEGA}`,
  };
}

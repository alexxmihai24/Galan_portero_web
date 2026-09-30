// Calculo puro del pedido: sin base de datos ni Astro, para poder probarlo con `node --test`.
// El servidor SIEMPRE recalcula aqui con los precios de la base de datos; lo que
// manda el navegador (la cesta) solo aporta SKU y unidades.

export const ENVIO_GRATIS_DESDE_CENT = 100_00;
// PROVISIONAL: la web antigua no publica la tarifa de envio por debajo de 100 €.
// Confirmar con la bodega y cambiar aqui (unico sitio).
export const ENVIO_CENT = 7_00;
export const MAX_UNIDADES = 99;

export type Solicitud = { sku: number; unidades: number };

export type ProductoVenta = {
  sku: number;
  nombre: string;
  formato: string;
  precio_cent: number;
  stock: number | null;
  activo: boolean;
};

export type LineaCalculada = {
  sku: number;
  nombre: string;
  formato: string;
  unidades: number;
  precio_cent: number;
  importe_cent: number;
};

export type Calculo = {
  lineas: LineaCalculada[];
  subtotal_cent: number;
  envio_cent: number;
  total_cent: number;
};

export class ErrorPedido extends Error {}

export function costeEnvio(subtotal_cent: number): number {
  return subtotal_cent >= ENVIO_GRATIS_DESDE_CENT ? 0 : ENVIO_CENT;
}

export function calcularPedido(solicitud: unknown, productos: Map<number, ProductoVenta>): Calculo {
  if (!Array.isArray(solicitud) || solicitud.length === 0) throw new ErrorPedido('La cesta está vacía.');
  if (solicitud.length > 50) throw new ErrorPedido('Demasiadas líneas en la cesta.');

  // Junta lineas repetidas del mismo SKU.
  const unidadesPorSku = new Map<number, number>();
  for (const item of solicitud) {
    const sku = Number((item as Solicitud)?.sku);
    const unidades = Number((item as Solicitud)?.unidades);
    if (!Number.isInteger(sku) || !Number.isInteger(unidades) || unidades < 1) {
      throw new ErrorPedido('Hay una línea de la cesta que no es válida.');
    }
    unidadesPorSku.set(sku, (unidadesPorSku.get(sku) ?? 0) + unidades);
  }

  const lineas: LineaCalculada[] = [];
  for (const [sku, unidades] of unidadesPorSku) {
    const p = productos.get(sku);
    if (!p || !p.activo) throw new ErrorPedido('Uno de los vinos de la cesta ya no está a la venta.');
    if (unidades > MAX_UNIDADES) throw new ErrorPedido(`Máximo ${MAX_UNIDADES} unidades de ${p.nombre}.`);
    if (p.stock !== null && unidades > p.stock) {
      throw new ErrorPedido(
        p.stock === 0 ? `${p.nombre} (${p.formato}) está agotado.` : `Solo quedan ${p.stock} de ${p.nombre} (${p.formato}).`,
      );
    }
    lineas.push({ ...p, unidades, importe_cent: p.precio_cent * unidades });
  }

  const subtotal_cent = lineas.reduce((s, l) => s + l.importe_cent, 0);
  const envio_cent = costeEnvio(subtotal_cent);
  return { lineas, subtotal_cent, envio_cent, total_cent: subtotal_cent + envio_cent };
}

export function euros(cent: number): string {
  return (cent / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

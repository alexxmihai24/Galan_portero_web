import type { ImageMetadata } from 'astro';
import { pack, vinos, type Variacion, type Vino } from '../data/vinos.ts';
import type { ProductoVenta } from './pedido.ts';
import { publico, servicio } from './supabase.ts';

// Textos e imagenes: src/data/vinos.ts. Precio, stock y si esta a la venta: tabla `productos`.

type Venta = { precio_cent: number; stock: number | null; activo: boolean };
export type VariacionTienda = Variacion & Venta;
export type VinoTienda = Omit<Vino, 'variaciones'> & { variaciones: VariacionTienda[] };
export type PackTienda = typeof pack & Venta & { sku: number };

/** Todo lo que se puede meter en la cesta, por SKU. */
export type Articulo = ProductoVenta & {
  slug: string;
  corto: string;
  etiqueta: string;
  gama: string;
  imagen: ImageMetadata;
  recorte?: ImageMetadata;
};

// Alta de productos nuevos de vinos.ts con su precio inicial. Los ya existentes no se tocan.
// Una vez por instancia del servidor; si falla, se reintenta en la siguiente lectura.
let alta: Promise<void> | null = null;
async function darDeAlta() {
  const filas = [
    ...vinos.flatMap((v) => v.variaciones.map((x) => ({ sku: x.id, precio_cent: Math.round(x.precio * 100) }))),
    { sku: pack.id, precio_cent: Math.round(pack.precio * 100) },
  ];
  const r = await servicio?.from('productos').upsert(filas, { onConflict: 'sku', ignoreDuplicates: true });
  if (r?.error) throw new Error(r.error.message);
}

// ponytail: caché de 30 s por instancia. Tras cambiar un precio en el admin, otras instancias
// de Vercel pueden enseñar el anterior hasta 30 s; al pagar siempre se lee el precio real.
const TTL_MS = 30_000;
let cache: { hasta: number; datos: Map<number, Venta> } | null = null;

async function ventas(fresco: boolean): Promise<Map<number, Venta>> {
  if (!publico) return new Map(); // sin Supabase: precios de vinos.ts (solo para ver la web)
  if (!fresco && cache && cache.hasta > Date.now()) return cache.datos;
  try {
    alta ??= darDeAlta().catch((e) => {
      alta = null;
      throw e;
    });
    await alta;
    const { data, error } = await publico.from('productos').select('sku, precio_cent, stock, activo');
    if (error) throw new Error(error.message);
    const datos = new Map(data.map((f) => [f.sku as number, { precio_cent: f.precio_cent, stock: f.stock, activo: f.activo }]));
    cache = { hasta: Date.now() + TTL_MS, datos };
    return datos;
  } catch (e) {
    // Para cobrar hace falta el precio real; para enseñar la web vale el último conocido.
    if (fresco) throw e;
    console.error('No se han podido leer los precios de Supabase:', (e as Error).message);
    return cache?.datos ?? new Map();
  }
}

/** `fresco`: sin caché y sin plan B (para cobrar). */
export async function catalogo(fresco = false): Promise<{ vinos: VinoTienda[]; pack: PackTienda }> {
  const v = await ventas(fresco);
  const venta = (sku: number, precio: number): Venta => v.get(sku) ?? { precio_cent: Math.round(precio * 100), stock: null, activo: true };
  const d = venta(pack.id, pack.precio);
  return {
    vinos: vinos.map((vino) => ({
      ...vino,
      variaciones: vino.variaciones.map((x) => {
        const d = venta(x.id, x.precio);
        return { ...x, ...d, precio: d.precio_cent / 100 };
      }),
    })),
    pack: { ...pack, ...d, sku: pack.id, precio: d.precio_cent / 100 },
  };
}

export async function articulos(fresco = false): Promise<Map<number, Articulo>> {
  const { vinos: vs, pack: p } = await catalogo(fresco);
  const m = new Map<number, Articulo>();
  for (const v of vs) {
    for (const x of v.variaciones) {
      m.set(x.id, {
        sku: x.id,
        nombre: v.corto,
        formato: x.formato,
        etiqueta: x.etiqueta,
        precio_cent: x.precio_cent,
        stock: x.stock,
        activo: x.activo,
        slug: v.slug,
        corto: v.corto,
        gama: v.gama,
        imagen: v.imagen,
        recorte: v.recorte,
      });
    }
  }
  m.set(p.sku, {
    sku: p.sku,
    nombre: p.nombre,
    formato: 'Estuche con las cinco',
    etiqueta: 'Pack',
    precio_cent: p.precio_cent,
    stock: p.stock,
    activo: p.activo,
    slug: p.slug,
    corto: p.nombre,
    gama: p.gama,
    imagen: p.imagen,
  });
  return m;
}

/** Primera variacion comprable (la botella suelta, normalmente). */
export function principal(v: VinoTienda): VariacionTienda | undefined {
  return v.variaciones.find((x) => x.activo && x.stock !== 0);
}

// --- admin ---------------------------------------------------------------------

export async function actualizarProducto(sku: number, cambios: { precio_cent: number; stock: number | null; activo: boolean }) {
  if (!Number.isSafeInteger(sku)) throw new Error('Ese producto no existe.');
  if (!Number.isInteger(cambios.precio_cent) || cambios.precio_cent < 0 || cambios.precio_cent > 1_000_000) {
    throw new Error('Precio no válido.');
  }
  if (cambios.stock !== null && (!Number.isInteger(cambios.stock) || cambios.stock < 0 || cambios.stock > 100_000)) {
    throw new Error('Stock no válido.');
  }
  if (!servicio) throw new Error('Supabase no está configurado.');
  const { data, error } = await servicio
    .from('productos')
    .update({ ...cambios, actualizado: new Date().toISOString() })
    .eq('sku', sku)
    .select('sku');
  if (error) throw new Error(`No se ha podido guardar: ${error.message}`);
  if (data.length !== 1) throw new Error('Ese producto no existe.');
  cache = null;
}

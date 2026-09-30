import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { articulos } from '../../lib/catalogo.ts';

export const prerender = false;

/** Lo que la cesta del navegador necesita para pintarse. El precio aqui es informativo:
 *  al pagar, el servidor lo vuelve a calcular. */
export const GET: APIRoute = async () => {
  const lista = await Promise.all(
    [...(await articulos()).values()].map(async (a) => {
      const foto = await getImage({ src: a.recorte ?? a.imagen, width: 160, format: 'webp' });
      return {
        sku: a.sku,
        nombre: a.nombre,
        formato: a.formato,
        precio_cent: a.precio_cent,
        stock: a.stock,
        activo: a.activo,
        href: `/vinos/${a.slug}`,
        imagen: foto.src,
        recortada: Boolean(a.recorte),
      };
    }),
  );
  return new Response(JSON.stringify(lista), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

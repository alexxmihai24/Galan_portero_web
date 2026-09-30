// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://bodegasgalanportero.com',
  // Paginas estaticas por defecto; las que leen precios, sesion o pedidos
  // declaran `export const prerender = false` y se sirven al momento.
  // Se publica en Vercel (que define VERCEL=1 al compilar). En local, servidor Node
  // para poder probar la compilacion de produccion con `npm start`.
  adapter: process.env.VERCEL ? vercel() : node({ mode: 'standalone' }),
  image: {
    responsiveStyles: true,
  },
  // CSS dentro del HTML: sin peticiones que bloqueen el primer pintado.
  build: { inlineStylesheets: 'always' },
  // Dominios en los que se publica. Astro solo se fía de la cabecera X-Forwarded-Host si
  // está aquí; si no, cree estar en otro origen y rechaza formularios y pagos.
  // AÑADIR aquí el dominio definitivo si cambia.
  security: {
    allowedDomains: [
      { hostname: 'localhost' },
      { hostname: '127.0.0.1' },
      { hostname: 'bodegasgalanportero.com', protocol: 'https' },
      { hostname: 'www.bodegasgalanportero.com', protocol: 'https' },
      // Previsualizaciones de Vercel (proyecto-git-rama-equipo.vercel.app).
      { hostname: '*.vercel.app', protocol: 'https' },
    ],
  },
  env: {
    schema: {
      // Todo son secretos de servidor: el navegador nunca habla con Supabase ni con Stripe.
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      STRIPE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      STRIPE_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});

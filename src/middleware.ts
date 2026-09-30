import { defineMiddleware } from 'astro:middleware';
import { usuarioDe } from './lib/auth.ts';
import { clienteSesion, supabaseConfigurado } from './lib/supabase.ts';

// Cabeceras de seguridad (las mismas que vercel.json pone a las páginas estáticas).
// CSP parcial: una completa con hashes (security.csp de Astro) no es compatible con <ClientRouter />.
const CABECERAS_SEGURIDAD: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), usb=()',
  'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

function blindar(res: Response): Response {
  for (const [k, v] of Object.entries(CABECERAS_SEGURIDAD)) res.headers.set(k, v);
  return res;
}

// Páginas de /cuenta que se ven sin sesión.
const LIBRES = new Set(['/cuenta/entrar', '/cuenta/registro', '/cuenta/recuperar', '/cuenta/confirmar']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  ctx.locals.usuario = null;
  ctx.locals.supabase = null;
  // Las páginas estáticas se generan al compilar: ahí no hay petición ni cookies.
  if (ctx.isPrerendered) return blindar(await next());

  // routePattern es la ruta que Astro YA ha elegido (p. ej. "/admin/pedidos/[id]"): no se puede
  // esquivar con mayúsculas, %61dmin, barras dobles ni trucos de codificación en la URL.
  const patron = ctx.routePattern;
  const esCuenta = patron === '/cuenta' || patron.startsWith('/cuenta/');
  const esAdmin = patron === '/admin' || patron.startsWith('/admin/');

  if ((esCuenta || esAdmin || patron === '/api/checkout') && supabaseConfigurado) {
    const supabase = clienteSesion(ctx.request, ctx.cookies);
    ctx.locals.supabase = supabase;
    // getUser() pregunta a Supabase Auth en cada petición: además de la firma y la caducidad del
    // token, detecta sesiones cerradas y usuarios borrados o bloqueados, y trae el rol actual
    // (quitar el rol de admin surte efecto en la siguiente petición). Si el token ha caducado lo
    // renueva y reescribe las cookies. NUNCA getSession() para esto: solo lee la cookie, sin validar.
    const { data } = await supabase.auth.getUser();
    ctx.locals.usuario = data.user ? usuarioDe(data.user) : null;
  }

  const usuario = ctx.locals.usuario;
  if (esCuenta && !LIBRES.has(patron) && !usuario) {
    return ctx.redirect(`/cuenta/entrar?volver=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`);
  }
  if (esAdmin) {
    if (!usuario) return ctx.redirect(`/cuenta/entrar?volver=${encodeURIComponent(ctx.url.pathname)}`);
    if (usuario.rol !== 'admin') return blindar(new Response('No tienes permiso para ver esta página.', { status: 403 }));
  }

  const res = await next();
  // Datos personales: que no los guarde ninguna caché (CDN, proxy o el historial de un ordenador compartido).
  if (esCuenta || esAdmin) res.headers.set('cache-control', 'private, no-store');
  return blindar(res);
});

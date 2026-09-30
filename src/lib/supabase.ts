import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { SUPABASE_KEY, SUPABASE_SECRET, SUPABASE_URL } from 'astro:env/server';

// Tres clientes, de menos a más poder. El navegador no recibe ninguna clave: solo el servidor
// habla con Supabase.

export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_KEY && SUPABASE_SECRET);

// Si Supabase no responde, mejor un error a los 8 s que una página colgada hasta que Vercel la corte.
const conPlazo: typeof fetch = (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) });

const sinSesion = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: conPlazo },
};

/** Clave pública, sin sesión: solo lo que RLS deja ver a cualquiera (el catálogo). */
export const publico: SupabaseClient | null = supabaseConfigurado
  ? createClient(SUPABASE_URL!, SUPABASE_KEY!, sinSesion)
  : null;

/**
 * Clave secreta (service_role): se salta RLS. Solo para lo que el servidor hace en nombre de
 * la tienda (crear y cobrar pedidos, panel de admin) y SIEMPRE después de comprobar la sesión.
 */
export const servicio: SupabaseClient | null = supabaseConfigurado
  ? createClient(SUPABASE_URL!, SUPABASE_SECRET!, sinSesion)
  : null;

/**
 * Cliente con la sesión del visitante, guardada en cookies. Lo que lee pasa por RLS con su
 * identidad. Las cookies son httpOnly (ningún script de la página las puede leer), Secure en
 * producción y SameSite=Lax (no viajan en peticiones POST desde otras webs).
 */
export function clienteSesion(request: Request, cookies: AstroCookies): SupabaseClient {
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    global: { fetch: conPlazo },
    cookieOptions: { httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () =>
        parseCookieHeader(request.headers.get('cookie') ?? '').map((c) => ({ name: c.name, value: c.value ?? '' })),
      setAll: (lista) => {
        for (const { name, value, options } of lista) cookies.set(name, value, options);
      },
    },
  });
}

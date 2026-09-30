import type { APIRoute } from 'astro';

export const prerender = false;

// Solo POST: un enlace o una imagen de otra web no pueden cerrar la sesión.
// scope 'local': cierra esta sesión en Supabase (el token de refresco deja de valer) y borra las
// cookies; las abiertas en otros dispositivos siguen.
export const POST: APIRoute = async ({ locals, redirect }) => {
  await locals.supabase?.auth.signOut({ scope: 'local' });
  return redirect('/');
};

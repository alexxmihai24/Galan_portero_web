// Reglas de cuentas y sesiones sin dependencias (ni Astro ni Supabase), para probarlas con
// `node --test`. Las llamadas a Supabase Auth están en las páginas de /cuenta y en el middleware.

export type Usuario = { id: string; email: string; nombre: string; rol: 'cliente' | 'admin' };

type UsuarioSupabase = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

/**
 * El rol SOLO sale de app_metadata, que únicamente puede cambiar la clave secreta (el admin de la
 * bodega desde el panel de Supabase o `npm run crear-admin`). user_metadata lo puede escribir el
 * propio usuario con su sesión, así que nunca sirve para dar permisos.
 */
export function usuarioDe(u: UsuarioSupabase): Usuario {
  const email = u.email ?? '';
  const nombre = typeof u.user_metadata?.nombre === 'string' ? u.user_metadata.nombre.trim().slice(0, 100) : '';
  return { id: u.id, email, nombre: nombre || email.split('@')[0]!, rol: u.app_metadata?.rol === 'admin' ? 'admin' : 'cliente' };
}

// --- redirecciones --------------------------------------------------------------------

const BASE = 'http://interno.invalid';

/**
 * Devuelve `volver` solo si es una ruta de esta web; si no, `porDefecto`.
 * Se normaliza con el mismo parser que usa el navegador: quita tabuladores y saltos de línea
 * y trata "\" como "/". Así "/\t/malo.com", "/\\malo.com" o "/.//malo.com" (que el navegador
 * convertiría en //malo.com, otra web) se rechazan.
 */
export function rutaSegura(volver: string | null | undefined, porDefecto = '/cuenta'): string {
  if (!volver || !volver.startsWith('/')) return porDefecto;
  let u: URL;
  try {
    u = new URL(volver, BASE);
  } catch {
    return porDefecto;
  }
  const ruta = u.pathname + u.search + u.hash;
  return u.origin === BASE && !ruta.startsWith('//') ? ruta : porDefecto;
}

// --- freno a la fuerza bruta en el login ---------------------------------------------
// ponytail: en memoria de cada instancia. En Vercel hay varias y se reciclan, así que es solo una
// primera barrera; la de verdad son los límites de Supabase Auth (y CAPTCHA si hay ataques).
const fallos = new Map<string, { n: number; desde: number }>();
const VENTANA_MS = 15 * 60_000;
const MAX_FALLOS = 5;

export function bloqueado(email: string, ahora = Date.now()): boolean {
  const f = fallos.get(email);
  if (!f) return false;
  if (ahora - f.desde > VENTANA_MS) {
    fallos.delete(email);
    return false;
  }
  return f.n >= MAX_FALLOS;
}

export function anotarFallo(email: string, ahora = Date.now()) {
  const f = fallos.get(email);
  if (!f || ahora - f.desde > VENTANA_MS) fallos.set(email, { n: 1, desde: ahora });
  else f.n++;
  if (fallos.size > 10_000) fallos.delete(fallos.keys().next().value!); // que no crezca sin límite
}

export function olvidarFallos(email: string) {
  fallos.delete(email);
}

// --- datos del formulario de registro ----------------------------------------------------

export class ErrorAuth extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validarClave(password: string) {
  // Supabase guarda la contraseña con bcrypt, que solo usa los primeros 72 bytes.
  if (password.length < 8) throw new ErrorAuth('La contraseña debe tener al menos 8 caracteres.');
  if (new TextEncoder().encode(password).length > 72) throw new ErrorAuth('La contraseña es demasiado larga (máximo 72 caracteres).');
}

export function validarRegistro(datos: { email: string; nombre: string; password: string }) {
  const email = normalizarEmail(datos.email);
  const nombre = datos.nombre.trim();
  if (!EMAIL.test(email) || email.length > 200) throw new ErrorAuth('Escribe un correo válido.');
  if (nombre.length < 2 || nombre.length > 100) throw new ErrorAuth('Escribe tu nombre.');
  validarClave(datos.password);
  return { email, nombre, password: datos.password };
}

export function emailValido(email: string): boolean {
  return EMAIL.test(email) && email.length <= 200;
}

/** Mensaje para el cliente a partir del código de error de Supabase Auth. */
export function mensajeAuth(e: { code?: string; status?: number }): string {
  switch (e.code) {
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.';
    case 'email_not_confirmed':
      return 'Antes de entrar, confirma tu correo con el enlace que te enviamos al registrarte.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya hay una cuenta con ese correo. ¿Quieres entrar?';
    case 'weak_password':
      return 'Esa contraseña es demasiado fácil. Usa al menos 8 caracteres y mezcla letras y números.';
    case 'same_password':
      return 'La contraseña nueva tiene que ser distinta de la anterior.';
    case 'email_address_invalid':
      return 'Escribe un correo válido.';
    case 'otp_expired':
      return 'El enlace ha caducado o ya se ha usado.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';
  }
  return e.status === 429
    ? 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.'
    : 'No hemos podido completarlo. Inténtalo de nuevo en unos minutos.';
}

// --- recuperar contraseña -----------------------------------------------------------------

// Supabase da objetos {method, timestamp}; el estándar (RFC 8176) permite solo el nombre, sin hora.
type Amr = (string | { method?: string; timestamp?: number })[] | undefined;

/**
 * ¿La sesión viene de un enlace del correo de hace menos de 15 minutos? Solo entonces se deja poner
 * contraseña nueva sin pedir la actual: quien robe una sesión normal (entrada con contraseña) no
 * puede cambiarla y quedarse la cuenta. Supabase marca igual ('otp') el enlace de recuperar y el
 * de confirmar el correo: los dos demuestran acceso al buzón, que es lo que exige recuperar.
 */
export function recuperacionReciente(amr: Amr, ahora = Date.now()): boolean {
  return (amr ?? []).some(
    (m) =>
      typeof m === 'object' &&
      (m.method === 'recovery' || m.method === 'otp') &&
      typeof m.timestamp === 'number' &&
      ahora / 1000 - m.timestamp < 15 * 60,
  );
}


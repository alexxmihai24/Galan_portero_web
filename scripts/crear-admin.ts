// Da o quita permisos de administrador (usa la clave secreta de .env).
//
//   npm run crear-admin -- correo@bodega.es                          da admin a una cuenta ya registrada
//   npm run crear-admin -- correo@bodega.es "Nombre" "contraseña"    crea la cuenta (confirmada) y la hace admin
//   npm run crear-admin -- correo@bodega.es --quitar                 le quita el admin
//
// Lo mismo desde el SQL Editor de Supabase:
//   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"admin"}'::jsonb where email = 'correo@bodega.es';
// El cambio vale desde la siguiente página que abra esa persona (no hace falta que vuelva a entrar).
import { createClient, type User } from '@supabase/supabase-js';
import { ErrorAuth, normalizarEmail, validarRegistro } from '../src/lib/auth.ts';

const { SUPABASE_URL, SUPABASE_SECRET } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET en .env');
  process.exit(1);
}
const [correo, ...resto] = process.argv.slice(2);
if (!correo) {
  console.error('Uso: npm run crear-admin -- correo [nombre contraseña | --quitar]');
  process.exit(1);
}
const email = normalizarEmail(correo);
const quitar = resto.includes('--quitar');
const [nombre, password] = resto.filter((a) => a !== '--quitar');
const sb = createClient(SUPABASE_URL, SUPABASE_SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

async function buscar(): Promise<User | undefined> {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u || data.users.length < 1000) return u;
  }
}

try {
  let usuario = await buscar();
  if (!usuario) {
    if (quitar) throw new ErrorAuth(`No hay ninguna cuenta con ${email}.`);
    if (!nombre || !password) throw new ErrorAuth('No existe esa cuenta. Para crearla pasa también nombre y contraseña.');
    const datos = validarRegistro({ email, nombre, password });
    const { data, error } = await sb.auth.admin.createUser({
      email: datos.email,
      password: datos.password,
      email_confirm: true,
      user_metadata: { nombre: datos.nombre },
    });
    if (error) throw error;
    usuario = data.user;
  }
  // app_metadata solo lo puede cambiar la clave secreta; Supabase mezcla las claves (null = borrar).
  const { error } = await sb.auth.admin.updateUserById(usuario.id, { app_metadata: { rol: quitar ? null : 'admin' } });
  if (error) throw error;
  console.log(quitar ? `${email} ya NO es administrador.` : `${email} ya es administrador. Entra en /cuenta/entrar y ve a /admin.`);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

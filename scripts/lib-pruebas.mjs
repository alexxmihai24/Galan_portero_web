// Utilidades de las pruebas contra el proyecto de Supabase (lee SUPABASE_URL, SUPABASE_KEY y
// SUPABASE_SECRET de .env; los scripts se lanzan con `node --env-file=.env`).
// Todo lo que se crea aquí lleva el prefijo `prueba+` en el correo y se borra al final.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_KEY, SUPABASE_SECRET } = process.env;
if (!SUPABASE_URL || !SUPABASE_KEY || !SUPABASE_SECRET) {
  console.error('Faltan SUPABASE_URL, SUPABASE_KEY o SUPABASE_SECRET en .env');
  process.exit(1);
}

const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
export const servicio = createClient(SUPABASE_URL, SUPABASE_SECRET, sinSesion);
export const anonimo = () => createClient(SUPABASE_URL, SUPABASE_KEY, sinSesion);

export const CLAVE = 'Uva-pasa-1950!';
export const correoPrueba = (etiqueta) => `prueba+${etiqueta}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@ejemplo.es`;

/** Usuario ya confirmado (no se envía ningún correo). */
export async function crearUsuario(email, { nombre = 'Cliente de Prueba', admin = false, confirmado = true } = {}) {
  const { data, error } = await servicio.auth.admin.createUser({
    email,
    password: CLAVE,
    email_confirm: confirmado,
    user_metadata: { nombre },
    app_metadata: admin ? { rol: 'admin' } : {},
  });
  if (error) throw new Error(`crear usuario: ${error.message}`);
  return data.user;
}

/** Supabase mezcla app_metadata: una clave a null se borra y las demás se conservan. */
export async function cambiarRol(id, admin) {
  const { error } = await servicio.auth.admin.updateUserById(id, { app_metadata: { rol: admin ? 'admin' : null } });
  if (error) throw new Error(`cambiar rol: ${error.message}`);
}

/** Cliente con la sesión de ese usuario (como si fuera él con la clave publicable). */
export async function sesionDe(email, clave = CLAVE) {
  const sb = anonimo();
  const { error } = await sb.auth.signInWithPassword({ email, password: clave });
  if (error) throw new Error(`entrar como ${email}: ${error.message}`);
  return sb;
}

/** Pedido pendiente con su sesión de Stripe inventada, como lo deja /api/checkout. */
export async function crearPedido(usuario, lineas, envio = 700) {
  const subtotal = lineas.reduce((s, l) => s + l.precio_cent * l.unidades, 0);
  const { data: id, error } = await servicio.rpc('crear_pedido', {
    p_usuario: usuario.id,
    p_email: usuario.email,
    p_subtotal: subtotal,
    p_envio: envio,
    p_lineas: lineas,
  });
  if (error) throw new Error(`crear pedido: ${error.message}`);
  const sesion = `cs_test_prueba_${id}_${Date.now()}`;
  const r = await servicio.from('pedidos').update({ stripe_sesion: sesion }).eq('id', id);
  if (r.error) throw new Error(`asignar sesión: ${r.error.message}`);
  return { id: Number(id), sesion };
}

export async function confirmarPago(sesion, nombre = null, direccion = null) {
  const { data, error } = await servicio.rpc('confirmar_pago', { p_sesion: sesion, p_nombre: nombre, p_direccion: direccion });
  if (error) throw new Error(`confirmar pago: ${error.message}`);
  return data;
}

/** Borra los usuarios de prueba y sus pedidos (primero los pedidos: si no, se quedarían sin dueño). */
export async function borrarUsuarios(usuarios) {
  for (const u of usuarios.filter(Boolean)) {
    if (!u.email?.startsWith('prueba+')) throw new Error(`Me niego a borrar ${u.email}: no es un usuario de prueba`);
    await servicio.from('pedidos').delete().or(`usuario_id.eq.${u.id},email.eq.${u.email}`);
    const { error } = await servicio.auth.admin.deleteUser(u.id);
    if (error) console.error(`No se ha podido borrar ${u.email}: ${error.message}`);
  }
}

/** Guarda precio/stock/activo de unos productos y devuelve la función que los deja como estaban. */
export async function recordarProductos(skus) {
  const { data, error } = await servicio.from('productos').select('sku, precio_cent, stock, activo').in('sku', skus);
  if (error) throw new Error(`leer productos: ${error.message}`);
  return async () => {
    for (const p of data) await servicio.from('productos').update({ precio_cent: p.precio_cent, stock: p.stock, activo: p.activo }).eq('sku', p.sku);
  };
}

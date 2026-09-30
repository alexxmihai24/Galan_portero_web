import type { SupabaseClient } from '@supabase/supabase-js';
import type { Usuario } from './auth.ts';
import type { Calculo } from './pedido.ts';
import { servicio } from './supabase.ts';

export type Estado = 'pendiente' | 'pagado' | 'enviado' | 'entregado' | 'cancelado';
export const ESTADOS: Estado[] = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];

export type Linea = { sku: number; nombre: string; formato: string; unidades: number; precio_cent: number };

export type Pedido = {
  id: number;
  usuario_id: string | null;
  email: string;
  estado: Estado;
  subtotal_cent: number;
  envio_cent: number;
  total_cent: number;
  stripe_sesion: string | null;
  envio_nombre: string | null;
  envio_direccion: string | null;
  creado: string;
  pagado: string | null;
  actualizado: string;
};

export type PedidoConLineas = Pedido & { lineas: Linea[]; cliente?: string };

const LINEAS = 'lineas(id, sku, nombre, formato, unidades, precio_cent)';
const COBRADOS: Estado[] = ['pagado', 'enviado', 'entregado'];

function srv(): SupabaseClient {
  if (!servicio) throw new Error('Supabase no está configurado (faltan SUPABASE_URL y las claves).');
  return servicio;
}

function sinError<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`Supabase (${que}): ${r.error.message}`);
  return r.data;
}

type Fila = Pedido & { lineas?: (Linea & { id: number })[]; perfiles?: { nombre: string } | null };

function limpiar(f: Fila): PedidoConLineas {
  const { lineas = [], perfiles, ...p } = f;
  return {
    ...p,
    lineas: [...lineas].sort((a, b) => a.id - b.id).map(({ id: _id, ...l }) => l),
    cliente: perfiles?.nombre || undefined,
  };
}

// --- ciclo de vida del pedido (solo servidor, con la clave secreta) -------------------------

export async function crearPedido(usuario: Usuario, c: Calculo): Promise<number> {
  const id = sinError(
    await srv().rpc('crear_pedido', {
      p_usuario: usuario.id,
      p_email: usuario.email,
      p_subtotal: c.subtotal_cent,
      p_envio: c.envio_cent,
      p_lineas: c.lineas.map(({ sku, nombre, formato, unidades, precio_cent }) => ({ sku, nombre, formato, unidades, precio_cent })),
    }),
    'crear pedido',
  );
  return Number(id);
}

export async function asignarSesionStripe(pedidoId: number, sesionId: string) {
  sinError(
    await srv().from('pedidos').update({ stripe_sesion: sesionId, actualizado: new Date().toISOString() }).eq('id', pedidoId),
    'asignar sesión',
  );
}

/**
 * Marca como pagado el pedido de esa sesión de Stripe y descuenta stock (función SQL
 * `confirmar_pago`, atómica). Idempotente: el webhook y la página de vuelta pueden llamarla
 * los dos; solo la primera cambia algo. Devuelve true si ha cambiado el pedido.
 */
export async function confirmarPago(sesionId: string, envio?: { nombre?: string | null; direccion?: string | null }): Promise<boolean> {
  const r = await srv().rpc('confirmar_pago', {
    p_sesion: sesionId,
    p_nombre: envio?.nombre ?? null,
    p_direccion: envio?.direccion ?? null,
  });
  return sinError(r, 'confirmar pago') === true;
}

/** Stripe no llegó a crear la sesión de pago: el pedido nunca existió para el cliente. */
export async function borrarPendiente(pedidoId: number) {
  sinError(
    await srv().from('pedidos').delete().eq('id', pedidoId).eq('estado', 'pendiente').is('stripe_sesion', null),
    'borrar pendiente',
  );
}

/** El cliente abandonó el pago en Stripe (la sesión caducó). */
export async function cancelarPendiente(sesionId: string) {
  sinError(
    await srv()
      .from('pedidos')
      .update({ estado: 'cancelado', actualizado: new Date().toISOString() })
      .eq('stripe_sesion', sesionId)
      .eq('estado', 'pendiente'),
    'cancelar pendiente',
  );
}

// --- cliente: con SU sesión, así RLS impide ver pedidos ajenos aunque aquí hubiera un fallo ----

export async function pedidoDeUsuario(sb: SupabaseClient, id: number, usuarioId: string): Promise<PedidoConLineas | null> {
  const f = sinError(
    await sb.from('pedidos').select(`*, ${LINEAS}`).eq('id', id).eq('usuario_id', usuarioId).maybeSingle(),
    'pedido',
  );
  return f ? limpiar(f as Fila) : null;
}

/** Pedidos del cliente, sin los intentos de pago abandonados. */
export async function pedidosDeUsuario(sb: SupabaseClient, usuarioId: string): Promise<PedidoConLineas[]> {
  const filas = sinError(
    await sb
      .from('pedidos')
      .select(`*, ${LINEAS}`)
      .eq('usuario_id', usuarioId)
      .neq('estado', 'pendiente')
      .order('id', { ascending: false }),
    'pedidos',
  );
  return (filas as Fila[]).map(limpiar);
}

/** Vinos que el cliente ha comprado alguna vez (pedidos pagados o posteriores), el último primero. */
export function productosComprados(pedidos: PedidoConLineas[]) {
  const porSku = new Map<number, { sku: number; nombre: string; formato: string; unidades: number; ultima: string }>();
  for (const p of pedidos) {
    if (!COBRADOS.includes(p.estado)) continue;
    for (const l of p.lineas) {
      const c = porSku.get(l.sku);
      if (c) {
        c.unidades += l.unidades;
        if (p.creado > c.ultima) c.ultima = p.creado;
      } else {
        porSku.set(l.sku, { sku: l.sku, nombre: l.nombre, formato: l.formato, unidades: l.unidades, ultima: p.creado });
      }
    }
  }
  return [...porSku.values()].sort((a, b) => b.ultima.localeCompare(a.ultima));
}

// --- admin (el middleware ya ha comprobado el rol con Supabase Auth) ---------------------------

export async function pedidoAdmin(id: number): Promise<PedidoConLineas | null> {
  const f = sinError(await srv().from('pedidos').select(`*, ${LINEAS}, perfiles(nombre)`).eq('id', id).maybeSingle(), 'pedido admin');
  return f ? limpiar(f as Fila) : null;
}

export async function listarPedidos(estado?: Estado): Promise<(PedidoConLineas & { unidades: number })[]> {
  let q = srv().from('pedidos').select(`*, ${LINEAS}, perfiles(nombre)`);
  q = estado ? q.eq('estado', estado) : q.neq('estado', 'pendiente');
  const filas = sinError(await q.order('id', { ascending: false }).limit(500), 'listar pedidos');
  return (filas as Fila[]).map((f) => {
    const p = limpiar(f);
    return { ...p, unidades: p.lineas.reduce((s, l) => s + l.unidades, 0) };
  });
}

// Transiciones que el admin puede hacer a mano. `pendiente -> pagado` solo lo hace Stripe.
const SIGUIENTES: Record<Estado, Estado[]> = {
  pendiente: ['cancelado'],
  pagado: ['enviado', 'cancelado'],
  enviado: ['entregado'],
  entregado: [],
  cancelado: [],
};

export function estadosSiguientes(e: Estado): Estado[] {
  return SIGUIENTES[e];
}

export async function cambiarEstado(id: number, nuevo: Estado): Promise<boolean> {
  const p = sinError(await srv().from('pedidos').select('estado').eq('id', id).maybeSingle(), 'estado');
  if (!p || !SIGUIENTES[p.estado as Estado].includes(nuevo)) return false;
  // `.eq('estado', ...)`: si otro admin (o Stripe) lo ha cambiado entre medias, no se pisa.
  const filas = sinError(
    await srv()
      .from('pedidos')
      .update({ estado: nuevo, actualizado: new Date().toISOString() })
      .eq('id', id)
      .eq('estado', p.estado)
      .select('id'),
    'cambiar estado',
  );
  return filas?.length === 1;
}

export async function resumenAdmin() {
  const ahora = new Date();
  const inicioMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
  const [porEnviar, mes, clientes] = await Promise.all([
    srv().from('pedidos').select('id', { count: 'exact', head: true }).eq('estado', 'pagado'),
    // ponytail: suma en JS; con miles de pedidos al mes, pasar a una función SQL.
    srv().from('pedidos').select('total_cent').in('estado', COBRADOS).gte('pagado', inicioMes),
    srv().from('perfiles').select('id', { count: 'exact', head: true }).eq('admin', false),
  ]);
  const ventas = sinError(mes, 'ventas del mes') as { total_cent: number }[];
  sinError(porEnviar, 'por enviar');
  sinError(clientes, 'clientes');
  return {
    porEnviar: porEnviar.count ?? 0,
    ventasMesCent: ventas.reduce((s, p) => s + p.total_cent, 0),
    pedidosMes: ventas.length,
    clientes: clientes.count ?? 0,
  };
}

export async function listarClientes() {
  const filas = sinError(
    await srv()
      .from('perfiles')
      .select('id, email, nombre, admin, creado, pedidos(estado, total_cent)')
      .order('creado', { ascending: false })
      .limit(1000),
    'clientes',
  ) as { id: string; email: string; nombre: string; admin: boolean; creado: string; pedidos: { estado: Estado; total_cent: number }[] }[];
  return filas.map(({ pedidos, ...c }) => {
    const cobrados = pedidos.filter((p) => COBRADOS.includes(p.estado));
    return { ...c, pedidos: cobrados.length, gastado_cent: cobrados.reduce((s, p) => s + p.total_cent, 0) };
  });
}

// --- presentación --------------------------------------------------------------------------

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  pendiente: 'Pendiente de pago',
  pagado: 'Pagado · preparando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Fecha de Postgres (timestamptz en ISO) en hora de Madrid. */
export function fecha(iso: string, conHora = false): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Europe/Madrid',
  });
}

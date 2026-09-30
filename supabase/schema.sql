-- Tienda de Bodegas Galán Portero: productos, perfiles, pedidos y líneas.
--
-- Modelo de permisos:
--   * RLS activado en todas las tablas.
--   * El navegador NUNCA habla con Supabase: todo pasa por el servidor Astro.
--   * anon/authenticated solo pueden LEER: el catálogo (todos) y sus propios pedidos (cada cliente).
--   * Escribir (crear pedidos, marcarlos pagados, cambiar precios) solo lo hace el servidor con la
--     clave secreta (service_role), después de comprobar la sesión y el rol.
--   * El rol de administrador vive en auth.users.raw_app_meta_data ('rol' = 'admin'), que el usuario
--     no puede modificar (user_metadata sí, por eso no se usa para permisos).

-- ------------------------------------------------------------------------------ tablas

create table public.productos (
  sku          integer primary key,
  precio_cent  integer not null check (precio_cent between 0 and 1000000),
  stock        integer check (stock is null or stock between 0 and 100000), -- null = sin control
  activo       boolean not null default true,
  actualizado  timestamptz not null default now()
);

-- Copia de datos de auth.users que el admin necesita para listar clientes y pedidos.
-- `admin` es solo informativo (listados): los permisos se comprueban en cada petición contra
-- auth.users.raw_app_meta_data, nunca contra esta columna.
create table public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  email   text not null,
  nombre  text not null default '',
  admin   boolean not null default false,
  creado  timestamptz not null default now()
);

create table public.pedidos (
  id               bigint generated always as identity primary key,
  -- Si se borra la cuenta, el pedido se conserva (es un registro contable) sin dueño.
  usuario_id       uuid references public.perfiles (id) on delete set null,
  email            text not null,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'pagado', 'enviado', 'entregado', 'cancelado')),
  subtotal_cent    integer not null check (subtotal_cent >= 0),
  envio_cent       integer not null check (envio_cent >= 0),
  total_cent       integer not null check (total_cent = subtotal_cent + envio_cent),
  stripe_sesion    text unique,
  envio_nombre     text,
  envio_direccion  text,
  creado           timestamptz not null default now(),
  pagado           timestamptz,
  actualizado      timestamptz not null default now()
);
create index pedidos_usuario on public.pedidos (usuario_id);
create index pedidos_estado on public.pedidos (estado);

create table public.lineas (
  id           bigint generated always as identity primary key,
  pedido_id    bigint not null references public.pedidos (id) on delete cascade,
  sku          integer not null,
  nombre       text not null,
  formato      text not null,
  unidades     integer not null check (unidades between 1 and 99),
  precio_cent  integer not null check (precio_cent >= 0)
);
create index lineas_pedido on public.lineas (pedido_id);

-- ------------------------------------------------------------------------------ RLS y privilegios

alter table public.productos enable row level security;
alter table public.perfiles  enable row level security;
alter table public.pedidos   enable row level security;
alter table public.lineas    enable row level security;

-- Supabase da por defecto todos los privilegios a anon y authenticated; se dejan solo lecturas.
-- (TRUNCATE no pasa por RLS: mejor que no lo tengan.)
revoke all on public.productos, public.perfiles, public.pedidos, public.lineas from anon, authenticated;
grant select on public.productos to anon, authenticated;
grant select on public.pedidos, public.lineas to authenticated;

create policy "el catálogo es público"
  on public.productos for select to anon, authenticated
  using (true);

create policy "cada cliente ve sus pedidos"
  on public.pedidos for select to authenticated
  using ((select auth.uid()) = usuario_id);

create policy "cada cliente ve las líneas de sus pedidos"
  on public.lineas for select to authenticated
  using (exists (
    select 1 from public.pedidos p
    where p.id = lineas.pedido_id and p.usuario_id = (select auth.uid())
  ));

-- perfiles: sin políticas. Solo lo lee el servidor con service_role.

-- ------------------------------------------------------------------------------ perfiles automáticos

create function public.sincronizar_perfil() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, email, nombre, admin)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'nombre', ''), 100),
          coalesce(new.raw_app_meta_data ->> 'rol', '') = 'admin')
  on conflict (id) do update set email = excluded.email, nombre = excluded.nombre, admin = excluded.admin;
  return new;
end;
$$;

create trigger al_crear_o_cambiar_usuario
  after insert or update of email, raw_user_meta_data, raw_app_meta_data on auth.users
  for each row execute function public.sincronizar_perfil();

-- Usuarios que ya existieran antes de esta migración.
insert into public.perfiles (id, email, nombre, admin)
select id, coalesce(email, ''), left(coalesce(raw_user_meta_data ->> 'nombre', ''), 100),
       coalesce(raw_app_meta_data ->> 'rol', '') = 'admin'
from auth.users
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------ operaciones del servidor

-- Pedido pendiente con sus líneas, todo o nada. Los importes los calcula el servidor
-- (src/lib/pedido.ts) con los precios de la tabla productos, nunca con los del navegador.
create function public.crear_pedido(p_usuario uuid, p_email text, p_subtotal integer, p_envio integer, p_lineas jsonb)
returns bigint
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.pedidos (usuario_id, email, subtotal_cent, envio_cent, total_cent)
  values (p_usuario, p_email, p_subtotal, p_envio, p_subtotal + p_envio)
  returning id into v_id;

  insert into public.lineas (pedido_id, sku, nombre, formato, unidades, precio_cent)
  select v_id, l.sku, l.nombre, l.formato, l.unidades, l.precio_cent
  from jsonb_to_recordset(p_lineas) as l (sku integer, nombre text, formato text, unidades integer, precio_cent integer);

  if not found then
    raise exception 'pedido sin líneas';
  end if;
  return v_id;
end;
$$;

-- Marca pagado el pedido de una sesión de Stripe y descuenta stock. Idempotente: el webhook y la
-- página de vuelta pueden llamarla a la vez; el UPDATE bloquea la fila y solo el primero cambia algo.
-- También acepta un pedido cancelado a mano mientras el cliente pagaba: si el dinero ha llegado,
-- el pedido vale (pagado IS NULL evita resucitar uno pagado y cancelado después).
create function public.confirmar_pago(p_sesion text, p_nombre text, p_direccion text)
returns boolean
language plpgsql set search_path = ''
as $$
declare
  v_id bigint;
begin
  update public.pedidos
     set estado = 'pagado', pagado = now(), actualizado = now(),
         envio_nombre = coalesce(p_nombre, envio_nombre),
         envio_direccion = coalesce(p_direccion, envio_direccion)
   where stripe_sesion = p_sesion and estado in ('pendiente', 'cancelado') and pagado is null
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  -- ponytail: el stock se descuenta al pagar, no al abrir el pago; con mucho tráfico podría
  -- venderse la última botella dos veces. Si pasa, reservar stock en crear_pedido.
  update public.productos pr
     set stock = greatest(pr.stock - l.total, 0), actualizado = now()
    from (select sku, sum(unidades)::integer as total from public.lineas where pedido_id = v_id group by sku) l
   where pr.sku = l.sku and pr.stock is not null;

  return true;
end;
$$;

-- Postgres da EXECUTE a PUBLIC y Supabase a anon/authenticated: sin esto, cualquiera con la clave
-- pública podría llamar a estas funciones por la API (/rest/v1/rpc/...).
revoke execute on function public.sincronizar_perfil() from public, anon, authenticated;
revoke execute on function public.crear_pedido(uuid, text, integer, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.confirmar_pago(text, text, text) from public, anon, authenticated;
grant execute on function public.crear_pedido(uuid, text, integer, integer, jsonb) to service_role;
grant execute on function public.confirmar_pago(text, text, text) to service_role;

-- ------------------------------------------------------------------------------ administradores
-- El admin se da de alta a mano (nunca desde la web). La persona se registra en /cuenta/registro y
-- después, en el SQL Editor:
--
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"admin"}'::jsonb
--   where email = 'correo@bodega.es';
--
-- Para quitarlo:
--
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'rol' where email = 'correo@bodega.es';
--
-- Surte efecto en la siguiente página que abra (la web pregunta a Supabase Auth en cada petición).

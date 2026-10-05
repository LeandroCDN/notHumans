-- Cuentas, planes y consumo.
-- Cada persona tiene un perfil (profiles). Se entra con Google (Supabase Auth: auth_user_id) o, mientras
-- tanto, con una cuenta fija de AUTH_USERS (legacy_login). El plan define qué puede hacer y cuánto puede
-- gastar por mes; el consumo queda en usage (solo se agregan filas: es el registro de todo lo que costó plata).
-- Igual que el resto: solo accede el server con la secret key (RLS sin políticas, sin permisos públicos).

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete cascade,
  legacy_login text unique,
  email text,
  name text not null check (char_length(name) <= 120),
  handle text unique check (handle ~ '^[a-z0-9_]{2,24}$'),
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business', 'admin')),
  -- De dónde salió el plan: 'manual' (lo asignó un admin). Mañana: 'mercadopago', 'stripe'…
  plan_source text not null default 'manual',
  -- Vencimiento del plan (null = no vence). Vencido, la cuenta se comporta como Free.
  plan_until timestamptz,
  -- Límites puntuales por encima (o por debajo) del plan, para no inventar un plan por cada caso.
  overrides jsonb not null default '{}'::jsonb,
  access_requested_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index profiles_email_idx on public.profiles (lower(email)) where email is not null;

-- Dueño de cada notHuman y de cada puesto. Si se borra la cuenta, se borra todo lo suyo.
alter table public.nothumans add column user_id uuid references public.profiles (id) on delete cascade;
alter table public.jobs add column user_id uuid references public.profiles (id) on delete cascade;
create index nothumans_user_idx on public.nothumans (user_id);
create index jobs_user_idx on public.jobs (user_id);

-- Las vistas suman el dueño al final (create or replace solo permite agregar columnas al final).
create or replace view public.nothumans_current with (security_invoker = true) as
select
  n.id,
  n.name,
  n.owner,
  n.created_by,
  n.created_at,
  n.updated_at,
  v.version,
  v.business,
  v.profile,
  v.examples,
  v.stats,
  n.job_id,
  n.user_id
from public.nothumans n
join public.nothuman_versions v on v.nothuman_id = n.id and v.version = n.current_version;

create or replace view public.jobs_current with (security_invoker = true) as
select j.id, j.created_by, j.created_at, j.updated_at, v.version, v.name, v.content, j.user_id
from public.jobs j
join public.job_versions v on v.job_id = j.id and v.version = j.current_version;

-- Consumo. kind: generation | reply | audio | structure (tienen tope mensual por plan) y extract | profile
-- (los pasos de una generación: solo cuentan para el tope de costo). units: 1 por acción, segundos en audio.
create table public.usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  units numeric not null default 0,
  cost_usd numeric not null default 0,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  -- Para agrupar: los pasos de una generación apuntan a la fila de esa generación.
  ref text,
  nothuman_id uuid,
  created_at timestamptz not null default now()
);

create index usage_user_time_idx on public.usage (user_id, created_at desc);
create index usage_ref_idx on public.usage (ref) where ref is not null;

-- Reserva una unidad de consumo si entra en el tope del mes y en el tope de costo. Devuelve el id de la fila
-- (después se completa con el costo real, o se borra si la llamada a la IA falló), -1 si no hay cupo y
-- -2 si se pasó del tope de costo. Atómico por usuario: dos requests a la vez no pueden pasarse del tope.
create function public.consume_usage(
  p_user uuid,
  p_kind text,
  p_units numeric,
  p_limit numeric,
  p_cost_cap numeric,
  p_since timestamptz,
  p_ref text default null,
  p_nothuman uuid default null
) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  used numeric;
  spent numeric;
  new_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  if p_limit is not null then
    select coalesce(sum(units), 0) into used
    from public.usage where user_id = p_user and kind = p_kind and created_at >= p_since;
    if used + p_units > p_limit then return -1; end if;
  end if;
  if p_cost_cap is not null then
    select coalesce(sum(cost_usd), 0) into spent
    from public.usage where user_id = p_user and created_at >= p_since;
    if spent >= p_cost_cap then return -2; end if;
  end if;
  insert into public.usage (user_id, kind, units, ref, nothuman_id)
  values (p_user, p_kind, p_units, p_ref, p_nothuman)
  returning id into new_id;
  return new_id;
end;
$$;

-- Lo consumido desde una fecha, por tipo (para los medidores y el panel de admin). p_user null = todos.
create function public.usage_since(p_since timestamptz, p_user uuid default null)
returns table (user_id uuid, kind text, units numeric, cost_usd numeric)
language sql
stable
set search_path = ''
as $$
  select u.user_id, u.kind, sum(u.units), sum(u.cost_usd)
  from public.usage u
  where u.created_at >= p_since and (p_user is null or u.user_id = p_user)
  group by u.user_id, u.kind;
$$;

alter table public.profiles enable row level security;
alter table public.usage enable row level security;
revoke all on public.profiles, public.usage from anon, authenticated;
revoke all on public.nothumans_current, public.jobs_current from anon, authenticated;
revoke execute on function public.consume_usage(uuid, text, numeric, numeric, numeric, timestamptz, text, uuid) from public, anon, authenticated;
revoke execute on function public.usage_since(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, text, numeric, numeric, numeric, timestamptz, text, uuid) to service_role;
grant execute on function public.usage_since(timestamptz, uuid) to service_role;

-- Lo que ya existía era de las cuentas fijas (AUTH_USERS): cada una pasa a tener su perfil (Pro, porque eran
-- invitados) y sus notHumans y puestos. El admin se decide al entrar (ADMINS, o la primera de AUTH_USERS).
insert into public.profiles (legacy_login, name, plan)
select distinct created_by, created_by, 'pro'
from (select created_by from public.nothumans union select created_by from public.jobs) s
on conflict (legacy_login) do nothing;

update public.nothumans n set user_id = p.id from public.profiles p where p.legacy_login = n.created_by and n.user_id is null;
update public.jobs j set user_id = p.id from public.profiles p where p.legacy_login = j.created_by and j.user_id is null;

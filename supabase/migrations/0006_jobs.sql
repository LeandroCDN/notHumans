-- Puestos de trabajo: dónde trabaja un notHuman (negocio, reglas, horario, cuándo pasar a una persona).
-- Separados de la personalidad: un puesto se crea solo y se asigna a uno o varios notHumans.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by text not null,
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_versions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  version int not null,
  name text not null,
  content jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (job_id, version)
);

create view public.jobs_current with (security_invoker = true) as
select j.id, j.created_by, j.created_at, j.updated_at, v.version, v.name, v.content
from public.jobs j
join public.job_versions v on v.job_id = j.id and v.version = j.current_version;

-- El puesto asignado a cada notHuman (asignar no crea una versión nueva de la personalidad).
alter table public.nothumans add column job_id uuid references public.jobs (id) on delete set null;

-- La vista de notHumans suma el puesto al final (create or replace solo permite agregar columnas al final).
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
  n.job_id
from public.nothumans n
join public.nothuman_versions v on v.nothuman_id = n.id and v.version = n.current_version;

alter table public.jobs enable row level security;
alter table public.job_versions enable row level security;
revoke all on public.jobs, public.job_versions, public.jobs_current from anon, authenticated;
revoke all on public.nothumans_current from anon, authenticated;

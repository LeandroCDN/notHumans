-- notHumans y sus versiones. Cada cambio de perfil o ejemplos es una versión nueva; nada se pisa.
-- Solo accede el server con la secret key: RLS prendido y sin políticas = nadie más puede leer ni escribir.

create table public.nothumans (
  id uuid primary key default gen_random_uuid(),
  -- Cuenta de AUTH_USERS que lo creó (no hay sistema de usuarios todavía).
  created_by text not null,
  name text not null,
  owner text not null,
  current_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nothuman_versions (
  id uuid primary key default gen_random_uuid(),
  nothuman_id uuid not null references public.nothumans (id) on delete cascade,
  version int not null,
  business jsonb not null,
  profile jsonb not null,
  examples jsonb not null,
  stats jsonb not null,
  -- Qué cambió en esta versión ("generado", "corrección desde el chat", …).
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (nothuman_id, version)
);

create index nothuman_versions_nothuman_idx on public.nothuman_versions (nothuman_id, version desc);

alter table public.nothumans enable row level security;
alter table public.nothuman_versions enable row level security;

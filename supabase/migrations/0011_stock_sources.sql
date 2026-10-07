-- Stock de un puesto: la planilla de Google que el cliente le compartió al robot (solo lectura).
-- `map` es cómo entendimos la planilla (lo revisó el dueño) y `snapshot` la copia solo con lo visible:
-- las columnas privadas (costo, proveedor…) no se guardan nunca.
create table public.stock_sources (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  spreadsheet_id text not null,
  title text not null default '',
  map jsonb not null,
  snapshot jsonb not null default '{"tabs": []}'::jsonb,
  status text not null default 'ok' check (status in ('ok', 'needs_review', 'error')),
  error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_sources_user_idx on public.stock_sources (user_id);

alter table public.stock_sources enable row level security;
revoke all on public.stock_sources from anon, authenticated;

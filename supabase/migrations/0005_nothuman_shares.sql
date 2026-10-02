-- Links públicos para chatear con un notHuman sin cuenta. El token es lo único que hace falta para entrar,
-- así que es largo y aleatorio. Cada link tiene un tope de respuestas (cada una cuesta tokens de DeepSeek).
create table public.nothuman_shares (
  token text primary key,
  nothuman_id uuid not null references public.nothumans (id) on delete cascade,
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  replies int not null default 0,
  max_replies int not null default 300,
  last_used_at timestamptz
);

-- Un solo link activo por notHuman.
create unique index nothuman_shares_active_idx on public.nothuman_shares (nothuman_id) where revoked_at is null;

alter table public.nothuman_shares enable row level security;
revoke all on public.nothuman_shares from anon, authenticated;

-- Suma una respuesta al link si está activo y no llegó al tope. Devuelve el notHuman, o nada si no se puede.
-- Atómico: dos requests a la vez no pueden pasarse del tope.
create function public.use_share(p_token text) returns uuid
language sql
set search_path = ''
as $$
  update public.nothuman_shares
  set replies = replies + 1, last_used_at = now()
  where token = p_token and revoked_at is null and replies < max_replies
  returning nothuman_id;
$$;

revoke execute on function public.use_share(text) from public, anon, authenticated;
grant execute on function public.use_share(text) to service_role;

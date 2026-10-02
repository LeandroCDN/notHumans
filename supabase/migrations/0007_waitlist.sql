-- Lista de espera de la home. Un mail por persona; solo lo lee y escribe el server.
create table public.waitlist (
  email text primary key check (char_length(email) <= 254),
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

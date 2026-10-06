-- Registro mínimo de cada aviso que llega al webhook de WhatsApp, para diagnosticar sin mirar los logs de Vercel:
-- si la firma dio bien, si el número estaba conectado, cuántos mensajes traía. No guarda el texto de los mensajes.
create table public.wa_webhook_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- bad_signature | bad_json | ok | no_channel | error
  outcome text not null,
  phone_number_id text,
  messages int not null default 0,
  statuses int not null default 0,
  detail text check (char_length(detail) <= 500)
);

create index wa_webhook_log_at_idx on public.wa_webhook_log (at desc);

alter table public.wa_webhook_log enable row level security;
revoke all on public.wa_webhook_log from anon, authenticated;

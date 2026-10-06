-- WhatsApp (Cloud API oficial, flujo propio). Un canal es un número conectado a una cuenta: lo atiende un
-- notHuman (con su puesto) en un modo. Las charlas son por cliente (su número de WhatsApp) dentro de un canal.
-- Igual que el resto: solo accede el server con la secret key.

create table public.wa_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- El id que manda Meta en cada webhook (metadata.phone_number_id): así sabemos de qué canal es un mensaje.
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  display_phone text not null default '' check (char_length(display_phone) <= 40),
  nothuman_id uuid references public.nothumans (id) on delete set null,
  -- draft: sugiere y el dueño aprueba · offhours: responde solo con el negocio cerrado · auto: responde siempre · off
  mode text not null default 'draft' check (mode in ('draft', 'offhours', 'auto', 'off')),
  created_at timestamptz not null default now()
);

create index wa_channels_user_idx on public.wa_channels (user_id);

create table public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.wa_channels (id) on delete cascade,
  customer_wa_id text not null check (char_length(customer_wa_id) <= 30),
  customer_name text not null default '' check (char_length(customer_name) <= 120),
  -- bot: atiende el notHuman · human: la tomó el dueño (el bot no contesta)
  status text not null default 'bot' check (status in ('bot', 'human')),
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  preview text not null default '' check (char_length(preview) <= 200),
  -- Candado mientras se arma una respuesta: dos avisos de Meta a la vez no generan dos respuestas.
  generating_until timestamptz,
  created_at timestamptz not null default now(),
  unique (channel_id, customer_wa_id)
);

create index wa_conversations_channel_idx on public.wa_conversations (channel_id, last_message_at desc);

create table public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  author text not null check (author in ('customer', 'bot', 'human', 'system')),
  status text not null check (status in ('received', 'draft', 'sent', 'failed', 'discarded')),
  -- Una fila por turno: las burbujas van juntas (un borrador del notHuman puede tener varias).
  texts jsonb not null default '[]'::jsonb,
  -- Id de WhatsApp del mensaje que llegó: Meta reintenta los avisos y así no se procesa dos veces.
  wa_id text unique,
  -- Ids de WhatsApp de las burbujas que mandamos (para los avisos de "falló").
  wa_out_ids text[] not null default '{}',
  error text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index wa_messages_conversation_idx on public.wa_messages (conversation_id, created_at);
create index wa_messages_out_ids_idx on public.wa_messages using gin (wa_out_ids);

alter table public.wa_channels enable row level security;
alter table public.wa_conversations enable row level security;
alter table public.wa_messages enable row level security;
revoke all on public.wa_channels, public.wa_conversations, public.wa_messages from anon, authenticated;

-- 002: chat-native bot (Leomatch-style feed), roles/bans, passes, runtime settings, purchases.
-- Additive only: existing Mini App tables and columns are untouched.

alter table profiles add column if not exists gender text check (gender in ('m','f'));
alter table profiles add column if not exists looking_for text not null default 'a' check (looking_for in ('m','f','a'));
alter table profiles add column if not exists age_min smallint check (age_min between 18 and 99);
alter table profiles add column if not exists age_max smallint check (age_max between 18 and 99);
-- Telegram file_id of the profile photo uploaded in the chat bot flow.
alter table profiles add column if not exists photo_file_id text;

create table if not exists bot_users (
  telegram_user_id bigint primary key,
  username text,
  role text not null default 'user' check (role in ('user','admin','owner')),
  is_banned boolean not null default false,
  ban_reason text,
  state text not null default '',
  state_data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists bot_users_username_idx on bot_users (lower(username));

create table if not exists passes (
  from_profile_id uuid not null references profiles(id) on delete cascade,
  to_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_profile_id, to_profile_id),
  constraint passes_no_self_pass check (from_profile_id <> to_profile_id)
);

-- Runtime switches without redeploy: paywall, free limits, admin username claims.
create table if not exists bot_settings (
  key text primary key,
  value text not null
);

-- Telegram Stars payments (idempotent by charge_id). Premium itself lives in `entitlements`.
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null,
  product_key text not null,
  stars integer not null,
  charge_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists purchases_user_idx on purchases (telegram_user_id, created_at desc);

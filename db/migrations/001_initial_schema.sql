-- Znakomstva initial PostgreSQL schema.
-- Run only against a dedicated Znakomstva database after reviewing the migration.
-- All writes must go through a trusted backend; never expose database credentials to the Mini App.
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  display_name text not null check (char_length(display_name) between 1 and 40),
  birth_date date not null,
  bio text not null default '' check (char_length(bio) <= 500),
  city text not null default '' check (char_length(city) <= 100),
  interests text[] not null default '{}',
  is_visible boolean not null default true,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_adult_only check (birth_date <= (current_date - interval '18 years')::date)
);

create table if not exists profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  storage_key text not null,
  position smallint not null default 0 check (position between 0 and 9),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(profile_id, position)
);

create table if not exists likes (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references profiles(id) on delete cascade,
  to_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_no_self_like check (from_profile_id <> to_profile_id),
  unique(from_profile_id, to_profile_id)
);
create index if not exists likes_incoming_idx on likes(to_profile_id, created_at desc);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  profile_a_id uuid not null references profiles(id) on delete cascade,
  profile_b_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint matches_distinct_profiles check (profile_a_id <> profile_b_id),
  constraint matches_canonical_order check (profile_a_id < profile_b_id),
  unique(profile_a_id, profile_b_id)
);

create table if not exists blocks (
  blocker_profile_id uuid not null references profiles(id) on delete cascade,
  blocked_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_profile_id, blocked_profile_id),
  constraint blocks_no_self_block check (blocker_profile_id <> blocked_profile_id)
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references profiles(id) on delete cascade,
  reported_profile_id uuid not null references profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','fake_profile','underage','inappropriate_content','other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint reports_no_self_report check (reporter_profile_id <> reported_profile_id)
);
create index if not exists reports_queue_idx on reports(status, created_at);

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  feature_key text not null,
  source text not null default 'manual' check (source in ('manual','subscription','promotion')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(profile_id, feature_key, starts_at),
  constraint entitlement_expiry_after_start check (expires_at is null or expires_at > starts_at)
);
create index if not exists entitlements_lookup_idx on entitlements(profile_id, feature_key, expires_at);

create table if not exists admin_audit_log (
  id bigserial primary key,
  actor_telegram_user_id bigint not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_recent_idx on admin_audit_log(created_at desc);

-- Enforce Telegram WebApp initData signature and auth_date freshness in the backend.
-- Use numeric Telegram IDs for owner/admin authorization; usernames are not authorization.
-- Enforce blocks in discovery, likes and chat queries. Store photos privately and issue signed URLs.
-- Compute mutual likes transactionally and canonicalize match profile IDs before insert.
-- Never grant clients direct access using a database service-role credential.

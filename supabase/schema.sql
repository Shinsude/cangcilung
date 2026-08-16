-- Skema sinkronisasi cloud cangcilung (Supabase)
-- Jalankan di: Supabase Dashboard > SQL Editor > New query

create extension if not exists "pgcrypto";

-- Sesi percakapan (history, summary, pinned disimpan sebagai jsonb per sesi)
create table if not exists public.sessions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Pengaturan aplikasi (tanpa apiKey, disimpan terpisah agar aman)
create table if not exists public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Pemakaian harian
create table if not exists public.usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  requests integer not null default 0,
  primary key (user_id, date)
);

-- Row Level Security: tiap pengguna hanya melihat datanya sendiri
alter table public.sessions enable row level security;
alter table public.settings enable row level security;
alter table public.usage enable row level security;

create policy "own_sessions" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_usage" on public.usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists sessions_user_updated
  on public.sessions (user_id, updated_at desc);

-- Realtime (agar perubahan perangkat lain langsung terlihat)
alter publication supabase_realtime add table public.sessions;

-- cangcilung — Supabase schema
-- Jalankan SEKALI di dashboard Supabase: SQL Editor → New query → jalankan seluruh file ini.
-- Setelah selesai: aktifkan Anonymous sign-ins (Settings → Auth → Providers → Anonymous).
-- Lalu set env vars SUPABASE_URL + SUPABASE_ANON_KEY di Vercel (lihat .env.local.example) dan redeploy.

-- ================= Tabel sinkronisasi dasar =================

create table if not exists public.sessions (
  user_id uuid not null,
  id text not null,
  name text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.settings (
  user_id uuid primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage (
  user_id uuid not null,
  date text not null,
  requests bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ================= Catatan: RAG (pgvector) telah dibuang =================
-- Fitur chat/knowledge base (kb.js + RAG) dihapus. Bila database ini pernah
-- memakai schema RAG lama, objek berikut bisa dihapus manual (aplikasi tidak
-- lagi memakainya): tabel public.documents + public.chunks, fungsi
-- public.match_chunks, atau extension pgvector bila tidak dipakai lain.

create index if not exists sessions_user on public.sessions (user_id, updated_at);
create index if not exists usage_user_date on public.usage (user_id, date);

-- ================= Row Level Security =================
-- Setiap baris hanya bisa dilihat/diubah oleh pemiliknya (user anonymous punya auth.uid()).

alter table public.sessions enable row level security;
alter table public.settings enable row level security;
alter table public.usage enable row level security;

drop policy if exists "sessions_all_own" on public.sessions;
create policy "sessions_all_own" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_all_own" on public.settings;
create policy "settings_all_own" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "usage_all_own" on public.usage;
create policy "usage_all_own" on public.usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ================= Realtime (sinkron lintas perangkat) =================
-- Supabase Wajib: publication default sudah ada. Tambahkan tabel sessions.

alter publication supabase_realtime add table public.sessions;
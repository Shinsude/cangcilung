-- cangcilung — Supabase schema
-- Jalankan SEKALI di dashboard Supabase: SQL Editor → New query → jalankan seluruh file ini.
-- Setelah selesai: aktifkan Anonymous sign-ins (Settings → Auth → Providers → Anonymous).
-- Lalu set env vars SUPABASE_URL + SUPABASE_ANON_KEY di Vercel (lihat .env.local.example) dan redeploy.

create extension if not exists vector;

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

-- ================= RAG / basis pengetahuan (pgvector) =================

create table if not exists public.documents (
  user_id uuid not null,
  id text not null,
  title text not null,
  source text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.chunks (
  user_id uuid not null,
  id text not null,
  document_id text not null,
  idx int not null default 0,
  content text not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Indeks HNSW untuk pencarian kosinus (1024 dimensi).
create index if not exists chunks_embedding_hnsw on public.chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_user_doc on public.chunks (user_id, document_id);
create index if not exists documents_user on public.documents (user_id);
create index if not exists sessions_user on public.sessions (user_id, updated_at);
create index if not exists usage_user_date on public.usage (user_id, date);

-- ================= Row Level Security =================
-- Setiap baris hanya bisa dilihat/diubah oleh pemiliknya (user anonymous punya auth.uid()).

alter table public.sessions enable row level security;
alter table public.settings enable row level security;
alter table public.usage enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;

drop policy if exists "sessions_all_own" on public.sessions;
create policy "sessions_all_own" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "settings_all_own" on public.settings;
create policy "settings_all_own" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "usage_all_own" on public.usage;
create policy "usage_all_own" on public.usage
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "documents_all_own" on public.documents;
create policy "documents_all_own" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "chunks_all_own" on public.chunks;
create policy "chunks_all_own" on public.chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ================= RPC pencarian semantik =================
-- Kembalikan potongan paling mirip milik user (uid). Dipakai kb.js: client.rpc('match_chunks', { query_embedding, match_count, uid }).

create or replace function public.match_chunks(
  query_embedding vector(1024),
  match_count int,
  uid uuid
)
returns table (id text, document_id text, content text, similarity float)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select c.id, c.document_id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.user_id = uid
  order by c.embedding <=> query_embedding
  limit greatest(1, match_count);
end;
$$;

-- grant public.execute cukup (RLS chunks sudah membatasi ke pemilik)
revoke all on function public.match_chunks(vector(1024), int, uuid) from public;
grant execute on function public.match_chunks(vector(1024), int, uuid) to authenticated, anon;

-- ================= Realtime (sinkron lintas perangkat) =================
-- Supabase Wajib: publication default sudah ada. Tambahkan tabel sessions.

alter publication supabase_realtime add table public.sessions;
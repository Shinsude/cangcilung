-- Skema sinkronisasi cloud cangcilung (Supabase)
-- Jalankan di: Supabase Dashboard > SQL Editor > New query

create extension if not exists "pgcrypto";
create extension if not exists vector;

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

-- ================== BASIS PENGETAHUAN (RAG permanen, pgvector) ==================
-- Dokumen yang disimpan pengguna (dari file atau URL)
create table if not exists public.documents (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  title text not null default '',
  source text not null default 'file',              -- file | url
  meta jsonb not null default '{}'::jsonb,          -- nama file/asli, dsb.
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Potongan teks dokumen beserta embedding-nya (dimensi 1024 = jina-embeddings-v3)
create table if not exists public.chunks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  document_id text not null,
  foreign key (user_id, document_id) references public.documents (user_id, id) on delete cascade,
  idx integer not null default 0,
  content text not null,
  embedding vector(1024),
  primary key (user_id, id)
);

alter table public.documents enable row level security;
alter table public.chunks enable row level security;

create policy "own_documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_chunks" on public.chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists chunks_doc_idx on public.chunks (user_id, document_id);
create index if not exists chunks_embed_hnsw on public.chunks using hnsw (embedding vector_cosine_ops);

-- Pencarian semantik: potongan paling mirip dengan embedding pertanyaan
create or replace function public.match_chunks(
  query_embedding vector(1024),
  match_count int default 6,
  uid uuid default auth.uid()
) returns table (document_id text, content text, similarity float)
language sql stable security definer
set search_path = public
as $$
  select c.document_id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.user_id = uid
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

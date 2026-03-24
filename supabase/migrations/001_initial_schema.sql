-- Enable pgvector extension for embeddings
create extension if not exists vector with schema extensions;

-- Knowledge Bases
create table knowledge_bases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Podcasts
create table podcasts (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  url text not null,
  title text,
  channel text,
  duration_seconds int,
  thumbnail_url text,
  status text not null default 'pending'
    check (status in ('pending', 'downloading', 'transcribing', 'processing', 'ready', 'error')),
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Transcripts
create table transcripts (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  full_text text not null,
  segments jsonb default '[]'::jsonb,
  word_count int,
  created_at timestamptz default now()
);

-- Chunks (with vector embedding)
create table chunks (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  text text not null,
  start_time float,
  end_time float,
  token_count int,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Insights
create table insights (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  summary text,
  topics jsonb default '[]'::jsonb,
  key_points jsonb default '[]'::jsonb,
  entities jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Conversations
create table conversations (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  title text,
  created_at timestamptz default now()
);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb,
  created_at timestamptz default now()
);

-- Indexes
create index idx_podcasts_kb on podcasts(knowledge_base_id);
create index idx_chunks_kb on chunks(knowledge_base_id);
create index idx_chunks_podcast on chunks(podcast_id);
create index idx_messages_conversation on messages(conversation_id);
create index idx_conversations_kb on conversations(knowledge_base_id);

-- Updated_at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger knowledge_bases_updated_at
  before update on knowledge_bases
  for each row execute function update_updated_at();

create trigger podcasts_updated_at
  before update on podcasts
  for each row execute function update_updated_at();

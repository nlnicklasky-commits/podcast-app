-- ============================================================
-- Migration: Semantic Search infrastructure
--
-- 1. match_chunks_global RPC — vector search across all podcasts
-- 2. Update match_chunks RPC — add offset parameter for pagination
-- 3. search_history table — recent search queries
-- ============================================================

-- 1. Global vector search (no KB filter, searches all ready podcasts)
create or replace function match_chunks_global(
  query_embedding vector(1536),
  match_count int default 20,
  match_threshold float default 0.3,
  match_offset int default 0
)
returns table (
  id uuid,
  podcast_id uuid,
  text text,
  start_time float,
  end_time float,
  token_count int,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      c.id,
      c.podcast_id,
      c.text,
      c.start_time,
      c.end_time,
      c.token_count,
      1 - (c.embedding <=> query_embedding) as similarity
    from chunks c
    inner join podcasts p on p.id = c.podcast_id
    where p.status = 'ready'
      and 1 - (c.embedding <=> query_embedding) > match_threshold
    order by c.embedding <=> query_embedding
    limit match_count
    offset match_offset;
end;
$$;

-- 2. Recreate match_chunks with offset support
-- (preserves existing signature, adds optional match_offset)
create or replace function match_chunks(
  query_embedding vector(1536),
  match_kb_id uuid,
  match_count int default 10,
  match_threshold float default 0.3,
  match_offset int default 0
)
returns table (
  id uuid,
  podcast_id uuid,
  text text,
  start_time float,
  end_time float,
  token_count int,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      c.id,
      c.podcast_id,
      c.text,
      c.start_time,
      c.end_time,
      c.token_count,
      1 - (c.embedding <=> query_embedding) as similarity
    from chunks c
    inner join knowledge_base_podcasts kbp
      on kbp.podcast_id = c.podcast_id
      and kbp.knowledge_base_id = match_kb_id
    inner join podcasts p on p.id = c.podcast_id
    where p.status = 'ready'
      and 1 - (c.embedding <=> query_embedding) > match_threshold
    order by c.embedding <=> query_embedding
    limit match_count
    offset match_offset;
end;
$$;

-- 3. Search history
create table search_history (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  result_count int not null default 0,
  scope_type text not null default 'all'
    check (scope_type in ('all', 'knowledge_base', 'podcast')),
  scope_id uuid,
  created_at timestamptz default now()
);

create index idx_search_history_created on search_history(created_at desc);

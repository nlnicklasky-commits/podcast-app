-- ============================================================
-- Migration: Decouple podcasts from knowledge bases
--
-- Why: A single YouTube video can appear in multiple knowledge
-- bases. Without this, adding the same URL to two KBs would
-- download, transcribe, embed, and extract insights twice.
--
-- What changes:
-- 1. Add youtube_video_id to podcasts for deduplication
-- 2. Remove knowledge_base_id from podcasts (no longer 1:1)
-- 3. Create knowledge_base_podcasts junction table (many:many)
-- 4. Remove knowledge_base_id from chunks (derive via joins)
-- ============================================================

-- Step 1: Add youtube_video_id for dedup
alter table podcasts add column youtube_video_id text;

-- Unique index — only one row per YouTube video
-- WHERE clause allows NULLs (for any future non-YouTube sources)
create unique index idx_podcasts_youtube_video_id
  on podcasts(youtube_video_id)
  where youtube_video_id is not null;

-- Step 2: Create the many-to-many junction table
create table knowledge_base_podcasts (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid not null references knowledge_bases(id) on delete cascade,
  podcast_id uuid not null references podcasts(id) on delete cascade,
  created_at timestamptz default now(),
  unique(knowledge_base_id, podcast_id)
);

create index idx_kbp_kb on knowledge_base_podcasts(knowledge_base_id);
create index idx_kbp_podcast on knowledge_base_podcasts(podcast_id);

-- Step 3: Migrate existing data into the junction table
-- (copy current knowledge_base_id relationships before dropping the column)
insert into knowledge_base_podcasts (knowledge_base_id, podcast_id)
select knowledge_base_id, id from podcasts
where knowledge_base_id is not null;

-- Step 4: Drop the old direct FK from podcasts
alter table podcasts drop column knowledge_base_id;

-- Step 5: Drop knowledge_base_id from chunks
-- Vector search will now join: chunks → podcasts → knowledge_base_podcasts
-- to scope results to a specific KB
alter table chunks drop column knowledge_base_id;

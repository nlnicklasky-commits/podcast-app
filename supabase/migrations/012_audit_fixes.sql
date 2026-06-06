-- ============================================================
-- Migration 012: Audit fixes from r-1749174000
--
-- Addresses:
--   1. delete_podcast_data() — add ownership check (P0)
--   2. delete_knowledge_base_data() — add ownership check (P0)
--   3. Drop stale anon policies on kb_syntheses (P0)
--   4. Fix podcasts.status CHECK to include 'cancelled' (P1)
--   5. Revoke cleanup_expired_data from anon (P1, if exists)
--   6. Add missing indexes on user_id columns (P1, if columns exist)
--   7. Add HNSW vector index on chunks.embedding (P1)
-- ============================================================


-- ============================================================
-- 1. delete_podcast_data — ownership check before delete
--    Keeps SECURITY DEFINER. Allows NULL user_id (pre-auth data)
--    or matching auth.uid().
-- ============================================================
CREATE OR REPLACE FUNCTION delete_podcast_data(p_podcast_id uuid)
RETURNS jsonb AS $$
DECLARE
  podcast_title text;
  kbp_deleted int;
  insights_deleted int;
  chunks_deleted int;
  transcripts_deleted int;
  logs_deleted int;
BEGIN
  -- Ownership check: must be owner or pre-auth (NULL user_id)
  IF NOT EXISTS (
    SELECT 1 FROM podcasts
    WHERE id = p_podcast_id
    AND (user_id IS NULL OR user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Grab the title for the return value
  SELECT title INTO podcast_title FROM podcasts WHERE id = p_podcast_id;

  IF podcast_title IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Podcast not found: ' || p_podcast_id
    );
  END IF;

  -- Remove junction table entries (detach from all KBs)
  DELETE FROM knowledge_base_podcasts WHERE podcast_id = p_podcast_id;
  GET DIAGNOSTICS kbp_deleted = ROW_COUNT;

  -- Remove insights
  DELETE FROM insights WHERE podcast_id = p_podcast_id;
  GET DIAGNOSTICS insights_deleted = ROW_COUNT;

  -- Remove chunks (and their embeddings)
  DELETE FROM chunks WHERE podcast_id = p_podcast_id;
  GET DIAGNOSTICS chunks_deleted = ROW_COUNT;

  -- Remove transcripts
  DELETE FROM transcripts WHERE podcast_id = p_podcast_id;
  GET DIAGNOSTICS transcripts_deleted = ROW_COUNT;

  -- Remove processing logs (may not exist as a table)
  BEGIN
    DELETE FROM processing_logs WHERE podcast_id = p_podcast_id;
    GET DIAGNOSTICS logs_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    logs_deleted := 0;
  END;

  -- Remove the podcast itself
  DELETE FROM podcasts WHERE id = p_podcast_id;

  RETURN jsonb_build_object(
    'success', true,
    'podcast_id', p_podcast_id,
    'podcast_title', podcast_title,
    'deleted', jsonb_build_object(
      'knowledge_base_links', kbp_deleted,
      'insights', insights_deleted,
      'chunks', chunks_deleted,
      'transcripts', transcripts_deleted,
      'processing_logs', logs_deleted
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Keep grant to authenticated, revoke from anon
GRANT EXECUTE ON FUNCTION delete_podcast_data(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_podcast_data(uuid) FROM anon;


-- ============================================================
-- 2. delete_knowledge_base_data — ownership check before delete
-- ============================================================
CREATE OR REPLACE FUNCTION delete_knowledge_base_data(p_kb_id uuid)
RETURNS jsonb AS $$
DECLARE
  kb_name text;
  kbp_deleted int;
  conversations_deleted int;
BEGIN
  -- Ownership check: must be owner or pre-auth (NULL user_id)
  IF NOT EXISTS (
    SELECT 1 FROM knowledge_bases
    WHERE id = p_kb_id
    AND (user_id IS NULL OR user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT name INTO kb_name FROM knowledge_bases WHERE id = p_kb_id;

  IF kb_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Knowledge base not found: ' || p_kb_id
    );
  END IF;

  -- Count conversations before cascade delete removes them
  SELECT count(*) INTO conversations_deleted
  FROM conversations WHERE knowledge_base_id = p_kb_id;

  -- Count junction entries before cascade removes them
  SELECT count(*) INTO kbp_deleted
  FROM knowledge_base_podcasts WHERE knowledge_base_id = p_kb_id;

  -- Delete the KB — cascades to knowledge_base_podcasts,
  -- conversations, and messages
  DELETE FROM knowledge_bases WHERE id = p_kb_id;

  RETURN jsonb_build_object(
    'success', true,
    'knowledge_base_id', p_kb_id,
    'knowledge_base_name', kb_name,
    'deleted', jsonb_build_object(
      'podcast_links', kbp_deleted,
      'conversations', conversations_deleted
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_knowledge_base_data(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_knowledge_base_data(uuid) FROM anon;


-- ============================================================
-- 3. Drop stale anon policies on kb_syntheses
--    Migration 009 tried to drop "anon_select_kb_syntheses" but
--    the actual policy name from 008 is "anon_select_syntheses".
-- ============================================================
DROP POLICY IF EXISTS "anon_select_syntheses" ON kb_syntheses;
DROP POLICY IF EXISTS "anon_insert_syntheses" ON kb_syntheses;


-- ============================================================
-- 4. Fix podcasts.status CHECK to include 'cancelled'
-- ============================================================
ALTER TABLE podcasts DROP CONSTRAINT IF EXISTS podcasts_status_check;
ALTER TABLE podcasts ADD CONSTRAINT podcasts_status_check
  CHECK (status IN ('pending', 'downloading', 'transcribing', 'processing', 'ready', 'error', 'cancelled'));


-- ============================================================
-- 5. Revoke cleanup_expired_data from anon (if function exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_expired_data'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION cleanup_expired_data() FROM anon';
  END IF;
END
$$;


-- ============================================================
-- 6. Add missing indexes on user_id columns (if columns exist)
--    These columns are added by migration 009. If 009 hasn't
--    been applied, these are safe no-ops.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'podcasts' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_podcasts_user_id ON podcasts(user_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'knowledge_bases' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_kb_user_id ON knowledge_bases(user_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'user_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
  END IF;
END
$$;


-- ============================================================
-- 7. Add HNSW vector index on chunks.embedding
--    Eliminates brute-force seq scans for vector similarity search.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);

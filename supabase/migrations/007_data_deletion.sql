-- ============================================================
-- Migration 007: Data deletion utilities and cascade verification
--
-- Existing ON DELETE CASCADE (from migrations 001 + 002):
--   podcasts        → transcripts (cascade)
--   podcasts        → chunks (cascade)
--   podcasts        → insights (cascade)
--   podcasts        → knowledge_base_podcasts (cascade)
--   knowledge_bases → knowledge_base_podcasts (cascade)
--   knowledge_bases → conversations (cascade)
--   conversations   → messages (cascade)
--
-- Missing cascades:
--   podcasts → processing_logs (table created outside migrations,
--     may not have ON DELETE CASCADE — we fix that here)
--
-- This migration also adds:
--   1. CASCADE fix for processing_logs.podcast_id (if needed)
--   2. delete_podcast_data(uuid) — targeted podcast removal
--   3. delete_knowledge_base_data(uuid) — targeted KB removal
--   4. delete_all_user_data() — nuclear option / GDPR erasure
-- ============================================================


-- ============================================================
-- 1. Fix processing_logs FK cascade (if table exists)
--
-- processing_logs was created outside migrations and may lack
-- ON DELETE CASCADE. We drop and re-add the FK constraint.
-- ============================================================
DO $$
DECLARE
  fk_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'processing_logs'
  ) THEN
    RAISE NOTICE 'processing_logs table not found — skipping FK fix';
    RETURN;
  END IF;

  -- Check if there's an existing FK constraint on podcast_id
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'processing_logs'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'podcast_id'
  LIMIT 1;

  -- Drop existing FK if found
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE processing_logs DROP CONSTRAINT %I', fk_name);
    RAISE NOTICE 'Dropped FK constraint % on processing_logs.podcast_id', fk_name;
  END IF;

  -- Add FK with ON DELETE CASCADE
  ALTER TABLE processing_logs
    ADD CONSTRAINT fk_processing_logs_podcast
    FOREIGN KEY (podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE;

  RAISE NOTICE 'Added ON DELETE CASCADE FK on processing_logs.podcast_id';
END
$$;


-- ============================================================
-- 2. delete_podcast_data(uuid) — remove a single podcast and
--    all its associated data
--
-- Most data is cascade-deleted when the podcast row is removed,
-- but we explicitly clean up everything for clarity and safety.
--
-- SECURITY DEFINER: runs as the function owner (postgres) so
-- it bypasses RLS. Only callable via supabase.rpc().
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

-- Grant to anon so the frontend can call via supabase.rpc()
GRANT EXECUTE ON FUNCTION delete_podcast_data(uuid) TO anon;


-- ============================================================
-- 3. delete_knowledge_base_data(uuid) — remove a KB and detach
--    its podcasts (but NOT delete shared podcasts)
--
-- Behavior:
--   - Deletes the KB, its conversations, and messages (cascade)
--   - Removes junction table entries (knowledge_base_podcasts)
--   - Does NOT delete podcasts — they may belong to other KBs
--   - Orphaned podcasts (not in any KB) are left intact
-- ============================================================
CREATE OR REPLACE FUNCTION delete_knowledge_base_data(p_kb_id uuid)
RETURNS jsonb AS $$
DECLARE
  kb_name text;
  kbp_deleted int;
  conversations_deleted int;
BEGIN
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

GRANT EXECUTE ON FUNCTION delete_knowledge_base_data(uuid) TO anon;


-- ============================================================
-- 4. delete_all_user_data() — GDPR right to erasure
--
-- Wipes ALL user data from the database. This is the nuclear
-- option. Order matters to respect FK constraints (even though
-- cascades handle most of it, explicit ordering is safer).
--
-- NOTE: This does NOT clean up Supabase Storage (podcast-audio
-- bucket). Storage cleanup should be done via Edge Function or
-- Dashboard. In practice, audio files are already deleted after
-- processing, so the bucket should be empty.
-- ============================================================
CREATE OR REPLACE FUNCTION delete_all_user_data()
RETURNS jsonb AS $$
DECLARE
  messages_deleted int;
  conversations_deleted int;
  search_deleted int;
  logs_deleted int;
  insights_deleted int;
  chunks_deleted int;
  transcripts_deleted int;
  kbp_deleted int;
  podcasts_deleted int;
  kbs_deleted int;
BEGIN
  -- 1. Messages (depends on conversations)
  DELETE FROM messages;
  GET DIAGNOSTICS messages_deleted = ROW_COUNT;

  -- 2. Conversations (depends on knowledge_bases)
  DELETE FROM conversations;
  GET DIAGNOSTICS conversations_deleted = ROW_COUNT;

  -- 3. Search history (standalone)
  DELETE FROM search_history;
  GET DIAGNOSTICS search_deleted = ROW_COUNT;

  -- 4. Processing logs (depends on podcasts, may not exist)
  BEGIN
    DELETE FROM processing_logs;
    GET DIAGNOSTICS logs_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    logs_deleted := 0;
  END;

  -- 5. Insights (depends on podcasts)
  DELETE FROM insights;
  GET DIAGNOSTICS insights_deleted = ROW_COUNT;

  -- 6. Chunks (depends on podcasts)
  DELETE FROM chunks;
  GET DIAGNOSTICS chunks_deleted = ROW_COUNT;

  -- 7. Transcripts (depends on podcasts)
  DELETE FROM transcripts;
  GET DIAGNOSTICS transcripts_deleted = ROW_COUNT;

  -- 8. Junction table (depends on both knowledge_bases and podcasts)
  DELETE FROM knowledge_base_podcasts;
  GET DIAGNOSTICS kbp_deleted = ROW_COUNT;

  -- 9. Podcasts
  DELETE FROM podcasts;
  GET DIAGNOSTICS podcasts_deleted = ROW_COUNT;

  -- 10. Knowledge bases
  DELETE FROM knowledge_bases;
  GET DIAGNOSTICS kbs_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'messages', messages_deleted,
      'conversations', conversations_deleted,
      'search_history', search_deleted,
      'processing_logs', logs_deleted,
      'insights', insights_deleted,
      'chunks', chunks_deleted,
      'transcripts', transcripts_deleted,
      'knowledge_base_podcasts', kbp_deleted,
      'podcasts', podcasts_deleted,
      'knowledge_bases', kbs_deleted
    ),
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DO NOT grant to anon — this should only be callable by
-- service_role (or from the Dashboard SQL editor).
-- When auth is added, grant to authenticated with additional
-- safeguards (e.g., require re-authentication).
REVOKE EXECUTE ON FUNCTION delete_all_user_data() FROM anon;
REVOKE EXECUTE ON FUNCTION delete_all_user_data() FROM public;

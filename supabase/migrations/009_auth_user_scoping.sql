-- ============================================================
-- Migration 009: Auth user scoping
--
-- Adds user_id columns to user-facing tables and replaces
-- anon RLS policies with authenticated policies scoped to
-- auth.uid(). Backend-only tables remain service_role-write
-- with authenticated SELECT via join to user-owned podcast.
--
-- After applying this migration:
--   1. Enable Google + GitHub OAuth in Supabase Dashboard
--   2. Enable Email (Magic Link) auth in Supabase Dashboard
--   3. Backfill user_id on existing rows if needed
-- ============================================================


-- ============================================================
-- 1. Add user_id columns to user-facing tables
-- ============================================================
ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);


-- ============================================================
-- 2. Drop ALL existing anon policies (from migration 005)
-- ============================================================

-- knowledge_bases
DROP POLICY IF EXISTS "anon_select_knowledge_bases" ON knowledge_bases;
DROP POLICY IF EXISTS "anon_insert_knowledge_bases" ON knowledge_bases;
DROP POLICY IF EXISTS "anon_update_knowledge_bases" ON knowledge_bases;
DROP POLICY IF EXISTS "anon_delete_knowledge_bases" ON knowledge_bases;

-- podcasts
DROP POLICY IF EXISTS "anon_select_podcasts" ON podcasts;
DROP POLICY IF EXISTS "anon_insert_podcasts" ON podcasts;
DROP POLICY IF EXISTS "anon_update_podcasts" ON podcasts;

-- knowledge_base_podcasts
DROP POLICY IF EXISTS "anon_select_knowledge_base_podcasts" ON knowledge_base_podcasts;
DROP POLICY IF EXISTS "anon_insert_knowledge_base_podcasts" ON knowledge_base_podcasts;
DROP POLICY IF EXISTS "anon_delete_knowledge_base_podcasts" ON knowledge_base_podcasts;

-- transcripts
DROP POLICY IF EXISTS "anon_select_transcripts" ON transcripts;

-- chunks
DROP POLICY IF EXISTS "anon_select_chunks" ON chunks;

-- insights
DROP POLICY IF EXISTS "anon_select_insights" ON insights;

-- conversations
DROP POLICY IF EXISTS "anon_select_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_insert_conversations" ON conversations;
DROP POLICY IF EXISTS "anon_delete_conversations" ON conversations;

-- messages
DROP POLICY IF EXISTS "anon_select_messages" ON messages;
DROP POLICY IF EXISTS "anon_insert_messages" ON messages;
DROP POLICY IF EXISTS "anon_delete_messages" ON messages;

-- processing_logs
DROP POLICY IF EXISTS "anon_select_processing_logs" ON processing_logs;

-- search_history
DROP POLICY IF EXISTS "anon_select_search_history" ON search_history;
DROP POLICY IF EXISTS "anon_insert_search_history" ON search_history;

-- kb_syntheses (from migration 008)
DROP POLICY IF EXISTS "anon_select_kb_syntheses" ON kb_syntheses;


-- ============================================================
-- 3. Authenticated policies — knowledge_bases
-- ============================================================
CREATE POLICY "auth_select_knowledge_bases" ON knowledge_bases
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "auth_insert_knowledge_bases" ON knowledge_bases
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_update_knowledge_bases" ON knowledge_bases
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_delete_knowledge_bases" ON knowledge_bases
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================
-- 4. Authenticated policies — podcasts
-- ============================================================
CREATE POLICY "auth_select_podcasts" ON podcasts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "auth_insert_podcasts" ON podcasts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_update_podcasts" ON podcasts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_delete_podcasts" ON podcasts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================
-- 5. Authenticated policies — knowledge_base_podcasts
--    User can manage junction rows where they own the KB
-- ============================================================
CREATE POLICY "auth_select_knowledge_base_podcasts" ON knowledge_base_podcasts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_base_podcasts.knowledge_base_id
        AND knowledge_bases.user_id = auth.uid()
    )
  );

CREATE POLICY "auth_insert_knowledge_base_podcasts" ON knowledge_base_podcasts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_base_podcasts.knowledge_base_id
        AND knowledge_bases.user_id = auth.uid()
    )
  );

CREATE POLICY "auth_delete_knowledge_base_podcasts" ON knowledge_base_podcasts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_bases
      WHERE knowledge_bases.id = knowledge_base_podcasts.knowledge_base_id
        AND knowledge_bases.user_id = auth.uid()
    )
  );


-- ============================================================
-- 6. Authenticated policies — conversations
-- ============================================================
CREATE POLICY "auth_select_conversations" ON conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "auth_insert_conversations" ON conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_delete_conversations" ON conversations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================
-- 7. Authenticated policies — messages
--    User can access messages in their own conversations
-- ============================================================
CREATE POLICY "auth_select_messages" ON messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "auth_insert_messages" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "auth_delete_messages" ON messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.user_id = auth.uid()
    )
  );


-- ============================================================
-- 8. Authenticated policies — search_history
-- ============================================================
CREATE POLICY "auth_select_search_history" ON search_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "auth_insert_search_history" ON search_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_delete_search_history" ON search_history
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ============================================================
-- 9. Backend tables — authenticated SELECT via podcast ownership
--    service_role writes (Edge Functions bypass RLS)
-- ============================================================

-- transcripts: readable if user owns the podcast
CREATE POLICY "auth_select_transcripts" ON transcripts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM podcasts
      WHERE podcasts.id = transcripts.podcast_id
        AND podcasts.user_id = auth.uid()
    )
  );

-- chunks: readable if user owns the podcast
CREATE POLICY "auth_select_chunks" ON chunks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM podcasts
      WHERE podcasts.id = chunks.podcast_id
        AND podcasts.user_id = auth.uid()
    )
  );

-- insights: readable if user owns the podcast
CREATE POLICY "auth_select_insights" ON insights
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM podcasts
      WHERE podcasts.id = insights.podcast_id
        AND podcasts.user_id = auth.uid()
    )
  );

-- processing_logs: readable + insertable if user owns the podcast
-- (frontend inserts cancellation logs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'processing_logs'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'processing_logs' AND policyname = 'auth_select_processing_logs'
    ) THEN
      CREATE POLICY "auth_select_processing_logs" ON processing_logs
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM podcasts
            WHERE podcasts.id = processing_logs.podcast_id
              AND podcasts.user_id = auth.uid()
          )
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'processing_logs' AND policyname = 'auth_insert_processing_logs'
    ) THEN
      CREATE POLICY "auth_insert_processing_logs" ON processing_logs
        FOR INSERT TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM podcasts
            WHERE podcasts.id = processing_logs.podcast_id
              AND podcasts.user_id = auth.uid()
          )
        );
    END IF;
  END IF;
END
$$;


-- ============================================================
-- 10. kb_syntheses — authenticated SELECT via KB ownership
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kb_syntheses'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'kb_syntheses' AND policyname = 'auth_select_kb_syntheses'
    ) THEN
      CREATE POLICY "auth_select_kb_syntheses" ON kb_syntheses
        FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM knowledge_bases
            WHERE knowledge_bases.id = kb_syntheses.knowledge_base_id
              AND knowledge_bases.user_id = auth.uid()
          )
        );
    END IF;
  END IF;
END
$$;


-- ============================================================
-- 11. Update delete_all_user_data() to scope to auth.uid()
--     and grant to authenticated role
-- ============================================================
CREATE OR REPLACE FUNCTION delete_all_user_data()
RETURNS jsonb AS $$
DECLARE
  calling_user_id uuid;
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
  syntheses_deleted int;
BEGIN
  calling_user_id := auth.uid();

  IF calling_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  -- 1. Messages (via user-owned conversations)
  DELETE FROM messages WHERE conversation_id IN (
    SELECT id FROM conversations WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS messages_deleted = ROW_COUNT;

  -- 2. Conversations
  DELETE FROM conversations WHERE user_id = calling_user_id;
  GET DIAGNOSTICS conversations_deleted = ROW_COUNT;

  -- 3. Search history
  DELETE FROM search_history WHERE user_id = calling_user_id;
  GET DIAGNOSTICS search_deleted = ROW_COUNT;

  -- 4. Processing logs (via user-owned podcasts)
  BEGIN
    DELETE FROM processing_logs WHERE podcast_id IN (
      SELECT id FROM podcasts WHERE user_id = calling_user_id
    );
    GET DIAGNOSTICS logs_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    logs_deleted := 0;
  END;

  -- 5. Insights (via user-owned podcasts)
  DELETE FROM insights WHERE podcast_id IN (
    SELECT id FROM podcasts WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS insights_deleted = ROW_COUNT;

  -- 6. Chunks (via user-owned podcasts)
  DELETE FROM chunks WHERE podcast_id IN (
    SELECT id FROM podcasts WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS chunks_deleted = ROW_COUNT;

  -- 7. Transcripts (via user-owned podcasts)
  DELETE FROM transcripts WHERE podcast_id IN (
    SELECT id FROM podcasts WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS transcripts_deleted = ROW_COUNT;

  -- 8. KB syntheses (via user-owned KBs)
  BEGIN
    DELETE FROM kb_syntheses WHERE knowledge_base_id IN (
      SELECT id FROM knowledge_bases WHERE user_id = calling_user_id
    );
    GET DIAGNOSTICS syntheses_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    syntheses_deleted := 0;
  END;

  -- 9. Junction table (via user-owned KBs)
  DELETE FROM knowledge_base_podcasts WHERE knowledge_base_id IN (
    SELECT id FROM knowledge_bases WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS kbp_deleted = ROW_COUNT;

  -- 10. Podcasts
  DELETE FROM podcasts WHERE user_id = calling_user_id;
  GET DIAGNOSTICS podcasts_deleted = ROW_COUNT;

  -- 11. Knowledge bases
  DELETE FROM knowledge_bases WHERE user_id = calling_user_id;
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
      'kb_syntheses', syntheses_deleted,
      'knowledge_base_podcasts', kbp_deleted,
      'podcasts', podcasts_deleted,
      'knowledge_bases', kbs_deleted
    ),
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant to authenticated (was previously revoked from anon/public)
GRANT EXECUTE ON FUNCTION delete_all_user_data() TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_all_user_data() FROM anon;
REVOKE EXECUTE ON FUNCTION delete_all_user_data() FROM public;


-- ============================================================
-- 12. Update delete_podcast_data and delete_knowledge_base_data
--     Grant to authenticated, revoke from anon
-- ============================================================
GRANT EXECUTE ON FUNCTION delete_podcast_data(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_podcast_data(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION delete_knowledge_base_data(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_knowledge_base_data(uuid) FROM anon;

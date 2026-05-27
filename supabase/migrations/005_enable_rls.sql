-- ============================================================
-- Migration 005: Enable Row-Level Security on all tables
--
-- STOPGAP SECURITY LAYER — tighten when Supabase Auth is added
--
-- Current state: Zero RLS. The anon key is exposed in the
-- frontend (by Supabase design), meaning anyone with the key
-- can read, write, and delete ALL data in ALL tables.
--
-- Strategy:
--   - service_role bypasses RLS by default, so Edge Functions
--     (process-podcast, chat, etc.) are unaffected.
--   - anon gets SELECT on all tables (app needs reads).
--   - anon gets INSERT on tables where the frontend creates
--     records (knowledge_bases, podcasts, knowledge_base_podcasts,
--     conversations, messages, search_history).
--   - anon gets UPDATE only on tables the frontend mutates
--     (podcasts for status/progress, knowledge_bases for name/desc).
--   - anon gets DELETE only where the UI has delete buttons
--     (knowledge_bases, knowledge_base_podcasts, conversations, messages).
--   - Backend-only tables (transcripts, chunks, insights,
--     processing_logs) are read-only for anon — only service_role
--     (Edge Functions) can write to them.
--
-- TODO when auth is added:
--   1. Add user_id column to knowledge_bases (and possibly podcasts)
--   2. Replace all USING (true) with USING (auth.uid() = user_id)
--   3. Remove anon policies, replace with authenticated role policies
--   4. Add RLS to storage.objects scoped to auth.uid()
-- ============================================================


-- ============================================================
-- 1. knowledge_bases — full CRUD for anon
-- ============================================================
ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_knowledge_bases" ON knowledge_bases
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_knowledge_bases" ON knowledge_bases
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_knowledge_bases" ON knowledge_bases
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_knowledge_bases" ON knowledge_bases
  FOR DELETE TO anon USING (true);


-- ============================================================
-- 2. podcasts — anon can SELECT, INSERT, UPDATE (status/progress)
--    No anon DELETE — use delete_podcast_data() or cascade from KB
-- ============================================================
ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_podcasts" ON podcasts
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_podcasts" ON podcasts
  FOR INSERT TO anon WITH CHECK (true);

-- Frontend updates status (cancelled) and the UI reads progress.
-- Edge functions use service_role so they bypass RLS anyway.
CREATE POLICY "anon_update_podcasts" ON podcasts
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- No anon DELETE policy — podcasts should be removed via
-- the delete_podcast_data() function or cascade from KB deletion.


-- ============================================================
-- 3. knowledge_base_podcasts — anon can SELECT, INSERT, DELETE
--    (UI adds/removes podcasts from KBs)
-- ============================================================
ALTER TABLE knowledge_base_podcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_knowledge_base_podcasts" ON knowledge_base_podcasts
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_knowledge_base_podcasts" ON knowledge_base_podcasts
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_delete_knowledge_base_podcasts" ON knowledge_base_podcasts
  FOR DELETE TO anon USING (true);

-- No anon UPDATE — junction rows are immutable (add or remove, never edit)


-- ============================================================
-- 4. transcripts — READ-ONLY for anon
--    Only service_role (Edge Functions) writes transcripts.
-- ============================================================
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_transcripts" ON transcripts
  FOR SELECT TO anon USING (true);

-- No INSERT/UPDATE/DELETE for anon — service_role bypasses RLS


-- ============================================================
-- 5. chunks — READ-ONLY for anon
--    Only service_role (Edge Functions) writes chunks.
-- ============================================================
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_chunks" ON chunks
  FOR SELECT TO anon USING (true);

-- No INSERT/UPDATE/DELETE for anon — service_role bypasses RLS


-- ============================================================
-- 6. insights — READ-ONLY for anon
--    Only service_role (Edge Functions) writes insights.
-- ============================================================
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_insights" ON insights
  FOR SELECT TO anon USING (true);

-- No INSERT/UPDATE/DELETE for anon — service_role bypasses RLS


-- ============================================================
-- 7. conversations — anon can SELECT, INSERT, DELETE
--    (UI creates and deletes conversations)
-- ============================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_conversations" ON conversations
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_conversations" ON conversations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_delete_conversations" ON conversations
  FOR DELETE TO anon USING (true);

-- No anon UPDATE — conversation titles are set at creation


-- ============================================================
-- 8. messages — anon can SELECT, INSERT, DELETE
--    (UI sends messages and may delete conversations with messages)
-- ============================================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_messages" ON messages
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_messages" ON messages
  FOR INSERT TO anon WITH CHECK (true);

-- Allow delete so cascading conversation deletion works from frontend.
-- Messages are never individually deleted, only via conversation delete.
CREATE POLICY "anon_delete_messages" ON messages
  FOR DELETE TO anon USING (true);

-- No anon UPDATE — messages are immutable once sent


-- ============================================================
-- 9. processing_logs — READ-ONLY for anon
--    Only service_role (Edge Functions) writes logs.
--    Note: This table may have been created outside of migrations
--    (via Dashboard). If it doesn't exist, this will error —
--    apply via Dashboard SQL editor instead.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'processing_logs'
  ) THEN
    ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;

    -- Create policies only if they don't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'processing_logs' AND policyname = 'anon_select_processing_logs'
    ) THEN
      CREATE POLICY "anon_select_processing_logs" ON processing_logs
        FOR SELECT TO anon USING (true);
    END IF;
  END IF;
END
$$;

-- No INSERT/UPDATE/DELETE for anon — service_role bypasses RLS


-- ============================================================
-- 10. search_history — anon can SELECT and INSERT
--     (UI writes search queries and reads recent history)
-- ============================================================
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_search_history" ON search_history
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_search_history" ON search_history
  FOR INSERT TO anon WITH CHECK (true);

-- No anon UPDATE/DELETE — search history is append-only,
-- cleaned up by retention function (see migration 006)


-- ============================================================
-- 11. Storage bucket: podcast-audio
--
-- Storage policies live on storage.objects and were created via
-- the Supabase Dashboard. We attempt to drop overly permissive
-- anon policies here. If the policy names don't match what was
-- created in the Dashboard, run these manually via SQL Editor:
--
--   SELECT policyname FROM pg_policies
--     WHERE tablename = 'objects' AND schemaname = 'storage';
--
-- Then drop any anon INSERT/UPDATE/DELETE policies by name.
--
-- Goal: Only service_role (Edge Functions) should write to
-- podcast-audio. Audio files are temporary (uploaded during
-- processing, deleted after transcription).
-- ============================================================

-- Common policy names created by Supabase Dashboard UI
DROP POLICY IF EXISTS "allow_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "allow_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "allow_anon_delete" ON storage.objects;
DROP POLICY IF EXISTS "allow_anon_select" ON storage.objects;

-- Alternative naming patterns the Dashboard may have used
DROP POLICY IF EXISTS "Give anon access to upload" ON storage.objects;
DROP POLICY IF EXISTS "Give anon access to update" ON storage.objects;
DROP POLICY IF EXISTS "Give anon access to delete" ON storage.objects;
DROP POLICY IF EXISTS "Give anon access to read" ON storage.objects;

-- Bucket-specific policy names (another common Dashboard pattern)
DROP POLICY IF EXISTS "podcast-audio_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "podcast-audio_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "podcast-audio_anon_delete" ON storage.objects;
DROP POLICY IF EXISTS "podcast-audio_anon_select" ON storage.objects;

-- NOTE: If none of the above policy names matched, you need to
-- check the actual names in the Dashboard under Storage > Policies,
-- or run:
--   SELECT policyname, roles, cmd
--   FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects';
-- Then drop any anon write policies manually.
--
-- service_role bypasses RLS on storage.objects by default,
-- so Edge Functions will continue to work without any policies.

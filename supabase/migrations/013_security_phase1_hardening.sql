-- =====================================================================
-- 013_security_phase1_hardening.sql
-- PHASE 1 of the security cutover: changes that are SAFE TO APPLY NOW,
-- while the live app is still anonymous. None of this enables RLS or
-- revokes the anon table grants (that is 014, applied at cutover).
--
-- Reconciles the DRIFTED prod state:
--   * adds the missing user_id ownership columns (nullable for now)
--   * creates the missing feed_subscriptions table
--   * fixes the two delete_* RPCs (they currently reference user_id
--     columns that don't exist, so they throw if ever called)
--   * creates delete_all_user_data() (the Profile page already calls it)
--   * pins search_path on every SECURITY DEFINER / flagged function
--   * revokes the dangerous anon EXECUTE on the delete RPCs
--   * drops the 4 anon policies on the private podcast-audio bucket
--
-- Idempotent: safe to re-run.
-- =====================================================================


-- =====================================================================
-- SECTION A - SCHEMA: ownership columns + feed_subscriptions
-- Nullable columns and a new empty table are invisible to the running
-- anon app, so this is a no-op for current behaviour.
-- =====================================================================

ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE conversations   ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE search_history  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
-- NOTE: podcasts / transcripts / chunks / insights get NO user_id by design.
--       They are shared, deduplicated catalog/derived content (one row per
--       unique episode). Ownership flows through knowledge_base_podcasts -> KB.
--       playback_progress already has user_id (NOT NULL) + RLS.

CREATE INDEX IF NOT EXISTS idx_kb_user_id             ON knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id  ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);

-- feed_subscriptions was never created in prod (migration 011 not applied),
-- yet the Subscribe UI + poll-subscriptions edge fn reference it. Create the
-- superset of columns both the frontend and the edge function use.
CREATE TABLE IF NOT EXISTS feed_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_id         bigint NOT NULL,
  feed_url        text NOT NULL,
  feed_title      text,
  feed_artwork    text,
  feed_author     text,
  auto_process    boolean DEFAULT false,
  is_active       boolean DEFAULT true,
  last_checked_at timestamptz,
  last_episode_at timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, feed_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_subs_user   ON feed_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_subs_active ON feed_subscriptions(is_active, last_checked_at);

-- update_updated_at() exists from the initial schema; (re)attach its trigger.
DROP TRIGGER IF EXISTS feed_subscriptions_updated_at ON feed_subscriptions;
CREATE TRIGGER feed_subscriptions_updated_at
  BEFORE UPDATE ON feed_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =====================================================================
-- SECTION C - PRIVILEGED FUNCTIONS: fix bodies, pin search_path, tighten grants
-- =====================================================================

-- delete_podcast_data: the live body filters podcasts by podcasts.user_id,
-- a column that does not exist -> it throws today. Rewrite ownership to the
-- shared-podcast model (KB/junction), pin search_path. service_role bypasses
-- the check (auth.uid() IS NULL); a fully-orphaned podcast is deletable by
-- any authed caller.
CREATE OR REPLACE FUNCTION public.delete_podcast_data(p_podcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  podcast_title       text;
  kbp_deleted         int;
  insights_deleted    int;
  chunks_deleted      int;
  transcripts_deleted int;
  logs_deleted        int;
BEGIN
  -- Ownership: a signed-in caller may delete only if they own a KB linked to
  -- this podcast, OR the podcast is orphaned (linked to no KB at all).
  IF auth.uid() IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM knowledge_base_podcasts j WHERE j.podcast_id = p_podcast_id)
       AND NOT EXISTS (
         SELECT 1 FROM knowledge_base_podcasts j
         JOIN knowledge_bases kb ON kb.id = j.knowledge_base_id
         WHERE j.podcast_id = p_podcast_id AND kb.user_id = auth.uid()
       )
    THEN
      RAISE EXCEPTION 'Not authorized to delete this podcast';
    END IF;
  END IF;

  SELECT title INTO podcast_title FROM podcasts WHERE id = p_podcast_id;
  IF podcast_title IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Podcast not found: ' || p_podcast_id);
  END IF;

  DELETE FROM knowledge_base_podcasts WHERE podcast_id = p_podcast_id; GET DIAGNOSTICS kbp_deleted = ROW_COUNT;
  DELETE FROM insights    WHERE podcast_id = p_podcast_id; GET DIAGNOSTICS insights_deleted = ROW_COUNT;
  DELETE FROM chunks      WHERE podcast_id = p_podcast_id; GET DIAGNOSTICS chunks_deleted = ROW_COUNT;
  DELETE FROM transcripts WHERE podcast_id = p_podcast_id; GET DIAGNOSTICS transcripts_deleted = ROW_COUNT;
  BEGIN
    DELETE FROM processing_logs WHERE podcast_id = p_podcast_id; GET DIAGNOSTICS logs_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    logs_deleted := 0;
  END;
  DELETE FROM podcasts WHERE id = p_podcast_id;

  RETURN jsonb_build_object(
    'success', true, 'podcast_id', p_podcast_id, 'podcast_title', podcast_title,
    'deleted', jsonb_build_object(
      'knowledge_base_links', kbp_deleted, 'insights', insights_deleted,
      'chunks', chunks_deleted, 'transcripts', transcripts_deleted, 'processing_logs', logs_deleted));
END $$;

-- delete_knowledge_base_data: keep existing behaviour, pin search_path. Its
-- ownership clause (user_id IS NULL OR user_id = auth.uid()) starts working
-- now that knowledge_bases.user_id exists (Section A).
CREATE OR REPLACE FUNCTION public.delete_knowledge_base_data(p_kb_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  kb_name               text;
  kbp_deleted           int;
  conversations_deleted int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM knowledge_bases
    WHERE id = p_kb_id AND (user_id IS NULL OR user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT name INTO kb_name FROM knowledge_bases WHERE id = p_kb_id;
  IF kb_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Knowledge base not found: ' || p_kb_id);
  END IF;

  SELECT count(*) INTO conversations_deleted FROM conversations WHERE knowledge_base_id = p_kb_id;
  SELECT count(*) INTO kbp_deleted FROM knowledge_base_podcasts WHERE knowledge_base_id = p_kb_id;

  DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE knowledge_base_id = p_kb_id);
  DELETE FROM conversations           WHERE knowledge_base_id = p_kb_id;
  DELETE FROM kb_syntheses            WHERE knowledge_base_id = p_kb_id;
  DELETE FROM knowledge_base_podcasts WHERE knowledge_base_id = p_kb_id;
  DELETE FROM knowledge_bases         WHERE id = p_kb_id;

  RETURN jsonb_build_object(
    'success', true, 'knowledge_base_id', p_kb_id, 'knowledge_base_name', kb_name,
    'deleted', jsonb_build_object('podcast_links', kbp_deleted, 'conversations', conversations_deleted));
END $$;

-- delete_all_user_data: the Profile page calls this but it does NOT exist in
-- prod (PGRST202). Create it: scoped to auth.uid(), shared catalog untouched.
CREATE OR REPLACE FUNCTION public.delete_all_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid        uuid := auth.uid();
  kb_count   int;
  conv_count int;
  sh_deleted int;
  pp_deleted int;
  fs_deleted int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(*) INTO kb_count   FROM knowledge_bases WHERE user_id = uid;
  SELECT count(*) INTO conv_count FROM conversations   WHERE user_id = uid;

  DELETE FROM search_history    WHERE user_id = uid; GET DIAGNOSTICS sh_deleted = ROW_COUNT;
  DELETE FROM playback_progress WHERE user_id = uid; GET DIAGNOSTICS pp_deleted = ROW_COUNT;
  DELETE FROM feed_subscriptions WHERE user_id = uid; GET DIAGNOSTICS fs_deleted = ROW_COUNT;
  -- messages cascade from conversations; junction + kb_syntheses cascade from KB.
  DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = uid);
  DELETE FROM conversations   WHERE user_id = uid;
  DELETE FROM knowledge_bases WHERE user_id = uid;

  RETURN jsonb_build_object('success', true, 'deleted', jsonb_build_object(
    'knowledge_bases', kb_count, 'conversations', conv_count,
    'search_history', sh_deleted, 'playback_progress', pp_deleted, 'feed_subscriptions', fs_deleted));
END $$;

-- Pin search_path on the remaining flagged functions (closes lint 0011).
-- Resolve exact signatures dynamically so the pgvector `vector` arg type
-- (which lives in the extensions schema) can't break type resolution, and
-- both match_chunks overloads are covered automatically.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'ALTER FUNCTION public.' || p.proname || '(' ||
           pg_get_function_identity_arguments(p.oid) || ') SET search_path = public, pg_temp' AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('update_updated_at', 'match_chunks', 'match_chunks_global')
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;

-- Revoke the dangerous anon-callable delete RPCs (lint 0028). Confirmed: the
-- frontend's ONLY rpc() call is delete_all_user_data, so this breaks nothing.
REVOKE EXECUTE ON FUNCTION public.delete_podcast_data(uuid)        FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_knowledge_base_data(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.delete_all_user_data()           FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.delete_podcast_data(uuid)        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_knowledge_base_data(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_all_user_data()           TO authenticated;


-- =====================================================================
-- SECTION F - STORAGE: drop the 4 anon policies on the private bucket
-- The browser never touches podcast-audio; only process-podcast does, as
-- service_role (the "Allow service role all" policy is retained). Exact
-- live policy names confirmed via pg_policies.
-- =====================================================================

DROP POLICY IF EXISTS "Allow anon reads"   ON storage.objects;
DROP POLICY IF EXISTS "Allow anon uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon deletes" ON storage.objects;
-- KEEP "Allow service role all".

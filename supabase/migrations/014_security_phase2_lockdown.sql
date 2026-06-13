-- =====================================================================
-- 014_security_phase2_lockdown.sql
-- PHASE 2 of the security cutover: the POINT OF NO RETURN for anon.
--
-- *** DO NOT APPLY until BOTH are true: ***
--   1. The owner has signed up (so auth.users has a row to backfill to).
--   2. The new frontend (real AuthGate + user_id stamping + JWT-forwarding
--      edge callers) is DEPLOYED to production.
-- Applying this while the live app is still anonymous will return zero rows
-- for every query and brick the app.
--
-- Order inside this file: B (backfill) -> D (enable RLS + policies) ->
-- E (revoke blanket grants, re-grant authenticated). Idempotent.
-- =====================================================================


-- =====================================================================
-- SECTION B - BACKFILL: assign all pre-auth rows to the owner account.
-- Self-resolving by email; aborts loudly if the owner hasn't signed up.
-- =====================================================================

DO $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT id INTO owner_id
  FROM auth.users
  WHERE email = 'nl.nicklasky@gmail.com'
  ORDER BY created_at
  LIMIT 1;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Owner account (nl.nicklasky@gmail.com) not found - sign up first, then re-run.';
  END IF;

  UPDATE knowledge_bases SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE conversations   SET user_id = owner_id WHERE user_id IS NULL;
  UPDATE search_history  SET user_id = owner_id WHERE user_id IS NULL;
  -- podcasts/transcripts/chunks/insights: shared catalog, no user_id - nothing to backfill.
  -- playback_progress/feed_subscriptions: user_id NOT NULL - cannot have pre-auth rows.
END $$;


-- =====================================================================
-- SECTION D - ENABLE RLS + POLICIES (modelled on the live, working
-- playback_progress.auth_own_progress policy). All DROP ... IF EXISTS first.
-- =====================================================================

-- ---- USER-OWNED (auth.uid() = user_id) ----

ALTER TABLE knowledge_bases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_own_kb ON knowledge_bases;
CREATE POLICY auth_own_kb ON knowledge_bases
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_own_conversations ON conversations;
CREATE POLICY auth_own_conversations ON conversations
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_select_search_history ON search_history;
DROP POLICY IF EXISTS auth_delete_search_history ON search_history;
-- SELECT + DELETE for the owner; INSERT is performed by the semantic-search
-- edge function as service_role (which bypasses RLS).
CREATE POLICY auth_select_search_history ON search_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY auth_delete_search_history ON search_history
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE playback_progress ENABLE ROW LEVEL SECURITY;  -- already on; idempotent
DROP POLICY IF EXISTS auth_own_progress ON playback_progress;
CREATE POLICY auth_own_progress ON playback_progress
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE feed_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_own_feed_subscriptions ON feed_subscriptions;
CREATE POLICY auth_own_feed_subscriptions ON feed_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---- KB / PARENT-SCOPED (EXISTS join to an owned parent) ----

ALTER TABLE knowledge_base_podcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_kbp_select ON knowledge_base_podcasts;
DROP POLICY IF EXISTS auth_kbp_insert ON knowledge_base_podcasts;
DROP POLICY IF EXISTS auth_kbp_delete ON knowledge_base_podcasts;
CREATE POLICY auth_kbp_select ON knowledge_base_podcasts
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM knowledge_bases kb
    WHERE kb.id = knowledge_base_podcasts.knowledge_base_id AND kb.user_id = auth.uid()));
CREATE POLICY auth_kbp_insert ON knowledge_base_podcasts
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM knowledge_bases kb
    WHERE kb.id = knowledge_base_podcasts.knowledge_base_id AND kb.user_id = auth.uid()));
CREATE POLICY auth_kbp_delete ON knowledge_base_podcasts
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM knowledge_bases kb
    WHERE kb.id = knowledge_base_podcasts.knowledge_base_id AND kb.user_id = auth.uid()));

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_messages_select ON messages;
DROP POLICY IF EXISTS auth_messages_insert ON messages;
DROP POLICY IF EXISTS auth_messages_delete ON messages;
CREATE POLICY auth_messages_select ON messages
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));
CREATE POLICY auth_messages_insert ON messages
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));
CREATE POLICY auth_messages_delete ON messages
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()));

-- kb_syntheses: RLS already on with 0 policies (locked out today). Add the
-- KB-scoped SELECT policy; writes stay service_role (synthesize-kb edge fn).
ALTER TABLE kb_syntheses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_select_kb_syntheses ON kb_syntheses;
CREATE POLICY auth_select_kb_syntheses ON kb_syntheses
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM knowledge_bases kb
    WHERE kb.id = kb_syntheses.knowledge_base_id AND kb.user_id = auth.uid()));

-- ---- SHARED catalog / derived content ----
-- Readable by any authed user. The frontend also INSERTs podcasts (add episode),
-- UPDATEs podcasts (cancel), and INSERTs processing_logs (cancel log), so those
-- verbs get permissive policies. DELETE on podcasts is via delete_podcast_data
-- (SECURITY DEFINER) only. transcripts/chunks/insights are read-only to clients
-- (written by process-podcast as service_role, which bypasses RLS).

ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authed_select_podcasts ON podcasts;
DROP POLICY IF EXISTS authed_insert_podcasts ON podcasts;
DROP POLICY IF EXISTS authed_update_podcasts ON podcasts;
CREATE POLICY authed_select_podcasts ON podcasts FOR SELECT TO authenticated USING (true);
CREATE POLICY authed_insert_podcasts ON podcasts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authed_update_podcasts ON podcasts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authed_select_processing_logs ON processing_logs;
DROP POLICY IF EXISTS authed_insert_processing_logs ON processing_logs;
CREATE POLICY authed_select_processing_logs ON processing_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY authed_insert_processing_logs ON processing_logs FOR INSERT TO authenticated WITH CHECK (true);

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authed_select_transcripts ON transcripts;
CREATE POLICY authed_select_transcripts ON transcripts FOR SELECT TO authenticated USING (true);

ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authed_select_chunks ON chunks;
CREATE POLICY authed_select_chunks ON chunks FOR SELECT TO authenticated USING (true);

ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authed_select_insights ON insights;
CREATE POLICY authed_select_insights ON insights FOR SELECT TO authenticated USING (true);


-- =====================================================================
-- SECTION E - GRANTS: strip anon entirely; let RLS gate authenticated.
-- This is what actually closes the hole (RLS without revoking the blanket
-- anon DML grant still leaves anon able to touch rows its grant allows).
-- =====================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Broad verbs for authenticated; the RLS policies above are the real row gate.
-- (A verb with no matching policy is denied regardless of this grant.)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- service_role keeps full access (bypasses RLS; used by every edge function).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Revoke anon EXECUTE on the vector-search RPCs (only the service-role edge
-- functions call them). Mirrors the delete-RPC hardening in 013. Harmless
-- belt-and-suspenders: anon loses table grants above anyway.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT 'REVOKE EXECUTE ON FUNCTION public.' || p.proname || '(' ||
           pg_get_function_identity_arguments(p.oid) || ') FROM anon, public' AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('match_chunks', 'match_chunks_global')
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;

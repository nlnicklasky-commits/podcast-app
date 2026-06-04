-- ============================================================
-- 011: Feed Subscriptions
--
-- Adds feed_subscriptions table for subscribing to podcast
-- feeds and auto-ingesting new episodes. Includes RLS,
-- indexes, and updates delete_all_user_data().
-- ============================================================

CREATE TABLE feed_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_id bigint NOT NULL,
  feed_url text NOT NULL,
  feed_title text,
  feed_artwork text,
  feed_author text,
  last_checked_at timestamptz,
  last_episode_at timestamptz,
  auto_process boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, feed_id)
);

CREATE INDEX idx_feed_subs_user ON feed_subscriptions(user_id);
CREATE INDEX idx_feed_subs_active ON feed_subscriptions(is_active, last_checked_at);

CREATE TRIGGER feed_subscriptions_updated_at
  BEFORE UPDATE ON feed_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS policies (authenticated, user_id scoped)
-- ============================================================

ALTER TABLE feed_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_feed_subscriptions" ON feed_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "auth_insert_feed_subscriptions" ON feed_subscriptions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_update_feed_subscriptions" ON feed_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "auth_delete_feed_subscriptions" ON feed_subscriptions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Service role bypasses RLS for Edge Functions (poll-subscriptions)
GRANT ALL ON feed_subscriptions TO service_role;

-- ============================================================
-- Update delete_all_user_data() to include feed_subscriptions
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
  playback_deleted int;
  subscriptions_deleted int;
BEGIN
  calling_user_id := auth.uid();

  IF calling_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  DELETE FROM messages WHERE conversation_id IN (
    SELECT id FROM conversations WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS messages_deleted = ROW_COUNT;

  DELETE FROM conversations WHERE user_id = calling_user_id;
  GET DIAGNOSTICS conversations_deleted = ROW_COUNT;

  DELETE FROM search_history WHERE user_id = calling_user_id;
  GET DIAGNOSTICS search_deleted = ROW_COUNT;

  DELETE FROM processing_logs WHERE podcast_id IN (
    SELECT id FROM podcasts WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS logs_deleted = ROW_COUNT;

  DELETE FROM insights WHERE podcast_id IN (
    SELECT id FROM podcasts WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS insights_deleted = ROW_COUNT;

  DELETE FROM chunks WHERE podcast_id IN (
    SELECT id FROM podcasts WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS chunks_deleted = ROW_COUNT;

  DELETE FROM transcripts WHERE podcast_id IN (
    SELECT id FROM podcasts WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS transcripts_deleted = ROW_COUNT;

  DELETE FROM knowledge_base_podcasts WHERE knowledge_base_id IN (
    SELECT id FROM knowledge_bases WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS kbp_deleted = ROW_COUNT;

  DELETE FROM kb_syntheses WHERE knowledge_base_id IN (
    SELECT id FROM knowledge_bases WHERE user_id = calling_user_id
  );
  GET DIAGNOSTICS syntheses_deleted = ROW_COUNT;

  DELETE FROM playback_progress WHERE user_id = calling_user_id;
  GET DIAGNOSTICS playback_deleted = ROW_COUNT;

  DELETE FROM feed_subscriptions WHERE user_id = calling_user_id;
  GET DIAGNOSTICS subscriptions_deleted = ROW_COUNT;

  DELETE FROM podcasts WHERE user_id = calling_user_id;
  GET DIAGNOSTICS podcasts_deleted = ROW_COUNT;

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
      'knowledge_base_podcasts', kbp_deleted,
      'kb_syntheses', syntheses_deleted,
      'playback_progress', playback_deleted,
      'feed_subscriptions', subscriptions_deleted,
      'podcasts', podcasts_deleted,
      'knowledge_bases', kbs_deleted
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_all_user_data() TO authenticated;
REVOKE EXECUTE ON FUNCTION delete_all_user_data() FROM anon;
REVOKE EXECUTE ON FUNCTION delete_all_user_data() FROM public;

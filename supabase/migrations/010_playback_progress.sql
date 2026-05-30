-- Playback progress tracking per user per podcast
CREATE TABLE playback_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  podcast_id uuid NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  position_seconds float NOT NULL DEFAULT 0,
  duration_seconds float,
  playback_speed float DEFAULT 1.0,
  completed boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, podcast_id)
);

CREATE INDEX idx_playback_user ON playback_progress(user_id);

ALTER TABLE playback_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_own_progress" ON playback_progress
  FOR ALL TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

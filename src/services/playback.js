import { supabase } from '../lib/supabase'
import { requireUserId } from './_auth'

/**
 * Fetch saved playback progress for a podcast.
 * Returns the progress row or null if none exists.
 */
export async function getProgress(podcastId) {
  if (!podcastId) return null

  const { data, error } = await supabase
    .from('playback_progress')
    .select('*')
    .eq('podcast_id', podcastId)
    .limit(1)

  if (error) {
    console.error('Failed to load playback progress:', error.message)
    return null
  }

  return data?.[0] ?? null
}

/**
 * Upsert playback progress for a podcast.
 */
export async function saveProgress(podcastId, { positionSeconds, durationSeconds, playbackSpeed, completed }) {
  if (!podcastId) return null

  const { data, error } = await supabase
    .from('playback_progress')
    .upsert(
      {
        user_id: await requireUserId(),
        podcast_id: podcastId,
        position_seconds: positionSeconds,
        duration_seconds: durationSeconds ?? null,
        playback_speed: playbackSpeed ?? 1.0,
        completed: completed ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,podcast_id' },
    )
    .select()
    .limit(1)

  if (error) {
    console.error('Failed to save playback progress:', error.message)
    return null
  }

  return data?.[0] ?? null
}

/**
 * Fetch recent playback progress for the current user.
 * Returns an array of { podcast_id, position_seconds, duration_seconds, completed }.
 */
export async function getRecentProgress() {
  try {
    const { data, error } = await supabase
      .from('playback_progress')
      .select('podcast_id, position_seconds, duration_seconds, completed')

    if (error) {
      console.error('Failed to load recent progress:', error.message)
      return []
    }

    return data ?? []
  } catch {
    // Not authenticated — return empty
    return []
  }
}

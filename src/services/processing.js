import { supabase } from '../lib/supabase'

/**
 * Trigger the full processing pipeline for a podcast.
 * In dev: calls local Vite API which runs yt-dlp + uploads to Storage + triggers edge function.
 * The local API spawns the process as a background task and returns immediately.
 * Progress is tracked via polling the DB (status + progress columns).
 */
export async function processPodcast(podcastId) {
  const response = await fetch(`/api/process/${podcastId}`, {
    method: 'POST',
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Processing failed: ${response.status}`)
  }

  return response.json()
}

/**
 * Get the current status of a podcast (for polling)
 */
export async function getPodcastStatus(podcastId) {
  const { data, error } = await supabase
    .from('podcasts')
    .select('status, error_message, progress')
    .eq('id', podcastId)
    .limit(1)

  if (error) throw error
  return data?.[0]
}

/**
 * Get insights for a podcast
 */
export async function getInsights(podcastId) {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('podcast_id', podcastId)
    .limit(1)

  if (error) throw error
  return data?.[0] || null
}

/**
 * Get transcript for a podcast
 */
export async function getTranscript(podcastId) {
  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('podcast_id', podcastId)
    .limit(1)

  if (error) throw error
  return data?.[0] || null
}

/**
 * Cancel processing for a podcast.
 * Sets status to 'cancelled' — the edge function checks this and aborts.
 */
export async function cancelProcessing(podcastId) {
  const { error } = await supabase
    .from('podcasts')
    .update({ status: 'cancelled', error_message: null })
    .eq('id', podcastId)

  if (error) throw error

  await supabase.from('processing_logs').insert({
    podcast_id: podcastId,
    step: 'cancelled',
    message: 'Processing cancelled by user.',
  })
}

/**
 * Get processing logs for a podcast (ordered by time)
 */
export async function getProcessingLogs(podcastId) {
  const { data, error } = await supabase
    .from('processing_logs')
    .select('*')
    .eq('podcast_id', podcastId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data || []
}

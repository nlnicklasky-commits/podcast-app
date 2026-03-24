import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

/**
 * Trigger the full processing pipeline for a podcast.
 * Calls the process-podcast Edge Function which handles:
 * YouTube audio extraction → OpenAI Whisper transcription → chunking → embeddings → insights
 */
export async function processPodcast(podcastId) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/process-podcast`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ podcast_id: podcastId }),
    },
  )

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
    .select('status, error_message')
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

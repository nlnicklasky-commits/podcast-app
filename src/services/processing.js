import { supabase } from '../lib/supabase'
import { callEdgeFunction } from './_edge'

/**
 * Trigger the full processing pipeline for a podcast.
 * Calls the Supabase Edge Function which:
 *   1. Downloads audio via Cobalt (Railway)
 *   2. Uploads to Supabase Storage
 *   3. Transcribes with OpenAI Whisper
 *   4. Chunks + generates embeddings
 *   5. Generates insights with GPT-4o
 * Progress is tracked via polling the DB (status + progress columns).
 */
export async function processPodcast(podcastId) {
  if (!podcastId) throw new Error('Failed to start processing: podcast ID is required')

  return callEdgeFunction(
    'process-podcast',
    { podcast_id: podcastId },
    { errorPrefix: 'Failed to start processing' },
  )
}

/**
 * Get the current status of a podcast (for polling)
 */
export async function getPodcastStatus(podcastId) {
  if (!podcastId) throw new Error('Failed to get podcast status: podcast ID is required')

  const { data, error } = await supabase
    .from('podcasts')
    .select('status, error_message, progress')
    .eq('id', podcastId)
    .limit(1)

  if (error) throw new Error(`Failed to get podcast status: ${error.message}`)
  return data?.[0]
}

/**
 * Get insights for a podcast
 */
export async function getInsights(podcastId) {
  if (!podcastId) throw new Error('Failed to load insights: podcast ID is required')

  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .eq('podcast_id', podcastId)
    .limit(1)

  if (error) throw new Error(`Failed to load insights: ${error.message}`)
  return data?.[0] || null
}

/**
 * Get transcript for a podcast
 */
export async function getTranscript(podcastId) {
  if (!podcastId) throw new Error('Failed to load transcript: podcast ID is required')

  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('podcast_id', podcastId)
    .limit(1)

  if (error) throw new Error(`Failed to load transcript: ${error.message}`)
  return data?.[0] || null
}

/**
 * Cancel processing for a podcast.
 * Sets status to 'cancelled' -- the edge function checks this and aborts.
 */
export async function cancelProcessing(podcastId) {
  if (!podcastId) throw new Error('Failed to cancel processing: podcast ID is required')

  const { error } = await supabase
    .from('podcasts')
    .update({ status: 'cancelled', error_message: null })
    .eq('id', podcastId)

  if (error) throw new Error(`Failed to cancel processing: ${error.message}`)

  const { error: logError } = await supabase.from('processing_logs').insert({
    podcast_id: podcastId,
    step: 'cancelled',
    message: 'Processing cancelled by user.',
  })

  if (logError) throw new Error(`Failed to log cancellation: ${logError.message}`)
}

/**
 * Get processing logs for a podcast (ordered by time)
 */
export async function getProcessingLogs(podcastId) {
  if (!podcastId) throw new Error('Failed to load processing logs: podcast ID is required')

  const { data, error } = await supabase
    .from('processing_logs')
    .select('*')
    .eq('podcast_id', podcastId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to load processing logs: ${error.message}`)
  return data || []
}

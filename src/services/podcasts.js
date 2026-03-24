import { supabase } from '../lib/supabase'

/**
 * Extract the 11-character YouTube video ID from various URL formats.
 * Returns null if the URL isn't a recognized YouTube format.
 */
export function extractYouTubeVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

/**
 * List all podcasts across all knowledge bases (deduplicated).
 * Used for the standalone Podcasts section.
 */
export async function listAllPodcasts() {
  const { data, error } = await supabase
    .from('podcasts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Add an existing podcast to a knowledge base (junction row only).
 * Used from the standalone podcast view to link to a KB.
 */
export async function addPodcastToKB(knowledgeBaseId, podcastId) {
  const { error } = await supabase
    .from('knowledge_base_podcasts')
    .insert({
      knowledge_base_id: knowledgeBaseId,
      podcast_id: podcastId,
    })

  if (error) {
    if (error.code === '23505') {
      throw new Error('This podcast is already in that knowledge base')
    }
    throw error
  }
}

/**
 * Get which knowledge bases a podcast belongs to.
 */
export async function getPodcastKBs(podcastId) {
  const { data, error } = await supabase
    .from('knowledge_base_podcasts')
    .select('knowledge_base_id, knowledge_bases(id, name)')
    .eq('podcast_id', podcastId)

  if (error) throw error
  return data.map((row) => row.knowledge_bases)
}

/**
 * List all podcasts linked to a knowledge base.
 * Queries the junction table and returns the podcast data.
 */
export async function listPodcasts(knowledgeBaseId) {
  const { data, error } = await supabase
    .from('knowledge_base_podcasts')
    .select('podcast_id, created_at, podcasts(*)')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data.map((row) => row.podcasts)
}

/**
 * Add a podcast, optionally linking it to a knowledge base.
 *
 * Dedup logic:
 * 1. Extract youtube_video_id from the URL
 * 2. Check if a podcast with that video ID already exists
 * 3. If yes and knowledgeBaseId provided → just link it to this KB
 * 4. If no → create the podcast row, optionally link it, and return it
 *
 * knowledgeBaseId can be null (standalone podcast add from Podcasts tab).
 *
 * Returns { podcast, alreadyProcessed } so the caller knows whether
 * to kick off the processing pipeline or not.
 */
export async function addPodcast(knowledgeBaseId, url) {
  const youtubeVideoId = extractYouTubeVideoId(url)

  // Check for an existing podcast with the same video ID
  if (youtubeVideoId) {
    const { data: existing } = await supabase
      .from('podcasts')
      .select('*')
      .eq('youtube_video_id', youtubeVideoId)
      .maybeSingle()

    if (existing) {
      // Podcast content already exists
      if (knowledgeBaseId) {
        // Link it to this KB
        const { error: linkError } = await supabase
          .from('knowledge_base_podcasts')
          .insert({
            knowledge_base_id: knowledgeBaseId,
            podcast_id: existing.id,
          })

        if (linkError) {
          if (linkError.code === '23505') {
            throw new Error('This podcast is already in this knowledge base')
          }
          throw linkError
        }
      } else {
        // Standalone add — podcast already exists, just return it
        throw new Error('This podcast has already been added')
      }

      return { podcast: existing, alreadyProcessed: existing.status === 'ready' }
    }
  }

  // New podcast — fetch metadata and create it
  let title = null
  let channel = null
  let thumbnailUrl = null

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(oembedUrl)
    if (res.ok) {
      const meta = await res.json()
      title = meta.title
      channel = meta.author_name
      thumbnailUrl = meta.thumbnail_url
    }
  } catch {
    // Metadata fetch failed — proceed without it
  }

  const { data: podcast, error } = await supabase
    .from('podcasts')
    .insert({
      url,
      youtube_video_id: youtubeVideoId,
      title,
      channel,
      thumbnail_url: thumbnailUrl,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw error

  // Link to the knowledge base if one was provided
  if (knowledgeBaseId) {
    const { error: linkError } = await supabase
      .from('knowledge_base_podcasts')
      .insert({
        knowledge_base_id: knowledgeBaseId,
        podcast_id: podcast.id,
      })

    if (linkError) throw linkError
  }

  return { podcast, alreadyProcessed: false }
}

/**
 * Remove a podcast from a knowledge base.
 *
 * This unlinks the podcast from the KB. If no other KBs reference it,
 * the podcast row itself is deleted (cascading to transcripts, chunks, insights).
 */
export async function removePodcastFromKB(knowledgeBaseId, podcastId) {
  // Remove the junction row
  const { error } = await supabase
    .from('knowledge_base_podcasts')
    .delete()
    .eq('knowledge_base_id', knowledgeBaseId)
    .eq('podcast_id', podcastId)

  if (error) throw error

  // Check if any other KBs still reference this podcast
  const { data: remaining } = await supabase
    .from('knowledge_base_podcasts')
    .select('id')
    .eq('podcast_id', podcastId)

  // If orphaned, delete the podcast entirely
  if (!remaining || remaining.length === 0) {
    await supabase.from('podcasts').delete().eq('id', podcastId)
  }
}

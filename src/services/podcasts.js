import { supabase } from '../lib/supabase'

/**
 * List all podcasts across all knowledge bases (deduplicated).
 * Used for the standalone Podcasts section.
 */
export async function listAllPodcasts() {
  const { data, error } = await supabase
    .from('podcasts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load podcasts: ${error.message}`)
  return data
}

/**
 * Add an existing podcast to a knowledge base (junction row only).
 * Used from the standalone podcast view to link to a KB.
 */
export async function addPodcastToKB(knowledgeBaseId, podcastId) {
  if (!knowledgeBaseId) throw new Error('Failed to link podcast: knowledge base ID is required')
  if (!podcastId) throw new Error('Failed to link podcast: podcast ID is required')

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
    throw new Error(`Failed to link podcast to knowledge base: ${error.message}`)
  }
}

/**
 * Get which knowledge bases a podcast belongs to.
 */
export async function getPodcastKBs(podcastId) {
  if (!podcastId) throw new Error('Failed to load podcast knowledge bases: podcast ID is required')

  const { data, error } = await supabase
    .from('knowledge_base_podcasts')
    .select('knowledge_base_id, knowledge_bases(id, name)')
    .eq('podcast_id', podcastId)

  if (error) throw new Error(`Failed to load podcast knowledge bases: ${error.message}`)
  return data.map((row) => row.knowledge_bases)
}

/**
 * List all podcasts linked to a knowledge base.
 * Queries the junction table and returns the podcast data.
 */
export async function listPodcasts(knowledgeBaseId) {
  if (!knowledgeBaseId) throw new Error('Failed to list podcasts: knowledge base ID is required')

  const { data, error } = await supabase
    .from('knowledge_base_podcasts')
    .select('podcast_id, created_at, podcasts(*)')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list podcasts for knowledge base: ${error.message}`)
  return data.map((row) => row.podcasts)
}

/**
 * Add a podcast episode from Podcast Index, optionally linking to a KB.
 *
 * Dedup logic: check by episode_index_id.
 * The episode metadata (title, channel, enclosure_url, etc.) comes from
 * the Podcast Index API via the frontend.
 *
 * Returns { podcast, alreadyProcessed }
 */
export async function addPodcastFromIndex(knowledgeBaseId, episode) {
  if (!episode) throw new Error('Failed to add episode: episode data is required')

  // Check for existing by Podcast Index episode ID
  if (episode.id) {
    const { data: existing, error: lookupError } = await supabase
      .from('podcasts')
      .select('*')
      .eq('episode_index_id', episode.id)
      .maybeSingle()

    if (lookupError) throw new Error(`Failed to check for existing episode: ${lookupError.message}`)

    if (existing) {
      if (knowledgeBaseId) {
        const { error: linkError } = await supabase
          .from('knowledge_base_podcasts')
          .insert({
            knowledge_base_id: knowledgeBaseId,
            podcast_id: existing.id,
          })

        if (linkError) {
          if (linkError.code === '23505') {
            throw new Error('This episode is already in this knowledge base')
          }
          throw new Error(`Failed to link episode to knowledge base: ${linkError.message}`)
        }
      } else {
        throw new Error('This episode has already been added')
      }

      return { podcast: existing, alreadyProcessed: existing.status === 'ready' }
    }
  }

  // Resolve transcript URL if user chose transcript method
  let transcriptUrl = null
  if (episode.processingMethod === 'transcript') {
    if (episode.transcripts && episode.transcripts.length > 0) {
      const srt = episode.transcripts.find(t =>
        t.type === 'application/x-subrip' || t.type?.includes('srt')
      )
      const txt = episode.transcripts.find(t => t.type === 'text/plain')
      transcriptUrl = (srt || txt || episode.transcripts[0]).url
    } else if (episode.transcriptUrl) {
      transcriptUrl = episode.transcriptUrl
    }
  }

  // New episode -- create podcast row with Podcast Index metadata
  const { data, error } = await supabase
    .from('podcasts')
    .insert({
      title: episode.title,
      channel: episode.showTitle,
      thumbnail_url: episode.image || episode.showArtwork,
      url: episode.link || episode.enclosureUrl,
      enclosure_url: episode.enclosureUrl,
      podcast_index_id: episode.feedId,
      episode_index_id: episode.id,
      feed_url: episode.feedUrl || null,
      source: 'podcast_index',
      duration_seconds: episode.duration || null,
      transcript_url: transcriptUrl,
      status: 'pending',
    })
    .select()
    .limit(1)

  if (error) throw new Error(`Failed to add episode: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Failed to add episode: no data returned')
  const podcast = data[0]

  // Link to KB if provided
  if (knowledgeBaseId) {
    const { error: linkError } = await supabase
      .from('knowledge_base_podcasts')
      .insert({
        knowledge_base_id: knowledgeBaseId,
        podcast_id: podcast.id,
      })

    if (linkError) throw new Error(`Failed to link episode to knowledge base: ${linkError.message}`)
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
  if (!knowledgeBaseId) throw new Error('Failed to remove podcast: knowledge base ID is required')
  if (!podcastId) throw new Error('Failed to remove podcast: podcast ID is required')

  // Remove the junction row
  const { error } = await supabase
    .from('knowledge_base_podcasts')
    .delete()
    .eq('knowledge_base_id', knowledgeBaseId)
    .eq('podcast_id', podcastId)

  if (error) throw new Error(`Failed to remove podcast from knowledge base: ${error.message}`)

  // Check if any other KBs still reference this podcast
  const { data: remaining, error: checkError } = await supabase
    .from('knowledge_base_podcasts')
    .select('id')
    .eq('podcast_id', podcastId)

  if (checkError) throw new Error(`Failed to check podcast references: ${checkError.message}`)

  // If orphaned, delete the podcast entirely
  if (!remaining || remaining.length === 0) {
    const { error: deleteError } = await supabase
      .from('podcasts')
      .delete()
      .eq('id', podcastId)

    if (deleteError) throw new Error(`Failed to delete orphaned podcast: ${deleteError.message}`)
  }
}

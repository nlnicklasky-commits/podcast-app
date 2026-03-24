import { supabase } from '../lib/supabase'

export async function listPodcasts(knowledgeBaseId) {
  const { data, error } = await supabase
    .from('podcasts')
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function addPodcast(knowledgeBaseId, url) {
  // First, try to fetch metadata via YouTube oEmbed
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
    // Metadata fetch failed, that's okay — proceed without it
  }

  const { data, error } = await supabase
    .from('podcasts')
    .insert({
      knowledge_base_id: knowledgeBaseId,
      url,
      title,
      channel,
      thumbnail_url: thumbnailUrl,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deletePodcast(id) {
  const { error } = await supabase
    .from('podcasts')
    .delete()
    .eq('id', id)

  if (error) throw error
}

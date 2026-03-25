import { supabase } from '../lib/supabase'

/**
 * Search YouTube for podcast videos via the youtube-search edge function.
 * Returns an array of { videoId, url, title, channel, description, publishedAt, thumbnail }
 */
export async function searchYouTube(query) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(`${supabaseUrl}/functions/v1/youtube-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Search failed: ${response.status}`)
  }

  const data = await response.json()
  return data.results || []
}

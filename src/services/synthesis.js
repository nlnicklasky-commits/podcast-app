import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

/**
 * Generate a cross-podcast synthesis for a knowledge base.
 * Calls the synthesize-kb Edge Function which fetches all insights
 * and uses GPT-4o to find themes, agreements, and disagreements.
 */
export async function generateSynthesis(knowledgeBaseId) {
  if (!knowledgeBaseId) throw new Error('Synthesis failed: knowledge base ID is required')

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY

  let response
  try {
    response = await fetch(
      `${SUPABASE_URL}/functions/v1/synthesize-kb`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ knowledgeBaseId }),
      },
    )
  } catch (networkError) {
    throw new Error(`Synthesis failed: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err.error || `Synthesis failed: edge function returned HTTP ${response.status}`
    )
  }

  return response.json()
}

/**
 * Get the existing synthesis for a knowledge base.
 * Returns null if no synthesis has been generated yet.
 */
export async function getSynthesis(knowledgeBaseId) {
  if (!knowledgeBaseId) throw new Error('Failed to load synthesis: knowledge base ID is required')

  const { data, error } = await supabase
    .from('kb_syntheses')
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('generated_at', { ascending: false })
    .limit(1)

  if (error) throw new Error(`Failed to load synthesis: ${error.message}`)
  return data?.[0] || null
}

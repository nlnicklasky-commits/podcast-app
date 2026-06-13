import { supabase } from '../lib/supabase'
import { callEdgeFunction } from './_edge'

/**
 * Generate a cross-podcast synthesis for a knowledge base.
 * Calls the synthesize-kb Edge Function which fetches all insights
 * and uses GPT-4o to find themes, agreements, and disagreements.
 */
export async function generateSynthesis(knowledgeBaseId) {
  if (!knowledgeBaseId) throw new Error('Synthesis failed: knowledge base ID is required')

  return callEdgeFunction(
    'synthesize-kb',
    { knowledgeBaseId },
    { errorPrefix: 'Synthesis failed' },
  )
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

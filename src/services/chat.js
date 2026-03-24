import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

/**
 * Send a chat message to the RAG pipeline
 */
export async function sendMessage(knowledgeBaseId, question, conversationId = null) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        knowledge_base_id: knowledgeBaseId,
        question,
        conversation_id: conversationId,
      }),
    },
  )

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Chat failed: ${response.status}`)
  }

  return response.json()
}

/**
 * List conversations for a knowledge base
 */
export async function listConversations(knowledgeBaseId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Get messages for a conversation
 */
export async function getMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

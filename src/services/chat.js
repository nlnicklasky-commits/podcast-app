import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

/**
 * Send a chat message to the RAG pipeline
 */
export async function sendMessage(knowledgeBaseId, question, conversationId = null) {
  if (!knowledgeBaseId) throw new Error('Chat request failed: knowledge base ID is required')
  if (!question || !question.trim()) throw new Error('Chat request failed: question is required')

  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY

  let response
  try {
    response = await fetch(
      `${SUPABASE_URL}/functions/v1/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          knowledge_base_id: knowledgeBaseId,
          question: question.trim(),
          conversation_id: conversationId,
        }),
      },
    )
  } catch (networkError) {
    throw new Error(`Chat request failed: network error (${networkError.message})`)
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err.error || `Chat request failed: edge function returned HTTP ${response.status}`
    )
  }

  return response.json()
}

/**
 * List conversations for a knowledge base
 */
export async function listConversations(knowledgeBaseId) {
  if (!knowledgeBaseId) throw new Error('Failed to list conversations: knowledge base ID is required')

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('knowledge_base_id', knowledgeBaseId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list conversations: ${error.message}`)
  return data
}

/**
 * Get messages for a conversation
 */
export async function getMessages(conversationId) {
  if (!conversationId) throw new Error('Failed to load messages: conversation ID is required')

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Failed to load messages: ${error.message}`)
  return data
}

import { supabase } from '../lib/supabase'
import { callEdgeFunction } from './_edge'

/**
 * Send a chat message to the RAG pipeline
 */
export async function sendMessage(knowledgeBaseId, question, conversationId = null) {
  if (!knowledgeBaseId) throw new Error('Chat request failed: knowledge base ID is required')
  if (!question || !question.trim()) throw new Error('Chat request failed: question is required')

  return callEdgeFunction(
    'chat',
    {
      knowledge_base_id: knowledgeBaseId,
      question: question.trim(),
      conversation_id: conversationId,
    },
    { errorPrefix: 'Chat request failed' },
  )
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

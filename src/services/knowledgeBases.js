import { supabase } from '../lib/supabase'

async function getCurrentUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

export async function listKnowledgeBases() {
  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*, knowledge_base_podcasts(count)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load knowledge bases: ${error.message}`)
  return data
}

export async function getKnowledgeBase(id) {
  if (!id) throw new Error('Failed to load knowledge base: id is required')

  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*')
    .eq('id', id)
    .limit(1)

  if (error) throw new Error(`Failed to load knowledge base: ${error.message}`)
  if (!data || data.length === 0) throw new Error(`Knowledge base not found: ${id}`)
  return data[0]
}

export async function createKnowledgeBase(name, description = '') {
  if (!name || !name.trim()) throw new Error('Failed to create knowledge base: name is required')

  const userId = await getCurrentUserId()

  const { data, error } = await supabase
    .from('knowledge_bases')
    .insert({ name: name.trim(), description, user_id: userId })
    .select()
    .limit(1)

  if (error) throw new Error(`Failed to create knowledge base: ${error.message}`)
  if (!data || data.length === 0) throw new Error('Failed to create knowledge base: no data returned')
  return data[0]
}

export async function updateKnowledgeBase(id, updates) {
  if (!id) throw new Error('Failed to update knowledge base: id is required')
  if (!updates || Object.keys(updates).length === 0) {
    throw new Error('Failed to update knowledge base: no updates provided')
  }

  const { data, error } = await supabase
    .from('knowledge_bases')
    .update(updates)
    .eq('id', id)
    .select()
    .limit(1)

  if (error) throw new Error(`Failed to update knowledge base: ${error.message}`)
  if (!data || data.length === 0) throw new Error(`Knowledge base not found: ${id}`)
  return data[0]
}

export async function deleteKnowledgeBase(id) {
  if (!id) throw new Error('Failed to delete knowledge base: id is required')

  const { error } = await supabase
    .from('knowledge_bases')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Failed to delete knowledge base: ${error.message}`)
}

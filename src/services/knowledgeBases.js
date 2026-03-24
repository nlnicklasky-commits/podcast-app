import { supabase } from '../lib/supabase'

export async function listKnowledgeBases() {
  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*, podcasts(count)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getKnowledgeBase(id) {
  const { data, error } = await supabase
    .from('knowledge_bases')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function createKnowledgeBase(name, description = '') {
  const { data, error } = await supabase
    .from('knowledge_bases')
    .insert({ name, description })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateKnowledgeBase(id, updates) {
  const { data, error } = await supabase
    .from('knowledge_bases')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteKnowledgeBase(id) {
  const { error } = await supabase
    .from('knowledge_bases')
    .delete()
    .eq('id', id)

  if (error) throw error
}

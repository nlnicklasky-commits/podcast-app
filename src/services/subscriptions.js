import { supabase } from '../lib/supabase'

export async function listSubscriptions() {
  const { data, error } = await supabase
    .from('feed_subscriptions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to load subscriptions: ${error.message}`)
  return data
}

export async function subscribe(show) {
  if (!show || !show.id) throw new Error('Failed to subscribe: show data is required')

  const { data, error } = await supabase
    .from('feed_subscriptions')
    .insert({
      feed_id: show.id,
      feed_url: show.feedUrl,
      feed_title: show.title,
      feed_artwork: show.artwork,
      feed_author: show.author,
    })
    .select()
    .limit(1)

  if (error) {
    if (error.code === '23505') {
      throw new Error('Already subscribed to this podcast')
    }
    throw new Error(`Failed to subscribe: ${error.message}`)
  }

  return data?.[0]
}

export async function unsubscribe(subscriptionId) {
  if (!subscriptionId) throw new Error('Failed to unsubscribe: subscription ID is required')

  const { error } = await supabase
    .from('feed_subscriptions')
    .delete()
    .eq('id', subscriptionId)

  if (error) throw new Error(`Failed to unsubscribe: ${error.message}`)
}

export async function updateSubscription(subscriptionId, updates) {
  if (!subscriptionId) throw new Error('Failed to update subscription: ID is required')

  const { data, error } = await supabase
    .from('feed_subscriptions')
    .update(updates)
    .eq('id', subscriptionId)
    .select()
    .limit(1)

  if (error) throw new Error(`Failed to update subscription: ${error.message}`)
  return data?.[0]
}

export async function isSubscribed(feedId) {
  if (!feedId) return false

  const { data, error } = await supabase
    .from('feed_subscriptions')
    .select('id')
    .eq('feed_id', feedId)
    .limit(1)

  if (error) return false
  return data && data.length > 0 ? data[0].id : null
}

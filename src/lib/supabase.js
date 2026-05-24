import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    const message =
      'Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
    console.warn(message)

    // Return a proxy that throws on any property access (fail-fast)
    // so errors surface at the call site, not as cryptic "null" errors.
    return new Proxy(
      {},
      {
        get(_, prop) {
          // Allow basic inspection without throwing
          if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
            return () => '[Supabase client not configured]'
          }
          throw new Error(
            `Cannot call supabase.${String(prop)}(): ${message}`
          )
        },
      },
    )
  }
  return createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = createSupabaseClient()

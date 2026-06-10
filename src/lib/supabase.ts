import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast with a clear message instead of cryptic runtime errors mid-exam.
  const msg =
    'Configuration error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. ' +
    'Check your .env (local) or Vercel project environment variables.'
  if (typeof document !== 'undefined') {
    document.body.innerHTML =
      '<div style="font-family:sans-serif;max-width:480px;margin:4rem auto;text-align:center">' +
      '<h1>Setup incomplete</h1><p>The application is not configured correctly. ' +
      'Please contact the administrator.</p></div>'
  }
  throw new Error(msg)
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

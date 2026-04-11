import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Hardcoded — do not make this an env var (P3: client env vars are not secret)
export const ADMIN_EMAIL = 'chinmay@matramedia.co.in'

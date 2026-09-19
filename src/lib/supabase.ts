import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True only when both values are present. The app is designed to run without
 * them — it falls back to on-device storage so the whole product is usable
 * before a backend exists. Nothing here is a secret: the anon key is safe in
 * the bundle precisely because row level security is what guards the data.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * The query and hash exactly as the browser arrived with them.
 *
 * This has to be read here, above `createClient`, because `detectSessionInUrl`
 * consumes a mailed link's parameters and rewrites the address the moment the
 * client is constructed. When that consumption succeeds there is a session and
 * nobody needs these; when it fails — the classic case being a link opened on a
 * different device from the one that signed up — it fails silently and leaves a
 * clean URL behind, and without a copy the confirmation screen has nothing to
 * explain and nothing to retry.
 */
export const arrivalParams = typeof window !== 'undefined'
  ? { search: window.location.search, hash: window.location.hash }
  : { search: '', hash: '' }

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The OAuth return trip lands back on this page; PKCE keeps the token
        // out of the URL, which matters on a PWA people keep installed.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  return supabase
}

export const FOOD_IMAGE_BUCKET = 'food-images'

/// <reference lib="deno.ns" />

/**
 * Shared edge-function plumbing: CORS, the caller's identity, and a rate limit
 * that keeps one account from burning through the AI budget.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export interface Caller {
  userId: string
  /** Acts as the caller, so every query stays inside their RLS policies. */
  asUser: SupabaseClient
  /** Bypasses RLS. Only ever used after ownership has been verified. */
  asService: SupabaseClient
}

/** Verifies the JWT. Returns null when the request is not from a real session. */
export async function authenticate(request: Request): Promise<Caller | null> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })

  const { data, error } = await asUser.auth.getUser()
  if (error || !data.user) return null

  return {
    userId: data.user.id,
    asUser,
    asService: createClient(url, serviceKey, { auth: { persistSession: false } }),
  }
}

/**
 * A per-user sliding window held in memory. Good enough to stop a runaway
 * client or a single abusive account; it resets when an instance recycles, so
 * a hard quota belongs in the database if this ever needs to be exact.
 */
const windows = new Map<string, number[]>()

export function withinRateLimit(userId: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (windows.get(userId) ?? []).filter((at) => now - at < windowMs)
  if (recent.length >= limit) {
    windows.set(userId, recent)
    return false
  }
  recent.push(now)
  windows.set(userId, recent)
  return true
}

/** Errors are logged without image URLs, nutrition values or user identifiers. */
export function logFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'unknown error'
  console.error(`[${scope}] ${message.slice(0, 200)}`)
}

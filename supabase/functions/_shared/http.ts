/// <reference lib="deno.ns" />

/**
 * Shared edge-function plumbing: CORS, the caller's identity, and the limits
 * that keep one account — or one script with a hundred accounts — from
 * spending the whole AI budget.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
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

/* ------------------------------ rate limiting ----------------------------- */

export interface RateRule {
  /** 'user' or 'ip' — what the caller is told was exhausted. */
  scope: 'user' | 'ip'
  limit: number
  windowSeconds: number
}

export interface RateVerdict {
  ok: boolean
  scope: 'user' | 'ip' | null
  retryAfterSeconds: number
}

const ALLOWED: RateVerdict = { ok: true, scope: null, retryAfterSeconds: 0 }

export function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name)
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

/**
 * The address the request came from, as the platform's proxy saw it. The first
 * entry in x-forwarded-for is the client; everything after it is infrastructure.
 */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? null
}

/**
 * An IP is personal data, and a table of them is a liability nobody asked for.
 * What a counter actually needs is a stable, opaque name for "this address",
 * so that is all that is ever written down.
 */
async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get('RATE_LIMIT_SALT')
    ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? 'my-cal'
  const bytes = new TextEncoder().encode(`${salt}:${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest).subarray(0, 16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function label(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`
  if (seconds % 3600 === 0) return `${seconds / 3600}h`
  if (seconds % 60 === 0) return `${seconds / 60}m`
  return `${seconds}s`
}

/**
 * A per-instance fallback, used only when the shared counter cannot be reached.
 * It is weaker than the table in every way that matters — it forgets on a
 * recycle and each instance counts alone — but a broken counter should slow an
 * abuser down rather than open the gate.
 */
const memoryWindows = new Map<string, number[]>()

function withinMemoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const recent = (memoryWindows.get(key) ?? []).filter((at) => now - at < windowMs)
  if (recent.length >= limit) {
    memoryWindows.set(key, recent)
    return false
  }
  recent.push(now)
  memoryWindows.set(key, recent)
  // Keeps the map from growing without bound across a long-lived instance.
  if (memoryWindows.size > 5000) memoryWindows.clear()
  return true
}

/**
 * Spends one request against the user's quota and the address's quota at once.
 *
 * Both have to pass. The account limit is what stops one person hammering the
 * model; the address limit is what stops the same person doing it from twenty
 * throwaway accounts, which the account limit alone cannot see. Rules are
 * checked tightest-window first, so a request already blocked by the minute
 * never eats into the day.
 */
export async function enforceRateLimit(
  caller: Caller,
  request: Request,
  name: string,
  rules: RateRule[],
): Promise<RateVerdict> {
  if (!rules.length) return ALLOWED

  const ip = clientIp(request)
  const ipKey = ip ? await hashIp(ip) : null

  const ordered = [...rules].sort((a, b) => a.windowSeconds - b.windowSeconds)
  const payload = ordered
    // An address we cannot see cannot be limited by address; the account limit
    // still applies, so the request is not waved through either.
    .filter((rule) => rule.scope === 'user' || ipKey)
    .map((rule) => ({
      key: rule.scope === 'user'
        ? `${name}:u:${caller.userId}:${label(rule.windowSeconds)}`
        : `${name}:ip:${ipKey}:${label(rule.windowSeconds)}`,
      scope: rule.scope,
      limit: rule.limit,
      window_seconds: rule.windowSeconds,
    }))

  try {
    const { data, error } = await caller.asService.rpc('consume_rate_limits', { p_rules: payload })
    if (error) throw new Error(error.message)

    const verdict = Array.isArray(data) ? data[0] : data
    if (!verdict) return ALLOWED
    return {
      ok: Boolean(verdict.allowed),
      scope: (verdict.scope as 'user' | 'ip' | null) ?? null,
      retryAfterSeconds: Number(verdict.retry_after_seconds) || 0,
    }
  } catch (error) {
    logFailure(`${name}/rate-limit`, error)
    // The shared counter is unreachable — most likely the migration has not
    // been applied. Fall back rather than either failing the request or
    // leaving the key completely unguarded.
    const tightest = ordered[0]
    const ok = withinMemoryLimit(
      `${name}:u:${caller.userId}`, tightest.limit, tightest.windowSeconds * 1000,
    ) && (!ipKey || withinMemoryLimit(
      `${name}:ip:${ipKey}`, tightest.limit * 2, tightest.windowSeconds * 1000,
    ))
    return ok ? ALLOWED : { ok: false, scope: 'user', retryAfterSeconds: tightest.windowSeconds }
  }
}

/** Errors are logged without image URLs, nutrition values or user identifiers. */
export function logFailure(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'unknown error'
  console.error(`[${scope}] ${message.slice(0, 200)}`)
}

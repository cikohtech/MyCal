/**
 * Where this copy of MyCal actually lives.
 *
 * Every link Supabase mails out — confirm your address, reset your password —
 * comes back to a URL we hand it. Left unsaid, Supabase falls back to the
 * project's Site URL, which is how a deployed app ends up mailing people a
 * link to localhost. So it is never left unsaid.
 */
const configured = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim()

export function siteUrl(): string {
  // An explicit origin wins: it is the only thing that is right when a build
  // is opened from a preview domain but should send people to the real one.
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/** The address Supabase returns people to after they click a mailed link. */
export function authRedirectUrl(path = '/auth/confirm'): string {
  return `${siteUrl()}${path}`
}

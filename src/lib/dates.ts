/**
 * Date handling is deliberately timezone-explicit. "Today" is the user's
 * stored timezone, never the browser's drift or the database server's clock —
 * so a meal logged at 11pm and a flight across a timezone don't quietly
 * relocate a day's food.
 */
import type { IsoDate } from '@/types/domain'

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** `YYYY-MM-DD` for the given instant as seen in `timezone`. */
export function isoDateIn(timezone: string, at: Date = new Date()): IsoDate {
  try {
    // en-CA renders exactly YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(at)
  }
}

export function todayIn(timezone: string): IsoDate {
  return isoDateIn(timezone)
}

/** Treats an ISO date as a calendar value, free of any clock or offset. */
export function parseIsoDate(iso: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(iso)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a.localeCompare(b)
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function utcFromIso(iso: IsoDate): Date {
  const { year, month, day } = parseIsoDate(iso)
  return new Date(Date.UTC(year, month - 1, day))
}

export function weekdayName(iso: IsoDate, short = false): string {
  const name = WEEKDAYS[utcFromIso(iso).getUTCDay()]
  return short ? name.slice(0, 3) : name
}

export function monthName(iso: IsoDate, short = false): string {
  const name = MONTHS[utcFromIso(iso).getUTCMonth()]
  return short ? name.slice(0, 3) : name
}

/** "Today", "Yesterday", or "Thu 12 Sep" — whichever a person would say. */
export function friendlyDate(iso: IsoDate, today: IsoDate): string {
  if (iso === today) return 'Today'
  if (iso === addDays(today, -1)) return 'Yesterday'
  if (iso === addDays(today, 1)) return 'Tomorrow'
  const { day } = parseIsoDate(iso)
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  const base = `${weekdayName(iso, true)} ${day} ${monthName(iso, true)}`
  return sameYear ? base : `${base} ${iso.slice(0, 4)}`
}

export function longDate(iso: IsoDate): string {
  const { day, year } = parseIsoDate(iso)
  return `${weekdayName(iso)} ${day} ${monthName(iso)} ${year}`
}

/** Every timezone the runtime knows, for the profile picker. */
export function supportedTimezones(): string[] {
  const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  try {
    const zones = anyIntl.supportedValuesOf?.('timeZone')
    if (zones?.length) return zones
  } catch {
    /* fall through to a small fallback list */
  }
  return [
    'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
    'Australia/Sydney', 'Pacific/Auckland',
  ]
}

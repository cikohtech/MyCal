import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, friendlyDate, isoDateIn, longDate, weekdayName } from '@/lib/dates'

describe('timezone-aware dates', () => {
  it('reads the calendar date in the user timezone, not the runtime one', () => {
    // 23:30 in New York on the 18th is already the 19th in UTC.
    const at = new Date('2026-09-19T03:30:00Z')
    expect(isoDateIn('America/New_York', at)).toBe('2026-09-18')
    expect(isoDateIn('UTC', at)).toBe('2026-09-19')
    expect(isoDateIn('Asia/Tokyo', at)).toBe('2026-09-19')
  })

  it('falls back to the runtime zone for an unknown timezone', () => {
    expect(isoDateIn('Not/AZone', new Date('2026-09-19T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('moves across a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('counts whole days between two dates', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7)
  })

  it('names days the way a person would', () => {
    expect(friendlyDate('2026-09-18', '2026-09-18')).toBe('Today')
    expect(friendlyDate('2026-09-17', '2026-09-18')).toBe('Yesterday')
    expect(friendlyDate('2026-09-12', '2026-09-18')).toBe('Sat 12 Sep')
    expect(friendlyDate('2025-09-12', '2026-09-18')).toBe('Fri 12 Sep 2025')
  })

  it('reads weekdays off the calendar date alone', () => {
    expect(weekdayName('2026-09-18')).toBe('Friday')
    expect(longDate('2026-09-18')).toBe('Friday 18 September 2026')
  })
})

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Fallback for older WebViews.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

let counter = 0
/** Stable key for a draft row that has never been saved. */
export function tempId(prefix = 'tmp'): string {
  counter += 1
  return `${prefix}_${counter}_${Math.random().toString(36).slice(2, 7)}`
}

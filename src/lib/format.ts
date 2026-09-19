import type { UnitPreference } from '@/types/domain'
import { cmToFeetInches, kgToLb, round } from '@/lib/calc'

const NUMBER = new Intl.NumberFormat('en-GB')

export function kcal(value: number): string {
  return NUMBER.format(Math.round(value))
}

export function grams(value: number | null, places = 0): string {
  if (value === null || value === undefined) return '—'
  return `${NUMBER.format(round(value, places))} g`
}

export function amount(value: number, places = 1): string {
  return NUMBER.format(round(value, places))
}

export function signed(value: number, places = 1): string {
  const v = round(value, places)
  return `${v > 0 ? '+' : ''}${NUMBER.format(v)}`
}

export function weight(kg: number, unit: UnitPreference): string {
  return unit === 'imperial' ? `${amount(kgToLb(kg))} lb` : `${amount(kg)} kg`
}

export function height(cm: number, unit: UnitPreference): string {
  if (unit === 'imperial') {
    const { feet, inches } = cmToFeetInches(cm)
    return `${feet}′ ${inches}″`
  }
  return `${Math.round(cm)} cm`
}

export function percent(value: number): string {
  return `${Math.round(value)}%`
}

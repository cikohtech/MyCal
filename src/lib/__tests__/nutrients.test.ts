import { describe, expect, it } from 'vitest'
import { missingNutrientCount, presentNutrients } from '@/lib/nutrients'
import { isPlausibleBarcode } from '@/services/barcode'

describe('micronutrient presentation', () => {
  it('lists only nutrients with data', () => {
    const present = presentNutrients({ iron_mg: 7, vitamin_c_mg: 40 })
    expect(present.map((n) => n.key)).toEqual(['iron_mg', 'vitamin_c_mg'])
  })

  it('reports a percentage only where a reference value exists', () => {
    const [iron] = presentNutrients({ iron_mg: 7 })
    expect(iron.percentOfReference).toBe(50)
    const [sugar] = presentNutrients({ sugar_g: 12 })
    expect(sugar.percentOfReference).toBeNull()
  })

  it('counts what no source reported', () => {
    expect(missingNutrientCount({ iron_mg: 7 })).toBe(16)
    expect(missingNutrientCount({})).toBe(17)
  })
})

describe('barcode validation', () => {
  it('accepts real EAN-13 and UPC-A codes', () => {
    expect(isPlausibleBarcode('5000112637922')).toBe(true)
    expect(isPlausibleBarcode('036000291452')).toBe(true)
  })

  it('rejects a mistyped digit', () => {
    expect(isPlausibleBarcode('5000112637923')).toBe(false)
  })

  it('rejects a code of the wrong length', () => {
    expect(isPlausibleBarcode('12345')).toBe(false)
  })
})

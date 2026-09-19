import { describe, expect, it } from 'vitest'
import type { FoodEntry, NutritionSnapshot } from '@/types/domain'
import {
  addSnapshots, buildTarget, calcBmi, calcBmr, calcCalorieTarget, calcMacroTargets,
  calcTdee, calcWeightTrend, caloriesFromMacros, entryTotal, projectWeightChangeKg,
  scaleSnapshot, sumDay,
} from '@/lib/calc'

const snap = (over: Partial<NutritionSnapshot> = {}): NutritionSnapshot => ({
  calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: null,
  micronutrients: {}, ...over,
})

describe('body calculations', () => {
  it('computes BMI from kilograms and centimetres', () => {
    expect(calcBmi(70, 175)).toBe(22.9)
  })

  it('applies the Mifflin–St Jeor constants', () => {
    // 10*70 + 6.25*175 - 5*30 + 5
    expect(calcBmr('male', 70, 175, 30)).toBe(1649)
    expect(calcBmr('female', 70, 175, 30)).toBe(1483)
  })

  it('refuses to guess a constant when no sex applies', () => {
    expect(calcBmr('unspecified', 70, 175, 30)).toBeNull()
  })

  it('multiplies by the activity level for TDEE', () => {
    expect(calcTdee(1600, 'sedentary')).toBe(1920)
    expect(calcTdee(1600, 'extra')).toBe(3040)
  })

  it('offsets the calorie target by the goal', () => {
    expect(calcCalorieTarget(2400, 'lose')).toBe(1900)
    expect(calcCalorieTarget(2400, 'maintain')).toBe(2400)
    expect(calcCalorieTarget(2400, 'gain')).toBe(2650)
  })

  it('never drives a loss target below a floor', () => {
    expect(calcCalorieTarget(1400, 'lose')).toBe(1200)
  })

  it('splits macros as protein per kg, a quarter fat, the rest carbohydrate', () => {
    const macros = calcMacroTargets(2000, 70)
    expect(macros.protein_g).toBe(112)
    expect(macros.fat_g).toBe(56)
    expect(macros.carbs_g).toBe(262)
    expect(caloriesFromMacros(macros.protein_g, macros.carbs_g, macros.fat_g))
      .toBeGreaterThan(1950)
  })
})

describe('buildTarget', () => {
  it('produces a full target from ordinary inputs', () => {
    const result = buildTarget({
      age: 30, sex_for_bmr: 'female', height_cm: 165, weight_kg: 62,
      activity_level: 'moderate', goal: 'lose',
    })
    // 10*62 + 6.25*165 - 5*30 - 161 = 1340.25
    expect(result.bmr_kcal).toBe(1340)
    expect(result.tdee_kcal).toBe(2077)
    expect(result.calorie_target_kcal).toBe(1577)
    expect(result.needs_custom_target).toBe(false)
  })

  it('asks for a user-chosen target instead of applying a formula', () => {
    const result = buildTarget({
      age: 30, sex_for_bmr: 'unspecified', height_cm: 165, weight_kg: 62,
      activity_level: 'moderate', goal: 'lose', custom_calorie_target: 1800,
    })
    expect(result.needs_custom_target).toBe(true)
    expect(result.bmr_kcal).toBeNull()
    expect(result.calorie_target_kcal).toBe(1800)
  })
})

describe('nutrient arithmetic', () => {
  it('adds calories and macros', () => {
    const total = addSnapshots(
      snap({ calories_kcal: 200, protein_g: 10 }),
      snap({ calories_kcal: 150, protein_g: 5 }),
    )
    expect(total.calories_kcal).toBe(350)
    expect(total.protein_g).toBe(15)
  })

  it('keeps an unknown nutrient unknown rather than calling it zero', () => {
    const total = addSnapshots(snap(), snap())
    expect(total.fibre_g).toBeNull()
    expect(total.micronutrients.iron_mg).toBeUndefined()
  })

  it('carries a value present on only one side', () => {
    const total = addSnapshots(
      snap({ micronutrients: { iron_mg: 2 } }),
      snap({ micronutrients: { calcium_mg: 100 } }),
    )
    expect(total.micronutrients.iron_mg).toBe(2)
    expect(total.micronutrients.calcium_mg).toBe(100)
  })

  it('treats a known fibre value plus an unknown one as the known value', () => {
    expect(addSnapshots(snap({ fibre_g: 4 }), snap()).fibre_g).toBe(4)
  })

  it('scales a per-100g reference to a real portion', () => {
    const scaled = scaleSnapshot(
      snap({ calories_kcal: 250, protein_g: 12, micronutrients: { sodium_mg: 400 } }),
      1.5,
    )
    expect(scaled.calories_kcal).toBe(375)
    expect(scaled.protein_g).toBe(18)
    expect(scaled.micronutrients.sodium_mg).toBe(600)
  })

  it('leaves an unknown fibre unknown when scaling', () => {
    expect(scaleSnapshot(snap(), 2).fibre_g).toBeNull()
  })
})

const entry = (over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: 'e1', user_id: 'u1', consumed_on: '2026-09-18', meal_type: 'lunch',
  source: 'manual', display_name: 'Test', quantity: 1, quantity_unit: 'serving',
  nutrition_snapshot: snap({ calories_kcal: 400, protein_g: 20 }),
  food_reference_id: null, ai_analysis_id: null, food_image_id: null,
  user_corrected: false, confidence: null, note: null, parts: [], ...over,
})

describe('daily totals', () => {
  it('counts an entry plus everything attached to it', () => {
    const withOil = entry({
      parts: [{
        id: 'p1', food_entry_id: 'e1', kind: 'extra', name: 'Olive oil',
        quantity: 1, quantity_unit: 'tbsp',
        nutrition_snapshot: snap({ calories_kcal: 119, fat_g: 13.5 }),
      }],
    })
    expect(entryTotal(withOil).calories_kcal).toBe(519)
    expect(entryTotal(withOil).fat_g).toBe(13.5)
  })

  it('sums a day across entries', () => {
    const totals = sumDay([entry(), entry({ id: 'e2' })], '2026-09-18')
    expect(totals.calories_kcal).toBe(800)
    expect(totals.protein_g).toBe(40)
    expect(totals.entry_count).toBe(2)
  })

  it('reports fibre as unknown when nothing reported it', () => {
    expect(sumDay([entry()], '2026-09-18').fibre_g).toBeNull()
  })
})

describe('weight trend', () => {
  const series = (values: number[]) => values.map((weight_kg, index) => ({
    recorded_on: `2026-09-${String(index * 3 + 1).padStart(2, '0')}`, weight_kg,
  }))

  it('stays silent with too few observations', () => {
    expect(calcWeightTrend(series([80, 79.5])).slope_kg_per_week).toBeNull()
  })

  it('finds a downward slope in a falling series', () => {
    const trend = calcWeightTrend(series([82, 81.6, 81.1, 80.8, 80.3]))
    expect(trend.slope_kg_per_week).toBeLessThan(0)
    expect(trend.latest_kg).toBe(80.3)
  })

  it('centres the rolling mean so the line sits through the points', () => {
    const trend = calcWeightTrend(series([82, 80]))
    expect(trend.smoothed).toHaveLength(2)
    // Both points see the whole (tiny) window, so both take the mean.
    expect(trend.smoothed[0].weight_kg).toBe(81)
    expect(trend.smoothed[1].weight_kg).toBe(81)
  })

  it('projects a deficit as a loss', () => {
    expect(projectWeightChangeKg(1800, 2300, 7)).toBeLessThan(0)
  })
})

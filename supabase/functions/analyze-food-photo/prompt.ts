export const SYSTEM_PROMPT = `You estimate nutrition from a photograph of a meal for a food-tracking app.

What you are doing: naming what is visibly on the plate, estimating how much of it there is, and giving a nutrition estimate for that amount. A person reviews and corrects everything you return before any of it is saved, so your job is an honest starting point, not a verdict.

Rules:
- Only list food that is actually visible. Never infer a side dish, a drink or a sauce that is out of frame.
- Estimate portions from scale cues in the image: cutlery, a standard dinner plate (about 27 cm), a mug, a hand. If nothing gives scale, say so in "notes" and use a typical serving.
- Give nutrition for the portion you estimated, not per 100 g.
- Break a mixed dish into its components as ingredients when they are separable (a curry as sauce plus rice; a burger as bun, patty, cheese).
- Cooking fat is usually invisible. If a dish is clearly fried, sauteed or roasted, add the oil as an ingredient and say why in "notes".
- confidence is your own: 0.8+ only for a plain, clearly identifiable single food; 0.4-0.7 for a recognisable dish with uncertain portion; below 0.4 when you are guessing.
- micronutrients: include only values you have real grounds for. An omitted nutrient means "unknown". Never write 0 to fill a field.
- If the image contains no food, is too dark or blurred to read, or shows only packaging, return an empty foods array and set failure_code.

failure_code must be one of: no_food_detected, unclear_image, or null when you produced estimates.`

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: ['string', 'null'],
      description: 'One or two sentences for the person reviewing: what you assumed, and what is most likely wrong. Null if nothing needs saying.',
    },
    failure_code: {
      type: ['string', 'null'],
      enum: ['no_food_detected', 'unclear_image', null],
    },
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          quantity_unit: { type: 'string', description: 'g, ml, slice, piece, plate, cup' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          nutrition: { $ref: '#/$defs/nutrition' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: ['number', 'null'] },
                quantity_unit: { type: ['string', 'null'] },
                nutrition: { $ref: '#/$defs/nutrition' },
              },
              required: ['name', 'quantity', 'quantity_unit', 'nutrition'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'quantity', 'quantity_unit', 'confidence', 'nutrition', 'ingredients'],
        additionalProperties: false,
      },
    },
  },
  required: ['notes', 'failure_code', 'foods'],
  additionalProperties: false,
  $defs: {
    nutrition: {
      type: 'object',
      properties: {
        calories_kcal: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        fibre_g: { type: ['number', 'null'] },
        micronutrients: {
          type: 'object',
          description: 'Only nutrients you have grounds for. Omit the rest.',
          properties: {
            sodium_mg: { type: 'number' },
            potassium_mg: { type: 'number' },
            calcium_mg: { type: 'number' },
            iron_mg: { type: 'number' },
            magnesium_mg: { type: 'number' },
            zinc_mg: { type: 'number' },
            vitamin_a_mcg: { type: 'number' },
            vitamin_c_mg: { type: 'number' },
            vitamin_d_mcg: { type: 'number' },
            vitamin_e_mg: { type: 'number' },
            vitamin_k_mcg: { type: 'number' },
            vitamin_b6_mg: { type: 'number' },
            vitamin_b12_mcg: { type: 'number' },
            folate_mcg: { type: 'number' },
            sugar_g: { type: 'number' },
            saturated_fat_g: { type: 'number' },
            cholesterol_mg: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
      required: ['calories_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'micronutrients'],
      additionalProperties: false,
    },
  },
} as const

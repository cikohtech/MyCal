/// <reference lib="deno.ns" />

/**
 * The two places this function second-guesses a model. Run with:
 *
 *   deno test supabase/functions/analyze-food-voice/
 */
import { remainderAfterParts, type ModelNutrition } from '../_shared/nutrition.ts'
import { TRANSCRIPTION_PROMPT, withoutPromptEcho } from './prompt.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const n = (calories: number, extra: Partial<ModelNutrition> = {}): ModelNutrition => ({
  calories_kcal: calories, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: null, micronutrients: {}, ...extra,
})

Deno.test('a dish reported as its total keeps only what its parts do not cover', () => {
  // Eggs scrambled in butter: the model says 178 for the dish, 144 + 34 for
  // its parts. Counted naively that is 356.
  const own = remainderAfterParts(n(178, { fat_g: 16 }), [n(144, { fat_g: 10 }), n(34, { fat_g: 4 })])
  assertEquals(own.calories_kcal, 0)
  assertEquals(own.fat_g, 2)
})

Deno.test('a dish with something left over keeps it', () => {
  // Coffee with milk: 20 in all, 18 of it the milk.
  assertEquals(remainderAfterParts(n(20), [n(18)]).calories_kcal, 2)
})

Deno.test('parts that overshoot the total never make a negative', () => {
  assertEquals(remainderAfterParts(n(100), [n(150)]).calories_kcal, 0)
})

Deno.test('a food with no parts is untouched, fibre and micronutrients included', () => {
  const total = n(250, { fibre_g: 4, micronutrients: { iron_mg: 2 } })
  assertEquals(remainderAfterParts(total, []), total)
})

Deno.test('unknown fibre stays unknown rather than becoming a number', () => {
  assertEquals(remainderAfterParts(n(300), [n(100, { fibre_g: 2 })]).fibre_g, null)
})

Deno.test('a transcription model reading its own prompt back is not speech', () => {
  assertEquals(withoutPromptEcho(TRANSCRIPTION_PROMPT), '')
  assertEquals(withoutPromptEcho('Write numbers as digits.'), '')
  assertEquals(withoutPromptEcho('   '), '')
})

Deno.test('real speech passes through untouched', () => {
  const said = 'Two eggs and a slice of toast.'
  assertEquals(withoutPromptEcho(said), said)
  // Short words that happen to appear in the prompt are still speech.
  assertEquals(withoutPromptEcho('ate'), 'ate')
})

/* ------------------------------------------------- what the browser sends --- */

import { readRequest } from './request.ts'

const VOICE_URL = 'http://localhost/analyze-food-voice'

/** Built the way the client builds it: a named part, with the type repeated. */
function recordingRequest(type: string, bytes = 4096, partType = type): Request {
  const form = new FormData()
  form.append('audio', new Blob([new Uint8Array(bytes)], { type: partType }), 'voice.webm')
  form.append('mime_type', type)
  form.append('duration_ms', '4200')
  form.append('idempotency_key', 'key-1')
  form.append('timezone', 'Asia/Kuala_Lumpur')
  form.append('units', 'imperial')
  return new Request(VOICE_URL, { method: 'POST', body: form })
}

Deno.test('a recording arrives with its format, key and context', async () => {
  const parsed = await readRequest(recordingRequest('audio/webm;codecs=opus'))
  if ('error' in parsed) throw new Error(parsed.error)
  assertEquals(parsed.input.kind, 'voice')
  if (parsed.input.kind === 'voice') {
    assertEquals(parsed.input.mimeType, 'audio/webm')
    assertEquals(parsed.input.extension, 'webm')
    assertEquals(parsed.input.audio.byteLength, 4096)
  }
  assertEquals([parsed.idempotencyKey, parsed.timezone, parsed.units], ['key-1', 'Asia/Kuala_Lumpur', 'imperial'])
})

Deno.test('a part with no type of its own falls back to the one sent beside it', async () => {
  const parsed = await readRequest(recordingRequest('audio/mp4', 4096, ''))
  if ('error' in parsed) throw new Error(parsed.error)
  assertEquals(parsed.input.kind === 'voice' && parsed.input.extension, 'mp4')
})

Deno.test('recordings that cannot be heard are turned away before anything is spent', async () => {
  assertEquals(await readRequest(recordingRequest('audio/webm', 200)), { error: 'no_speech' })
  assertEquals(await readRequest(recordingRequest('audio/aiff')), { error: 'unsupported_audio' })
})

Deno.test('typed words keep their lines, and a retried transcript says it was spoken', async () => {
  const parsed = await readRequest(new Request(VOICE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '  eggs\n\n\n\ntoast   and  tea ', transcribed: true, timezone: 'Not/AZone' }),
  }))
  if ('error' in parsed) throw new Error(parsed.error)
  assertEquals(parsed.input, { kind: 'text', text: 'eggs\n\ntoast and tea', transcribed: true })
  // An unknown zone is dropped rather than trusted into the prompt.
  assertEquals(parsed.timezone, null)
})

Deno.test('too much text, or none, is refused', async () => {
  const post = (body: unknown) => readRequest(new Request(VOICE_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  assertEquals(await post({ text: 'x'.repeat(4001) }), { error: 'text_too_long' })
  assertEquals(await post({ text: '   ' }), { error: 'bad_request', status: 400 })
})

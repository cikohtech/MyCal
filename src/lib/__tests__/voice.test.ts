import { describe, expect, it } from 'vitest'
import type { DraftFood } from '@/types/domain'
import {
  audioExtension, baseAudioType, formatDuration, pickRecordingType, rmsLevel,
} from '@/services/voice'
import {
  blankFood, canRetryVoice, failureCopy, fillMeals, isAiSource, mixesMeals,
} from '@/features/food-log/draft'

describe('recording formats', () => {
  it('prefers Opus, and takes what Safari records when that is all there is', () => {
    expect(pickRecordingType(() => true)).toBe('audio/webm;codecs=opus')
    expect(pickRecordingType((type) => type.startsWith('audio/mp4'))).toBe('audio/mp4;codecs=mp4a.40.2')
  })

  it('leaves the choice to the browser when nothing claims support', () => {
    expect(pickRecordingType(() => false)).toBeNull()
    expect(pickRecordingType(() => { throw new Error('no') })).toBeNull()
  })

  it('names the file the way the provider decodes it', () => {
    expect(baseAudioType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(audioExtension('audio/webm;codecs=opus')).toBe('webm')
    expect(audioExtension('video/webm')).toBe('webm')
    expect(audioExtension('audio/mp4')).toBe('mp4')
    expect(audioExtension('audio/x-m4a')).toBe('m4a')
    expect(audioExtension('audio/ogg;codecs=opus')).toBe('ogg')
    // Unlabelled is Safari's MP4 far more often than anything else.
    expect(audioExtension('')).toBe('mp4')
  })
})

describe('the level meter', () => {
  it('reads silence as zero and a full-scale wave as loud', () => {
    expect(rmsLevel(new Uint8Array(256).fill(128))).toBe(0)
    const square = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 255 : 1))
    expect(rmsLevel(square)).toBeGreaterThan(0.9)
  })

  it('writes durations as a clock does', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65_400)).toBe('1:05')
    expect(formatDuration(180_000)).toBe('3:00')
  })
})

const food = (name: string, meal?: DraftFood['meal']): DraftFood => ({ ...blankFood(name), meal })

describe('meals in a voice log', () => {
  it('carries a meal forward to the foods listed after it', () => {
    const filled = fillMeals([
      food('eggs', 'breakfast'), food('toast', null), food('coffee', null),
      food('salad', 'lunch'), food('apple', null),
    ], 'dinner')
    expect(filled.map((f) => f.meal)).toEqual(['breakfast', 'breakfast', 'breakfast', 'lunch', 'lunch'])
  })

  it('gives anything said before a meal was named the fallback', () => {
    expect(fillMeals([food('crisps', null), food('pasta', 'dinner')], 'snack').map((f) => f.meal))
      .toEqual(['snack', 'dinner'])
  })

  it('knows when one picker is not enough', () => {
    expect(mixesMeals([food('a', 'lunch'), food('b', 'lunch')], 'lunch')).toBe(false)
    expect(mixesMeals([food('a', 'lunch'), food('b')], 'lunch')).toBe(false)
    expect(mixesMeals([food('a', 'breakfast'), food('b', 'lunch')], 'lunch')).toBe(true)
  })
})

describe('voice failures', () => {
  it('offers a retry only where trying again can change the answer', () => {
    expect(canRetryVoice('timeout')).toBe(true)
    expect(canRetryVoice('offline')).toBe(true)
    expect(canRetryVoice('no_speech')).toBe(false)
    expect(canRetryVoice('no_food_mentioned')).toBe(false)
    expect(canRetryVoice('free_limit_reached')).toBe(false)
  })

  it('talks about voice, not photos, for a voice log', () => {
    expect(failureCopy('no_speech', null, 'voice').title).toBe('Nothing was heard')
    expect(failureCopy('free_limit_reached', null, 'voice').title).toMatch(/voice/)
    expect(failureCopy('free_limit_reached').title).toMatch(/photos/)
    expect(failureCopy('something_new', null, 'voice').body).not.toMatch(/photo/)
  })

  it('counts a voice log as a model estimate', () => {
    expect(isAiSource('voice_ai')).toBe(true)
    expect(isAiSource('photo_ai')).toBe(true)
    expect(isAiSource('manual')).toBe(false)
  })
})

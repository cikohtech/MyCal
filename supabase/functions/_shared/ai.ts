/// <reference lib="deno.ns" />

/**
 * The one place that knows which AI provider is configured.
 *
 * Whichever key is present in the function's secrets decides the provider, so
 * deploying against OpenAI instead of Anthropic is a secret change, not a code
 * change. Callers get the same shape back either way: the model's JSON text,
 * or a refusal.
 *
 *   supabase secrets set OPENAI_API_KEY=sk-...        # uses OpenAI
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... # uses Claude
 *   supabase secrets set AI_PROVIDER=openai           # settles it if both exist
 *
 * Speech is the exception. Anthropic has no transcription endpoint, so turning
 * a recording into words always needs OPENAI_API_KEY — even when Claude is the
 * one reading the words afterwards.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.71.0'
import OpenAI from 'npm:openai@7.19.0'

export type AiProvider = 'anthropic' | 'openai'

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5.5',
}

export interface VisionRequest {
  /** Instructions that frame the whole task. */
  system: string
  /** The turn's own instruction, alongside the image when there is one. */
  prompt: string
  /** Both left out for a text-only request, such as reading a transcript. */
  imageBase64?: string
  mimeType?: string
  /** JSON Schema the reply must satisfy. */
  schema: Record<string, unknown>
  /** A name for that schema; OpenAI requires one. */
  schemaName: string
  maxOutputTokens: number
  timeoutMs: number
}

export interface VisionResult {
  /** The model's JSON text, or null when it produced nothing usable. */
  text: string | null
  /** True when the model declined rather than failed. */
  refused: boolean
}

export interface VisionClient {
  provider: AiProvider
  model: string
  analyze(request: VisionRequest): Promise<VisionResult>
}

/**
 * Returns the configured client, or null when no provider key is set — which
 * is a normal state: the app runs without photo analysis.
 */
export function resolveVisionClient(): VisionClient | null {
  const provider = selectProvider()
  if (!provider) return null

  const apiKey = Deno.env.get(provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY')
  if (!apiKey) return null

  const model = Deno.env.get(provider === 'openai' ? 'OPENAI_MODEL' : 'ANTHROPIC_MODEL')?.trim() ||
    DEFAULT_MODEL[provider]

  return provider === 'openai' ? openaiClient(apiKey, model) : anthropicClient(apiKey, model)
}

function selectProvider(): AiProvider | null {
  const requested = Deno.env.get('AI_PROVIDER')?.trim().toLowerCase()
  if (requested === 'openai' || requested === 'anthropic') return requested
  if (requested) console.error(`[ai] ignoring unknown AI_PROVIDER "${requested.slice(0, 32)}"`)

  // With both keys present Anthropic stays the default, so an existing
  // deployment does not change provider by having a second key added.
  if (Deno.env.get('ANTHROPIC_API_KEY')) return 'anthropic'
  if (Deno.env.get('OPENAI_API_KEY')) return 'openai'
  return null
}

function anthropicClient(apiKey: string, model: string): VisionClient {
  const client = new Anthropic({ apiKey })

  return {
    provider: 'anthropic',
    model,
    async analyze(request) {
      const response = await client.messages.create(
        {
          model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          output_config: {
            effort: 'medium',
            format: { type: 'json_schema', schema: request.schema },
          },
          messages: [{
            role: 'user',
            content: [
              ...(request.imageBase64
                ? [{
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: (request.mimeType ?? 'image/jpeg') as 'image/jpeg',
                    data: request.imageBase64,
                  },
                }]
                : []),
              { type: 'text' as const, text: request.prompt },
            ],
          }],
        },
        { timeout: request.timeoutMs },
      )

      if (response.stop_reason === 'refusal') return { text: null, refused: true }
      const block = response.content.find((part) => part.type === 'text')
      return { text: block?.type === 'text' ? block.text : null, refused: false }
    },
  }
}

function openaiClient(apiKey: string, model: string): VisionClient {
  const client = new OpenAI({ apiKey })

  return {
    provider: 'openai',
    model,
    async analyze(request) {
      const response = await client.chat.completions.create(
        {
          model,
          max_completion_tokens: request.maxOutputTokens,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: request.schemaName,
              strict: true,
              schema: strictSchema(request.schema),
            },
          },
          messages: [
            { role: 'system', content: request.system },
            {
              role: 'user',
              content: request.imageBase64
                ? [
                  { type: 'text', text: request.prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${request.mimeType ?? 'image/jpeg'};base64,${request.imageBase64}`,
                    },
                  },
                ]
                : request.prompt,
            },
          ],
        },
        { timeout: request.timeoutMs },
      )

      const choice = response.choices[0]
      if (choice?.message?.refusal || choice?.finish_reason === 'content_filter') {
        return { text: null, refused: true }
      }
      // A truncated reply is not parseable JSON, so treat it as no answer
      // rather than letting a half-object through.
      if (choice?.finish_reason === 'length') return { text: null, refused: false }
      return { text: choice?.message?.content ?? null, refused: false }
    },
  }
}

/* ------------------------------ transcription ----------------------------- */

const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-transcribe'
/** Older, but it has been there the longest; the one to fall back on. */
const FALLBACK_TRANSCRIBE_MODEL = 'whisper-1'

export interface TranscriptionRequest {
  audio: ArrayBuffer
  /** Without codec parameters: audio/webm, audio/mp4, audio/ogg, ... */
  mimeType: string
  /** The provider reads the format off the extension, so this must match the bytes. */
  filename: string
  /** Context that steers spelling and number formatting, not content. */
  prompt?: string
  timeoutMs: number
}

export interface Transcriber {
  model: string
  /** The words, or an empty string when nothing was said. */
  transcribe(request: TranscriptionRequest): Promise<{ text: string; model: string }>
}

/**
 * Returns a speech-to-text client, or null when there is no OpenAI key — in
 * which case a typed description still works and a recording cannot.
 */
export function resolveTranscriber(): Transcriber | null {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return null

  const client = new OpenAI({ apiKey })
  const configured = Deno.env.get('OPENAI_TRANSCRIBE_MODEL')?.trim() || DEFAULT_TRANSCRIBE_MODEL
  const models = [...new Set([configured, FALLBACK_TRANSCRIBE_MODEL])]

  return {
    model: configured,
    async transcribe(request) {
      let lastError: unknown = null
      for (const model of models) {
        try {
          const file = new File([request.audio], request.filename, { type: request.mimeType })
          const response = await client.audio.transcriptions.create(
            {
              file,
              model,
              response_format: 'json',
              ...(request.prompt ? { prompt: request.prompt } : {}),
            },
            { timeout: request.timeoutMs },
          )
          return { text: (response.text ?? '').trim(), model }
        } catch (error) {
          lastError = error
          // Only a model that does not exist (retired, or a typo in the
          // secret) is worth a second attempt. Anything else — a timeout, a
          // file the provider cannot decode — would fail the same way twice.
          if (!isMissingModel(error)) break
        }
      }
      throw lastError
    },
  }
}

function isMissingModel(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  const message = error instanceof Error ? error.message : ''
  if (status === 404) return true
  return /model/i.test(message) && /not (found|exist)|does not have access/i.test(message)
}

/**
 * OpenAI's strict structured output requires every property of every object to
 * be listed in `required`. Optional fields — the micronutrients a model should
 * leave out when it has no grounds for them — become required-but-nullable, so
 * "unknown" is still expressible as null rather than as a fabricated zero.
 */
export function strictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return walk(schema) as Record<string, unknown>
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk)
  if (node === null || typeof node !== 'object') return node

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = walk(value)
  }

  // Numeric bounds are advisory here and are re-clamped after parsing, so they
  // are dropped rather than risking a schema the provider rejects outright.
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf']) {
    delete out[key]
  }

  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    const properties = out.properties as Record<string, Record<string, unknown>>
    const required = new Set(Array.isArray(out.required) ? out.required as string[] : [])
    for (const key of Object.keys(properties)) {
      if (!required.has(key)) properties[key] = nullable(properties[key])
    }
    out.required = Object.keys(properties)
    out.additionalProperties = false
  }

  return out
}

function nullable(schema: Record<string, unknown>): Record<string, unknown> {
  const type = schema?.type
  if (typeof type === 'string' && type !== 'null') return { ...schema, type: [type, 'null'] }
  if (Array.isArray(type) && !type.includes('null')) return { ...schema, type: [...type, 'null'] }
  return schema
}

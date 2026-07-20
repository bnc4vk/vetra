import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import {
  ParsedItineraryAdjustment,
  ParsedTripIntent,
  normalizeParsedItineraryAdjustment,
  normalizeParsedTripIntent,
  ITINERARY_ADJUSTMENT_MAX_OUTPUT_TOKENS,
  ITINERARY_ADJUSTMENT_PROMPT,
  TRIP_INTERPRETATION_MAX_OUTPUT_TOKENS,
  TRIP_INTERPRETATION_MODEL,
  TRIP_INTERPRETATION_PROMPT,
} from '../shared/trip-intelligence.mjs'

const model = TRIP_INTERPRETATION_MODEL
const maxOutputTokens = TRIP_INTERPRETATION_MAX_OUTPUT_TOKENS
const dailyTokenLimit = Number(process.env.OPENAI_COMPLIMENTARY_DAILY_TOKEN_LIMIT || 250_000)
// The public demo is deliberately stricter than the local 90% ceiling. Keeping the
// hosted service at 40% leaves 150k tokens of headroom for other eligible org usage.
const safeFraction = Number(process.env.OPENAI_HOSTED_SAFE_FRACTION || 0.4)
const safeDailyTokenCeiling = Math.floor(dailyTokenLimit * safeFraction)
const baselineUsage = Math.max(
  0,
  Math.floor(Number(process.env.OPENAI_COMPLIMENTARY_TOKENS_USED_AT_START || 0)),
)
const hostedCeiling = Math.max(0, safeDailyTokenCeiling - baselineUsage)
const maxRequestsPerIpPerDay = Math.max(
  1,
  Math.floor(Number(process.env.VETRA_MAX_REQUESTS_PER_IP_PER_DAY || 12)),
)
const allowedOrigins = new Set(
  (process.env.VETRA_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

const projectId = process.env.OPENAI_PROJECT_ID?.trim()
const complimentaryTokensConfirmed =
  process.env.OPENAI_COMPLIMENTARY_TOKENS_CONFIRMED === 'true'
const redisUrl = (
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
)?.replace(/\/$/, '')
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const openai = process.env.OPENAI_API_KEY && projectId
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, project: projectId })
  : null

const SYSTEM_PROMPT = TRIP_INTERPRETATION_PROMPT

const utcDate = () => new Date().toISOString().slice(0, 10)
const expiryEpoch = () => {
  const tomorrow = new Date(`${utcDate()}T00:00:00.000Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  return Math.floor(tomorrow.getTime() / 1000) + 300
}
const quotaKey = () => `vetra:hosted:tokens:${utcDate()}`

async function redis(command) {
  if (!redisUrl || !redisToken) throw new Error('Hosted quota store is not configured.')
  const response = await fetch(redisUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${redisToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) throw new Error(`Hosted quota store returned ${response.status}.`)
  const payload = await response.json()
  if (payload.error) throw new Error('Hosted quota store rejected the command.')
  return payload.result
}

async function usedTokens() {
  const value = await redis(['GET', quotaKey()])
  return Math.max(0, Math.floor(Number(value || 0)))
}

async function reserveTokens(amount) {
  const script = `
    local current = tonumber(redis.call('GET', KEYS[1]) or '0')
    local amount = tonumber(ARGV[1])
    local ceiling = tonumber(ARGV[2])
    if current + amount > ceiling then return {-1, current} end
    local updated = redis.call('INCRBY', KEYS[1], amount)
    redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[3]))
    return {updated, current}
  `
  const result = await redis([
    'EVAL',
    script,
    '1',
    quotaKey(),
    String(amount),
    String(hostedCeiling),
    String(expiryEpoch()),
  ])
  return { accepted: Number(result?.[0]) >= 0, current: Math.max(0, Number(result?.[1] || 0)) }
}

async function reconcileReservation(reserved, actual) {
  const adjustment = actual - reserved
  if (adjustment !== 0) await redis(['INCRBY', quotaKey(), String(adjustment)])
}

async function consumeIpAllowance(request) {
  const ip = String(request.headers['x-real-ip'] || request.headers['x-forwarded-for'] || 'unknown')
    .split(',')[0]
    .trim()
    .replace(/[^a-zA-Z0-9:._-]/g, '')
    .slice(0, 96)
  const key = `vetra:hosted:requests:${utcDate()}:${ip || 'unknown'}`
  const script = `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIREAT', KEYS[1], tonumber(ARGV[2])) end
    if count > tonumber(ARGV[1]) then return -1 end
    return count
  `
  return Number(await redis([
    'EVAL', script, '1', key, String(maxRequestsPerIpPerDay), String(expiryEpoch()),
  ])) >= 0
}

async function usageStatus() {
  const tokens = redisUrl && redisToken ? await usedTokens() : 0
  return {
    utcDate: utcDate(),
    complimentaryDailyTokenLimit: dailyTokenLimit,
    hostedSafeDailyTokenCeiling: safeDailyTokenCeiling,
    dashboardBaselineTokens: baselineUsage,
    vetraHostedTokensToday: tokens,
    remainingHostedTokens: Math.max(0, hostedCeiling - tokens),
    globalHeadroomTokens: dailyTokenLimit - safeDailyTokenCeiling,
  }
}

function setCors(request, response) {
  const origin = request.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('vary', 'Origin')
  }
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  response.setHeader('access-control-allow-headers', 'Content-Type')
  response.setHeader('cache-control', 'no-store')
}

function originAllowed(request) {
  const origin = request.headers.origin
  return !origin || allowedOrigins.has(origin)
}

export default async function handler(request, response) {
  setCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).end()
  if (!originAllowed(request)) {
    return response.status(403).json({ error: 'This origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' })
  }

  const pathname = new URL(request.url, 'https://vetra.invalid').pathname
  const route = String(request.query?.route || pathname.split('/').pop() || '')
  const hostedReady = Boolean(openai) && complimentaryTokensConfirmed && Boolean(redisUrl && redisToken)

  if (request.method === 'GET' && route === 'health') {
    let usage = null
    try { usage = await usageStatus() } catch { usage = null }
    return response.json({
      ok: true,
      gptConfigured: Boolean(openai),
      projectConfigured: Boolean(projectId),
      complimentaryTokensConfirmed,
      quotaStoreConfigured: Boolean(redisUrl && redisToken),
      readyForGpt: hostedReady && Boolean(usage),
      model,
      billingSafety: 'fail-closed-atomic-hosted-quota',
      usage,
    })
  }

  if (request.method === 'GET' && route === 'usage') {
    if (!redisUrl || !redisToken) {
      return response.status(503).json({ error: 'Hosted quota store is not configured.' })
    }
    return response.json(await usageStatus())
  }

  if (request.method !== 'POST' || !['parse-trip', 'adjust-trip'].includes(route)) {
    return response.status(404).json({ error: 'Not found.' })
  }

  const isAdjustment = route === 'adjust-trip'
  const brief = typeof request.body?.brief === 'string' ? request.body.brief.trim() : ''
  const adjustmentRequest = typeof request.body?.request === 'string' ? request.body.request.trim() : ''
  const itinerary = request.body?.itinerary
  const validItinerary = Number.isInteger(itinerary?.revision)
    && Array.isArray(itinerary?.flightLegs)
    && itinerary.flightLegs.length > 0
    && itinerary.flightLegs.every((leg) => leg.legId && leg.origin && leg.destination)
  if ((!isAdjustment && (!brief || brief.length > 5000))
    || (isAdjustment && (!adjustmentRequest || adjustmentRequest.length > 5000 || !validItinerary))) {
    return response.status(400).json({ error: isAdjustment ? 'Please provide a valid itinerary and adjustment request.' : 'Please provide a flight brief between 1 and 5,000 characters.' })
  }
  if (!openai || !projectId) {
    return response.status(503).json({ error: 'GPT is not configured.', code: 'OPENAI_CONFIGURATION_MISSING' })
  }
  if (!complimentaryTokensConfirmed) {
    return response.status(412).json({
      error: 'Complimentary-token enrollment has not been confirmed.',
      code: 'COMPLIMENTARY_TOKENS_NOT_CONFIRMED',
    })
  }
  if (!redisUrl || !redisToken) {
    return response.status(503).json({ error: 'Hosted quota protection is unavailable.', code: 'QUOTA_STORE_MISSING' })
  }
  if (!(await consumeIpAllowance(request))) {
    return response.status(429).json({ error: 'The daily demo request limit has been reached.', code: 'IP_RATE_LIMIT' })
  }

  const systemPrompt = isAdjustment ? ITINERARY_ADJUSTMENT_PROMPT : SYSTEM_PROMPT
  const userInput = isAdjustment ? JSON.stringify({ request: adjustmentRequest, itinerary }) : brief
  const outputTokens = isAdjustment ? ITINERARY_ADJUSTMENT_MAX_OUTPUT_TOKENS : maxOutputTokens
  const outputSchema = isAdjustment ? ParsedItineraryAdjustment : ParsedTripIntent
  const outputName = isAdjustment ? 'parsed_itinerary_adjustment' : 'parsed_trip_intent'
  const estimatedInputTokens = Math.ceil((systemPrompt.length + userInput.length) / 3)
  const reservedForRequest = estimatedInputTokens + outputTokens + 200
  const reservation = await reserveTokens(reservedForRequest)
  if (!reservation.accepted) {
    return response.status(429).json({
      error: 'The hosted complimentary-token safety ceiling has been reached.',
      code: 'COMPLIMENTARY_TOKEN_SAFETY_CEILING',
    })
  }

  try {
    const gptResponse = await openai.responses.parse({
      model,
      reasoning: { effort: 'none' },
      max_output_tokens: outputTokens,
      store: false,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput },
      ],
      text: { format: zodTextFormat(outputSchema, outputName), verbosity: 'low' },
    })

    const parsed = gptResponse.output_parsed || gptResponse.output
      ?.find((item) => item.type === 'message')
      ?.content?.find((item) => item.type === 'output_text')?.parsed
    if (!parsed) throw new Error('GPT returned no parsed trip brief.')

    const reportedTotal = Number(gptResponse.usage?.total_tokens)
    const actualTokens = Number.isFinite(reportedTotal) && reportedTotal > 0
      ? Math.floor(reportedTotal)
      : reservedForRequest
    await reconcileReservation(reservedForRequest, actualTokens)

    return response.json({
      ...(isAdjustment ? normalizeParsedItineraryAdjustment(parsed) : normalizeParsedTripIntent(parsed)),
      meta: {
        poweredBy: 'OpenAI',
        requestedModel: model,
        resolvedModel: gptResponse.model || model,
        usage: {
          inputTokens: gptResponse.usage?.input_tokens || 0,
          outputTokens: gptResponse.usage?.output_tokens || 0,
          totalTokens: actualTokens,
        },
      },
    })
  } catch (error) {
    // Keep the full reservation when outcome/usage is unknown. This intentionally
    // overcounts instead of risking a billed request after an ambiguous failure.
    console.error('Hosted trip parsing failed', {
      status: Number(error?.status) || 502,
      requestId: error?.request_id,
      type: error?.type,
      code: error?.code,
    })
    return response.status(502).json({
      error: 'Vetra could not interpret that brief with GPT. Please try again.',
      code: 'GPT_REQUEST_FAILED',
    })
  }
}

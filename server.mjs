import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { config } from 'dotenv'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

config({ path: '.env.local' })
config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT || 5173)
// Pin the exact snapshot included in OpenAI's complimentary-token program.
// Do not replace this with a floating alias: eligibility is snapshot-specific.
const model = 'gpt-5.4-2026-03-05'
const complimentaryTokensConfirmed =
  process.env.OPENAI_COMPLIMENTARY_TOKENS_CONFIRMED === 'true'
const configuredDailyTokenLimit = Number(
  process.env.OPENAI_COMPLIMENTARY_DAILY_TOKEN_LIMIT || 250_000,
)
const dailyTokenLimit = Number.isFinite(configuredDailyTokenLimit)
  ? Math.max(1, Math.floor(configuredDailyTokenLimit))
  : 250_000
const safeDailyTokenCeiling = Math.floor(dailyTokenLimit * 0.9)
const configuredBaselineUsage = Number(
  process.env.OPENAI_COMPLIMENTARY_TOKENS_USED_AT_START || 0,
)
const baselineUsage = Number.isFinite(configuredBaselineUsage)
  ? Math.max(0, Math.floor(configuredBaselineUsage))
  : 0
const maxOutputTokens = 700
const usageLedgerPath = path.join(__dirname, '.vetra', 'openai-usage.json')
let reservedTokens = 0
const projectId = process.env.OPENAI_PROJECT_ID?.trim()
const openai = process.env.OPENAI_API_KEY && projectId
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, project: projectId })
  : null

const Constraint = z.object({
  icon: z.enum(['route', 'date', 'cabin', 'flex', 'traveler']),
  label: z.string(),
  value: z.string(),
  hard: z.boolean(),
})

const ParsedTripBrief = z.object({
  assistantMessage: z.string(),
  routeCities: z.array(z.string()),
  constraints: z.array(Constraint),
})

const SYSTEM_PROMPT = `
You are Vetra, an expert flight-award optimization agent for experienced US points travelers.

Your job in this step is only to interpret a user's explicit flight request into a concise,
auditable brief for confirmation. Do not plan activities, choose destinations, search fares,
invent preferences, or claim that availability has been checked.

Success means:
- assistantMessage acknowledges the request in one or two calm, precise sentences
- routeCities contains the requested cities in travel order, including the return city
- constraints contains only facts stated or directly implied by the request
- mark hard=true only for an explicit must/need, required cabin, deadline, or arrival cutoff
- an exact date by itself is a fixed itinerary input, not a hard constraint, unless the user says it
  is required or must be met
- normalize dates and cabin names while preserving the user's intent
- use the icon whose meaning best matches each constraint
- combine closely related facts when that improves scanability
- if the request is not about flights, return an empty routeCities and constraints array and use
  assistantMessage to ask for a flight brief

Tone: personable, concise, rational, and confident. Never mention internal reasoning.
`.trim()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '24kb' }))

const utcDate = () => new Date().toISOString().slice(0, 10)

async function readUsageLedger() {
  try {
    const stored = JSON.parse(await readFile(usageLedgerPath, 'utf8'))
    if (stored.date === utcDate() && Number.isFinite(stored.tokens)) {
      return { date: stored.date, tokens: Math.max(0, Math.floor(stored.tokens)) }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Could not read the local OpenAI usage ledger; defaulting to zero.')
    }
  }
  return { date: utcDate(), tokens: 0 }
}

async function writeUsageLedger(tokens) {
  await mkdir(path.dirname(usageLedgerPath), { recursive: true })
  await writeFile(
    usageLedgerPath,
    `${JSON.stringify({ date: utcDate(), tokens }, null, 2)}\n`,
    'utf8',
  )
}

async function usageStatus() {
  const ledger = await readUsageLedger()
  const accountedTokens = baselineUsage + ledger.tokens + reservedTokens
  return {
    utcDate: utcDate(),
    complimentaryDailyTokenLimit: dailyTokenLimit,
    safeDailyTokenCeiling,
    safeBufferTokens: dailyTokenLimit - safeDailyTokenCeiling,
    dashboardBaselineTokens: baselineUsage,
    vetraTokensToday: ledger.tokens,
    reservedTokens,
    remainingSafeTokens: Math.max(0, safeDailyTokenCeiling - accountedTokens),
  }
}

app.get('/api/health', async (_request, response) => {
  response.json({
    ok: true,
    gptConfigured: Boolean(openai),
    projectConfigured: Boolean(projectId),
    complimentaryTokensConfirmed,
    readyForGpt: Boolean(openai) && complimentaryTokensConfirmed,
    model,
    billingSafety: 'fail-closed',
    usage: await usageStatus(),
  })
})

app.get('/api/usage', async (_request, response) => {
  response.json(await usageStatus())
})

app.post('/api/parse-trip', async (request, response) => {
  const brief = typeof request.body?.brief === 'string' ? request.body.brief.trim() : ''

  if (!brief || brief.length > 5000) {
    return response.status(400).json({
      error: 'Please provide a flight brief between 1 and 5,000 characters.',
    })
  }

  if (!openai) {
    return response.status(503).json({
      error: 'GPT requires a server-side project key and explicit project ID.',
      code: 'OPENAI_CONFIGURATION_MISSING',
    })
  }

  // OpenAI does not expose a per-request "will this be complimentary?" preflight.
  // Fail closed unless the project owner has confirmed enrollment in Platform settings.
  if (!complimentaryTokensConfirmed) {
    return response.status(412).json({
      error:
        'GPT requests are locked until complimentary-token enrollment is confirmed for this project.',
      code: 'COMPLIMENTARY_TOKENS_NOT_CONFIRMED',
    })
  }

  // Reserve conservatively before sending: one token per three characters plus
  // the full output allowance and protocol headroom. Actual usage replaces the
  // reservation in the persisted ledger after a successful response.
  const estimatedInputTokens = Math.ceil((SYSTEM_PROMPT.length + brief.length) / 3)
  const reservedForRequest = estimatedInputTokens + maxOutputTokens + 200
  const beforeRequest = await usageStatus()
  if (reservedForRequest > beforeRequest.remainingSafeTokens) {
    return response.status(429).json({
      error: 'The complimentary-token safety ceiling has been reached.',
      code: 'COMPLIMENTARY_TOKEN_SAFETY_CEILING',
      usage: beforeRequest,
    })
  }
  reservedTokens += reservedForRequest

  try {
    const gptResponse = await openai.responses.parse({
      model,
      reasoning: { effort: 'none' },
      max_output_tokens: maxOutputTokens,
      store: false,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: brief },
      ],
      text: {
        format: zodTextFormat(ParsedTripBrief, 'parsed_trip_brief'),
        verbosity: 'low',
      },
    })

    const parsed =
      gptResponse.output_parsed ||
      gptResponse.output
        ?.find((item) => item.type === 'message')
        ?.content?.find((item) => item.type === 'output_text')
        ?.parsed

    if (!parsed) {
      throw new Error('GPT returned no parsed trip brief.')
    }

    const reportedTotal = Number(gptResponse.usage?.total_tokens)
    // If an SDK/API response ever omits usage, charge the conservative reservation
    // to the local ledger instead of risking an undercount.
    const actualTokens = Number.isFinite(reportedTotal) && reportedTotal > 0
      ? Math.floor(reportedTotal)
      : reservedForRequest
    const ledger = await readUsageLedger()
    await writeUsageLedger(ledger.tokens + actualTokens)

    return response.json({
      ...parsed,
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
    const status = Number(error?.status) || 502
    console.error('Trip parsing failed', {
      status,
      requestId: error?.request_id,
      type: error?.type,
      code: error?.code,
    })
    return response.status(status >= 400 && status < 600 ? status : 502).json({
      error: 'Vetra could not interpret that brief with GPT. Please try again.',
      code: 'GPT_REQUEST_FAILED',
    })
  } finally {
    reservedTokens = Math.max(0, reservedTokens - reservedForRequest)
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (_request, response) => {
    response.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
} else {
  const { createServer } = await import('vite')
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Vetra is running at http://localhost:${port}`)
  const gptStatus = !openai
    ? 'mock fallback only (project credential not configured)'
    : complimentaryTokensConfirmed
      ? `${model} enabled in complimentary-only mode`
      : 'locked (complimentary-token enrollment not confirmed)'
  console.log(`GPT brief parsing: ${gptStatus}`)
})

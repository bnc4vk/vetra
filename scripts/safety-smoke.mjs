import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const projectRoot = new URL('../', import.meta.url)

async function startServer(port, overrides = {}) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      OPENAI_API_KEY: '',
      OPENAI_PROJECT_ID: '',
      OPENAI_COMPLIMENTARY_TOKENS_CONFIRMED: 'false',
      OPENAI_COMPLIMENTARY_DAILY_TOKEN_LIMIT: '250000',
      OPENAI_COMPLIMENTARY_TOKENS_USED_AT_START: '0',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  const deadline = Date.now() + 8000
  while (!output.includes('Vetra is running')) {
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${output}`)
    if (Date.now() > deadline) throw new Error(`Server did not start:\n${output}`)
    await new Promise((resolve) => setTimeout(resolve, 40))
  }

  return child
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => child.once('exit', resolve))
}

async function postBrief(port) {
  return fetch(`http://127.0.0.1:${port}/api/parse-trip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brief: 'Fly from New York to Tokyo.' }),
  })
}

async function run() {
  const basePort = 53170

  let server = await startServer(basePort)
  try {
    const health = await fetch(`http://127.0.0.1:${basePort}/api/health`).then((r) => r.json())
    assert.equal(health.model, 'gpt-5.4-2026-03-05')
    assert.equal(health.readyForGpt, false)
    const response = await postBrief(basePort)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'OPENAI_CONFIGURATION_MISSING')
  } finally {
    await stopServer(server)
  }

  server = await startServer(basePort + 1, {
    OPENAI_API_KEY: 'dummy-local-key',
    OPENAI_PROJECT_ID: 'proj_dummy_local_only',
    OPENAI_MODEL: 'gpt-5.6-sol',
  })
  try {
    const health = await fetch(`http://127.0.0.1:${basePort + 1}/api/health`).then((r) => r.json())
    assert.equal(health.model, 'gpt-5.4-2026-03-05', 'environment must not override model')
    assert.equal(health.readyForGpt, false)
    const response = await postBrief(basePort + 1)
    assert.equal(response.status, 412)
    assert.equal((await response.json()).code, 'COMPLIMENTARY_TOKENS_NOT_CONFIRMED')
  } finally {
    await stopServer(server)
  }

  server = await startServer(basePort + 2, {
    OPENAI_API_KEY: 'dummy-local-key',
    OPENAI_PROJECT_ID: 'proj_dummy_local_only',
    OPENAI_COMPLIMENTARY_TOKENS_CONFIRMED: 'true',
    OPENAI_COMPLIMENTARY_DAILY_TOKEN_LIMIT: '1000',
    OPENAI_COMPLIMENTARY_TOKENS_USED_AT_START: '900',
  })
  try {
    const health = await fetch(`http://127.0.0.1:${basePort + 2}/api/health`).then((r) => r.json())
    assert.equal(health.usage.safeDailyTokenCeiling, 900)
    assert.equal(health.usage.safeBufferTokens, 100)
    assert.equal(health.usage.remainingSafeTokens, 0)
    const response = await postBrief(basePort + 2)
    assert.equal(response.status, 429)
    assert.equal((await response.json()).code, 'COMPLIMENTARY_TOKEN_SAFETY_CEILING')
  } finally {
    await stopServer(server)
  }

  console.log('Safety smoke tests passed: model pin, key lock, enrollment lock, and 90% ceiling.')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

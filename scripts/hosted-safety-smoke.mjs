import assert from 'node:assert/strict'

process.env.OPENAI_API_KEY = 'dummy-hosted-key'
process.env.OPENAI_PROJECT_ID = 'proj_dummy_hosted_only'
process.env.OPENAI_COMPLIMENTARY_TOKENS_CONFIRMED = 'true'
process.env.OPENAI_COMPLIMENTARY_DAILY_TOKEN_LIMIT = '250000'
process.env.OPENAI_COMPLIMENTARY_TOKENS_USED_AT_START = '0'
process.env.OPENAI_HOSTED_SAFE_FRACTION = '0.4'
process.env.VETRA_ALLOWED_ORIGINS = 'https://bnc4vk.github.io'
delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN
delete process.env.KV_REST_API_URL
delete process.env.KV_REST_API_TOKEN

const { default: handler } = await import('../api/index.mjs')

function responseRecorder() {
  return {
    body: undefined,
    headers: {},
    statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
    end() { return this },
  }
}

let response = responseRecorder()
await handler({ method: 'GET', url: '/api/health', headers: {}, query: { route: 'health' } }, response)
assert.equal(response.statusCode, 200)
assert.equal(response.body.model, 'gpt-5.4-2026-03-05')
assert.equal(response.body.readyForGpt, false)
assert.equal(response.body.quotaStoreConfigured, false)

response = responseRecorder()
await handler({
  method: 'POST',
  url: '/api/parse-trip',
  headers: { origin: 'https://bnc4vk.github.io' },
  query: { route: 'parse-trip' },
  body: { brief: 'Fly from New York to Tokyo.' },
}, response)
assert.equal(response.statusCode, 503)
assert.equal(response.body.code, 'QUOTA_STORE_MISSING')

response = responseRecorder()
await handler({
  method: 'POST',
  url: '/api/parse-trip',
  headers: { origin: 'https://malicious.example' },
  query: { route: 'parse-trip' },
  body: { brief: 'Fly from New York to Tokyo.' },
}, response)
assert.equal(response.statusCode, 403)
assert.equal(response.body.code, 'ORIGIN_NOT_ALLOWED')

console.log('Hosted safety smoke tests passed: model pin, origin lock, and Redis fail-closed gate.')

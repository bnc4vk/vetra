import assert from 'node:assert/strict'
import {
  ITINERARY_ADJUSTMENT_VERSION,
  TRIP_INTENT_VERSION,
} from '../shared/trip-intelligence.mjs'

const apiBase = String(process.env.VETRA_API_BASE_URL || '').trim().replace(/\/$/, '')
const expectedRevision = String(process.env.EXPECTED_DEPLOYMENT_SHA || '').trim()
assert(apiBase, 'VETRA_API_BASE_URL is required.')

const expectedContracts = {
  tripIntent: TRIP_INTENT_VERSION,
  itineraryAdjustment: ITINERARY_ADJUSTMENT_VERSION,
}

const verifyHealth = async () => {
  const response = await fetch(`${apiBase}/api/health?revision=${encodeURIComponent(expectedRevision || 'contract-check')}`, {
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  })
  assert.equal(response.ok, true, `Hosted API health returned HTTP ${response.status}.`)

  const health = await response.json()
  assert.equal(health.ok, true)
  assert.equal(health.readyForGpt, true, 'Hosted API is not ready for GPT requests.')
  assert.deepEqual(health.contractVersions, expectedContracts)
  if (expectedRevision) {
    assert.equal(
      health.deploymentRevision,
      expectedRevision,
      `Hosted API is serving revision ${health.deploymentRevision || 'unknown'}, expected ${expectedRevision}.`,
    )
  }
}

let lastError
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    await verifyHealth()
    lastError = null
    break
  } catch (error) {
    lastError = error
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
}
if (lastError) throw lastError

console.log(`Hosted API is ready with ${TRIP_INTENT_VERSION} and ${ITINERARY_ADJUSTMENT_VERSION}${expectedRevision ? ` at ${expectedRevision}` : ''}.`)

import assert from 'node:assert/strict'
import {
  ITINERARY_ADJUSTMENT_VERSION,
  TRIP_INTENT_VERSION,
} from '../shared/trip-intelligence.mjs'

const apiBase = String(process.env.VETRA_API_BASE_URL || '').trim().replace(/\/$/, '')
assert(apiBase, 'VETRA_API_BASE_URL is required.')

const response = await fetch(`${apiBase}/api/health`, {
  headers: { accept: 'application/json' },
})
assert.equal(response.ok, true, `Hosted API health returned HTTP ${response.status}.`)

const health = await response.json()
assert.deepEqual(health.contractVersions, {
  tripIntent: TRIP_INTENT_VERSION,
  itineraryAdjustment: ITINERARY_ADJUSTMENT_VERSION,
})

console.log(`Hosted API contract matches ${TRIP_INTENT_VERSION} and ${ITINERARY_ADJUSTMENT_VERSION}.`)

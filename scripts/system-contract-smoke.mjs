import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BROWSER_DEMO_JOURNEYS } from '../shared/browser-demo-journeys.mjs'
import { ParsedTripIntent } from '../shared/trip-intelligence.mjs'
import {
  SYSTEM_CONTRACT_VERSION,
  systemServices,
} from '../src/systemServices.js'

assert.equal(SYSTEM_CONTRACT_VERSION, 'vetra-demo-system/v1')
assert.equal(systemServices.contractVersion, SYSTEM_CONTRACT_VERSION)
assert.match(systemServices.rewards.id, /^demo-rewards\//)
assert.match(systemServices.legPricing.id, /^demo-leg-pricing\//)
assert.match(systemServices.awardSearch.id, /^demo-award-search\//)
assert.match(systemServices.reasoning.id, /^demo-reasoning\//)
assert(systemServices.rewards.programs.length >= 70)

assert.equal(BROWSER_DEMO_JOURNEYS.length, 5)
assert.equal(new Set(BROWSER_DEMO_JOURNEYS.map((journey) => journey.id)).size, 5)
assert.equal(new Set(BROWSER_DEMO_JOURNEYS.map((journey) => journey.brief)).size, 5)
BROWSER_DEMO_JOURNEYS.forEach((journey) => ParsedTripIntent.parse(journey.intent))

const canonical = BROWSER_DEMO_JOURNEYS[0].intent
const brief = {
  route: canonical.routeCities.join(' → '),
  tripDurationDays: canonical.tripDurationDays,
  flightLegs: canonical.flightLegs.map((leg, index) => ({
    ...leg,
    legId: `contract-leg-${index + 1}`,
    route: `${leg.origin} → ${leg.destination}`,
    timing: leg.timing.label,
    timingKind: leg.timing.kind,
    cabin: leg.cabin.label,
  })),
}
const recommendations = systemServices.recommend({ brief, referenceYear: 2026 })
assert.equal(recommendations.length, 3)
assert.deepEqual(new Set(recommendations.map((entry) => entry.title)), new Set([
  'Balanced itinerary',
  'High-value itinerary',
  'Streamlined itinerary',
]))
assert(recommendations.every((entry) => entry.economics.fundingMode === 'cash'))
assert(recommendations.every((entry) => entry.segments.every((segment) => segment.economics.cashValue > 0)))

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.doesNotMatch(appSource, /setPhase\(['"]review['"]\)/)
assert.match(appSource, /data-system-contract=\{SYSTEM_CONTRACT_VERSION\}/)
assert.match(appSource, /if \(phase !== 'optimizing'\) return undefined[\s\S]*setRecommendations\(systemServices\.recommend/)
assert.doesNotMatch(appSource, /const recommendations = useMemo\([\s\S]*systemServices\.recommend/)

console.log('System contract smoke test passed: six-phase demo orchestration and three replaceable service boundaries are locked.')

import assert from 'node:assert/strict'
import {
  ParsedTripIntent,
  TRIP_INTENT_VERSION,
  TRIP_INTERPRETATION_MODEL,
  normalizeParsedTripIntent,
} from '../shared/trip-intelligence.mjs'
import {
  applyFollowUpToBrief,
  applyItineraryOperations,
  toUiTripBrief,
  validateItinerary,
} from '../src/tripIntelligence.js'

const leg = (sequence, origin, destination, timing = 'Within Two-Week Trip', status = 'captured') => ({
  sequence,
  origin,
  originKind: ['South Korea', 'Vietnam', 'Philippines'].includes(origin) ? 'broad_location' : 'city',
  destination,
  destinationKind: ['South Korea', 'Vietnam', 'Philippines'].includes(destination) ? 'broad_location' : 'city',
  timing: { label: timing, kind: timing.startsWith('Arrive') ? 'arrive_by' : 'trip_window', evidence: sequence === 1 ? 'explicit' : 'implied' },
  cabin: { label: 'Not Specified', evidence: 'missing' },
  detail: `${origin} to ${destination}.`,
  status,
  statusLabel: status === 'needed' ? 'Destination Needed' : 'Captured',
})

const intent = ParsedTripIntent.parse({
  contractVersion: TRIP_INTENT_VERSION,
  assistantMessage: 'I mapped the trip from New York through Tokyo, South Korea, and Vietnam, then home.',
  routeCities: [],
  tripDurationDays: 14,
  travelers: 'Not Specified',
  flexibility: 'Two-week trip',
  flightLegs: [
    leg(3, 'South Korea', 'Vietnam', undefined, 'needed'),
    leg(1, 'New York', 'Tokyo', 'Arrive by Nov 12'),
    leg(4, 'Vietnam', 'New York', undefined, 'suggested'),
    leg(2, 'Tokyo', 'South Korea', undefined, 'needed'),
  ],
  followUpQuestions: [
    { field: 'destination', scope: 'Vietnam', priority: 2, question: 'Which city in Vietnam would you like to visit?' },
    { field: 'destination', scope: 'South Korea', priority: 1, question: 'Which city in South Korea would you like to visit?' },
  ],
})

const normalized = normalizeParsedTripIntent(intent)
assert.equal(TRIP_INTERPRETATION_MODEL, 'gpt-5.4-2026-03-05')
assert.deepEqual(normalized.routeCities, ['New York', 'Tokyo', 'South Korea', 'Vietnam', 'New York'])
assert.deepEqual(normalized.flightLegs.map((entry) => entry.sequence), [1, 2, 3, 4])

const uiBrief = toUiTripBrief({ ...normalized, meta: { resolvedModel: TRIP_INTERPRETATION_MODEL } }, 'Demo brief')
const southKoreaResolved = applyFollowUpToBrief(uiBrief, uiBrief.followUpQuestions[0], 'seoul')
assert.deepEqual(southKoreaResolved.cities, ['New York', 'Tokyo', 'Seoul', 'Vietnam', 'New York'])
assert.equal(southKoreaResolved.followUpQuestions.length, 1)
assert.equal(southKoreaResolved.followUpQuestions[0].scope, 'Vietnam')

const fullyResolved = applyFollowUpToBrief(southKoreaResolved, southKoreaResolved.followUpQuestions[0], 'hanoi')
assert.deepEqual(fullyResolved.cities, ['New York', 'Tokyo', 'Seoul', 'Hanoi', 'New York'])
assert.deepEqual(fullyResolved.followUpQuestions, [])
assert.deepEqual(validateItinerary(fullyResolved.flightLegs), [])

const secondLegId = fullyResolved.flightLegs[1].legId
const inserted = applyItineraryOperations(fullyResolved, {
  contractVersion: 'itinerary-adjustment/v1',
  baseRevision: fullyResolved.revision,
  operations: [{
    operationId: 'insert-osaka',
    type: 'replace',
    targetLegIds: [secondLegId],
    anchorLegId: null,
    position: null,
    field: null,
    value: null,
    valueKind: null,
    legs: [
      leg(1, 'Tokyo', 'Osaka'),
      leg(2, 'Osaka', 'Seoul'),
    ],
  }],
}).brief
assert.deepEqual(inserted.cities, ['New York', 'Tokyo', 'Osaka', 'Seoul', 'Hanoi', 'New York'])
assert.deepEqual(validateItinerary(inserted.flightLegs), [])

const removedMiddle = applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [{ operationId: 'remove-middle', type: 'remove', targetLegIds: [fullyResolved.flightLegs[1].legId], anchorLegId: null, position: null, field: null, value: null, valueKind: null, legs: [] }],
}).brief
assert.equal(removedMiddle.flightLegs.length, 3)
assert.deepEqual(validateItinerary(removedMiddle.flightLegs), [])

const badTiming = applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [{ operationId: 'earlier-second-leg', type: 'update', targetLegIds: [fullyResolved.flightLegs[1].legId], anchorLegId: null, position: null, field: 'timing', value: 'Nov 10', valueKind: 'timing', legs: [] }],
}).brief
assert.equal(validateItinerary(badTiming.flightLegs).filter((issue) => issue.type === 'timing').length, 1)

const laterTiming = applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [{ operationId: 'later-third-leg', type: 'update', targetLegIds: [fullyResolved.flightLegs[2].legId], anchorLegId: null, position: null, field: 'timing', value: 'Nov 14', valueKind: 'timing', legs: [] }],
}).brief
assert.equal(validateItinerary(laterTiming.flightLegs).filter((issue) => issue.type === 'timing').length, 0)

const nonAdjacentBadTiming = applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [{ operationId: 'earlier-third-leg', type: 'update', targetLegIds: [fullyResolved.flightLegs[2].legId], anchorLegId: null, position: null, field: 'timing', value: 'Nov 10', valueKind: 'timing', legs: [] }],
}).brief
assert.equal(validateItinerary(nonAdjacentBadTiming.flightLegs).filter((issue) => issue.type === 'timing').length, 1)
assert.match(validateItinerary(nonAdjacentBadTiming.flightLegs).find((issue) => issue.type === 'timing').message, /Leg 3 is dated before leg 1/)

const firstLegId = inserted.flightLegs[0].legId
const cityGapAllowed = applyItineraryOperations(inserted, {
  baseRevision: inserted.revision,
  operations: [{ operationId: 'break-route', type: 'update', targetLegIds: [firstLegId], anchorLegId: null, position: null, field: 'destination', value: 'Kyoto', valueKind: 'city', legs: [] }],
}).brief
assert.deepEqual(validateItinerary(cityGapAllowed.flightLegs), [])

const sameCityAllowed = fullyResolved.flightLegs.map((entry, index) => index === 1
  ? { ...entry, origin: 'Seoul', originKind: 'city', destination: 'Seoul', destinationKind: 'city', route: 'Seoul → Seoul' }
  : entry)
assert.deepEqual(validateItinerary(sameCityAllowed), [])

const repaired = applyItineraryOperations(cityGapAllowed, {
  baseRevision: cityGapAllowed.revision,
  operations: [{ operationId: 'repair-route', type: 'update', targetLegIds: [cityGapAllowed.flightLegs[1].legId], anchorLegId: null, position: null, field: 'origin', value: 'Kyoto', valueKind: 'city', legs: [] }],
}).brief
assert.deepEqual(validateItinerary(repaired.flightLegs), [])

const philippines = applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [
    { operationId: 'philippines-in', type: 'update', targetLegIds: [fullyResolved.flightLegs[1].legId], anchorLegId: null, position: null, field: 'destination', value: 'Philippines', valueKind: 'broad_location', legs: [] },
    { operationId: 'philippines-out', type: 'update', targetLegIds: [fullyResolved.flightLegs[2].legId], anchorLegId: null, position: null, field: 'origin', value: 'Philippines', valueKind: 'broad_location', legs: [] },
  ],
}).brief
assert.equal(validateItinerary(philippines.flightLegs).filter((issue) => issue.type === 'city').length, 2)

const isoReversed = fullyResolved.flightLegs.map((entry, index) => ({ ...entry, timing: index === 0 ? '2026-11-12' : index === 1 ? '2026-11-10' : entry.timing }))
assert.equal(validateItinerary(isoReversed).filter((issue) => issue.type === 'timing').length, 1)
const yearReversed = fullyResolved.flightLegs.map((entry, index) => ({ ...entry, timing: index === 0 ? 'December 20, 2026' : index === 1 ? 'January 5, 2026' : entry.timing }))
assert.equal(validateItinerary(yearReversed).filter((issue) => issue.type === 'timing').length, 1)

assert.throws(() => applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [{ operationId: 'bad-insert', type: 'insert', targetLegIds: [], anchorLegId: fullyResolved.flightLegs[0].legId, position: null, field: null, value: null, valueKind: null, legs: [leg(1, 'Tokyo', 'Osaka')] }],
}), /insertion point was incomplete/)
assert.throws(() => applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [{ operationId: 'partial-remove', type: 'remove', targetLegIds: [fullyResolved.flightLegs[1].legId, 'missing-leg'], anchorLegId: null, position: null, field: null, value: null, valueKind: null, legs: [] }],
}), /no longer exists/)

const replayBase = applyItineraryOperations(fullyResolved, {
  baseRevision: fullyResolved.revision,
  operations: [{ operationId: 'one-time-edit', type: 'update', targetLegIds: [fullyResolved.flightLegs[0].legId], anchorLegId: null, position: null, field: 'cabin', value: 'Business Class', valueKind: 'cabin', legs: [] }],
}).brief
assert.throws(() => applyItineraryOperations(replayBase, {
  baseRevision: replayBase.revision,
  operations: [{ operationId: 'one-time-edit', type: 'insert', targetLegIds: [], anchorLegId: replayBase.flightLegs[0].legId, position: 'after', field: null, value: null, valueKind: null, legs: [leg(1, 'Tokyo', 'Osaka')] }],
}), /already applied/)
assert.equal(validateItinerary([{ ...fullyResolved.flightLegs[0] }, { ...fullyResolved.flightLegs[1], legId: fullyResolved.flightLegs[0].legId }]).some((issue) => issue.type === 'identity'), true)

assert.throws(() => applyItineraryOperations(repaired, {
  baseRevision: 0,
  operations: [{ operationId: 'stale', type: 'remove', targetLegIds: [firstLegId], anchorLegId: null, position: null, field: null, value: null, valueKind: null, legs: [] }],
}), /changed while the request was processing/)

console.log('Itinerary smoke test passed: city gaps allowed, cross-leg date ordering enforced, and typed edits remain revision-safe.')

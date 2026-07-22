import assert from 'node:assert/strict'
import { DEMO_REWARDS_PROGRAMS } from '../src/demoRewardsPrograms.js'
import {
  buildDemoRecommendations,
  calculatePointValue,
  candidateMeetsHardRequirements,
} from '../src/flightRecommendations.js'
import { fetchDemoLegPrice } from '../src/demoLegPricing.js'

const brief = {
  route: 'New York → Tokyo → Seoul → New York',
  tripDurationDays: 14,
  tripSummary: '14-Day Trip',
  flightLegs: [
    { legId: 'one', route: 'New York → Tokyo', origin: 'New York', destination: 'Tokyo', timing: 'Arrive By Nov 12', timingKind: 'arrive_by', cabin: 'Not Specified' },
    { legId: 'two', route: 'Tokyo → Seoul', origin: 'Tokyo', destination: 'Seoul', timing: 'Within Two-Week Trip', timingKind: 'trip_window', cabin: 'Not Specified' },
    { legId: 'three', route: 'Seoul → New York', origin: 'Seoul', destination: 'New York', timing: 'Within Two-Week Trip', timingKind: 'trip_window', cabin: 'Not Specified' },
  ],
}
const rewards = DEMO_REWARDS_PROGRAMS.filter((program) => ['chase', 'capitalone'].includes(program.id))
const recommendations = buildDemoRecommendations(brief, { referenceYear: 2026, rewards })

assert.equal(recommendations.length, 3)
assert.equal(calculatePointValue({ points: 65000, fees: 104, cashValue: 3400 }), ((3400 - 104) * 100) / 65000)
assert.deepEqual(recommendations.map((entry) => entry.title), [
  'Balanced itinerary',
  'High-value itinerary',
  'Streamlined itinerary',
])
recommendations.forEach((recommendation) => {
  assert.deepEqual(recommendation.segments.map((segment) => segment.plannedLegId), ['one', 'two', 'three'])
  assert.equal(recommendation.segments.some((segment) => /October|Honolulu|HNL/.test(`${segment.route} ${segment.departure} ${segment.arrival}`)), false)
  assert.equal(Array.isArray(recommendation.pros), true)
  assert.equal(Array.isArray(recommendation.cons), true)
  assert.equal([...recommendation.pros, ...recommendation.cons].some((item) => /planned legs|arrive by|vetra score/i.test(item)), false)
  assert(recommendation.segments.every((segment) => (
    segment.departure
    && segment.arrival
    && segment.economics.points > 0
    && segment.economics.cashValue > 0
    && segment.economics.source === 'demo-distance-model/v1'
    && rewards.some((program) => program.id === segment.economics.fundingProgram.id)
  )))
  assert.deepEqual(new Set(recommendation.fundingPrograms.map((program) => program.id)), new Set(['chase', 'capitalone']))
  const summed = recommendation.segments.reduce((total, segment) => ({
    points: total.points + segment.economics.points,
    fees: total.fees + segment.economics.fees,
    cashValue: total.cashValue + segment.economics.cashValue,
  }), { points: 0, fees: 0, cashValue: 0 })
  assert.equal(recommendation.economics.points, summed.points)
  assert.equal(recommendation.economics.fees, summed.fees)
  assert.equal(recommendation.economics.cashValue, summed.cashValue)
  assert.equal(recommendation.economics.pointValue, calculatePointValue(summed))
})

const deterministicRequest = {
  leg: brief.flightLegs[0],
  cabin: 'Economy',
  candidateIndex: 1,
  fundingProgram: rewards[0],
}
assert.deepEqual(fetchDemoLegPrice(deterministicRequest), fetchDemoLegPrice(deterministicRequest))

const extendedBrief = {
  ...brief,
  route: 'New York → Tokyo → Seoul → Honolulu → New York',
  flightLegs: [
    ...brief.flightLegs.slice(0, 2),
    { legId: 'extra', route: 'Seoul → Honolulu', origin: 'Seoul', destination: 'Honolulu', timing: 'Within Two-Week Trip', timingKind: 'trip_window', cabin: 'Economy' },
    { ...brief.flightLegs[2], origin: 'Honolulu', route: 'Honolulu → New York' },
  ],
}
const extendedRecommendations = buildDemoRecommendations(extendedBrief, { referenceYear: 2026, rewards: [rewards[0]] })
extendedRecommendations.forEach((recommendation) => {
  assert.equal(recommendation.segments.length, 4)
  assert(recommendation.segments.every((segment) => segment.economics.points > 0 && segment.economics.fundingProgram.id === 'chase'))
})

const cashRecommendations = buildDemoRecommendations(extendedBrief, { referenceYear: 2026 })
cashRecommendations.forEach((recommendation) => {
  assert.equal(recommendation.economics.fundingMode, 'cash')
  assert.equal(recommendation.points.endsWith(' cash'), true)
  assert.equal(recommendation.value, 'Cash fallback')
  assert(recommendation.segments.every((segment) => (
    segment.economics.points === 0
    && segment.economics.fees === 0
    && segment.economics.cashValue > 0
    && segment.economics.fundingProgram === null
  )))
})

const lateCandidate = {
  ...recommendations[0],
  segments: recommendations[0].segments.map((segment, index) => index === 0
    ? { ...segment, arrivalDate: new Date(Date.UTC(2026, 10, 13)) }
    : segment),
}
assert.equal(candidateMeetsHardRequirements(lateCandidate, brief, 2026), false)

const adjusted = {
  ...brief,
  flightLegs: brief.flightLegs.map((leg, index) => index === 0
    ? { ...leg, timing: 'Arrive By Nov 13', cabin: 'Business Class' }
    : leg),
}
const adjustedRecommendations = buildDemoRecommendations(adjusted, { referenceYear: 2026, rewards })
assert(adjustedRecommendations.every((entry) => entry.segments[0].cabin === 'Business Class'))
assert(adjustedRecommendations.every((entry) => /November 12/.test(entry.segments[0].arrival)))
assert(adjustedRecommendations.every((entry, index) => entry.segments[0].economics.points > recommendations[index].segments[0].economics.points))

console.log('Results continuity smoke test passed: every confirmed leg is priced, linked programs constrain funding, and cash fallback remains recoverable.')

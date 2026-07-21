import assert from 'node:assert/strict'
import {
  buildDemoRecommendations,
  calculatePointValue,
  candidateMeetsHardRequirements,
} from '../src/flightRecommendations.js'

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

const recommendations = buildDemoRecommendations(brief, { referenceYear: 2026 })
assert.equal(recommendations.length, 3)
assert.equal(calculatePointValue({ points: 65000, fees: 104, cashValue: 3400 }), ((3400 - 104) * 100) / 65000)
recommendations.forEach((recommendation) => {
  assert.deepEqual(recommendation.segments.map((segment) => segment.plannedLegId), ['one', 'two', 'three'])
  assert.equal(recommendation.segments.some((segment) => /October|Honolulu|HNL/.test(`${segment.route} ${segment.departure} ${segment.arrival}`)), false)
  assert.equal(Array.isArray(recommendation.pros), true)
  assert.equal(Array.isArray(recommendation.cons), true)
  assert.equal([...recommendation.pros, ...recommendation.cons].some((item) => /planned legs|arrive by|vetra score/i.test(item)), false)
  assert.equal(recommendation.segments.every((segment) => segment.departure && segment.arrival && segment.economics), true)
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
const netPros = recommendations.map((recommendation) => recommendation.pros.length - recommendation.cons.length)
assert.deepEqual(netPros, [...netPros].sort((left, right) => right - left))
assert.deepEqual(recommendations.map((recommendation) => recommendation.title), [
  'Aeroplan-led itinerary',
  'ANA + United itinerary',
  'United-led itinerary',
])
assert.equal(recommendations[0].pros.includes('Premium Economy on the long-haul outbound'), true)
assert.equal(recommendations[1].pros.includes('Highest modeled point value'), true)
assert.equal(recommendations[1].pros.some((pro) => /lowest points/i.test(pro)), false)
assert.equal(recommendations[2].cons.includes('Lowest modeled point value'), true)
assert.equal(recommendations[2].cons.some((con) => /highest points/i.test(con)), false)
assert.deepEqual(recommendations.map((recommendation) => recommendation.score), [96, 89, 83])

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
const adjustedRecommendations = buildDemoRecommendations(adjusted, { referenceYear: 2026 })
assert.equal(adjustedRecommendations.every((entry) => entry.segments[0].cabin === 'Business Class'), true)
assert.equal(adjustedRecommendations.every((entry) => /November 12/.test(entry.segments[0].arrival)), true)

console.log('Results continuity smoke test passed: hard requirements filter candidates and leg economics drive ranked trade-offs.')

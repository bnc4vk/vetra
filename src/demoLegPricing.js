import { resolveKnownLocation } from './locationCatalog.js'

const EARTH_RADIUS_MILES = 3958.8
const CABIN_MULTIPLIERS = {
  economy: 1,
  'premium economy': 1.55,
  business: 2.8,
  'business class': 2.8,
  first: 4.2,
  'first class': 4.2,
}

function hashUnit(value) {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function toRadians(value) {
  return (value * Math.PI) / 180
}

export function estimateLegDistanceMiles(leg) {
  const origin = resolveKnownLocation(leg?.origin)
  const destination = resolveKnownLocation(leg?.destination)
  if (!origin || !destination) {
    return Math.round(450 + (hashUnit(`${leg?.origin}|${leg?.destination}`) * 5_550))
  }

  const latitudeDelta = toRadians(destination.lat - origin.lat)
  const longitudeDelta = toRadians(destination.lon - origin.lon)
  const originLatitude = toRadians(origin.lat)
  const destinationLatitude = toRadians(destination.lat)
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return Math.round(EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc)))
}

function baseAwardPoints(distanceMiles) {
  if (distanceMiles <= 500) return 7_500
  if (distanceMiles <= 1_500) return 12_500
  if (distanceMiles <= 3_000) return 25_000
  if (distanceMiles <= 5_000) return 40_000
  if (distanceMiles <= 7_500) return 55_000
  return 70_000
}

function roundTo(value, increment) {
  return Math.max(increment, Math.round(value / increment) * increment)
}

export function fetchDemoLegPrice({ leg, cabin, candidateIndex = 0, fundingProgram = null }) {
  const distanceMiles = estimateLegDistanceMiles(leg)
  const normalizedCabin = String(cabin || 'Economy').trim().toLowerCase()
  const cabinMultiplier = CABIN_MULTIPLIERS[normalizedCabin] || 1
  const seed = `${leg?.legId}|${leg?.origin}|${leg?.destination}|${leg?.timing}|${normalizedCabin}|${candidateIndex}`
  const priceJitter = .88 + (hashUnit(seed) * .24)
  const candidatePointFactors = [.96, .82, 1.08]
  const candidateCashFactors = [1, 1.04, .94]
  const candidateFeeFactors = [1, 1.35, .78]
  const cashValue = roundTo(
    (95 + (distanceMiles * .17)) * cabinMultiplier * candidateCashFactors[candidateIndex % candidateCashFactors.length] * priceJitter,
    5,
  )

  if (!fundingProgram) {
    return {
      fundingMode: 'cash',
      fundingProgram: null,
      points: 0,
      fees: 0,
      cashValue,
      distanceMiles,
      source: 'demo-distance-model/v1',
    }
  }

  return {
    fundingMode: 'points',
    fundingProgram: {
      id: fundingProgram.id,
      name: fundingProgram.name,
      program: fundingProgram.program,
    },
    points: roundTo(
      baseAwardPoints(distanceMiles) * cabinMultiplier * candidatePointFactors[candidateIndex % candidatePointFactors.length] * priceJitter,
      500,
    ),
    fees: roundTo(
      (18 + Math.min(155, distanceMiles * .014)) * candidateFeeFactors[candidateIndex % candidateFeeFactors.length] * (.9 + (priceJitter * .1)),
      1,
    ),
    cashValue,
    distanceMiles,
    source: 'demo-distance-model/v1',
  }
}

export const demoLegPricingService = Object.freeze({
  id: 'demo-leg-pricing/v1',
  quote: fetchDemoLegPrice,
})

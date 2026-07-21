const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CANDIDATE_CONFIGS = [
  {
    label: 'Best overall',
    title: 'Aeroplan-led itinerary',
    detail: 'A premium-economy outbound and balanced airports create the strongest overall trade-off',
    color: '#6258d6',
    departureTimes: ['9:10 AM', '4:10 PM', '11:00 AM'],
    arrivalTimes: ['1:35 PM', '6:45 PM', '10:40 AM'],
    arrivalDayOffsets: [1, 0, 0],
    carriers: ['Air Canada partner award', 'ANA · NH 865', 'Air Canada partner award'],
    defaultCabins: ['Premium Economy', 'Economy', 'Economy'],
    routes: ['JFK → HND', 'HND → GMP', 'ICN → JFK'],
    segmentEconomics: [
      { points: 65000, fees: 104, cashValue: 3400 },
      { points: 28000, fees: 64, cashValue: 464 },
      { points: 75000, fees: 144, cashValue: 3000 },
    ],
    tradeoffs: [
      { dimension: 'airport_balance', sentiment: 'pro', label: 'Balanced airport choices', weight: 8 },
      { dimension: 'carrier_complexity', sentiment: 'con', label: 'Mixed-carrier itinerary', weight: 4 },
    ],
  },
  {
    label: 'Best point value',
    title: 'ANA + United itinerary',
    detail: 'The strongest redemption return, with more airport and booking-path complexity',
    color: '#be477e',
    departureTimes: ['10:15 AM', '1:20 PM', '10:00 AM'],
    arrivalTimes: ['2:40 PM', '3:55 PM', '9:35 AM'],
    arrivalDayOffsets: [1, 0, 0],
    carriers: ['ANA · partner award', 'Asiana · OZ 101', 'United partner award'],
    defaultCabins: ['Economy', 'Economy', 'Economy'],
    routes: ['EWR → NRT', 'NRT → ICN', 'ICN → EWR'],
    segmentEconomics: [
      { points: 55000, fees: 228, cashValue: 2950 },
      { points: 25000, fees: 95, cashValue: 519 },
      { points: 65000, fees: 361, cashValue: 3450 },
    ],
    tradeoffs: [
      { dimension: 'booking_flexibility', sentiment: 'pro', label: 'Multiple partner booking paths', weight: 6 },
      { dimension: 'alternate_airports', sentiment: 'con', label: 'Alternate airports in New York and Tokyo', weight: 5 },
    ],
  },
  {
    label: 'Simplest booking',
    title: 'United-led itinerary',
    detail: 'The cleanest booking path, with a lower redemption return and less schedule flexibility',
    color: '#17806c',
    departureTimes: ['11:30 AM', '3:45 PM', '6:15 PM'],
    arrivalTimes: ['3:55 PM', '6:20 PM', '5:50 PM'],
    arrivalDayOffsets: [1, 0, 0],
    carriers: ['United · UA 131', 'United partner award', 'United · partner award'],
    defaultCabins: ['Economy', 'Economy', 'Economy'],
    routes: ['EWR → HND', 'HND → ICN', 'ICN → EWR'],
    segmentEconomics: [
      { points: 70000, fees: 86, cashValue: 3200 },
      { points: 30000, fees: 54, cashValue: 508 },
      { points: 80000, fees: 108, cashValue: 3200 },
    ],
    tradeoffs: [
      { dimension: 'booking_simplicity', sentiment: 'pro', label: 'Fewest booking steps', weight: 8 },
      { dimension: 'schedule_flexibility', sentiment: 'con', label: 'Less schedule flexibility', weight: 5 },
    ],
  },
]

function parseDate(value, referenceYear = new Date().getFullYear()) {
  const text = String(value || '')
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))

  const named = text.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i)
  if (!named) return null
  const month = MONTHS.findIndex((entry) => entry.toLowerCase().startsWith(named[1].slice(0, 3).toLowerCase()))
  if (month < 0) return null
  return new Date(Date.UTC(Number(named[3] || referenceYear), month, Number(named[2])))
}

function addDays(date, days) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function formatDate(date) {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatCurrency(value) {
  return `$${formatNumber(value)}`
}

export function calculatePointValue({ points, fees, cashValue }) {
  if (!points) return 0
  const netCashFareInCents = (cashValue - fees) * 100
  return netCashFareInCents / points
}

function candidateRoute(leg, config, legIndex) {
  const canonicalRoutes = [
    ['new york', 'tokyo'],
    ['tokyo', 'seoul'],
    ['seoul', 'new york'],
  ]
  const expected = canonicalRoutes[legIndex]
  const matchesDemoOutline = expected
    && String(leg.origin || '').trim().toLowerCase() === expected[0]
    && String(leg.destination || '').trim().toLowerCase() === expected[1]
  return matchesDemoOutline ? config.routes[legIndex] : `${leg.origin} → ${leg.destination}`
}

function requestedCabin(leg, fallback) {
  return leg.cabin && !/not specified/i.test(leg.cabin) ? leg.cabin : fallback
}

function buildLegDates(brief, referenceYear) {
  const legs = brief?.flightLegs || []
  const anchorIndex = legs.findIndex((leg) => parseDate(leg.timing, referenceYear))
  const anchorDate = anchorIndex >= 0
    ? parseDate(legs[anchorIndex].timing, referenceYear)
    : new Date(Date.UTC(referenceYear, 10, 12))
  const duration = Math.max(7, Number(brief?.tripDurationDays) || 14)
  const tripStart = addDays(anchorDate, anchorIndex === 0 ? -2 : -Math.max(1, anchorIndex * 3))
  const finalOffset = Math.max(duration, legs.length * 3)

  return legs.map((leg, index) => {
    const explicit = parseDate(leg.timing, referenceYear)
    if (explicit) {
      return /arrive_by/i.test(leg.timingKind || '') || /arrive\s+by/i.test(leg.timing || '')
        ? addDays(explicit, -2)
        : explicit
    }
    if (index === legs.length - 1) return addDays(tripStart, finalOffset)
    return addDays(tripStart, Math.round((finalOffset * index) / Math.max(1, legs.length - 1)))
  })
}

function aggregateEconomics(segments) {
  const totals = segments.reduce((total, segment) => ({
    points: total.points + segment.economics.points,
    fees: total.fees + segment.economics.fees,
    cashValue: total.cashValue + segment.economics.cashValue,
  }), { points: 0, fees: 0, cashValue: 0 })
  return { ...totals, pointValue: calculatePointValue(totals) }
}

export function candidateMeetsHardRequirements(candidate, brief, referenceYear = new Date().getFullYear()) {
  const plannedLegs = brief?.flightLegs || []
  if (candidate.segments.length !== plannedLegs.length) return false
  if (!plannedLegs.every((leg) => candidate.segments.some((segment) => segment.plannedLegId === leg.legId))) return false

  return plannedLegs.every((leg) => {
    if (!/arrive_by/i.test(leg.timingKind || '') && !/arrive\s+by/i.test(leg.timing || '')) return true
    const deadline = parseDate(leg.timing, referenceYear)
    const segment = candidate.segments.find((entry) => entry.plannedLegId === leg.legId)
    return deadline && segment?.arrivalDate && segment.arrivalDate <= deadline
  })
}

function uniqueTradeoffs(tradeoffs) {
  const dimensions = new Set()
  return tradeoffs.filter((tradeoff) => {
    if (tradeoff.kind === 'requirement' || dimensions.has(tradeoff.dimension)) return false
    dimensions.add(tradeoff.dimension)
    return true
  })
}

export function arbitrateCandidateRecommendations(candidates) {
  if (!candidates.length) return []
  const pointValues = candidates.map((candidate) => candidate.economics.pointValue)
  const fees = candidates.map((candidate) => candidate.economics.fees)
  const highestPointValue = Math.max(...pointValues)
  const lowestPointValue = Math.min(...pointValues)
  const highestFees = Math.max(...fees)
  const lowestFees = Math.min(...fees)

  return candidates.map((candidate) => {
    const derived = []
    if (candidate.segments.some((segment) => /premium economy/i.test(segment.cabin))) {
      derived.push({ dimension: 'premium_economy', sentiment: 'pro', label: 'Premium Economy on the long-haul outbound', weight: 10 })
    }
    if (candidate.economics.pointValue === highestPointValue) {
      derived.push({ dimension: 'point_value', sentiment: 'pro', label: 'Highest modeled point value', weight: 14 })
    } else if (candidate.economics.pointValue === lowestPointValue) {
      derived.push({ dimension: 'point_value', sentiment: 'con', label: 'Lowest modeled point value', weight: 8 })
    }
    if (candidate.economics.fees === lowestFees) {
      derived.push({ dimension: 'fees', sentiment: 'pro', label: 'Lowest modeled fees', weight: 6 })
    } else if (candidate.economics.fees === highestFees) {
      derived.push({ dimension: 'fees', sentiment: 'con', label: 'Highest modeled fees', weight: 8 })
    }

    const tradeoffs = uniqueTradeoffs([...candidate.tradeoffs, ...derived])
    const arbitrationScore = tradeoffs.reduce(
      (score, tradeoff) => score + (tradeoff.sentiment === 'pro' ? tradeoff.weight : -tradeoff.weight),
      0,
    )
    return {
      ...candidate,
      arbitrationScore,
      score: Math.max(0, Math.min(100, Math.round(82 + arbitrationScore))),
      pros: tradeoffs.filter((tradeoff) => tradeoff.sentiment === 'pro').map((tradeoff) => tradeoff.label),
      cons: tradeoffs.filter((tradeoff) => tradeoff.sentiment === 'con').map((tradeoff) => tradeoff.label),
    }
  }).sort((left, right) => right.arbitrationScore - left.arbitrationScore || right.economics.pointValue - left.economics.pointValue)
}

export function buildDemoRecommendations(brief, { referenceYear = new Date().getFullYear() } = {}) {
  const legs = brief?.flightLegs || []
  const dates = buildLegDates(brief, referenceYear)
  const eligibleCandidates = CANDIDATE_CONFIGS.map((config) => {
    const segments = legs.map((leg, legIndex) => {
      const departureDate = dates[legIndex]
      const arrivalDate = addDays(departureDate, config.arrivalDayOffsets[legIndex] || 0)
      const economics = config.segmentEconomics[legIndex] || { points: 0, fees: 0, cashValue: 0 }
      return {
        plannedLegId: leg.legId,
        route: candidateRoute(leg, config, legIndex),
        departure: `${formatDate(departureDate)} · ${config.departureTimes[legIndex] || config.departureTimes.at(-1)}`,
        arrival: `${formatDate(arrivalDate)} · ${config.arrivalTimes[legIndex] || config.arrivalTimes.at(-1)}`,
        arrivalDate,
        cabin: requestedCabin(leg, config.defaultCabins[legIndex] || 'Economy'),
        detail: config.carriers[legIndex] || 'Partner award candidate',
        plannedRoute: leg.route,
        economics: {
          ...economics,
          pointValue: calculatePointValue(economics),
        },
      }
    })
    const economics = aggregateEconomics(segments)
    return {
      ...config,
      segments,
      economics,
      points: `${formatNumber(economics.points)} pts`,
      fees: `${formatCurrency(economics.fees)} fees`,
      value: `${economics.pointValue.toFixed(1)}¢ / point`,
    }
  }).filter((candidate) => candidateMeetsHardRequirements(candidate, brief, referenceYear))

  return arbitrateCandidateRecommendations(eligibleCandidates)
}

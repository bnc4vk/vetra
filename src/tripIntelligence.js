const CONTRACT_VERSION = 'itinerary-intent/v1'
const ADJUSTMENT_VERSION = 'itinerary-adjustment/v1'

const BROAD_LOCATIONS = new Set([
  'africa', 'asia', 'australia', 'brazil', 'canada', 'caribbean', 'china', 'europe',
  'france', 'germany', 'greece', 'hawaii', 'india', 'indonesia', 'italy', 'japan',
  'mexico', 'middle east', 'new zealand', 'portugal', 'south america', 'south korea',
  'spain', 'thailand', 'united kingdom', 'uk', 'vietnam',
])

function ensureTripIntent(payload) {
  const valid = payload
    && payload.contractVersion === CONTRACT_VERSION
    && Array.isArray(payload.flightLegs)
    && payload.flightLegs.length > 0
    && payload.flightLegs.every((leg) => leg.origin && leg.destination && leg.timing?.label)

  if (!valid) throw new Error('GPT returned an invalid itinerary intent.')
  return payload
}

function ensureAdjustment(payload) {
  const valid = payload
    && payload.contractVersion === ADJUSTMENT_VERSION
    && Number.isInteger(payload.baseRevision)
    && Array.isArray(payload.operations)
    && payload.operations.length > 0
    && payload.operations.every((operation) => operation.operationId && operation.type)
  if (!valid) throw new Error('GPT returned an invalid itinerary adjustment.')
  return payload
}

const apiBase = () => (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export async function interpretTrip(rawBrief, { signal } = {}) {
  const response = await fetch(`${apiBase()}/api/parse-trip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief: rawBrief }),
    signal,
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'GPT trip interpretation failed.')
  return ensureTripIntent(payload)
}

export async function interpretItineraryAdjustment(request, brief, { signal } = {}) {
  const itinerary = {
    revision: brief.revision,
    appliedOperationIds: brief.appliedOperationIds || [],
    flightLegs: brief.flightLegs.map((leg) => ({
      legId: leg.legId,
      origin: leg.origin,
      originKind: leg.originKind,
      destination: leg.destination,
      destinationKind: leg.destinationKind,
      timing: { label: leg.timing, kind: leg.timingKind, evidence: leg.timingEvidence },
      cabin: { label: leg.cabin, evidence: leg.cabinEvidence },
      detail: leg.detail,
      status: leg.status,
      statusLabel: leg.statusLabel,
    })),
  }
  const response = await fetch(`${apiBase()}/api/adjust-trip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request, itinerary }),
    signal,
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error || 'GPT itinerary adjustment failed.')
  return ensureAdjustment(payload)
}

const slug = (value) => String(value || 'place').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

function isBroadLocation(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return !normalized || BROAD_LOCATIONS.has(normalized) || /\b(region|area|coast|islands?)\b/.test(normalized)
}

export function isPlausibleCityAnswer(answer, scope = '') {
  const normalized = String(answer || '').trim()
  return normalized.length >= 2
    && normalized.toLowerCase() !== String(scope).trim().toLowerCase()
    && !isBroadLocation(normalized)
}

function legFromIntent(leg, index, idPrefix = 'leg') {
  const originKind = leg.originKind || (isBroadLocation(leg.origin) ? 'broad_location' : 'city')
  const destinationKind = leg.destinationKind || (isBroadLocation(leg.destination) ? 'broad_location' : 'city')
  const pending = leg.status === 'needed' || originKind === 'broad_location' || destinationKind === 'broad_location'
  return {
    legId: leg.legId || `${idPrefix}-${index + 1}-${slug(leg.origin)}-${slug(leg.destination)}`,
    route: `${leg.origin} → ${leg.destination}`,
    origin: leg.origin,
    originKind,
    destination: leg.destination,
    destinationKind,
    timing: leg.timing?.label || leg.timing || 'Timing Not Specified',
    timingKind: leg.timing?.kind || leg.timingKind || 'missing',
    timingEvidence: leg.timing?.evidence || leg.timingEvidence || 'missing',
    cabin: leg.cabin?.label || leg.cabin || 'Not Specified',
    cabinEvidence: leg.cabin?.evidence || leg.cabinEvidence || 'missing',
    detail: leg.detail || 'Flight leg',
    status: pending ? 'needed' : (leg.status || 'captured'),
    statusLabel: pending ? 'City Needed' : (leg.statusLabel || 'Captured'),
    pending,
    resolved: false,
  }
}

export function toUiTripBrief(intent, rawBrief) {
  const flightLegs = [...intent.flightLegs]
    .sort((left, right) => left.sequence - right.sequence)
    .map((leg, index) => legFromIntent(leg, index))

  return {
    raw: rawBrief,
    revision: 0,
    appliedOperationIds: [],
    assistantMessage: intent.assistantMessage,
    cities: intent.routeCities,
    route: intent.routeCities.join(' → '),
    travelers: intent.travelers === 'Not Specified' ? 'Travelers Not Specified' : intent.travelers,
    flexibility: intent.flexibility,
    tripDurationDays: intent.tripDurationDays,
    tripSummary: intent.tripDurationDays ? `${intent.tripDurationDays}-Day Trip` : intent.flexibility,
    flightLegs,
    followUpQuestions: [...intent.followUpQuestions].sort((left, right) => left.priority - right.priority),
    source: {
      kind: 'gpt',
      model: intent.meta?.resolvedModel || intent.meta?.requestedModel || 'gpt-5.4',
      contractVersion: intent.contractVersion,
    },
  }
}

function replaceScopedLocation(value, scope, answer) {
  if (!scope || !value) return value
  return value.toLowerCase() === scope.toLowerCase() ? answer : value
}

export function normalizeCityName(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!normalized) return normalized
  if (/^[A-Z]{2,4}$/.test(normalized)) return normalized
  if (/[A-Z]/.test(normalized) && /[a-z]/.test(normalized)) return normalized
  return normalized
    .toLocaleLowerCase()
    .replace(/(^|[\s'’-])([a-z])/g, (_, separator, letter) => `${separator}${letter.toUpperCase()}`)
}

function refreshBrief(brief, flightLegs, extras = {}) {
  const normalizedLegs = flightLegs.map((leg) => ({ ...leg, route: `${leg.origin} → ${leg.destination}` }))
  const cities = normalizedLegs.length
    ? [normalizedLegs[0].origin, ...normalizedLegs.map((leg) => leg.destination)]
    : []
  return { ...brief, ...extras, cities, route: cities.join(' → '), flightLegs: normalizedLegs }
}

export function applyFollowUpToBrief(brief, followUp, answer) {
  const normalizedAnswer = /destination|city|airport|location/i.test(followUp?.key || followUp?.field || '')
    ? normalizeCityName(answer)
    : answer.trim()
  const field = followUp?.key || followUp?.field || ''
  const scope = followUp?.scope || ''

  const flightLegs = brief.flightLegs.map((leg, index, legs) => {
    let updated = { ...leg }
    if (/destination|city|airport|location/i.test(field)) {
      const origin = replaceScopedLocation(leg.origin, scope, normalizedAnswer)
      const destination = replaceScopedLocation(leg.destination, scope, normalizedAnswer)
      if (origin !== leg.origin || destination !== leg.destination) {
        const originKind = origin !== leg.origin ? 'city' : leg.originKind
        const destinationKind = destination !== leg.destination ? 'city' : leg.destinationKind
        const stillPending = originKind === 'broad_location' || destinationKind === 'broad_location'
        updated = {
          ...updated,
          origin,
          originKind,
          destination,
          destinationKind,
          pending: stillPending,
          resolved: !stillPending,
          status: stillPending ? 'needed' : 'captured',
          statusLabel: stillPending ? 'City Needed' : 'City Set',
        }
      }
    } else if (/return/i.test(field) && index === legs.length - 1) {
      updated = { ...updated, timing: normalizedAnswer, timingKind: 'fixed_date', pending: false, resolved: true, status: 'captured', statusLabel: 'Return Set' }
    } else if (/date|timing/i.test(field) && (leg.pending || index === 0)) {
      updated = { ...updated, timing: normalizedAnswer, timingKind: 'fixed_date', pending: false, resolved: true, status: 'captured', statusLabel: 'Timing Set' }
    }
    return updated
  })

  return refreshBrief(brief, flightLegs, {
    travelers: /traveler/i.test(field) ? normalizedAnswer : brief.travelers,
    revision: brief.revision + 1,
    followUpQuestions: brief.followUpQuestions.filter((question) => question !== followUp && !(
      question.field === (followUp?.field || followUp?.key) && question.scope === followUp?.scope
    )),
  })
}

function updatedLeg(leg, field, value, valueKind) {
  const next = { ...leg, resolved: false, status: 'captured', statusLabel: 'Captured' }
  if (field === 'origin' || field === 'destination') {
    next[field] = valueKind === 'city' ? normalizeCityName(value) : value
    next[`${field}Kind`] = valueKind
  }
  if (field === 'timing') {
    next.timing = value
    next.timingKind = 'fixed_date'
    next.timingEvidence = 'explicit'
  }
  if (field === 'cabin') {
    next.cabin = value
    next.cabinEvidence = 'explicit'
  }
  next.pending = next.originKind === 'broad_location' || next.destinationKind === 'broad_location'
  if (next.pending) {
    next.status = 'needed'
    next.statusLabel = 'City Needed'
  }
  return { ...next, route: `${next.origin} → ${next.destination}` }
}

export function applyItineraryOperations(brief, adjustment) {
  if (adjustment.baseRevision !== brief.revision) throw new Error('This itinerary changed while the request was processing. Please try again.')
  const responseIds = adjustment.operations.map((operation) => operation.operationId)
  if (new Set(responseIds).size !== responseIds.length) throw new Error('The adjustment contained duplicate operations.')
  const appliedIds = new Set(brief.appliedOperationIds || [])
  if (responseIds.some((id) => appliedIds.has(id))) throw new Error('That adjustment was already applied. Please try the request again.')

  let legs = [...brief.flightLegs]
  const changedLegIds = new Set()
  for (const [operationIndex, operation] of adjustment.operations.entries()) {
    const targets = new Set(operation.targetLegIds || [])
    if (targets.size !== (operation.targetLegIds || []).length) throw new Error('The adjustment repeated a target flight leg.')
    const currentIds = new Set(legs.map((leg) => leg.legId))
    if (currentIds.size !== legs.length) throw new Error('The itinerary contains duplicate flight leg identifiers.')
    const missingTargets = [...targets].filter((id) => !currentIds.has(id))
    if (missingTargets.length) throw new Error('A requested flight leg no longer exists.')

    if (operation.type === 'update') {
      const expectedKind = operation.field === 'origin' || operation.field === 'destination' ? ['city', 'broad_location'] : [operation.field]
      if (!operation.field || !operation.value || targets.size !== 1 || !expectedKind.includes(operation.valueKind)) throw new Error('The requested cell edit was incomplete.')
      legs = legs.map((leg) => {
        if (!targets.has(leg.legId)) return leg
        changedLegIds.add(leg.legId)
        return updatedLeg(leg, operation.field, operation.value, operation.valueKind)
      })
    } else if (operation.type === 'remove') {
      if (!targets.size || operation.legs.length || operation.anchorLegId || operation.position || operation.field || operation.value || operation.valueKind) throw new Error('The requested removal was incomplete.')
      legs = legs.filter((leg) => !targets.has(leg.legId))
    } else if (operation.type === 'insert') {
      const anchorIndex = legs.findIndex((leg) => leg.legId === operation.anchorLegId)
      if (targets.size || anchorIndex < 0 || !['before', 'after'].includes(operation.position) || !operation.legs.length || operation.field || operation.value || operation.valueKind) throw new Error('The insertion point was incomplete.')
      const additions = operation.legs.map((leg, index) => legFromIntent(leg, index, `r${brief.revision + 1}-o${operationIndex + 1}`))
      additions.forEach((leg) => changedLegIds.add(leg.legId))
      const insertAt = anchorIndex + (operation.position === 'after' ? 1 : 0)
      legs.splice(insertAt, 0, ...additions)
    } else if (operation.type === 'replace') {
      const targetIndexes = legs.map((leg, index) => targets.has(leg.legId) ? index : -1).filter((index) => index >= 0)
      const contiguous = targetIndexes.every((value, index) => index === 0 || value === targetIndexes[index - 1] + 1)
      if (!targetIndexes.length || !contiguous || !operation.legs.length || operation.anchorLegId || operation.position || operation.field || operation.value || operation.valueKind) throw new Error('The replacement point was incomplete.')
      const firstIndex = Math.min(...targetIndexes)
      const replacements = operation.legs.map((leg, index) => legFromIntent(leg, index, `r${brief.revision + 1}-o${operationIndex + 1}`))
      replacements.forEach((leg) => changedLegIds.add(leg.legId))
      legs = legs.filter((leg) => !targets.has(leg.legId))
      legs.splice(firstIndex, 0, ...replacements)
    }
    if (new Set(legs.map((leg) => leg.legId)).size !== legs.length) throw new Error('The adjustment created duplicate flight leg identifiers.')
  }

  if (!legs.length) throw new Error('An itinerary needs at least one flight leg.')
  return {
    brief: refreshBrief(brief, legs, {
      revision: brief.revision + 1,
      appliedOperationIds: [...appliedIds, ...responseIds],
    }),
    changedLegIds: [...changedLegIds],
  }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

function parseComparableDate(value) {
  const text = String(value || '').toLowerCase()
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
  const named = text.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/)
  if (named) {
    const monthIndex = MONTHS.findIndex((month) => month.startsWith(named[1].slice(0, 3)))
    if (monthIndex >= 0) return { year: named[3] ? Number(named[3]) : null, month: monthIndex + 1, day: Number(named[2]) }
  }
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (!numeric) return null
  const rawYear = numeric[3] ? Number(numeric[3]) : null
  return { year: rawYear !== null && rawYear < 100 ? 2000 + rawYear : rawYear, month: Number(numeric[1]), day: Number(numeric[2]) }
}

function isDateBefore(left, right) {
  if (!left || !right) return false
  if (left.year !== null && right.year !== null) {
    return Date.UTC(right.year, right.month - 1, right.day) < Date.UTC(left.year, left.month - 1, left.day)
  }
  const leftOrdinal = (left.month - 1) * 31 + left.day
  const rightOrdinal = (right.month - 1) * 31 + right.day
  return rightOrdinal < leftOrdinal && leftOrdinal - rightOrdinal < 180
}

export function validateItinerary(legs) {
  const issues = []
  const priorDatedLegs = []
  const duplicateIds = new Set()
  const seenIds = new Set()
  legs.forEach((leg) => {
    if (seenIds.has(leg.legId)) duplicateIds.add(leg.legId)
    seenIds.add(leg.legId)
  })
  legs.forEach((leg, index) => {
    if (duplicateIds.has(leg.legId)) {
      issues.push({ id: `duplicate-${leg.legId}-${index}`, type: 'identity', legIds: [leg.legId], message: 'Two flight legs share the same identifier.' })
    }
    const unresolvedOrigin = leg.originKind === 'broad_location' || (!leg.originKind && isBroadLocation(leg.origin))
    const unresolvedDestination = leg.destinationKind === 'broad_location' || (!leg.destinationKind && isBroadLocation(leg.destination))
    if (unresolvedOrigin || unresolvedDestination || leg.pending) {
      issues.push({ id: `city-${leg.legId}`, type: 'city', legIds: [leg.legId], message: `Choose a city for ${unresolvedOrigin ? leg.origin : leg.destination} on flight leg ${index + 1}.` })
    }
    const currentDate = parseComparableDate(leg.timing)
    if (currentDate) {
      const conflictingPrior = [...priorDatedLegs].reverse().find((prior) => isDateBefore(prior.date, currentDate))
      if (conflictingPrior) {
        issues.push({
          id: `time-${conflictingPrior.leg.legId}-${leg.legId}`,
          type: 'timing',
          legIds: [conflictingPrior.leg.legId, leg.legId],
          message: `Flight leg ${index + 1} is dated before flight leg ${conflictingPrior.index + 1}.`,
        })
      }
      priorDatedLegs.push({ leg, index, date: currentDate })
    }
  })
  return issues
}

import { z } from 'zod'

export const TRIP_INTENT_VERSION = 'itinerary-intent/v1'
export const ITINERARY_ADJUSTMENT_VERSION = 'itinerary-adjustment/v1'
export const TRIP_INTERPRETATION_MODEL = 'gpt-5.4-2026-03-05'
export const TRIP_INTERPRETATION_MAX_OUTPUT_TOKENS = 1_200
export const ITINERARY_ADJUSTMENT_MAX_OUTPUT_TOKENS = 1_800

const Evidence = z.enum(['explicit', 'implied', 'missing'])
const PlaceKind = z.enum(['city', 'broad_location'])

const TimingIntent = z.object({
  label: z.string(),
  kind: z.enum(['depart_on', 'arrive_by', 'fixed_date', 'trip_window', 'missing']),
  evidence: Evidence,
})

const CabinIntent = z.object({
  label: z.string(),
  evidence: Evidence,
})

export const FlightLegIntent = z.object({
  sequence: z.number().int().positive(),
  origin: z.string(),
  originKind: PlaceKind,
  destination: z.string(),
  destinationKind: PlaceKind,
  timing: TimingIntent,
  cabin: CabinIntent,
  detail: z.string(),
  status: z.enum(['captured', 'suggested', 'needed']),
  statusLabel: z.string(),
})

export const FollowUpIntent = z.object({
  field: z.string(),
  scope: z.string(),
  priority: z.number().int().positive(),
  question: z.string(),
})

export const ParsedTripIntent = z.object({
  contractVersion: z.literal(TRIP_INTENT_VERSION),
  assistantMessage: z.string(),
  routeCities: z.array(z.string()),
  tripDurationDays: z.number().int().positive().nullable(),
  travelers: z.string(),
  flexibility: z.string(),
  flightLegs: z.array(FlightLegIntent),
  followUpQuestions: z.array(FollowUpIntent),
})

const NewFlightLegIntent = FlightLegIntent.omit({ sequence: true })

export const ItineraryOperation = z.object({
  operationId: z.string(),
  type: z.enum(['update', 'insert', 'remove', 'replace']),
  targetLegIds: z.array(z.string()),
  anchorLegId: z.string().nullable(),
  position: z.enum(['before', 'after']).nullable(),
  field: z.enum(['origin', 'destination', 'timing', 'cabin']).nullable(),
  value: z.string().nullable(),
  valueKind: z.enum(['city', 'broad_location', 'timing', 'cabin']).nullable(),
  legs: z.array(NewFlightLegIntent),
})

export const ParsedItineraryAdjustment = z.object({
  contractVersion: z.literal(ITINERARY_ADJUSTMENT_VERSION),
  baseRevision: z.number().int().nonnegative(),
  assistantMessage: z.string(),
  changeSummary: z.string(),
  operations: z.array(ItineraryOperation).min(1),
})

export function normalizeParsedTripIntent(intent) {
  const flightLegs = [...intent.flightLegs]
    .sort((left, right) => left.sequence - right.sequence)
    .map((leg, index) => ({ ...leg, sequence: index + 1 }))
  const routeCities = flightLegs.length
    ? [flightLegs[0].origin, ...flightLegs.map((leg) => leg.destination)]
    : []
  return { ...intent, routeCities, flightLegs }
}

export function normalizeParsedItineraryAdjustment(adjustment) {
  return {
    ...adjustment,
    operations: adjustment.operations.map((operation, index) => ({
      ...operation,
      operationId: operation.operationId || `operation-${index + 1}`,
    })),
  }
}

export const TRIP_INTERPRETATION_PROMPT = `
You are Vetra's itinerary interpretation layer. Convert a natural-language flight request into
the exact itinerary-intent/v1 JSON contract. This step structures intent only: do not search
fares, plan activities, invent preferences, or claim availability.

Build the route semantically, not in the order locations happen to appear in the sentence:
- A stated home, residence, or "I live in" location is the trip origin.
- When a bounded trip duration is given and the user does not say one-way, returning home is
  directly implied. Include that return flight as the last leg.
- A requirement to be in a place on a date applies to the inbound leg for that place. Preserve
  whether it is an arrival requirement; do not turn it into a departure date.
- A desire to explore another country or city creates the next stop after the required stop.
- If only a country is named, keep the country as the destination. Never invent a city, airport,
  year, departure date, return date, cabin preference, or traveler count.
- Create one flightLeg for every air transfer in logical travel order, with sequence values 1..n.
- Cabin must be "Not Specified" with evidence "missing" unless the user names a cabin.
- Use timing kind "trip_window" for a stated trip duration without an exact leg date. Use a
  concise label such as "Within Two-Week Trip". Use "Return Date Needed" only when a more
  exact return date is genuinely required.
- detail and statusLabel must tersely explain the most important explicit, implied, or missing
  fact for that leg. status="needed" means a user decision is required; status="suggested"
  means the leg is logically implied; status="captured" means the material facts are explicit.
- A leg whose destination is only a country must use status="needed" and a concise statusLabel
  such as "Destination Needed", because a specific flight destination is still unresolved.
- Every flight endpoint must ultimately be a city. A country, region, island group, or other broad
  area is not a city and remains an unresolved placeholder. Never silently choose a representative
  city for it.
- originKind and destinationKind must be "city" only for an actual city, airport, or metropolitan
  airport area. Use "broad_location" for every country, region, state/province, coast, island group,
  or other area that still requires the user to choose a flight city.
- followUpQuestions must contain one city question for every distinct unresolved broad location,
  ordered in route sequence. If both South Korea and Vietnam are unresolved, return two questions,
  not only the first. Keep each question natural and singular. field should identify a city or
  destination. scope must be the exact unresolved location label used in flightLegs (for example,
  the country name), not a leg number or generic phrase. Do not ask lower-value questions such as
  cabin or travelers while any route city remains unresolved.
- travelers must be "Not Specified" when absent. flexibility should summarize only stated
  flexibility, otherwise "Not Specified".

assistantMessage should be one calm sentence confirming the interpreted route. Never expose
internal reasoning. Set contractVersion exactly to "itinerary-intent/v1".
`.trim()

export const ITINERARY_ADJUSTMENT_PROMPT = `
You are Vetra's itinerary adjustment layer. You receive JSON with a current flight itinerary and
a natural-language adjustment request. Return the exact itinerary-adjustment/v1 JSON contract.
This step edits structured intent only: do not search fares, claim availability, or invent facts.

Rules:
- Return typed operations only. The client reducer applies them to the canonical itinerary.
- Every operation field is required by the schema. Use null or [] when a field does not apply.
- A user may reference a leg by its one-based number or by its route, and may edit origin,
  destination, timing, cabin, or the concise detail/status text for that leg.
- For a single-cell edit, use type="update", one targetLegId, field and value. Changing one leg's
  destination must not also change the next leg's origin unless the user explicitly requested both.
- valueKind is required for updates: use "city" or "broad_location" for origin/destination,
  "timing" for timing, and "cabin" for cabin. Use null when the operation is not an update.
- For a new independent leg, use type="insert", anchorLegId plus position, and legs with the new
  complete leg specification.
- When inserting a stop between two cities, use type="replace" on the one affected leg and provide
  the two replacement legs in travel order.
- To remove an exact flight leg, use type="remove" with its targetLegIds and no replacement legs.
  Remove only what was requested even if this leaves a route gap for the client to flag.
- To remove a stop and reconnect its neighbors, use type="replace" on the two adjacent legs and
  provide the single replacement leg. Do this only when the user's wording unambiguously removes
  the stop rather than only one flight leg.
- Preserve every unmentioned cell exactly. In particular, changing one leg's destination must not
  silently change the next leg's origin, and changing one leg's origin must not silently change the
  prior destination. Vetra leaves geographic gaps visible for the traveler to handle independently;
  do not auto-repair or invent connecting travel.
- Preserve whether timing is depart_on, arrive_by, fixed_date, trip_window, or missing. When the user
  supplies a new date or timing, choose the matching kind and use evidence="explicit".
- Preserve cabin values unless changed. For a new leg with no cabin, use "Not Specified" and
  evidence="missing".
- Every flight endpoint should be a city. If the user adds only a country, region, or broad area,
  keep that exact label, set its originKind or destinationKind to "broad_location", set
  status="needed", and use a statusLabel such as "City Needed". Never invent a city. Actual cities,
  airports, and metropolitan airport areas use kind="city".
- For explicitly changed or newly complete legs, use status="captured" and a terse statusLabel.
- assistantMessage and changeSummary must each be one short factual sentence. Do not expose reasoning.
- targetLegIds and anchorLegId must use the exact stable legId values from the input itinerary.
- operationId values must be unique within the response.
- Never reuse an operationId listed in itinerary.appliedOperationIds.
- baseRevision must exactly echo the revision supplied with the input itinerary.

Set contractVersion exactly to "itinerary-adjustment/v1".
`.trim()

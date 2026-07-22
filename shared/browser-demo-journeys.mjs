import {
  ITINERARY_ADJUSTMENT_VERSION,
  TRIP_INTENT_VERSION,
} from './trip-intelligence.mjs'

const timing = (label, kind = 'fixed_date', evidence = 'explicit') => ({ label, kind, evidence })
const cabin = (label = 'Not Specified', evidence = 'missing') => ({ label, evidence })

const leg = (sequence, origin, destination, timingValue, options = {}) => ({
  sequence,
  origin,
  originKind: options.originKind || 'city',
  destination,
  destinationKind: options.destinationKind || 'city',
  timing: timingValue,
  cabin: cabin(options.cabin, options.cabin ? 'explicit' : 'missing'),
  detail: options.detail || `${origin} to ${destination}`,
  status: options.status || 'captured',
  statusLabel: options.statusLabel || 'Captured',
})

const intent = ({ message, duration, flexibility, legs, followUps = [] }) => ({
  contractVersion: TRIP_INTENT_VERSION,
  assistantMessage: message,
  routeCities: [legs[0].origin, ...legs.map((entry) => entry.destination)],
  tripDurationDays: duration,
  travelers: '1 Traveler',
  flexibility,
  flightLegs: legs,
  followUpQuestions: followUps,
  meta: { poweredBy: 'Deterministic browser regression fixture' },
})

export const BROWSER_DEMO_JOURNEYS = [
  {
    id: 'tokyo-seoul',
    brief: 'I live in New York and need to be in Tokyo by November 12, 2026. I have two weeks and also want to explore South Korea before flying home.',
    followUps: [{ answer: 'Seoul', question: 'Which city in South Korea would you like to fly to?' }],
    adjustments: [],
    linkedPrograms: [],
    expectedRoute: 'New York → Tokyo → Seoul → New York',
    expectedGlobeMode: 'geographic',
    intent: intent({
      message: 'I mapped New York to Tokyo, South Korea, and home.',
      duration: 14,
      flexibility: 'Two-week trip',
      legs: [
        leg(1, 'New York', 'Tokyo', timing('Arrive By November 12, 2026', 'arrive_by')),
        leg(2, 'Tokyo', 'South Korea', timing('Within Two-Week Trip', 'trip_window', 'implied'), {
          destinationKind: 'broad_location', status: 'needed', statusLabel: 'City Needed',
        }),
        leg(3, 'South Korea', 'New York', timing('Within Two-Week Trip', 'trip_window', 'implied'), {
          originKind: 'broad_location', status: 'needed', statusLabel: 'City Needed',
        }),
      ],
      followUps: [{
        field: 'destination_city',
        scope: 'South Korea',
        priority: 1,
        question: 'Which city in South Korea would you like to fly to?',
      }],
    }),
  },
  {
    id: 'london-barcelona',
    brief: 'Plan a London to Paris to Barcelona trip, returning to London, from September 5 through September 17, 2026.',
    followUps: [],
    adjustments: ['Upgrade the London to Paris leg to business class.'],
    linkedPrograms: ['Amex'],
    expectedRoute: 'London → Paris → Barcelona → London',
    expectedGlobeMode: 'geographic',
    intent: intent({
      message: 'I mapped London through Paris and Barcelona, then home.',
      duration: 13,
      flexibility: 'Fixed September dates',
      legs: [
        leg(1, 'London', 'Paris', timing('September 5, 2026')),
        leg(2, 'Paris', 'Barcelona', timing('Within Trip Window', 'trip_window', 'implied')),
        leg(3, 'Barcelona', 'London', timing('September 17, 2026')),
      ],
    }),
  },
  {
    id: 'seattle-paris',
    brief: 'Fly Seattle to London on September 7, London to Paris on September 12, and Paris back to Seattle on September 20, 2026.',
    followUps: [],
    adjustments: ['Move the Paris to Seattle flight to September 22, 2026.'],
    linkedPrograms: ['Chase', 'Capital One'],
    expectedRoute: 'Seattle → London → Paris → Seattle',
    expectedGlobeMode: 'geographic',
    intent: intent({
      message: 'I mapped Seattle through London and Paris, then home.',
      duration: 16,
      flexibility: 'Fixed September dates',
      legs: [
        leg(1, 'Seattle', 'London', timing('September 7, 2026')),
        leg(2, 'London', 'Paris', timing('September 12, 2026')),
        leg(3, 'Paris', 'Seattle', timing('September 20, 2026')),
      ],
    }),
  },
  {
    id: 'sydney-santiago',
    brief: 'Plan Sydney to Los Angeles to Santiago and back to Sydney from October 3 through October 18, 2026.',
    followUps: [],
    adjustments: [
      'Add a stop in Honolulu between Los Angeles and Santiago.',
    ],
    linkedPrograms: ['British Airways'],
    expectedRoute: 'Sydney → Los Angeles → Honolulu → Santiago → Sydney',
    expectedGlobeMode: 'geographic',
    intent: intent({
      message: 'I mapped Sydney through Los Angeles and Santiago, then home.',
      duration: 16,
      flexibility: 'Fixed October dates',
      legs: [
        leg(1, 'Sydney', 'Los Angeles', timing('October 3, 2026')),
        leg(2, 'Los Angeles', 'Santiago', timing('Within Trip Window', 'trip_window', 'implied')),
        leg(3, 'Santiago', 'Sydney', timing('October 18, 2026')),
      ],
    }),
  },
  {
    id: 'ambient-fallback',
    brief: 'Fly Toronto to Reykjavik on November 2, continue to airport ZZZ on November 7, and return to Toronto on November 14, 2026.',
    followUps: [],
    adjustments: [],
    linkedPrograms: ['Citi'],
    expectedRoute: 'Toronto → Reykjavik → ZZZ → Toronto',
    expectedGlobeMode: 'ambient',
    intent: intent({
      message: 'I mapped Toronto through Reykjavik and ZZZ, then home.',
      duration: 13,
      flexibility: 'Fixed November dates',
      legs: [
        leg(1, 'Toronto', 'Reykjavik', timing('November 2, 2026')),
        leg(2, 'Reykjavik', 'ZZZ', timing('November 7, 2026')),
        leg(3, 'ZZZ', 'Toronto', timing('November 14, 2026')),
      ],
    }),
  },
]

export function findBrowserDemoJourney(brief) {
  return BROWSER_DEMO_JOURNEYS.find((journey) => journey.brief === brief) || null
}

const replacementLeg = (origin, destination, timingValue) => ({
  origin,
  originKind: 'city',
  destination,
  destinationKind: 'city',
  timing: timingValue,
  cabin: cabin(),
  detail: `${origin} to ${destination}`,
  status: 'captured',
  statusLabel: 'Captured',
})

export function buildBrowserDemoAdjustment(request, itinerary) {
  const normalized = String(request || '').trim().toLowerCase()
  const findLeg = (origin, destination) => itinerary.flightLegs.find((entry) => (
    entry.origin === origin && entry.destination === destination
  ))
  let operations

  if (normalized === 'upgrade the london to paris leg to business class.') {
    const target = findLeg('London', 'Paris')
    operations = [{
      operationId: `browser-cabin-${itinerary.revision}`,
      type: 'update', targetLegIds: [target?.legId], anchorLegId: null, position: null,
      field: 'cabin', value: 'Business Class', valueKind: 'cabin', legs: [],
    }]
  } else if (normalized === 'move the paris to seattle flight to september 22, 2026.') {
    const target = findLeg('Paris', 'Seattle')
    operations = [{
      operationId: `browser-date-${itinerary.revision}`,
      type: 'update', targetLegIds: [target?.legId], anchorLegId: null, position: null,
      field: 'timing', value: 'September 22, 2026', valueKind: 'timing', legs: [],
    }]
  } else if (normalized === 'add a stop in honolulu between los angeles and santiago.') {
    const target = findLeg('Los Angeles', 'Santiago')
    operations = [{
      operationId: `browser-add-honolulu-${itinerary.revision}`,
      type: 'replace', targetLegIds: [target?.legId], anchorLegId: null, position: null,
      field: null, value: null, valueKind: null,
      legs: [
        replacementLeg('Los Angeles', 'Honolulu', timing('Within Trip Window', 'trip_window', 'implied')),
        replacementLeg('Honolulu', 'Santiago', timing('Within Trip Window', 'trip_window', 'implied')),
      ],
    }]
  } else if (normalized === 'remove honolulu and reconnect los angeles to santiago.') {
    const inbound = findLeg('Los Angeles', 'Honolulu')
    const outbound = findLeg('Honolulu', 'Santiago')
    operations = [{
      operationId: `browser-remove-honolulu-${itinerary.revision}`,
      type: 'replace', targetLegIds: [inbound?.legId, outbound?.legId], anchorLegId: null, position: null,
      field: null, value: null, valueKind: null,
      legs: [replacementLeg('Los Angeles', 'Santiago', timing('Within Trip Window', 'trip_window', 'implied'))],
    }]
  } else {
    return null
  }

  if (operations.some((operation) => operation.targetLegIds.some((id) => !id))) return null
  return {
    contractVersion: ITINERARY_ADJUSTMENT_VERSION,
    baseRevision: itinerary.revision,
    assistantMessage: 'I applied that itinerary change.',
    changeSummary: 'The requested demo itinerary change was applied.',
    operations,
    meta: { poweredBy: 'Deterministic browser regression fixture' },
  }
}

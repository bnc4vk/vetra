import { MAJOR_AIRPORTS, resolveKnownLocation, resolveRouteLocations } from '../src/locationCatalog.js'

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

assert(MAJOR_AIRPORTS.length >= 1000, `Expected at least 1,000 major airports; found ${MAJOR_AIRPORTS.length}.`)
assert(new Set(MAJOR_AIRPORTS.map(([code]) => code)).size === MAJOR_AIRPORTS.length, 'Airport codes must be unique.')
assert(MAJOR_AIRPORTS.every(([, , , lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180), 'Airport coordinates must be valid.')

for (const code of ['SEA', 'LHR', 'CDG', 'BCN']) {
  assert(resolveKnownLocation(code)?.code === code, `${code} should resolve by IATA code.`)
}

const known = resolveRouteLocations(['Seattle', 'London', 'Paris', 'Barcelona', 'Seattle'])
assert(known.mode === 'geographic', 'The Seattle–London–Paris–Barcelona route should resolve geographically.')
assert(known.locations.every(Boolean), 'Every known route location should resolve.')
assert(known.locations[0].lat === known.locations.at(-1).lat && known.locations[0].lon === known.locations.at(-1).lon, 'Repeated cities must resolve to identical coordinates.')

const unresolved = resolveRouteLocations(['Seattle', 'London', 'Atlantis', 'Seattle'])
assert(unresolved.mode === 'ambient', 'One unresolved city should switch the entire route to ambient mode.')
assert(unresolved.unresolvedCities.join(',') === 'Atlantis', 'The unresolved city should be reported deterministically.')

console.log(`Globe location smoke test passed with ${MAJOR_AIRPORTS.length} major airport codes and fail-closed ambient fallback.`)

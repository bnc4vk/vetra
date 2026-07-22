import { MAJOR_AIRPORTS } from './data/majorAirports.js'

const CURATED_CITIES = {
  'new york': { lat: 40.7128, lon: -74.006, code: 'NYC' },
  tokyo: { lat: 35.6762, lon: 139.6503, code: 'TYO' },
  seoul: { lat: 37.5665, lon: 126.978, code: 'SEL' },
  kyoto: { lat: 35.0116, lon: 135.7681, code: 'KYO' },
  honolulu: { lat: 21.3099, lon: -157.8581, code: 'HNL' },
  seattle: { lat: 47.6062, lon: -122.3321, code: 'SEA' },
  'san francisco': { lat: 37.7749, lon: -122.4194, code: 'SFO' },
  'los angeles': { lat: 34.0522, lon: -118.2437, code: 'LAX' },
  chicago: { lat: 41.8781, lon: -87.6298, code: 'CHI' },
  toronto: { lat: 43.6532, lon: -79.3832, code: 'YYZ' },
  vancouver: { lat: 49.2827, lon: -123.1207, code: 'YVR' },
  london: { lat: 51.5072, lon: -0.1276, code: 'LON' },
  paris: { lat: 48.8566, lon: 2.3522, code: 'PAR' },
  barcelona: { lat: 41.3874, lon: 2.1686, code: 'BCN' },
  rome: { lat: 41.9028, lon: 12.4964, code: 'ROM' },
  madrid: { lat: 40.4168, lon: -3.7038, code: 'MAD' },
  reykjavik: { lat: 64.1466, lon: -21.9426, code: 'REK' },
  istanbul: { lat: 41.0082, lon: 28.9784, code: 'IST' },
  dubai: { lat: 25.2048, lon: 55.2708, code: 'DXB' },
  delhi: { lat: 28.6139, lon: 77.209, code: 'DEL' },
  mumbai: { lat: 19.076, lon: 72.8777, code: 'BOM' },
  bangkok: { lat: 13.7563, lon: 100.5018, code: 'BKK' },
  singapore: { lat: 1.3521, lon: 103.8198, code: 'SIN' },
  sydney: { lat: -33.8688, lon: 151.2093, code: 'SYD' },
  melbourne: { lat: -37.8136, lon: 144.9631, code: 'MEL' },
  auckland: { lat: -36.8509, lon: 174.7645, code: 'AKL' },
  'cape town': { lat: -33.9249, lon: 18.4241, code: 'CPT' },
  johannesburg: { lat: -26.2041, lon: 28.0473, code: 'JNB' },
  nairobi: { lat: -1.2921, lon: 36.8219, code: 'NBO' },
  cairo: { lat: 30.0444, lon: 31.2357, code: 'CAI' },
  santiago: { lat: -33.4489, lon: -70.6693, code: 'SCL' },
  'buenos aires': { lat: -34.6037, lon: -58.3816, code: 'BUE' },
  'sao paulo': { lat: -23.5505, lon: -46.6333, code: 'SAO' },
  'mexico city': { lat: 19.4326, lon: -99.1332, code: 'MEX' },
}

const COUNTRY_ALIASES = {
  'united states': 'US', usa: 'US', us: 'US',
  'united kingdom': 'GB', uk: 'GB', england: 'GB',
  spain: 'ES', france: 'FR', canada: 'CA', japan: 'JP',
  australia: 'AU', india: 'IN', italy: 'IT', germany: 'DE',
}

export function normalizeLocationName(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const airportByCode = new Map()
const airportsByMunicipality = new Map()
const airportsByName = new Map()

for (const [code, municipality, country, lat, lon, name] of MAJOR_AIRPORTS) {
  const airport = { city: municipality, code, country, lat, lon, source: 'major-airport' }
  airportByCode.set(code, airport)
  const municipalityKey = normalizeLocationName(municipality)
  if (!airportsByMunicipality.has(municipalityKey)) airportsByMunicipality.set(municipalityKey, [])
  airportsByMunicipality.get(municipalityKey).push(airport)
  airportsByName.set(normalizeLocationName(name), airport)
}

function parseLocationLabel(label) {
  const normalized = normalizeLocationName(label)
  const [name, context = ''] = normalized.split(',').map((part) => part.trim())
  return { normalized, name, country: COUNTRY_ALIASES[context] || null }
}

function validCoordinates(location) {
  return Number.isFinite(location?.lat)
    && Number.isFinite(location?.lon)
    && location.lat >= -90
    && location.lat <= 90
    && location.lon >= -180
    && location.lon <= 180
}

export function resolveKnownLocation(label) {
  const raw = String(label || '').trim()
  if (!raw) return null
  const code = raw.toUpperCase()
  const airport = /^[A-Z0-9]{3}$/.test(code) ? airportByCode.get(code) : null
  if (airport && validCoordinates(airport)) return { ...airport, city: raw }

  const parsed = parseLocationLabel(raw)
  const curated = CURATED_CITIES[parsed.name] || CURATED_CITIES[parsed.normalized]
  if (curated && validCoordinates(curated)) return { ...curated, city: raw, source: 'curated-city' }

  const namedAirport = airportsByName.get(parsed.name)
  if (namedAirport && (!parsed.country || namedAirport.country === parsed.country)) {
    return { ...namedAirport, city: raw }
  }

  const municipalAirports = (airportsByMunicipality.get(parsed.name) || [])
    .filter((candidate) => !parsed.country || candidate.country === parsed.country)
  const countries = new Set(municipalAirports.map((candidate) => candidate.country))
  if (municipalAirports.length && countries.size === 1) {
    return { ...municipalAirports[0], city: raw }
  }
  return null
}

export function resolveRouteLocations(routeCities) {
  const cache = new Map()
  const locations = routeCities.map((city) => {
    const key = normalizeLocationName(city)
    if (!cache.has(key)) cache.set(key, resolveKnownLocation(city))
    const resolved = cache.get(key)
    return resolved ? { ...resolved, city } : null
  })
  const unresolvedCities = [...new Set(routeCities.filter((_, index) => !locations[index]))]
  return {
    mode: unresolvedCities.length ? 'ambient' : 'geographic',
    locations,
    unresolvedCities,
  }
}

export { CURATED_CITIES, MAJOR_AIRPORTS }

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OUTPUT = path.join(ROOT, 'src', 'data', 'majorAirports.js')

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        value += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }
  return rows
}

async function loadSource() {
  const localSource = process.argv[2]
  if (localSource) return readFile(path.resolve(localSource), 'utf8')
  const response = await fetch(SOURCE_URL)
  if (!response.ok) throw new Error(`Airport source download failed with ${response.status}.`)
  return response.text()
}

const rows = parseCsv(await loadSource())
const headers = rows.shift()
const column = Object.fromEntries(headers.map((header, index) => [header, index]))
const airports = rows
  .filter((row) => (
    row[column.type] === 'large_airport'
    && row[column.scheduled_service] === 'yes'
    && /^[A-Z0-9]{3}$/.test(row[column.iata_code])
  ))
  .map((row) => [
    row[column.iata_code],
    row[column.municipality] || row[column.name],
    row[column.iso_country],
    Number(Number(row[column.latitude_deg]).toFixed(6)),
    Number(Number(row[column.longitude_deg]).toFixed(6)),
    row[column.name],
  ])
  .filter((airport) => Number.isFinite(airport[3]) && Number.isFinite(airport[4]))
  .sort((left, right) => left[0].localeCompare(right[0]))

if (airports.length < 1000) {
  throw new Error(`Expected at least 1,000 major airports; source yielded ${airports.length}.`)
}

const output = `// Generated from OurAirports public-domain data. Do not edit by hand.\n`
  + `// Includes every large airport with scheduled service and an IATA code (${airports.length} records).\n`
  + `export const MAJOR_AIRPORTS = ${JSON.stringify(airports, null, 2)}\n`

await mkdir(path.dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, output, 'utf8')
console.log(`Generated ${airports.length} major airports at ${path.relative(ROOT, OUTPUT)}.`)

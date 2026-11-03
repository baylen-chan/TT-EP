// The ONLY file that knows where data comes from. The rest of the site calls
// these three functions and never cares whether the data is mock or real:
//   getLatestReading()        -> newest reading, or null if there are none
//   getReadings(from, to)     -> readings between two Dates, oldest first
//   getWaterings(from, to)    -> watering events between two Dates, oldest first
//
// The server code is in server/ at the top of the project.
import { CONFIG } from '../config.js'
import { generateMockData } from './mock.js'

// Set USE_MOCK to true to go back to fake data (e.g. to preview alerts).
export const USE_MOCK = false
const API_BASE_URL = 'https://tt-ep.onrender.com' // the Node server on Render

// Preview different situations with mock data by changing these numbers:
//   days: 18 = healthy (CO₂ can dip on sunny afternoons), 24 = water warning,
//         27 = water critical, 30 = tank empty + dry soil
//   minutesSinceUpload: 30 = offline warning, 90 = offline critical
const MOCK = { days: 30, minutesSinceUpload: 0 }

export async function getLatestReading() {
  if (USE_MOCK) {
    await fakeNetworkDelay()
    return mockData().readings.at(-1) ?? null
  }
  const reading = await getJson('/api/readings/latest')
  if (reading) checkReadings([reading])
  return reading
}

export async function getReadings(from, to) {
  if (USE_MOCK) {
    await fakeNetworkDelay()
    return mockData().readings.filter(isBetween(from, to))
  }
  return checkReadings(await getJson('/api/readings' + rangeQuery(from, to)))
}

export async function getWaterings(from, to) {
  if (USE_MOCK) {
    await fakeNetworkDelay()
    return mockData().waterings.filter(isBetween(from, to))
  }
  return getJson('/api/waterings' + rangeQuery(from, to))
}

// ---------- Real backend ----------

async function getJson(path) {
  const response = await fetch(API_BASE_URL + path)
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`)
  return response.json()
}

// Dates are sent as UTC ISO strings, e.g. ?from=2026-11-01T00:00:00.000Z
const rangeQuery = (from, to) =>
  `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`

// Warns in the browser console if real data doesn't match the format agreed
// with the firmware team. Warns instead of crashing, so one bad field (like
// a dead sensor) doesn't take the whole page down.
const READING_FIELDS = ['soil_moisture', 'lux', 'co2_ppm', 'temp_c', 'humidity_pct', 'water_ml']

function checkReadings(readings) {
  if (!Array.isArray(readings)) {
    console.warn('Expected a list of readings, got:', readings)
    return []
  }
  const bad = readings.find((r) => findProblems(r).length > 0)
  if (bad) {
    const count = readings.filter((r) => findProblems(r).length > 0).length
    console.warn(
      `${count} of ${readings.length} readings don't match the agreed format.`,
      'Problems in the first one:', findProblems(bad), bad,
    )
  }
  return readings
}

function findProblems(reading) {
  const problems = []
  // Must be UTC ("Z" on the end) or have an offset, or times will be shifted.
  if (!/(Z|[+-]\d\d:\d\d)$/.test(reading.timestamp ?? '') || isNaN(Date.parse(reading.timestamp))) {
    problems.push('timestamp should be UTC ISO, like 2026-11-10T14:30:00Z')
  }
  for (const field of READING_FIELDS) {
    if (typeof reading[field] !== 'number') problems.push(`${field} is missing or not a number`)
  }
  return problems
}

// ---------- Mock ----------

// Regenerate the mock data once per reading interval, so the newest mock
// reading keeps moving forward like real data would.
let mockCache = null

function mockData() {
  const slot = Math.floor(Date.now() / (CONFIG.READING_INTERVAL_MIN * 60 * 1000))
  if (mockCache?.slot !== slot) {
    const end = new Date(Date.now() - MOCK.minutesSinceUpload * 60 * 1000)
    mockCache = { slot, ...generateMockData({ days: MOCK.days, end }) }
    checkReadings(mockCache.readings)
  }
  return mockCache
}

// A short pause so loading states get built and tested now, not on demo day.
const fakeNetworkDelay = () => new Promise((resolve) => setTimeout(resolve, 300))

const isBetween = (from, to) => (item) => {
  const time = new Date(item.timestamp)
  return time >= from && time <= to
}

// The ONLY file that talks to the server. The rest of the site calls these
// four functions:
//   getLatestReading()        -> newest reading, or null if there are none
//   getReadings(from, to)     -> readings between two Dates, oldest first
//   getWaterings(from, to)    -> watering events between two Dates, oldest first
//   connectLive({ ... })      -> new readings pushed the moment they arrive
//
// The server code is in server/ at the top of the project.

const API_BASE_URL = 'https://tt-ep.onrender.com' // the Node server on Render

export async function getLatestReading() {
  const reading = await getJson('/api/readings/latest')
  if (reading) checkReadings([reading])
  return reading
}

export async function getReadings(from, to) {
  return checkReadings(await getJson('/api/readings' + rangeQuery(from, to)))
}

export async function getWaterings(from, to) {
  return getJson('/api/waterings' + rangeQuery(from, to))
}

async function getJson(path) {
  const response = await fetch(API_BASE_URL + path)
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`)
  return response.json()
}

// Dates are sent as UTC ISO strings, e.g. ?from=2026-11-01T00:00:00.000Z
const rangeQuery = (from, to) =>
  `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`

// Opens a WebSocket to the server and keeps it open. The server pushes each
// new reading or watering the moment the ESP32 uploads it.
//
// If the connection drops (server restarted or redeployed, Wi-Fi blipped) it
// tries again every 5 s. Once it's back it calls onReconnect, so the page can
// reload and pick up anything sent while it was disconnected.
//
// Returns a function that closes the connection for good.
const RETRY_MS = 5000

export function connectLive({ onReading, onWatering, onReconnect }) {
  let socket
  let retryTimer
  let dropped = false // true after a disconnect, until it's connected again
  let stopped = false // true once the page has closed it on purpose

  function connect() {
    // https://... becomes wss://... (the encrypted WebSocket address)
    socket = new WebSocket(API_BASE_URL.replace(/^http/, 'ws') + '/live')

    socket.onopen = () => {
      if (dropped) onReconnect()
      dropped = false
    }

    socket.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data)
      if (type === 'reading') onReading(checkReadings([data])[0])
      if (type === 'watering') onWatering(data)
    }

    // Also fires when a connection attempt fails, so this is the retry loop.
    socket.onclose = () => {
      if (stopped) return
      dropped = true
      retryTimer = setTimeout(connect, RETRY_MS)
    }
  }

  connect()
  return () => {
    stopped = true
    clearTimeout(retryTimer)
    socket.close()
  }
}

// Warns in the browser console if data doesn't match the format agreed with
// the firmware team. Warns instead of crashing, so one bad field doesn't take
// the whole page down.
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
    // null is fine: it's how the server stores a sensor that didn't report.
    const value = reading[field]
    if (value !== null && typeof value !== 'number') problems.push(`${field} should be a number or null`)
  }
  return problems
}

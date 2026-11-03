// Checks what the ESP32 sends before it goes into the database.
// Each function returns { data } if it's fine, or { error } explaining
// what's wrong, which the server sends back with a 400 status.

const READING_FIELDS = ['soil_moisture', 'lux', 'co2_ppm', 'temp_c', 'humidity_pct', 'water_ml']
const WATERING_FIELDS = ['duration_s', 'water_ml']

export const validateReading = (body) => validate(body, READING_FIELDS)
export const validateWatering = (body) => validate(body, WATERING_FIELDS)

function validate(body, fields) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Send one JSON object with Content-Type: application/json' }
  }

  const timestamp = parseTimestamp(body.timestamp)
  if (timestamp === 'invalid') {
    return { error: 'timestamp should be UTC ISO, like 2026-11-10T14:30:00Z' }
  }

  const data = { timestamp }
  for (const field of fields) {
    const value = body[field]
    // A dead sensor can send null (or leave the field out). That's stored as
    // empty, and the website shows "No data" for it.
    if (value === undefined || value === null) {
      data[field] = null
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      data[field] = value
    } else {
      return { error: `${field} should be a number or null, got ${JSON.stringify(value)}` }
    }
  }
  return { data }
}

// No timestamp means the ESP32 couldn't get the time from the internet, so
// use the moment the server received it. Timestamps must end in Z or a
// +hh:mm offset, otherwise they'd be read in the wrong time zone.
function parseTimestamp(value) {
  if (value === undefined || value === null) return new Date()
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value)) return 'invalid'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

// For ?from=...&to=... on the GET routes. Returns null if either is missing
// or not a real date.
export function parseRange(query) {
  const from = new Date(query.from)
  const to = new Date(query.to)
  if (!query.from || !query.to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return null
  }
  return { from, to }
}

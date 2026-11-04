// Merges a reading or watering the server just pushed into the data already
// on screen, so the page doesn't have to download everything again.
// Plain JS, no React, so it's easy to test.
import { getRange } from './ranges.js'

// `data` is App's state: { latest, readings, waterings, from, to, range }.
// getRange is worked out again because "Last 24 hours" means up to now, so
// the window slides forward. (A single day keeps the same midnight to midnight.)
export function addReading(data, reading) {
  const { from, to } = getRange(data.range)
  return {
    ...data,
    from,
    to,
    // Only replace "latest" if this one is newer. The ESP32 might upload old
    // readings it saved while the Wi-Fi was down.
    latest: !data.latest || time(reading) > time(data.latest) ? reading : data.latest,
    readings: addToList(data.readings, reading, from, to),
  }
}

export function addWatering(data, watering) {
  const { from, to } = getRange(data.range)
  return { ...data, from, to, waterings: addToList(data.waterings, watering, from, to) }
}

// Adds the item, drops anything that's now outside the range, and keeps the
// list oldest first like the server sends it.
function addToList(list, item, from, to) {
  return [...list, item]
    .filter((x) => time(x) >= from && time(x) <= to)
    .sort((a, b) => time(a) - time(b))
}

const time = (x) => Date.parse(x.timestamp)

// Turns API readings into rows that the charts can draw.
// Plain JS, no React, so it's easy to test.
import { CONFIG } from '../config.js'
import { METRICS } from './metrics.js'

const STEP_MS = CONFIG.READING_INTERVAL_MIN * 60 * 1000

// Each row: { time (ms), soil_pct, water_ml, temp_c, ... }
export function buildChartRows(readings) {
  const rows = []

  for (const reading of readings) {
    const time = new Date(reading.timestamp).getTime()

    // If uploads stopped for a while, add an empty row so the line breaks
    // instead of drawing a straight line across time with no data.
    const previous = rows.at(-1)
    if (previous && time - previous.time > STEP_MS * 2.5) {
      rows.push({ time: previous.time + STEP_MS })
    }

    const row = { time }
    for (const metric of METRICS) row[metric.key] = metric.value(reading)
    rows.push(row)
  }

  return rows
}

// Y-axis labels on round numbers that cover the data, e.g. temperatures
// 19.3 to 23.1 get 18, 20, 22, 24. Returns { domain, ticks } for <YAxis>.
export function makeYAxis(values) {
  const numbers = values.filter((v) => typeof v === 'number')
  if (numbers.length === 0) return { domain: ['auto', 'auto'] } // sensor never reported
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)

  // Aim for about 4 gaps. Round the step up to 1, 2 or 5 times a power of
  // ten (0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50 ...).
  const roughStep = (max - min) / 4 || 1 // `|| 1` handles a flat line
  const powerOfTen = 10 ** Math.floor(Math.log10(roughStep))
  const step = [1, 2, 5, 10].map((m) => m * powerOfTen).find((s) => s >= roughStep)

  const ticks = []
  for (let i = Math.floor(min / step); i <= Math.ceil(max / step); i++) {
    ticks.push(Number((i * step).toFixed(6))) // toFixed avoids 0.30000000000000004
  }
  return { domain: [ticks[0], ticks.at(-1)], ticks }
}

// Where to put the labels under the chart: every day at midnight, or every
// 6 hours if the range is 2 days or less. Recharts hides labels that would
// overlap, so long ranges don't get crowded.
export function makeTimeTicks(from, to) {
  const hoursApart = to - from <= 2 * 24 * 60 * 60 * 1000 ? 6 : 24
  const ticks = []
  const tick = new Date(from)
  tick.setHours(0, 0, 0, 0) // local midnight on the first day

  while (tick <= to) {
    if (tick >= from) ticks.push(tick.getTime())
    tick.setHours(tick.getHours() + hoursApart)
  }
  return ticks
}

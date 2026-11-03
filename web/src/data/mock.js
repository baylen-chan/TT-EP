// Generates fake readings and watering events in the agreed format, so the
// page can be built before the hardware exists.
//
// Rather than pure random numbers, this simulates the TerraPod: soil dries
// faster in light and heat, the "firmware" waters it like the proposal
// describes (section 5.2), and the tank drains with each watering.
import { CONFIG } from '../config.js'

const STEP_MS = CONFIG.READING_INTERVAL_MIN * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Firmware behaviour we're imitating. The real values come from the
// firmware team; these only need to be roughly right for mock data.
const WATER_BELOW_PCT = 35 // firmware waters when soil drops below this
const BURST_SECONDS = 5
const ML_PER_SECOND = 30 // pump flow rate (measured with a cup later)
const MAX_PUMP_SECONDS_PER_DAY = 60 // safety cap so a bad sensor can't empty the tank

// Problems injected on purpose so every alert has something to fire on.
// day = days since the first reading, hours are local time.
const OFFLINE = { day: 12, fromHour: 1, toHour: 4 } // power bank shut off
const HEAT_WAVE = { day: 20, fromHour: 12, toHour: 16 } // chamber overheats

// Random numbers that come out the same on every page reload (a "seeded"
// generator). Math.random() would give different data each time, which
// makes bugs hard to reproduce.
function makeRandom(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

// Soil percentage -> raw sensor number, the reverse of what the website
// does with real data. Keeps the mock in the same format as the hardware.
const soilPctToRaw = (pct) =>
  CONFIG.SOIL_RAW_DRY + (pct / 100) * (CONFIG.SOIL_RAW_WET - CONFIG.SOIL_RAW_DRY)

// Returns { readings, waterings }, both sorted oldest first.
// Pass an `end` in the past (e.g. 90 minutes ago) to test the offline alert.
export function generateMockData({ days = 30, end = new Date(), seed = 42 } = {}) {
  const rand = makeRandom(seed)
  const noise = (size) => (rand() - 0.5) * 2 * size

  // Line the timestamps up on 10-minute marks, ending at `end`.
  const endMs = Math.floor(end.getTime() / STEP_MS) * STEP_MS
  const totalSteps = Math.round((days * DAY_MS) / STEP_MS)
  const startMs = endMs - (totalSteps - 1) * STEP_MS
  const firstMidnight = new Date(startMs).setHours(0, 0, 0, 0)

  const readings = []
  const waterings = []

  // The simulated state of the pod, carried from one step to the next.
  let soilPct = 70
  let waterMl = CONFIG.TANK_CAPACITY_ML
  let co2 = 450
  let humidity = 65
  let pumpSecondsToday = 0
  let currentDay = -1
  let sky = 1 // how sunny today is, 0.5 (cloudy) to 1 (clear)

  for (let i = 0; i < totalSteps; i++) {
    const date = new Date(startMs + i * STEP_MS)
    const day = Math.floor((date - firstMidnight) / DAY_MS)
    const hour = date.getHours() + date.getMinutes() / 60
    const during = (event) => day === event.day && hour >= event.fromHour && hour < event.toHour

    if (day !== currentDay) {
      currentDay = day
      pumpSecondsToday = 0
      sky = 0.5 + rand() * 0.5
    }

    // Device is off: nothing gets measured, watered or uploaded.
    if (during(OFFLINE)) continue

    // Light follows a sun curve from 7:00 to 18:00, zero at night.
    const sun = Math.max(0, Math.sin((Math.PI * (hour - 7)) / 11)) * sky
    const lux = sun > 0 ? Math.max(0, sun * 12000 + noise(300)) : 0

    let temp = 20 + 5 * sun + noise(0.3)
    if (during(HEAT_WAVE)) temp += 13

    // Soil dries slowly at night, faster in light and heat, and faster as
    // the plant grows over the month.
    const growth = 1 + day / 30
    soilPct -= (0.05 + 0.18 * sun * (temp / 25)) * growth

    // Sealed chamber: the plant uses up CO2 in light and releases it in the
    // dark; a small leak pulls it back toward outdoor air (~420 ppm).
    co2 += (sun > 0 ? -7 * sun : 3) + (420 - co2) * 0.03 + noise(3)

    // Humidity drops when it's warm and rises when the plant transpires.
    const humidityTarget = 72 - (temp - 20) * 2 + 8 * sun
    humidity += (humidityTarget - humidity) * 0.05 + noise(0.5)

    // Sensors are read before the pump runs, same order as the firmware.
    const soilReading = soilPct

    if (
      soilPct < WATER_BELOW_PCT &&
      waterMl > 0 &&
      pumpSecondsToday + BURST_SECONDS <= MAX_PUMP_SECONDS_PER_DAY
    ) {
      const ml = Math.min(BURST_SECONDS * ML_PER_SECOND, waterMl)
      waterMl -= ml
      pumpSecondsToday += BURST_SECONDS
      soilPct += ml / 15 // 150 mL raises soil moisture ~10%
      humidity += 3
      waterings.push({ timestamp: date.toISOString(), duration_s: BURST_SECONDS, water_ml: ml })
    }

    soilPct = clamp(soilPct, 0, 100)
    humidity = clamp(humidity, 30, 99)

    readings.push({
      timestamp: date.toISOString(),
      soil_moisture: Math.round(soilPctToRaw(clamp(soilReading, 0, 100)) + noise(6)),
      lux: Math.round(lux),
      co2_ppm: Math.round(co2),
      temp_c: Math.round(temp * 10) / 10,
      humidity_pct: Math.round(humidity),
      water_ml: Math.round(waterMl),
    })
  }

  return { readings, waterings }
}

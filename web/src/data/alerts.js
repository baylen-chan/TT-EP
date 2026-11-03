// Compares a reading with CONFIG.THRESHOLDS and returns a list of alerts,
// critical first. Plain JS with no React, so it's easy to test on its own.
//
// Each alert: { key, level: 'warning' | 'critical', title, message }
// `key` is the metric key (or 'offline'), so cards can colour themselves.
import { CONFIG } from '../config.js'
import { METRICS } from './metrics.js'
import { formatNumber, formatTimeAgo, isNumber, minutesSince } from './convert.js'

// What to tell the person reading the page, for each metric and direction.
const ADVICE = {
  soil_pct: {
    low: 'Soil is too dry. Check the pump, tubing and water tank.',
    high: 'Soil is waterlogged. The pump may be stuck on.',
  },
  water_ml: { low: 'Refill the tank through the refill riser.' },
  temp_c: {
    low: 'Chamber is too cold for the tomato plant.',
    high: 'Chamber is overheating. Move it out of direct sun.',
  },
  humidity_pct: {
    low: 'Air is very dry. Check the chamber seal.',
    high: 'Air is very humid. Risk of mould and condensation on the electronics.',
  },
  co2_ppm: {
    low: 'Plant is running out of CO₂. Open the chamber briefly to let fresh air in.',
    high: 'CO₂ is unusually high. Ventilate the chamber and check the sensor.',
  },
  minutes_since_reading: {
    high: 'The TerraPod has stopped uploading. Check the power bank and Wi-Fi.',
  },
}

// Returns { level, direction } if the value is outside its limits, else null.
// Critical limits are checked first, so the worst level wins.
function checkLimits(value, limits) {
  const { critLow, warnLow, warnHigh, critHigh } = limits
  if (critLow != null && value < critLow) return { level: 'critical', direction: 'low' }
  if (critHigh != null && value > critHigh) return { level: 'critical', direction: 'high' }
  if (warnLow != null && value < warnLow) return { level: 'warning', direction: 'low' }
  if (warnHigh != null && value > warnHigh) return { level: 'warning', direction: 'high' }
  return null
}

export function evaluateAlerts(reading, now = Date.now()) {
  if (!reading) return []
  const alerts = []

  // Is the device still uploading? Based on how old the newest reading is.
  const minutes = minutesSince(reading.timestamp, now)
  const stale = checkLimits(minutes, CONFIG.THRESHOLDS.minutes_since_reading)
  if (stale) {
    alerts.push({
      key: 'offline',
      level: stale.level,
      title: `Last reading was ${formatTimeAgo(reading.timestamp, now)}`,
      message: ADVICE.minutes_since_reading.high,
    })
  }

  for (const metric of METRICS) {
    const value = metric.value(reading)

    if (!isNumber(value)) {
      alerts.push({
        key: metric.key,
        level: 'warning',
        title: `${metric.label} sensor not reporting`,
        message: 'Check its wiring and the sensor header on the PCB.',
      })
      continue
    }

    const limits = CONFIG.THRESHOLDS[metric.key]
    if (!limits) continue // e.g. light: dark at night is normal

    const result = checkLimits(value, limits)
    if (!result) continue

    alerts.push({
      key: metric.key,
      level: result.level,
      title: `${metric.label} ${result.direction}: ${formatNumber(value, metric.digits)} ${metric.unit}`,
      message: ADVICE[metric.key]?.[result.direction] ?? '',
    })
  }

  // Critical first; otherwise keep the order above.
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
}

// Small helpers that turn raw data into what people read on the page.
// Shared by the cards, alerts and graphs so they always agree.
import { CONFIG } from '../config.js'

// Raw capacitive reading -> 0-100%. Clamped because sensor noise near fully
// dry or fully wet can land slightly outside the calibration range.
export function soilRawToPct(raw) {
  if (typeof raw !== 'number') return null
  const pct = ((raw - CONFIG.SOIL_RAW_DRY) / (CONFIG.SOIL_RAW_WET - CONFIG.SOIL_RAW_DRY)) * 100
  return Math.min(100, Math.max(0, pct))
}

// True for real numbers. Missing fields, null and strings like "24.1" are not.
export const isNumber = (value) => typeof value === 'number' && !Number.isNaN(value)

export const formatNumber = (value, digits) =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const minutesSince =(timestamp, now = Date.now()) => (now - new Date(timestamp)) / 60000

// Timestamps arrive in UTC; toLocaleString shows them in the viewer's time zone.
export const formatLocalTime = (timestamp) =>
  new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export function formatTimeAgo(timestamp, now = Date.now()) {
  const minutes = Math.floor(minutesSince(timestamp, now))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} days ago`
}

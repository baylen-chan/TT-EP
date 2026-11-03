// The time ranges people can pick in the "Show" dropdown, and how each one
// turns into a start and end time. Plain JS, no React, so it's easy to test.
import { CONFIG } from '../config.js'

const DAY_MS = 24 * 60 * 60 * 1000

// `value` is what the <select> stores. For a single day it's that day's
// local midnight in milliseconds, e.g. "1793001600000".
export const LAST_24_HOURS = { value: 'last24', label: 'Last 24 hours' }
export const LAST_7_DAYS = { value: 'last7', label: 'Last 7 days' }

// Today, yesterday, then one option per day going back.
export function makeDayOptions(now = new Date()) {
  const days = []
  for (let i = 0; i < CONFIG.PAST_DAYS_IN_DROPDOWN; i++) {
    // new Date(year, month, day) is local midnight. A day number of 0 or
    // below rolls back into the previous month, so this works across months.
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)

    let label = day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    if (i === 0) label = 'Today'
    if (i === 1) label = 'Yesterday'

    days.push({ value: String(day.getTime()), label })
  }
  return days
}

// Turns a dropdown value into { from, to } Dates.
export function getRange(value, now = new Date()) {
  if (value === LAST_24_HOURS.value) return { from: new Date(now - DAY_MS), to: now }
  if (value === LAST_7_DAYS.value) return { from: new Date(now - 7 * DAY_MS), to: now }

  // A single day: from its midnight to the next midnight.
  const from = new Date(Number(value))
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1)
  return { from, to }
}

import { LAST_24_HOURS, LAST_7_DAYS, makeDayOptions } from '../data/ranges.js'

// The "Show: [Last 24 hours ▾]" dropdown above the charts.
// `value` is the chosen option; `onChange` is called with the new one.
// `loading` shows "Loading…" next to it while the new range is fetched.
export default function RangeSelect({ value, onChange, loading }) {
  return (
    <p>
      <label>
        Show:{' '}
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value={LAST_24_HOURS.value}>{LAST_24_HOURS.label}</option>
          <option value={LAST_7_DAYS.value}>{LAST_7_DAYS.label}</option>

          {/* <optgroup> puts a grey "Single day" heading over these options */}
          <optgroup label="Single day">
            {makeDayOptions().map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {loading && <span className="muted"> Loading…</span>}
    </p>
  )
}

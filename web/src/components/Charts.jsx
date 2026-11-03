import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CONFIG } from '../config.js'
import { METRICS } from '../data/metrics.js'
import { buildChartRows, makeTimeTicks, makeYAxis } from '../data/chartData.js'
import { formatLocalTime, formatNumber, isNumber } from '../data/convert.js'

// Fixed y-axis ranges where there's a natural one, so a small change doesn't
// look huge (and an empty tank doesn't zoom the water chart in to 0-4 mL).
// The other charts fit their axis to the data with makeYAxis().
const FIXED_Y_AXES = {
  soil_pct: { domain: [0, 100], ticks: [0, 25, 50, 75, 100] },
  humidity_pct: { domain: [0, 100], ticks: [0, 25, 50, 75, 100] },
  water_ml: { domain: [0, CONFIG.TANK_CAPACITY_ML], ticks: [0, 2000, 4000, 6000] },
}

// One simple line chart per sensor, stacked down the page.
export default function Charts({ readings, from, to }) {
  if (readings.length === 0) {
    return <p>No readings in this time range.</p>
  }

  const rows = buildChartRows(readings)
  const ticks = makeTimeTicks(from, to)
  const showHours = to - from <= 2 * 24 * 60 * 60 * 1000

  // How the dates under each chart look, e.g. "Oct 30" or "6 PM".
  const formatXTick = (time) =>
    new Date(time).toLocaleString(undefined, showHours ? { hour: 'numeric' } : { month: 'short', day: 'numeric' })

  return (
    <div>
      {METRICS.map((metric) => {
        const limits = CONFIG.THRESHOLDS[metric.key] ?? {}
        const yAxis = FIXED_Y_AXES[metric.key] ?? makeYAxis(rows.map((row) => row[metric.key]))

        // Tooltip text for one point, e.g. "24.3 °C".
        const formatValue = (value) => [
          isNumber(value) ? `${formatNumber(value, metric.digits)} ${metric.unit}` : 'No data',
          metric.label,
        ]

        return (
          <div key={metric.key} className="chart card">
            <h3>
              {metric.label} <span className="muted">{metric.unit}</span>
            </h3>
            {/* Colours like var(--grid) come from index.css, so the charts
                follow light/dark mode along with the rest of the page. */}
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rows}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={[from.getTime(), to.getTime()]}
                  ticks={ticks}
                  tickFormatter={formatXTick}
                  stroke="var(--border)"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                />
                <YAxis
                  domain={yAxis.domain}
                  ticks={yAxis.ticks}
                  width={50}
                  stroke="var(--border)"
                  tick={{ fill: 'var(--muted)', fontSize: 12 }}
                />
                <Tooltip
                  labelFormatter={formatLocalTime}
                  formatter={formatValue}
                  contentStyle={{ background: 'var(--card)', borderColor: 'var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--muted)' }}
                  itemStyle={{ color: 'var(--text)' }}
                />

                {/* Dashed lines at the warning (orange) and critical (red) limits */}
                {[limits.warnLow, limits.warnHigh].map((y) => y != null && (
                  <ReferenceLine key={`warn-${y}`} y={y} stroke="var(--warning)" strokeDasharray="4 4" />
                ))}
                {[limits.critLow, limits.critHigh].map((y) => y != null && (
                  <ReferenceLine key={`crit-${y}`} y={y} stroke="var(--critical)" strokeDasharray="4 4" />
                ))}

                <Line dataKey={metric.key} stroke="var(--line)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      })}
    </div>
  )
}

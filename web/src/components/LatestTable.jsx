import { METRICS } from '../data/metrics.js'
import { formatNumber, isNumber } from '../data/convert.js'

// One table row per sensor: name, latest value, and OK / Warning / Critical.
export default function LatestTable({ reading, alerts }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Sensor</th>
          <th>Value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {METRICS.map((metric) => {
          const value = metric.value(reading)
          const alert = alerts.find((a) => a.key === metric.key)

          let status = 'OK'
          if (!isNumber(value)) status = 'No data'
          else if (alert) status = alert.level === 'critical' ? 'Critical' : 'Warning'

          return (
            <tr key={metric.key}>
              <td>{metric.label}</td>
              <td>{isNumber(value) ? `${formatNumber(value, metric.digits)} ${metric.unit}` : '—'}</td>
              <td className={alert ? alert.level : 'ok'}>{status}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

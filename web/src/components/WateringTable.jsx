import { formatLocalTime } from '../data/convert.js'

// Lists the most recent times the pump ran, newest first.
export default function WateringTable({ waterings }) {
  if (waterings.length === 0) {
    return <p>No waterings in this time range.</p>
  }

  // The API sends oldest first, so reverse a copy to show the newest at the top.
  const recent = [...waterings].reverse().slice(0, 10)

  return (
    <>
      <p>
        The pump ran {waterings.length === 1 ? 'once' : `${waterings.length} times`} in this range.
        {waterings.length > 10 && ' Showing the last 10.'}
      </p>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Water used</th>
            <th>Pump time</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((watering) => (
            <tr key={watering.timestamp}>
              <td>{formatLocalTime(watering.timestamp)}</td>
              <td>{watering.water_ml} mL</td>
              <td>{watering.duration_s} s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

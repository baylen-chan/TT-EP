import { formatLocalTime, isNumber } from '../data/convert.js'

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
              {/* Either can be null if the firmware doesn't send it */}
              <td>{isNumber(watering.water_ml) ? `${watering.water_ml} mL` : 'No data'}</td>
              <td>{isNumber(watering.duration_s) ? `${watering.duration_s} s` : 'No data'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

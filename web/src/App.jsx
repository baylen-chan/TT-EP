import { useEffect, useState } from 'react'
import { USE_MOCK, getLatestReading, getReadings, getWaterings } from './data/api.js'
import { formatLocalTime, formatTimeAgo } from './data/convert.js'
import { evaluateAlerts } from './data/alerts.js'
import { LAST_24_HOURS, getRange } from './data/ranges.js'
import AlertList from './components/AlertList.jsx'
import LatestTable from './components/LatestTable.jsx'
import RangeSelect from './components/RangeSelect.jsx'
import Charts from './components/Charts.jsx'
import WateringTable from './components/WateringTable.jsx'

function App() {
  const [range, setRange] = useState(LAST_24_HOURS.value) // what the dropdown shows
  const [data, setData] = useState(null) // { latest, readings, waterings, from, to, range }
  const [error, setError] = useState(null)

  // Loads everything the page needs at once. `ignore` stops a slow, outdated
  // request from overwriting newer data (and handles React running effects
  // twice in development). Runs again whenever the dropdown changes.
  useEffect(() => {
    let ignore = false
    const { from, to } = getRange(range)

    Promise.all([getLatestReading(), getReadings(from, to), getWaterings(from, to)])
      .then(([latest, readings, waterings]) => {
        if (!ignore) setData({ latest, readings, waterings, from, to, range })
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
    return () => {
      ignore = true
    }
  }, [range])

  // Status line under the title.
  let status = 'Loading…'
  if (error) status = `Couldn't load data: ${error}`
  else if (data && !data.latest) status = 'No readings yet. Waiting for the TerraPod to upload.'
  else if (data) status = `Last reading: ${formatLocalTime(data.latest.timestamp)} (${formatTimeAgo(data.latest.timestamp)})`

  const latest = data?.latest
  const alerts = evaluateAlerts(latest) // the table and alert list both use this

  // True while the data on screen is for a different range than the dropdown
  // shows, i.e. the new range is still loading.
  const loading = data && data.range !== range

  return (
    <>
      {/* The glass bar that stays at the top while you scroll */}
      <header className="topbar">
        <div className="page">
          <h1>TerraPod Live Data</h1>
          <p className={error ? 'critical' : 'muted'}>
            {status}
            {USE_MOCK && ' · Mock data'}
          </p>
        </div>
      </header>

      <main className="page">
        {latest && (
          <>
            <h2>Alerts</h2>
            <AlertList alerts={alerts} />

            <h2>Latest readings</h2>
            <LatestTable reading={latest} alerts={alerts} />

            <h2>History</h2>
            <RangeSelect value={range} onChange={setRange} loading={loading} />

            <div className={loading ? 'history loading' : 'history'}>
              <Charts readings={data.readings} from={data.from} to={data.to} />

              <h2>Waterings</h2>
              <WateringTable waterings={data.waterings} />
            </div>
          </>
        )}
      </main>
    </>
  )
}

export default App

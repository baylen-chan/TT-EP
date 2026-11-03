import { useEffect, useState } from 'react'
import { CONFIG } from './config.js'
import { getLatestReading, getReadings, getWaterings } from './data/api.js'
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
  const [refreshes, setRefreshes] = useState(0) // goes up by 1 on each auto-refresh

  // Auto-refresh: every minute, bump `refreshes`, which makes the effect
  // below load the data again. Skipped while the tab is hidden (no point
  // loading data nobody sees); when the tab is shown again it refreshes
  // straight away instead of waiting for the next minute.
  useEffect(() => {
    if (!CONFIG.REFRESH_INTERVAL_SEC) return // turned off in config.js

    const refresh = () => {
      if (document.visibilityState === 'visible') setRefreshes((n) => n + 1)
    }
    const timer = setInterval(refresh, CONFIG.REFRESH_INTERVAL_SEC * 1000)
    document.addEventListener('visibilitychange', refresh)

    // Cleanup: stop the timer if this component is ever removed.
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  // Loads everything the page needs at once. `ignore` stops a slow, outdated
  // request from overwriting newer data (and handles React running effects
  // twice in development). Runs again whenever the dropdown changes or an
  // auto-refresh happens.
  useEffect(() => {
    let ignore = false
    const { from, to } = getRange(range)

    Promise.all([getLatestReading(), getReadings(from, to), getWaterings(from, to)])
      .then(([latest, readings, waterings]) => {
        if (ignore) return
        setData({ latest, readings, waterings, from, to, range })
        setError(null) // clears an old error once a refresh works again
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
    return () => {
      ignore = true
    }
  }, [range, refreshes])

  // Status line under the title. The free Render server sleeps when nobody
  // uses it and takes up to a minute to wake, so say so while loading.
  let status = 'Loading… (the server can take up to a minute to wake up)'
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
          <p className={error ? 'critical' : 'muted'}>{status}</p>
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

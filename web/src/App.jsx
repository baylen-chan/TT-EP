import { useEffect, useState } from 'react'
import { connectLive, getLatestReading, getReadings, getWaterings } from './data/api.js'
import { formatLocalTime, formatTimeAgo } from './data/convert.js'
import { evaluateAlerts } from './data/alerts.js'
import { addReading, addWatering } from './data/live.js'
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
  const [refreshes, setRefreshes] = useState(0) // goes up by 1 to reload everything
  const [now, setNow] = useState(Date.now()) // the clock "5 min ago" and alerts use

  // Live updates: the server pushes each new reading the moment the ESP32
  // uploads it, and it's added to what's on screen. If the connection
  // dropped and came back, bump `refreshes` to reload everything in case
  // something was missed while it was down.
  useEffect(() => {
    // connectLive returns the function that closes the connection, so
    // returning it here closes it if this component is ever removed.
    return connectLive({
      onReading: (reading) => setData((old) => old && addReading(old, reading)),
      onWatering: (watering) => setData((old) => old && addWatering(old, watering)),
      onReconnect: () => setRefreshes((n) => n + 1),
    })
  }, [])

  // Nothing re-draws the page between pushes, so tick the clock every minute.
  // That keeps "5 min ago" current and lets the "stopped uploading" alert
  // appear if readings stop coming. No server request involved.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  // Loads everything the page needs at once. `ignore` stops a slow, outdated
  // request from overwriting newer data (and handles React running effects
  // twice in development). Runs again whenever the dropdown changes or the
  // live connection reconnects.
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
  else if (data) status = `Last reading: ${formatLocalTime(data.latest.timestamp)} (${formatTimeAgo(data.latest.timestamp, now)})`

  const latest = data?.latest
  const alerts = evaluateAlerts(latest, now) // the table and alert list both use this

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

      {/* Shown as soon as the first load finishes, even with no readings yet:
          the table says "No data" and the charts are empty. */}
      <main className="page">
        {data && (
          <>
            <h2>Alerts</h2>
            {latest ? (
              <AlertList alerts={alerts} />
            ) : (
              <p className="muted">No alerts yet. They'll appear once the first reading arrives.</p>
            )}

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

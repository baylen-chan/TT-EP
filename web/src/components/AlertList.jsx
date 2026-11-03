// Shows the alerts from evaluateAlerts(), or "All readings normal" if none.
// The words "Critical"/"Warning" are always shown, not just the colour,
// so the page still makes sense to colour-blind viewers.
export default function AlertList({ alerts }) {
  if (alerts.length === 0) {
    return <p className="ok">All readings normal</p>
  }

  return (
    <div>
      {alerts.map((alert) => (
        <div key={alert.key} className={`alert ${alert.level}`}>
          <strong>
            {alert.level === 'critical' ? 'Critical' : 'Warning'}: {alert.title}
          </strong>
          <div>{alert.message}</div>
        </div>
      ))}
    </div>
  )
}

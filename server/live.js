// Live updates for the website, over WebSockets.
// Every open copy of the website connects to /live and stays connected. When
// the ESP32 uploads, index.js calls broadcast() and the new reading goes
// straight to every open page, so nobody has to reload.
//
// Only the server sends messages; anything a browser sends is ignored.
import { WebSocketServer } from 'ws'

let wss

// Attaches the WebSocket server to the same HTTP server Express uses, so it
// shares the one port Render gives us.
export function startLive(server) {
  wss = new WebSocketServer({ server, path: '/live' })

  wss.on('connection', (socket) => {
    socket.isAlive = true
    socket.on('pong', () => {
      socket.isAlive = true
    })
    socket.on('error', console.error) // without this, a broken connection would crash the server
  })

  // Every 30 s, ping each browser. One that didn't answer the last ping (its
  // laptop slept, Wi-Fi dropped) is gone, so close it. Regular pings also stop
  // Render or a school network closing a connection that has gone quiet.
  setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate()
        continue
      }
      socket.isAlive = false
      socket.ping()
    }
  }, 30_000)
}

// Sends { type, data } to every connected browser, e.g. type 'reading'.
export function broadcast(type, data) {
  const message = JSON.stringify({ type, data })
  for (const socket of wss.clients) {
    if (socket.readyState === socket.OPEN) socket.send(message)
  }
}

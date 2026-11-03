// The TerraPod server.
//   The ESP32 sends data here:    POST /api/readings, POST /api/waterings
//   The website reads it from:    GET /api/readings/latest, GET /api/readings, GET /api/waterings
//
// Run locally: npm run dev   (reads settings from .env)
import express from 'express'
import cors from 'cors'
import * as db from './db.js'
import { parseRange, validateReading, validateWatering } from './validate.js'

const PORT = process.env.PORT || 3001 // Render sets PORT for you
const API_KEY = process.env.API_KEY

const app = express()
app.use(cors()) // lets the website, on a different address, call this server
app.use(express.json()) // turns JSON request bodies into req.body

// Open this in a browser to check the server is up. Render also uses it.
app.get('/', (req, res) => {
  res.send('TerraPod server is running')
})

// ---------- From the ESP32 ----------

// Only the ESP32 knows the API key, so nobody else can add fake data.
function requireApiKey(req, res, next) {
  if (!API_KEY) return res.status(500).json({ error: 'API_KEY is not set on the server' })
  if (req.get('X-API-Key') !== API_KEY) return res.status(401).json({ error: 'Wrong or missing X-API-Key' })
  next()
}

app.post('/api/readings', requireApiKey, async (req, res) => {
  const { data, error } = validateReading(req.body)
  if (error) return res.status(400).json({ error })
  const id = await db.insertReading(data)
  res.status(201).json({ id })
})

app.post('/api/waterings', requireApiKey, async (req, res) => {
  const { data, error } = validateWatering(req.body)
  if (error) return res.status(400).json({ error })
  const id = await db.insertWatering(data)
  res.status(201).json({ id })
})

// ---------- For the website ----------

app.get('/api/readings/latest', async (req, res) => {
  res.json(await db.getLatestReading())
})

app.get('/api/readings', async (req, res) => {
  const range = parseRange(req.query)
  if (!range) return res.status(400).json({ error: 'Add ?from=...&to=... as ISO dates' })
  res.json(await db.getReadings(range.from, range.to))
})

app.get('/api/waterings', async (req, res) => {
  const range = parseRange(req.query)
  if (!range) return res.status(400).json({ error: 'Add ?from=...&to=... as ISO dates' })
  res.json(await db.getWaterings(range.from, range.to))
})

// If anything above throws (e.g. the database is unreachable), Express sends
// it here instead of crashing the server.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Body is not valid JSON' })
  console.error(err)
  res.status(500).json({ error: 'Server error' })
})

await db.createTables()
app.listen(PORT, () => {
  console.log(`TerraPod server listening on http://localhost:${PORT}`)
})

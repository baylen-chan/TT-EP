# TerraPod live data website

TerraPod is a sealed mini greenhouse (tomato plant) controlled by an ESP32-S3.
The ESP32 wakes every ~10 min, reads sensors, waters if needed, uploads, then
deep sleeps. I'm building the website's live data page. Overview/team pages
come later; focus on data only.

## Live addresses
- Website: https://tt-ep-web.onrender.com (Render static site, root `web`)
- Server: https://tt-ep.onrender.com (Render web service, root `server`)
- Code: github.com/baylen-chan/TT-EP (private). Every push to main redeploys both.

## How it fits together
ESP32 --POST--> Node server on Render --> Postgres on Supabase
Website --GET--> same server (reads from Supabase) when the page opens
Server --WebSocket--> website: each new reading is pushed to open pages
Status: everything is live and tested; waiting for the ESP32 to send real data.

## Website (`web/`)
- React (JavaScript) + Vite. Recharts for graphs. Run locally: `cd web && npm run dev`.
- config.js: soil calibration, tank size, alert thresholds, refresh interval.
- data/api.js: the only file that talks to the server (API_BASE_URL).
- data/: plain JS helpers (alerts, unit conversion, chart rows, date ranges,
  live.js merges pushed readings into what's on screen).
- App.jsx: page layout and data loading. components/: one file per section.
- Live updates: no polling. The page loads everything once over HTTP, then
  keeps a WebSocket to /live open; the server pushes each new reading or
  watering (~200 bytes), so Render's free 5 GB/month isn't a worry. If the
  connection drops it retries every 5 s and reloads everything once it's back.
  A 1-minute clock tick keeps "5 min ago" and the offline alert current.

## Backend (`server/`)
- Node/Express, hosted on Render (free web service). Database: Postgres on
  Supabase (free). Not SQLite or Render's free Postgres: Render's free disk is
  wiped on restart, and its free Postgres is deleted after 30 days.
- Files: index.js (routes), db.js (all SQL, creates tables on start),
  validate.js (checks ESP32 data), live.js (WebSocket at /live: broadcast()
  after each POST, pings every 30 s to drop dead connections).
  Settings in .env (copy .env.example).
  Run locally: `cd server && npm run dev`.
- The school Wi-Fi blocks the database connection; use a hotspot to run the
  server locally. The deployed server is unaffected.
- Website reads: GET /api/readings/latest, GET /api/readings?from=&to=,
  GET /api/waterings?from=&to= (from/to are UTC ISO strings; lists are sorted
  oldest first; /latest returns `null` if there are no readings yet).
- ESP32 sends: POST /api/readings, POST /api/waterings with header
  X-API-Key. A sensor that fails sends null. A missing timestamp means the server uses its own time.
  Replies: 201 saved, 400 bad data, 401 wrong key.
- Firmware notes: Render is HTTPS only (use WiFiClientSecure). Free server
  sleeps after 15 min idle and takes ~1 min to wake, so use a 60 s timeout.
- Secrets (API key, database password) live only in server/.env, Render's
  Environment settings and Supabase. Never commit them.
- Clear all data (Supabase SQL Editor): TRUNCATE readings, waterings RESTART IDENTITY;

## Data format (agreed with firmware team)
Reading: {"timestamp": "2026-11-10T14:30:00Z", "soil_moisture": 612,
"lux": null, "co2_ppm": 520, "temp_c": 24.3, "humidity_pct": 61, "water_ml": null}
Watering event: {"timestamp": "...", "duration_s": 5, "water_ml": 150}
- Timestamps UTC ISO; display in local time.
- soil_moisture is raw; website converts to % with calibration constants.
- Tank capacity is not measured yet. After measuring it, update the firmware
  calibration and `web/src/config.js`; low-water alerts stay disabled until then.

## How to work with me
Go step by step and explain each step so I understand the code.
Done: data format, latest readings, alerts, graphs, range dropdown,
backend on Render + Supabase, website online, live updates over WebSocket.
Next: ESP32 sends real data; calibrate soil sensor; overview/team pages.

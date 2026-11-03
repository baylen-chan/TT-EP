# TerraPod live data website

TerraPod is a sealed mini greenhouse (tomato plant) controlled by an ESP32-S3.
The ESP32 wakes every ~10 min, reads sensors, waters if needed, uploads, then
deep sleeps. I'm building the website's live data page. Overview/team pages
come later; focus on data only.

## Approach
- React (JavaScript) + Vite in `web/`. Recharts for graphs. Run: `cd web && npm run dev`.
- Files in web/src: config.js (calibration + alert thresholds), data/mock.js
  (fake data), data/api.js (only file that fetches data, has USE_MOCK switch),
  App.jsx (page layout), components/ (one file per UI section).
- Build with mock data now; later flip USE_MOCK to call a real backend
  (Node/Express in `server/` + Postgres/Supabase) with these endpoints:
  GET /api/readings/latest, GET /api/readings?from=&to=, GET /api/waterings?from=&to=
- Backend contract: from/to are UTC ISO strings. Lists are JSON arrays sorted
  oldest first. /latest returns a single reading object, or `null` if none yet.
  Errors use a non-200 status. The site warns in the console if a reading
  doesn't match the format below.
- To switch to real data: set API_BASE_URL and USE_MOCK = false in web/src/data/api.js.

## Backend (`server/`)
- Node/Express, hosted on Render (free web service). Database: Postgres on
  Supabase (free). Not SQLite or Render's free Postgres: Render's free disk is
  wiped on restart, and its free Postgres is deleted after 30 days.
- Files: index.js (routes), db.js (all SQL, creates tables on start),
  validate.js (checks ESP32 data). Settings in .env (copy .env.example).
  Run locally: `cd server && npm run dev`.
- ESP32 sends: POST /api/readings, POST /api/waterings with header
  X-API-Key. A sensor that fails sends null. A missing timestamp means the server uses its own time.
  Replies: 201 saved, 400 bad data, 401 wrong key.
- Firmware notes: Render is HTTPS only (use WiFiClientSecure). Free server
  sleeps after 15 min idle and takes ~1 min to wake, so use a 60 s timeout.

## Data format (agreed with firmware team)
Reading: {"timestamp": "2026-11-10T14:30:00Z", "soil_moisture": 612,
"lux": 8450, "co2_ppm": 520, "temp_c": 24.3, "humidity_pct": 61, "water_ml": 5200}
Watering event: {"timestamp": "...", "duration_s": 5, "water_ml": 150}
- Timestamps UTC ISO; display in local time.
- soil_moisture is raw; website converts to % with calibration constants.
- Tank holds ~7000 mL; show low-water warning below a set level.

## How to work with me
Go step by step and explain each step so I understand the code. Steps:
1. Data format (done) 2. Folder setup (done) 3. Mock data generator (done)
4. api.js data layer (done) 5. Latest readings (done) 6. Warnings/critical alerts (done)
7. Graphs (done) 8. Range dropdown: last 24 h / 7 days / single day (done)
9. Auto-refresh every minute, paused while tab hidden (done)
10. Backend on Render + Supabase (done); website uses it (USE_MOCK = false)
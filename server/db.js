// Everything that talks to the Postgres database lives in this file.
// index.js calls these functions and never writes SQL itself.
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
}

// Supabase needs an encrypted (SSL) connection; a database on your own
// computer doesn't. rejectUnauthorized: false skips checking Supabase's
// certificate, which is the usual setup for small projects.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)

// A "pool" keeps a few connections open and reuses them, instead of
// connecting to the database again for every request.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

// Creates the tables the first time the server starts. "IF NOT EXISTS"
// makes it safe to run on every start.
//
// The column is called recorded_at (not timestamp, which is also a SQL
// type name); the queries below rename it back to "timestamp" so the JSON
// matches the format agreed with the firmware team.
export async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS readings (
      id            SERIAL PRIMARY KEY,
      recorded_at   TIMESTAMPTZ NOT NULL,
      soil_moisture DOUBLE PRECISION,
      lux           DOUBLE PRECISION,
      co2_ppm       DOUBLE PRECISION,
      temp_c        DOUBLE PRECISION,
      humidity_pct  DOUBLE PRECISION,
      water_ml      DOUBLE PRECISION,
      received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS readings_recorded_at ON readings (recorded_at);

    CREATE TABLE IF NOT EXISTS waterings (
      id          SERIAL PRIMARY KEY,
      recorded_at TIMESTAMPTZ NOT NULL,
      duration_s  DOUBLE PRECISION,
      water_ml    DOUBLE PRECISION,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS waterings_recorded_at ON waterings (recorded_at);

    -- Supabase also exposes every table through its own web API. Turning on
    -- row level security with no rules blocks that route completely. This
    -- server logs in as the database owner, so it isn't affected.
    ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE waterings ENABLE ROW LEVEL SECURITY;
  `)
}

// The columns sent back to the website, in the agreed format.
const READING_COLUMNS = `recorded_at AS "timestamp", soil_moisture, lux, co2_ppm, temp_c, humidity_pct, water_ml`
const WATERING_COLUMNS = `recorded_at AS "timestamp", duration_s, water_ml`

// $1, $2 ... are placeholders. pg fills them in safely, so values sent by
// the ESP32 can never be run as SQL ("SQL injection").
//
// The inserts return the saved row in the same format as the GET queries,
// plus its id, so it can be pushed to the website as-is.
export async function insertReading(r) {
  const result = await pool.query(
    `INSERT INTO readings (recorded_at, soil_moisture, lux, co2_ppm, temp_c, humidity_pct, water_ml)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, ${READING_COLUMNS}`,
    [r.timestamp, r.soil_moisture, r.lux, r.co2_ppm, r.temp_c, r.humidity_pct, r.water_ml],
  )
  return result.rows[0]
}

export async function insertWatering(w) {
  const result = await pool.query(
    `INSERT INTO waterings (recorded_at, duration_s, water_ml) VALUES ($1, $2, $3)
     RETURNING id, ${WATERING_COLUMNS}`,
    [w.timestamp, w.duration_s, w.water_ml],
  )
  return result.rows[0]
}

// The newest reading, or null if there are none yet.
export async function getLatestReading() {
  const result = await pool.query(
    `SELECT ${READING_COLUMNS} FROM readings ORDER BY recorded_at DESC LIMIT 1`,
  )
  return result.rows[0] ?? null
}

// Everything between two dates, oldest first.
export async function getReadings(from, to) {
  const result = await pool.query(
    `SELECT ${READING_COLUMNS} FROM readings
     WHERE recorded_at BETWEEN $1 AND $2
     ORDER BY recorded_at`,
    [from, to],
  )
  return result.rows
}

export async function getWaterings(from, to) {
  const result = await pool.query(
    `SELECT ${WATERING_COLUMNS} FROM waterings
     WHERE recorded_at BETWEEN $1 AND $2
     ORDER BY recorded_at`,
    [from, to],
  )
  return result.rows
}

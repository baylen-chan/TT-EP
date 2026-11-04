// Every number you might need to tune lives here, so when the hardware team
// hands over calibration values you only edit this one file.
export const CONFIG = {
  // Soil sensor calibration: raw readings in fully dry and fully wet soil.
  // PLACEHOLDERS until Tingting calibrates the real sensor.
  SOIL_RAW_DRY: 350,
  SOIL_RAW_WET: 1000,

  // Unknown until the physical tank is measured. Charts use an automatic
  // water axis and low-water alerts stay off while this is null.
  TANK_CAPACITY_ML: null,

  // The ESP32 uploads about every 10 min. The charts use this to spot missing
  // readings: a gap of more than 2.5 intervals breaks the line instead of
  // joining across it. (The "device offline" alert uses
  // minutes_since_reading in THRESHOLDS below.)
  READING_INTERVAL_MIN: 10,

  // How many single days the chart dropdown lists (today and the days before it).
  PAST_DAYS_IN_DROPDOWN: 30,

  // Alert levels for each metric. null means "no limit on that side".
  // These are starting guesses for a tomato plant; adjust once you see real data.
  THRESHOLDS: {
    soil_pct:     { critLow: 15,   warnLow: 30,   warnHigh: 90,   critHigh: null },
    temp_c:       { critLow: 10,   warnLow: 15,   warnHigh: 30,   critHigh: 35 },
    humidity_pct: { critLow: null, warnLow: 40,   warnHigh: 85,   critHigh: 95 },
    // The SCD-40 is rated for 400-2000 ppm: readings below 400 are rough, and
    // one at the top may really be higher. critHigh sits just under 2000 so
    // a reading stuck at the top still counts as critical.
    co2_ppm:      { critLow: 200,  warnLow: 300,  warnHigh: 1500, critHigh: 1900 },
    water_ml:     { critLow: null, warnLow: null, warnHigh: null, critHigh: null },
    minutes_since_reading: { critLow: null, warnLow: null, warnHigh: 25, critHigh: 60 },
  },
}

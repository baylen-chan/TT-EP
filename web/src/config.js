// Every number you might need to tune lives here, so when the hardware team
// hands over calibration values you only edit this one file.
export const CONFIG = {
  // Soil sensor calibration: raw readings in fully dry and fully wet soil.
  // PLACEHOLDERS until Tingting calibrates the real sensor.
  SOIL_RAW_DRY: 350,
  SOIL_RAW_WET: 1000,

  TANK_CAPACITY_ML: 7000,

  // The ESP32 uploads about every 10 min. If nothing has arrived for longer
  // than this, the device is probably offline or out of battery.
  READING_INTERVAL_MIN: 10,

  // How often the page checks the server for new readings, in seconds.
  // It skips checks while the browser tab is hidden. 0 = off: the page
  // loads once when opened (or when the dropdown changes) and that's it.
  // Paused for now to save Render's free data allowance; 60 to turn back on.
  REFRESH_INTERVAL_SEC: 0,

  // How many single days the chart dropdown lists (today and the days before it).
  PAST_DAYS_IN_DROPDOWN: 30,

  // Alert levels for each metric. null means "no limit on that side".
  // These are starting guesses for a tomato plant; adjust once you see real data.
  THRESHOLDS: {
    soil_pct:     { critLow: 15,   warnLow: 30,   warnHigh: 90,   critHigh: null },
    temp_c:       { critLow: 10,   warnLow: 15,   warnHigh: 30,   critHigh: 35 },
    humidity_pct: { critLow: null, warnLow: 40,   warnHigh: 85,   critHigh: 95 },
    co2_ppm:      { critLow: 200,  warnLow: 300,  warnHigh: 2000, critHigh: 5000 },
    water_ml:     { critLow: 700,  warnLow: 1500, warnHigh: null, critHigh: null },
    minutes_since_reading: { critLow: null, warnLow: null, warnHigh: 25, critHigh: 60 },
  },
}

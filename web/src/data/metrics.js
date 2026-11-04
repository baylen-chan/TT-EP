// The list of things TerraPod measures, defined once and shared by the cards,
// alerts and graphs. `key` matches the names in CONFIG.THRESHOLDS; `value`
// pulls the number out of a reading.
import { soilRawToPct } from './convert.js'

export const METRICS = [
  { key: 'soil_pct', label: 'Soil moisture', unit: '%', digits: 0, value: (r) => soilRawToPct(r.soil_moisture) },
  { key: 'water_ml', label: 'Water left', unit: 'mL', digits: 0, value: (r) => r.water_ml },
  { key: 'temp_c', label: 'Temperature', unit: '°C', digits: 1, value: (r) => r.temp_c },
  { key: 'humidity_pct', label: 'Humidity', unit: '%', digits: 0, value: (r) => r.humidity_pct },
  { key: 'co2_ppm', label: 'CO₂', unit: 'ppm', digits: 0, value: (r) => r.co2_ppm },
]

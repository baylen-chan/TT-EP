# TerraPod ESP32-S3 firmware

This firmware implements the data contract in `INFO.md`:

1. Wake every 10 minutes.
2. Read the STEMMA soil sensor, SCD-40, and AS5600 magnetic water-level encoder.
3. Run one short pump burst when the soil is dry, the tank is not low, and the daily safety limit allows it.
4. Queue a reading and (when applicable) a watering event in flash.
5. POST queued data to the Render backend with `X-API-Key`.
6. Enter deep sleep.

Failed I2C sensors are sent as JSON `null`, matching the server contract. Failed uploads remain in LittleFS and are retried on later wake cycles.

## Final hardware

- Adafruit STEMMA Soil Sensor, product 4026
- Adafruit SCD-40 CO2/temperature/humidity sensor, product 5187
- Espressif ESP32-S3-DevKitC-1-N8R8
- Adafruit 3 V submersible water pump, product 4546
- Adafruit MOSFETTI four-channel MOSFET driver, product 5757
- UMLIFE AS5600 magnetic encoder module used by the float lever

There is no light sensor in the final hardware. The firmware sends the legacy
backend `lux` field as JSON `null`, and the frontend does not display it.

## Hardware wiring

| Device | ESP32-S3-DevKitC-1 connection |
| --- | --- |
| All sensor grounds | GND |
| SCD-40, STEMMA soil, AS5600 VCC | 3V3 |
| All I2C SDA | GPIO8 |
| All I2C SCL | GPIO9 |
| AS5600 analog OUT | GPIO1 (ADC1) |
| Pump-driver signal | GPIO21 |
| Pump-driver logic ground | ESP32 GND |
| Pump power | External supply through the MOSFET driver, never an ESP32 GPIO |

The AS5600 must be powered from 3.3 V so its analog output cannot exceed the ESP32's 3.3 V ADC limit. Connect only its analog `OUT` signal to GPIO1; do not connect its SDA/SCL pins. The AS5600 and STEMMA soil sensor both have the fixed I2C address `0x36`, so putting both on the same I2C bus would cause an address conflict. The MOSFETTI driver and pump supply must share ground with the ESP32.

The float lever should rotate the AS5600 magnet through a useful angle without mechanically reaching the encoder's wraparound point.

## Arduino IDE setup

1. Install the current **esp32 by Espressif Systems** board package.
2. Select **ESP32S3 Dev Module** (8 MB flash / 8 MB PSRAM settings matching the N8R8 board).
3. Install these libraries from Library Manager:
   - ArduinoJson
   - Adafruit seesaw Library
   - Sensirion I2C SCD4x
   - Sensirion Core (normally installed as the SCD4x dependency)
4. Copy `TerraPodFirmware/secrets.example.h` to `TerraPodFirmware/secrets.h`.
5. Fill in the Wi-Fi name/password and the exact `API_KEY` configured on Render.
6. Open `TerraPodFirmware/TerraPodFirmware.ino`, compile, and upload.
7. Open Serial Monitor at 115200 baud for the first test.

The sketch supports both Arduino-ESP32 2.x and 3.x PWM APIs, although the current board package is recommended.

## Required calibration

All values to tune are in `TerraPodFirmware/config.h`.

### AS5600 float-lever water level

`WATER_LEVEL_RAW_EMPTY = 500`, `WATER_LEVEL_RAW_FULL = 3000`, and
`TANK_CAPACITY_ML = 1000` are placeholders. `WATER_LEVEL_CALIBRATED` is
deliberately `false`, so the backend receives `water_ml: null` and automatic
watering stays disabled until the real tank is measured.

1. Temporarily print or inspect `waterRaw` with the tank empty; average several stable readings from the AS5600 analog output.
2. Fill the tank to its actual intended maximum and record the averaged reading again.
3. Measure the usable tank capacity in mL and replace `TANK_CAPACITY_ML`.
4. Replace the two raw constants. Either sensor direction is supported.
5. Set `WATER_LEVEL_CALIBRATED = true`.
6. If an endpoint is close to 0 or 4095, adjust `WATER_LEVEL_RAW_VALID_MIN/MAX` so it is not mistaken for a wiring fault.

The firmware maps the calibrated range to `0..TANK_CAPACITY_ML` and sends that value as `water_ml` in every reading.

After measuring the tank, also replace the `null` `TANK_CAPACITY_ML` and set
appropriate `water_ml` alert thresholds in `web/src/config.js`, then update the
capacity note in `INFO.md`, so firmware and website use the same real value.

### Soil moisture

Replace `SOIL_RAW_DRY` and `SOIL_RAW_WET` with readings from the installed probe in dry and fully watered soil. Copy the same two numbers into `web/src/config.js`, because the website converts the raw value to percent. The pump threshold is `SOIL_WATER_BELOW_PERCENT`.

### Pump flow

Measure the installed pump and tubing with a measuring cup, then replace `PUMP_FLOW_ML_PER_SECOND`. This estimate is only used for the amount dispensed in a `/api/waterings` event; remaining tank water comes from the float sensor.

Also verify `PUMP_PWM_DUTY`. The placeholder 60% duty approximates 3 V from a 5 V supply, but motor behavior is not perfectly linear. A regulated 3 V pump supply is safer than relying on PWM alone.

## Safety behavior

- A missing soil or water-level reading prevents automatic watering.
- The pump will not run below `MIN_WATER_TO_RUN_PUMP_PERCENT` of tank capacity.
- Pump runtime is capped by `MAX_PUMP_SECONDS_PER_DAY`, persisted across deep sleep.
- A 48 KiB flash queue retains data during Wi-Fi/backend outages; if it fills, the oldest records are discarded.
- Each HTTP request waits up to 60 seconds because Render may be asleep.

## TLS note

The example secrets file enables `TLS_ALLOW_INSECURE` so the prototype works without maintaining a CA certificate. Traffic is encrypted, but the server identity is not authenticated. On an untrusted network, set it to `false` and put the backend's current root CA PEM in `TLS_ROOT_CA`.

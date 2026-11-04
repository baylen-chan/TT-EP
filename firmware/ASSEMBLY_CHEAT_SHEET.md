# TerraPod firmware assembly cheat sheet

Use this document during wiring, bench testing, calibration, and the first
end-to-end upload. The current firmware is intentionally safe by default:
automatic watering cannot run until the water-level calibration is completed.

## What the firmware does

On every wake cycle, the ESP32-S3:

1. Starts Serial at 115200 baud and mounts LittleFS flash storage.
2. Configures the MOSFETTI pump-control output and immediately turns it off.
3. Starts the shared I2C bus and detects the soil sensor and SCD-40.
4. Reads raw soil moisture, CO2, temperature, humidity, and the AS5600 analog output.
5. Prints raw calibration values to Serial Monitor.
6. Decides whether watering is allowed. It requires valid calibrated soil and
   tank data, enough tank water, and remaining daily pump time.
7. Connects to Wi-Fi, gets UTC time, and posts readings to the Render backend.
8. Saves failed uploads in LittleFS and retries them on a later wake cycle.
9. Turns Wi-Fi and the pump off and deep-sleeps for 10 minutes.

`loop()` is intentionally empty because one complete cycle happens in `setup()`
before deep sleep resets the ESP32 for the next cycle.

## Current hardware and proposed wiring

| Part | Connection | Notes |
| --- | --- | --- |
| ESP32-S3-DevKitC-1-N8R8 | USB for programming | PlatformIO environment is already configured. |
| Adafruit STEMMA soil sensor 4026 | 3V3, GND, SDA GPIO8, SCL GPIO9 | I2C address `0x36`. |
| Adafruit SCD-40 5187 | 3V3, GND, SDA GPIO8, SCL GPIO9 | Shares the I2C bus; address `0x62`. |
| UMLIFE AS5600 module | 3V3, GND, analog OUT to GPIO1 | Do not attach its SDA/SCL to the shared bus. |
| Adafruit MOSFETTI 5757 | Proposed control GPIO21 and common GND | Confirm the selected channel and polarity. |
| Adafruit 3 V pump 4546 | Through MOSFETTI and a suitable pump supply | Never power the pump from an ESP32 GPIO. |

The soil sensor and AS5600 both use I2C address `0x36`. The AS5600 therefore
uses its analog output. Powering it from 3.3 V keeps that output within the
ESP32 ADC limit. All grounds must be common. Keep pump wiring physically away
from sensor wiring where possible, and inspect for leaks before applying power.

## Searchable flags in the code

Search `config.h` and `secrets.example.h` for these labels:

- `ASSEMBLY TODO`: a value must be measured or supplied.
- `ASSEMBLY REVIEW`: a proposed value or wiring choice must be confirmed.
- `PLACEHOLDER`: never treat this as a measured production value.
- `SECURITY REVIEW`: acceptable for a prototype but not final deployment.

Most assembly-dependent values are centralized in
`TerraPodFirmware/config.h`. Wi-Fi and API credentials belong only in the
ignored `TerraPodFirmware/secrets.h` file.

## Safe first-power sequence

1. Leave the pump disconnected from its power supply.
2. Check continuity and confirm there is no 3V3-to-GND short.
3. Verify every sensor is powered at 3.3 V, not the pump voltage.
4. Connect USB, upload from PlatformIO, and open Serial Monitor at 115200.
5. Confirm both `STEMMA soil sensor ready` and valid SCD-40 output appear.
6. Move the float slowly and confirm `CALIBRATION water_raw` changes smoothly.
7. Touch or move the soil probe between dry and wet test material and confirm
   `CALIBRATION soil_raw` changes.
8. Only after sensor tests pass, bench-test the driver and pump under direct
   supervision with the plant/tank protected from accidental flooding.

If the board repeatedly resets when the pump starts, suspect supply droop,
grounding, motor noise, or insufficient flyback/suppression rather than software.

## AS5600 water-level calibration

The firmware averages 16 ADC samples and prints `CALIBRATION water_raw` every
boot. Because it deep-sleeps after one cycle, press Reset for additional samples
or temporarily shorten `READING_INTERVAL_MINUTES` during supervised testing.

1. Assemble the float lever and magnet in their final geometry.
2. Ensure the lever's travel does not cross the AS5600 0/360-degree wrap point.
   A wrap causes a sudden raw-value jump that simple linear mapping cannot handle.
3. Put the tank at its real empty point and record at least 5–10 stable raw readings.
4. Average them and replace `WATER_LEVEL_RAW_EMPTY`.
5. Fill to the intended maximum, record and average again, and replace
   `WATER_LEVEL_RAW_FULL`. Empty may be numerically greater than full; the code
   supports either direction.
6. Measure the usable water volume with a graduated container and replace
   `TANK_CAPACITY_ML`. Do not use the current 1000 mL placeholder.
7. Confirm intermediate float positions change approximately monotonically.
   The current conversion assumes a linear relationship between encoder output
   and water volume. Tank shape or lever geometry may make that inaccurate.
8. Review `WATER_LEVEL_RAW_VALID_MIN/MAX`. Values close to ADC rails may be real
   endpoints or may indicate a short/disconnection.
9. Set `WATER_LEVEL_CALIBRATED = true` only after all checks pass.
10. Copy the measured tank capacity and chosen alert limits into
    `web/src/config.js` so the website agrees with the firmware.

While `WATER_LEVEL_CALIBRATED` is false, `water_ml` is uploaded as `null` and
automatic watering is blocked.

## Soil calibration

Use the actual probe, soil type, installation depth, and final enclosure:

1. Record 5–10 `CALIBRATION soil_raw` readings under the agreed dry condition.
2. Record readings after fully watering and allowing excess water to drain.
3. Average each set and replace `SOIL_RAW_DRY` and `SOIL_RAW_WET`.
4. Copy the same values into `web/src/config.js` because the frontend calculates
   soil percentage independently.
5. Ask the plant team to approve `SOIL_WATER_BELOW_PERCENT`; 30% is provisional.
6. Test several intermediate moisture conditions before allowing unattended watering.

The code supports either calibration direction as long as dry and wet differ.

## Pump and MOSFETTI testing

The pump values are all provisional. Test them with a measuring cup before
connecting tubing to the plant:

1. Confirm MOSFETTI channel, GPIO21 input, common ground, and active-high behavior.
2. Confirm the pump has a suitable 3 V supply and observe voltage/current at startup.
3. Begin with a very short supervised burst. Confirm OFF really means off.
4. Verify `PUMP_PWM_DUTY` starts the pump reliably without excessive voltage,
   heat, noise, or stalling. The current `153/255` value is only a placeholder.
5. Run several timed tests through the final tubing into a measuring cup.
6. Calculate `PUMP_FLOW_ML_PER_SECOND = delivered mL / run seconds` and replace it.
7. Choose `PUMP_BURST_SECONDS` based on delivered water and plant needs.
8. Review `MAX_PUMP_SECONDS_PER_DAY` and `MIN_WATER_TO_RUN_PUMP_PERCENT` as safety limits.
9. Perform leak, siphon, blocked-tube, empty-tank, and power-cycle tests.

The watering event's `water_ml` is an estimate from run time and measured flow.
The tank reading after watering comes from the AS5600 instead of subtracting that estimate.

## Network and backend test

1. Fill in `TerraPodFirmware/secrets.h` with Wi-Fi credentials and the exact
   `API_KEY` configured on Render. Never commit this file.
2. Confirm `API_BASE_URL` in `config.h` is still correct.
3. Upload and watch Serial Monitor for Wi-Fi connection, time sync, and HTTP 201.
4. Confirm the reading appears in the backend and frontend with sensible units.
5. Disconnect Wi-Fi for one cycle, reconnect it, and verify the queued reading uploads.
6. The final hardware has no light sensor; `lux` is deliberately sent as JSON `null`.

`TLS_ALLOW_INSECURE = true` encrypts traffic but does not authenticate the
server. Before final deployment, install the correct root CA in `secrets.h` and
set it to `false`, or explicitly document acceptance of the prototype risk.

## Values that must be reviewed before unattended operation

- GPIO8/GPIO9/GPIO1/GPIO21 match the final harness.
- AS5600 empty/full raw values and usable tank capacity are measured.
- Water mapping is accurate enough across the tank, not only at endpoints.
- Soil dry/wet values and watering threshold are approved.
- Pump polarity, supply, PWM duty, burst time, flow, and daily limit are tested.
- Low-water cutoff keeps the pump inlet submerged and prevents dry running.
- Wi-Fi, API key, backend URL, timestamps, and retry queue work end to end.
- TLS verification decision is documented.
- Enclosure condensation, cable strain relief, leaks, and sensor placement are checked.

Do not enable unattended automatic watering merely because the firmware
compiles. Enable it only after the completed calibration and failure tests are
recorded by the assembly team.

#pragma once

#include <Arduino.h>

namespace Config {

// ASSEMBLY REVIEW [PINS]: Confirm these pins match the final harness before
// powering the assembled unit. The SCD-40 and STEMMA soil sensor share this bus.
constexpr uint8_t I2C_SDA_PIN = 8;
constexpr uint8_t I2C_SCL_PIN = 9;
constexpr uint32_t I2C_FREQUENCY_HZ = 100000;

// ASSEMBLY REVIEW [WATER WIRING]: AS5600 magnetic encoder: power it from 3.3 V and connect its analog OUT pin
// to GPIO1. Do not connect it over I2C: both the AS5600 and the STEMMA soil
// sensor use address 0x36. GPIO1 is on ADC1 and works while Wi-Fi is active.
constexpr uint8_t WATER_LEVEL_PIN = 1;
constexpr uint8_t WATER_LEVEL_SAMPLES = 16;
constexpr uint16_t WATER_LEVEL_SAMPLE_DELAY_MS = 8;

// ASSEMBLY TODO [WATER CALIBRATION]: Replace these placeholder values with
// averaged 12-bit ADC readings measured when
// the tank is actually empty and full. Reversed sensors are supported: the
// EMPTY value may be greater than the FULL value.
constexpr bool WATER_LEVEL_CALIBRATED = false;  // Keep false until all 3 values below are measured.
constexpr int WATER_LEVEL_RAW_EMPTY = 500;      // PLACEHOLDER; measure with the tank empty.
constexpr int WATER_LEVEL_RAW_FULL = 3000;      // PLACEHOLDER; measure at the intended maximum fill.

// ASSEMBLY REVIEW [WATER RANGE]: Readings at the ADC rails usually mean a disconnected/shorted sensor.
// Change these if a calibrated endpoint is legitimately close to 0 or 4095.
constexpr int WATER_LEVEL_RAW_VALID_MIN = 10;
constexpr int WATER_LEVEL_RAW_VALID_MAX = 4085;
// ASSEMBLY TODO [TANK CAPACITY]: Replace with the measured usable capacity,
// then set WATER_LEVEL_CALIBRATED to true.
constexpr float TANK_CAPACITY_ML = 1000.0f;  // PLACEHOLDER; not the known tank size.
constexpr float MIN_WATER_TO_RUN_PUMP_PERCENT = 5.0f;  // REVIEW after locating the pump inlet.

// I2C address used by the Adafruit STEMMA soil sensor.
constexpr uint8_t SOIL_SENSOR_ADDRESS = 0x36;

// ASSEMBLY TODO [SOIL CALIBRATION]: Replace these placeholders using the actual
// probe, soil, and installed depth in dry and fully watered conditions.
// These must also be copied to web/src/config.js so the website agrees.
constexpr int SOIL_RAW_DRY = 350;                 // PLACEHOLDER.
constexpr int SOIL_RAW_WET = 1000;                // PLACEHOLDER.
constexpr float SOIL_WATER_BELOW_PERCENT = 30.0f; // REVIEW with the plant team.

// ASSEMBLY REVIEW [PUMP WIRING]: GPIO21 is the proposed MOSFETTI control pin.
// Confirm the selected MOSFETTI channel, shared ground, and active polarity.
constexpr uint8_t PUMP_PIN = 21;
constexpr bool PUMP_ACTIVE_HIGH = true;  // VERIFY before connecting the pump.
constexpr uint32_t PUMP_PWM_FREQUENCY_HZ = 20000;
constexpr uint8_t PUMP_PWM_RESOLUTION_BITS = 8;

// ASSEMBLY TODO [PUMP TEST]: These are conservative prototype values, not
// calibrated operating values. Verify supply voltage, startup reliability,
// delivered flow, tubing, leaks, and plant needs while supervising the pump.
constexpr uint8_t PUMP_PWM_DUTY = 153;             // PLACEHOLDER: 60% of 8-bit PWM.
constexpr float PUMP_BURST_SECONDS = 5.0f;          // PLACEHOLDER.
constexpr float MAX_PUMP_SECONDS_PER_DAY = 30.0f;  // REVIEW safety limit.

// ASSEMBLY TODO [PUMP FLOW]: Measure the installed pump and tubing with a measuring cup.
// This value is used for the POST /api/waterings water_ml field.
constexpr float PUMP_FLOW_ML_PER_SECOND = 30.0f;  // PLACEHOLDER.

constexpr uint32_t READING_INTERVAL_MINUTES = 10;  // REVIEW desired reporting/battery interval.
constexpr uint32_t WIFI_TIMEOUT_MS = 20000;
constexpr uint32_t NTP_TIMEOUT_MS = 12000;
constexpr uint32_t HTTP_TIMEOUT_MS = 60000;
constexpr uint32_t MAX_UPLOADS_PER_WAKE = 32;
constexpr size_t MAX_QUEUE_BYTES = 48 * 1024;

// ASSEMBLY/DEPLOYMENT REVIEW [BACKEND]: Confirm this URL and the matching API
// key in secrets.h before the first end-to-end test.
constexpr char API_BASE_URL[] = "https://tt-ep.onrender.com";
constexpr char READINGS_PATH[] = "/api/readings";
constexpr char WATERINGS_PATH[] = "/api/waterings";

}  // namespace Config

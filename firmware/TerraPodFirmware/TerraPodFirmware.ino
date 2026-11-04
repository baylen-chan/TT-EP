#include <Arduino.h>
#include <Adafruit_seesaw.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <SensirionI2cScd4x.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <esp_arduino_version.h>
#include <esp_sleep.h>
#include <time.h>

#include "config.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy secrets.example.h to secrets.h and fill in the Wi-Fi/API settings."
#endif

constexpr char QUEUE_FILE[] = "/upload.queue";
constexpr char QUEUE_TEMP_FILE[] = "/upload.new";
constexpr char QUEUE_BACKUP_FILE[] = "/upload.bak";
constexpr char PREF_NAMESPACE[] = "terrapod";
constexpr char PREF_PUMP_SECONDS[] = "pumpSeconds";
constexpr char PREF_DAY_KEY[] = "dayKey";
constexpr char PREF_OFFLINE_CYCLES[] = "offlineCycles";
constexpr time_t MIN_VALID_EPOCH = 1700000000;  // November 2023
constexpr uint8_t LEGACY_LEDC_CHANNEL = 0;

Adafruit_seesaw soilSensor;
SensirionI2cScd4x scd4x;
Preferences preferences;

bool filesystemReady = false;
bool soilSensorReady = false;
bool scdSensorReady = false;
bool pumpPwmReady = false;

struct Measurements {
  bool soilOk = false;
  float soilRaw = 0;
  bool co2Ok = false;
  float co2Ppm = 0;
  bool temperatureOk = false;
  float temperatureC = 0;
  bool humidityOk = false;
  float humidityPct = 0;
  bool waterOk = false;
  int waterRaw = 0;
  float waterMl = 0;
};

void printSensirionError(const char* operation, int16_t error) {
  char message[96] = {};
  errorToString(error, message, sizeof(message));
  Serial.printf("SCD-40 %s failed: %s (%d)\n", operation, message, error);
}

void recoverUploadQueue() {
  if (!filesystemReady) return;
  if (!LittleFS.exists(QUEUE_FILE) && LittleFS.exists(QUEUE_BACKUP_FILE)) {
    LittleFS.rename(QUEUE_BACKUP_FILE, QUEUE_FILE);
  }
  LittleFS.remove(QUEUE_TEMP_FILE);
  if (LittleFS.exists(QUEUE_FILE) && LittleFS.exists(QUEUE_BACKUP_FILE)) {
    LittleFS.remove(QUEUE_BACKUP_FILE);
  }
}

void initFilesystem() {
  filesystemReady = LittleFS.begin(true);
  if (!filesystemReady) {
    Serial.println("LittleFS unavailable; readings cannot be queued for retry.");
    return;
  }
  recoverUploadQueue();
}

void initPump() {
  pinMode(Config::PUMP_PIN, OUTPUT);
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  pumpPwmReady = ledcAttach(Config::PUMP_PIN, Config::PUMP_PWM_FREQUENCY_HZ,
                            Config::PUMP_PWM_RESOLUTION_BITS);
#else
  ledcSetup(LEGACY_LEDC_CHANNEL, Config::PUMP_PWM_FREQUENCY_HZ,
            Config::PUMP_PWM_RESOLUTION_BITS);
  ledcAttachPin(Config::PUMP_PIN, LEGACY_LEDC_CHANNEL);
  pumpPwmReady = true;
#endif
}

void setPumpDuty(uint8_t duty) {
  const uint8_t output = Config::PUMP_ACTIVE_HIGH ? duty : 255 - duty;
#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(Config::PUMP_PIN, output);
#else
  ledcWrite(LEGACY_LEDC_CHANNEL, output);
#endif
}

void stopPump() {
  if (pumpPwmReady) setPumpDuty(0);
  else digitalWrite(Config::PUMP_PIN, Config::PUMP_ACTIVE_HIGH ? LOW : HIGH);
}

void initSensors() {
  Wire.begin(Config::I2C_SDA_PIN, Config::I2C_SCL_PIN, Config::I2C_FREQUENCY_HZ);

  soilSensorReady = soilSensor.begin(Config::SOIL_SENSOR_ADDRESS);
  Serial.println(soilSensorReady ? "STEMMA soil sensor ready." : "STEMMA soil sensor not found.");

  scd4x.begin(Wire, SCD40_I2C_ADDR_62);
  delay(30);
  // The SCD-40 may still be measuring after an ESP32 reset/deep-sleep wake.
  // Stopping first puts it in a known state. An idle sensor may report an
  // error here, so startPeriodicMeasurement() is the authoritative check.
  scd4x.stopPeriodicMeasurement();
  delay(500);
  const int16_t error = scd4x.startPeriodicMeasurement();
  scdSensorReady = error == 0;
  if (!scdSensorReady) printSensirionError("startPeriodicMeasurement", error);
}

int readWaterLevelRaw() {
  analogReadResolution(12);
  analogSetPinAttenuation(Config::WATER_LEVEL_PIN, ADC_11db);
  uint32_t total = 0;
  for (uint8_t i = 0; i < Config::WATER_LEVEL_SAMPLES; ++i) {
    total += analogRead(Config::WATER_LEVEL_PIN);
    delay(Config::WATER_LEVEL_SAMPLE_DELAY_MS);
  }
  return static_cast<int>(lroundf(static_cast<float>(total) / Config::WATER_LEVEL_SAMPLES));
}

bool rawWaterLevelToMl(int raw, float& waterMl) {
  if (!Config::WATER_LEVEL_CALIBRATED ||
      raw < Config::WATER_LEVEL_RAW_VALID_MIN || raw > Config::WATER_LEVEL_RAW_VALID_MAX ||
      Config::WATER_LEVEL_RAW_EMPTY == Config::WATER_LEVEL_RAW_FULL) {
    return false;
  }
  const float fraction = static_cast<float>(raw - Config::WATER_LEVEL_RAW_EMPTY) /
                         static_cast<float>(Config::WATER_LEVEL_RAW_FULL - Config::WATER_LEVEL_RAW_EMPTY);
  waterMl = constrain(fraction, 0.0f, 1.0f) * Config::TANK_CAPACITY_ML;
  return true;
}

Measurements readSensors() {
  Measurements result;

  if (soilSensorReady) {
    const uint16_t raw = soilSensor.touchRead(0);
    if (raw != 0 && raw != UINT16_MAX) {
      result.soilRaw = raw;
      result.soilOk = true;
    }
  }

  if (scdSensorReady) {
    bool dataReady = false;
    const uint32_t deadline = millis() + 8000;
    int16_t error = 0;
    while (!dataReady && static_cast<int32_t>(deadline - millis()) > 0) {
      delay(100);
      error = scd4x.getDataReadyStatus(dataReady);
      if (error != 0) break;
    }

    if (error == 0 && dataReady) {
      uint16_t co2 = 0;
      float temperature = 0;
      float humidity = 0;
      error = scd4x.readMeasurement(co2, temperature, humidity);
      if (error == 0 && co2 > 0) {
        result.co2Ppm = co2;
        result.temperatureC = temperature;
        result.humidityPct = humidity;
        result.co2Ok = true;
        result.temperatureOk = isfinite(temperature);
        result.humidityOk = isfinite(humidity);
      }
    }
    if (error != 0) printSensirionError("readMeasurement", error);
    scd4x.stopPeriodicMeasurement();
  }

  result.waterRaw = readWaterLevelRaw();
  result.waterOk = rawWaterLevelToMl(result.waterRaw, result.waterMl);
  return result;
}

// Assembly/calibration aid: these raw values are printed on every boot even
// while automatic watering is intentionally disabled. Record several stable
// samples rather than copying a single noisy value into config.h.
void printMeasurementSummary(const Measurements& readings) {
  if (readings.soilOk) Serial.printf("CALIBRATION soil_raw=%.0f\n", readings.soilRaw);
  else Serial.println("CALIBRATION soil_raw=INVALID");

  Serial.printf("CALIBRATION water_raw=%d water_calibrated=%s\n", readings.waterRaw,
                Config::WATER_LEVEL_CALIBRATED ? "true" : "false");

  if (readings.co2Ok) {
    Serial.printf("SCD-40 co2=%.0f ppm temp=%.2f C humidity=%.1f%%\n",
                  readings.co2Ppm, readings.temperatureC, readings.humidityPct);
  } else {
    Serial.println("SCD-40 reading unavailable.");
  }
}

float soilPercent(float raw) {
  if (Config::SOIL_RAW_DRY == Config::SOIL_RAW_WET) return NAN;
  const float percent = (raw - Config::SOIL_RAW_DRY) * 100.0f /
                        (Config::SOIL_RAW_WET - Config::SOIL_RAW_DRY);
  return constrain(percent, 0.0f, 100.0f);
}

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to Wi-Fi %s", WIFI_SSID);
  const uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < Config::WIFI_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi unavailable; this cycle will stay in the upload queue.");
    return false;
  }
  Serial.printf("Wi-Fi connected, IP %s\n", WiFi.localIP().toString().c_str());
  return true;
}

time_t syncClock() {
  time_t now = time(nullptr);
  if (now >= MIN_VALID_EPOCH) return now;

  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const uint32_t started = millis();
  while (now < MIN_VALID_EPOCH && millis() - started < Config::NTP_TIMEOUT_MS) {
    delay(250);
    now = time(nullptr);
  }
  if (now < MIN_VALID_EPOCH) {
    Serial.println("NTP unavailable; server receipt time will be used.");
    return 0;
  }
  return now;
}

String isoTimestamp(time_t now) {
  if (now < MIN_VALID_EPOCH) return String();
  struct tm utc = {};
  gmtime_r(&now, &utc);
  char timestamp[25] = {};
  strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", &utc);
  return String(timestamp);
}

float updateAndLoadDailyPumpBudget(time_t now) {
  preferences.begin(PREF_NAMESPACE, false);
  float usedSeconds = preferences.getFloat(PREF_PUMP_SECONDS, 0.0f);

  if (now >= MIN_VALID_EPOCH) {
    const uint32_t dayKey = static_cast<uint32_t>(now / 86400);
    if (preferences.getUInt(PREF_DAY_KEY, 0) != dayKey) {
      usedSeconds = 0;
      preferences.putFloat(PREF_PUMP_SECONDS, usedSeconds);
      preferences.putUInt(PREF_DAY_KEY, dayKey);
    }
    preferences.putUInt(PREF_OFFLINE_CYCLES, 0);
  } else {
    uint32_t cycles = preferences.getUInt(PREF_OFFLINE_CYCLES, 0) + 1;
    const uint32_t cyclesPerDay = max(1UL, 24UL * 60UL / Config::READING_INTERVAL_MINUTES);
    if (cycles >= cyclesPerDay) {
      cycles = 0;
      usedSeconds = 0;
      preferences.putFloat(PREF_PUMP_SECONDS, usedSeconds);
    }
    preferences.putUInt(PREF_OFFLINE_CYCLES, cycles);
  }
  preferences.end();
  return usedSeconds;
}

void saveDailyPumpBudget(float usedSeconds) {
  preferences.begin(PREF_NAMESPACE, false);
  preferences.putFloat(PREF_PUMP_SECONDS, usedSeconds);
  preferences.end();
}

bool shouldWater(const Measurements& readings, float usedPumpSeconds) {
  if (!readings.soilOk) {
    Serial.println("Skipping watering: soil sensor has no valid reading.");
    return false;
  }
  if (!readings.waterOk) {
    Serial.println("Skipping watering: float water-level reading is invalid.");
    return false;
  }
  const float minimumPumpWaterMl =
      Config::TANK_CAPACITY_ML * Config::MIN_WATER_TO_RUN_PUMP_PERCENT / 100.0f;
  if (readings.waterMl < minimumPumpWaterMl) {
    Serial.println("Skipping watering: tank is below the pump safety level.");
    return false;
  }
  if (usedPumpSeconds + Config::PUMP_BURST_SECONDS > Config::MAX_PUMP_SECONDS_PER_DAY) {
    Serial.println("Skipping watering: daily pump-time limit reached.");
    return false;
  }
  const float percent = soilPercent(readings.soilRaw);
  Serial.printf("Soil: %.0f raw (%.1f%%); water: %d raw (%.0f mL)\n",
                readings.soilRaw, percent, readings.waterRaw, readings.waterMl);
  return isfinite(percent) && percent < Config::SOIL_WATER_BELOW_PERCENT;
}

void runPump() {
  if (!pumpPwmReady) {
    Serial.println("Pump PWM initialization failed; pump will not run.");
    return;
  }
  Serial.printf("Watering for %.1f seconds at duty %u/255.\n",
                Config::PUMP_BURST_SECONDS, Config::PUMP_PWM_DUTY);
  setPumpDuty(Config::PUMP_PWM_DUTY);
  delay(static_cast<uint32_t>(Config::PUMP_BURST_SECONDS * 1000.0f));
  stopPump();
}

void setNumberOrNull(JsonDocument& doc, const char* key, bool valid, float value) {
  if (valid) doc[key] = value;
  else doc[key] = nullptr;
}

String makeReadingJson(const Measurements& readings, const String& timestamp) {
  JsonDocument doc;
  if (!timestamp.isEmpty()) doc["timestamp"] = timestamp;
  setNumberOrNull(doc, "soil_moisture", readings.soilOk, readings.soilRaw);
  // The backend still accepts the legacy field, but this hardware has no light sensor.
  doc["lux"] = nullptr;
  setNumberOrNull(doc, "co2_ppm", readings.co2Ok, readings.co2Ppm);
  setNumberOrNull(doc, "temp_c", readings.temperatureOk, readings.temperatureC);
  setNumberOrNull(doc, "humidity_pct", readings.humidityOk, readings.humidityPct);
  setNumberOrNull(doc, "water_ml", readings.waterOk, readings.waterMl);
  String json;
  serializeJson(doc, json);
  return json;
}

String makeWateringJson(const String& timestamp) {
  JsonDocument doc;
  if (!timestamp.isEmpty()) doc["timestamp"] = timestamp;
  doc["duration_s"] = Config::PUMP_BURST_SECONDS;
  doc["water_ml"] = Config::PUMP_BURST_SECONDS * Config::PUMP_FLOW_ML_PER_SECOND;
  String json;
  serializeJson(doc, json);
  return json;
}

void trimUploadQueue() {
  if (!filesystemReady) return;
  File source = LittleFS.open(QUEUE_FILE, FILE_READ);
  if (!source || source.size() <= Config::MAX_QUEUE_BYTES) {
    if (source) source.close();
    return;
  }

  const size_t keepBytes = Config::MAX_QUEUE_BYTES / 2;
  source.seek(source.size() - keepBytes);
  source.readStringUntil('\n');  // discard the first partial record
  LittleFS.remove(QUEUE_TEMP_FILE);
  File output = LittleFS.open(QUEUE_TEMP_FILE, FILE_WRITE);
  while (source.available()) output.write(source.read());
  source.close();
  output.close();

  LittleFS.remove(QUEUE_BACKUP_FILE);
  LittleFS.rename(QUEUE_FILE, QUEUE_BACKUP_FILE);
  if (LittleFS.rename(QUEUE_TEMP_FILE, QUEUE_FILE)) LittleFS.remove(QUEUE_BACKUP_FILE);
  else LittleFS.rename(QUEUE_BACKUP_FILE, QUEUE_FILE);
  Serial.println("Upload queue was full; oldest records were discarded.");
}

void enqueueUpload(const char* path, const String& body) {
  if (!filesystemReady) {
    Serial.printf("Not queued (%s): %s\n", path, body.c_str());
    return;
  }
  File queue = LittleFS.open(QUEUE_FILE, FILE_APPEND);
  if (!queue) {
    Serial.println("Could not open upload queue.");
    return;
  }
  queue.print(path);
  queue.print('\t');
  queue.println(body);
  queue.close();
  trimUploadQueue();
}

bool configureTls(WiFiClientSecure& client) {
  if (TLS_ALLOW_INSECURE) {
    client.setInsecure();
    return true;
  }
  if (strlen(TLS_ROOT_CA) == 0) {
    Serial.println("TLS verification requested, but TLS_ROOT_CA is empty.");
    return false;
  }
  client.setCACert(TLS_ROOT_CA);
  return true;
}

int postJson(const String& path, const String& body) {
  WiFiClientSecure client;
  if (!configureTls(client)) return -1;

  HTTPClient http;
  const String url = String(Config::API_BASE_URL) + path;
  if (!http.begin(client, url)) {
    Serial.printf("Could not begin POST %s\n", path.c_str());
    return -1;
  }
  http.setConnectTimeout(Config::HTTP_TIMEOUT_MS);
  http.setTimeout(Config::HTTP_TIMEOUT_MS);
  http.setReuse(false);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", TERRAPOD_API_KEY);
  const int status = http.POST(body);
  if (status < 200 || status >= 300) {
    Serial.printf("POST %s failed: HTTP %d, %s\n", path.c_str(), status,
                  status > 0 ? http.getString().c_str() : http.errorToString(status).c_str());
  } else {
    Serial.printf("POST %s saved: HTTP %d\n", path.c_str(), status);
  }
  http.end();
  return status;
}

void flushUploadQueue() {
  if (!filesystemReady || !LittleFS.exists(QUEUE_FILE) || WiFi.status() != WL_CONNECTED) return;

  File input = LittleFS.open(QUEUE_FILE, FILE_READ);
  LittleFS.remove(QUEUE_TEMP_FILE);
  File output = LittleFS.open(QUEUE_TEMP_FILE, FILE_WRITE);
  if (!input || !output) {
    if (input) input.close();
    if (output) output.close();
    return;
  }

  bool canSend = true;
  uint32_t attempts = 0;
  while (input.available()) {
    String line = input.readStringUntil('\n');
    line.trim();
    if (line.isEmpty()) continue;

    const int separator = line.indexOf('\t');
    if (separator < 1) {
      Serial.println("Discarding malformed upload-queue record.");
      continue;
    }

    if (canSend && attempts < Config::MAX_UPLOADS_PER_WAKE) {
      const String path = line.substring(0, separator);
      const String body = line.substring(separator + 1);
      ++attempts;
      const int status = postJson(path, body);
      if (status >= 200 && status < 300) continue;
      canSend = false;  // preserve ordering and retry this item next wake
    }
    output.println(line);
  }
  input.close();
  output.close();

  LittleFS.remove(QUEUE_BACKUP_FILE);
  LittleFS.rename(QUEUE_FILE, QUEUE_BACKUP_FILE);
  if (LittleFS.rename(QUEUE_TEMP_FILE, QUEUE_FILE)) LittleFS.remove(QUEUE_BACKUP_FILE);
  else LittleFS.rename(QUEUE_BACKUP_FILE, QUEUE_FILE);
}

void goToSleep() {
  stopPump();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  Wire.end();
  Serial.printf("Sleeping for %lu minutes.\n", Config::READING_INTERVAL_MINUTES);
  Serial.flush();
  const uint64_t sleepUs = static_cast<uint64_t>(Config::READING_INTERVAL_MINUTES) * 60ULL * 1000000ULL;
  esp_sleep_enable_timer_wakeup(sleepUs);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(750);
  Serial.println("\nTerraPod measurement cycle starting.");

  initFilesystem();
  initPump();
  stopPump();
  initSensors();

  Measurements readings = readSensors();
  printMeasurementSummary(readings);
  const bool wifiConnected = connectWifi();
  const time_t now = wifiConnected ? syncClock() : time(nullptr);
  const String timestamp = isoTimestamp(now);
  float pumpSecondsToday = updateAndLoadDailyPumpBudget(now);

  bool watered = false;
  if (shouldWater(readings, pumpSecondsToday) && pumpPwmReady) {
    runPump();
    watered = true;
    pumpSecondsToday += Config::PUMP_BURST_SECONDS;
    saveDailyPumpBudget(pumpSecondsToday);

    // Let tank movement settle briefly, then report the float sensor's actual
    // post-watering level rather than subtracting an estimated amount.
    delay(2000);
    readings.waterRaw = readWaterLevelRaw();
    readings.waterOk = rawWaterLevelToMl(readings.waterRaw, readings.waterMl);
  }

  const String wateringJson = watered ? makeWateringJson(timestamp) : String();
  const String readingJson = makeReadingJson(readings, timestamp);
  if (filesystemReady) {
    if (watered) enqueueUpload(Config::WATERINGS_PATH, wateringJson);
    enqueueUpload(Config::READINGS_PATH, readingJson);
    if (wifiConnected) flushUploadQueue();
  } else if (wifiConnected) {
    // LittleFS failure should remove retry protection, not all uploads.
    if (watered) postJson(Config::WATERINGS_PATH, wateringJson);
    postJson(Config::READINGS_PATH, readingJson);
  }
  goToSleep();
}

void loop() {
  // setup() completes one wake/read/water/upload cycle, then deep-sleeps.
}

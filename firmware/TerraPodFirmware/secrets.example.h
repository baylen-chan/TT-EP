#pragma once

// ASSEMBLY/DEPLOYMENT TODO [SECRETS]: Copy this file to secrets.h, then fill in all three values.
// secrets.h is ignored by Git and must never be committed.
constexpr char WIFI_SSID[] = "YOUR_WIFI_NAME";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char TERRAPOD_API_KEY[] = "THE_SAME_VALUE_AS_RENDER_API_KEY";

// SECURITY REVIEW [TLS]: Quick prototype setting. The connection is encrypted, but the ESP32 does
// not verify that the remote certificate really belongs to the backend.
// Keep this true only on a network you trust. For authenticated TLS, set it to
// false and paste the PEM root CA used by the backend into TLS_ROOT_CA.
constexpr bool TLS_ALLOW_INSECURE = true;
constexpr char TLS_ROOT_CA[] = R"CERT(
)CERT";

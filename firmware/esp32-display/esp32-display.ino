// Mine Edge node: reports telemetry and shows the gateway's verdict on its own screen.
//
// The gateway does the deciding and the formatting; this sketch prints what it is
// told, one line at a time, so there is no JSON parser and no threshold logic on the
// microcontroller. Change a limit on the Pi and every node's screen follows.
//
// Libraries (Arduino Library Manager): Adafruit SSD1306, Adafruit GFX.
// Board: any ESP32. Wiring: OLED SDA->21, SCL->22, VCC->3V3, GND->GND.

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---- configure for your site -------------------------------------------------
const char* WIFI_SSID     = "mine-wifi";
const char* WIFI_PASSWORD = "change-me";
const char* GATEWAY       = "http://192.168.1.13:3000";   // the Raspberry Pi
const char* DEVICE_ID     = "ESP32-002";
const char* DEVICE_TOKEN  = "";                            // only if DEVICE_AUTH_ENABLED=true
const unsigned long SEND_EVERY_MS    = 5000;
const unsigned long REFRESH_EVERY_MS = 5000;
// ------------------------------------------------------------------------------

Adafruit_SSD1306 display(128, 64, &Wire, -1);
unsigned long lastSend = 0, lastRefresh = 0;

void show(const String& body) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  int line = 0, start = 0;
  while (start <= body.length() && line < 8) {
    int nl = body.indexOf('\n', start);
    if (nl < 0) nl = body.length();
    String text = body.substring(start, nl);
    // A line the gateway marked urgent gets inverted so it reads across the dark.
    bool urgent = text.startsWith("!") || text.startsWith("*");
    display.setCursor(0, line * 8);
    if (urgent) { display.fillRect(0, line * 8, 128, 8, SSD1306_WHITE); display.setTextColor(SSD1306_BLACK); }
    display.print(text);
    if (urgent) display.setTextColor(SSD1306_WHITE);
    start = nl + 1; line++;
  }
  display.display();
}

void sendTelemetry() {
  // Replace these with real sensor reads; the gateway accepts any nested shape.
  String payload = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"data\":{"
    + "\"battery\":" + String(analogRead(34) / 40.95, 1)
    + ",\"temperature\":" + String(25.0 + (millis() % 9000) / 1000.0, 1)
    + ",\"gas\":{\"ch4\":0.3,\"co\":4.0,\"o2\":20.7}}}";
  HTTPClient http;
  http.begin(String(GATEWAY) + "/api/v1/telemetry");
  http.addHeader("content-type", "application/json");
  if (strlen(DEVICE_TOKEN)) http.addHeader("x-device-token", DEVICE_TOKEN);
  http.POST(payload);
  http.end();
}

void refreshDisplay() {
  HTTPClient http;
  http.begin(String(GATEWAY) + "/api/v1/devices/" + DEVICE_ID + "/display?format=text");
  if (strlen(DEVICE_TOKEN)) http.addHeader("x-device-token", DEVICE_TOKEN);
  int code = http.GET();
  // Hold the last good screen rather than blanking it: a stale reading is more use
  // underground than an empty display, so say it is stale instead of clearing.
  if (code == 200) show(http.getString());
  else show(String(DEVICE_ID) + "\nNO GATEWAY\nHTTP " + String(code) + "\nshowing last known");
  http.end();
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println("no OLED at 0x3C"); }
  show(String(DEVICE_ID) + "\nconnecting...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(400); Serial.print("."); }
  Serial.println(WiFi.localIP());
  refreshDisplay();
}

void loop() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); delay(1000); return; }
  if (now - lastSend >= SEND_EVERY_MS) { lastSend = now; sendTelemetry(); }
  if (now - lastRefresh >= REFRESH_EVERY_MS) { lastRefresh = now; refreshDisplay(); }
  delay(50);
}

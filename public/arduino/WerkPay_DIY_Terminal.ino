// 1. WiFi & Networking MUST be first to avoid conflicts with Arduino.h/Wire.h
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// 2. Hardware & Arduino libraries
#include <Arduino.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_PN532.h>
#include <Keypad.h>
#include <ArduinoJson.h>

// --- FIX VOOR HIGH/LOW CONFLICT ---
// Forceer un-def van macro's die door LwIP/WiFi kunnen worden meegebracht
#ifdef HIGH
#undef HIGH
#endif
#ifdef LOW
#undef LOW
#endif
#define HIGH 0x1
#define LOW 0x0

// --- CONFIGURATIE ---
const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";
const String serverUrl = "https://ais-dev-u5o2vxsevxwj4r73cqquj5-766620080537.europe-west2.run.app";

// --- HARDWARE CONFIG ---
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_PN532 nfc(13, 12, &Wire); 

const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'}, {'4','5','6','B'}, {'7','8','9','C'}, {'*','0','#','D'}
};
byte rowPins[ROWS] = {11, 10, 9, 8};
byte colPins[COLS] = {7, 6, 5, 4};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// --- SYSTEEM STATUS ---
enum SysteemStatus { STATUS_IDLE, LINKING, PAYING };
SysteemStatus mode = STATUS_IDLE;
String actieveGebruiker = "";
String ingevoerdePin = "";
String actieveUid = "";

WiFiClientSecure client;

void setup() {
  Serial.begin(115200);
  lcd.init(); lcd.backlight();
  WiFi.begin(ssid, password);
  lcd.print("WiFi...");
  while (WiFi.status() != WL_CONNECTED) delay(500);
  client.setInsecure();
  nfc.begin(); nfc.SAMConfig();
  lcd.clear(); lcd.print("WerkPay USB");
}

void loop() {
  // 1. Polling: Vraag aan server
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(client, serverUrl + "/api/hardware/status");
    int code = http.GET();
    if (code == 200) {
      JsonDocument doc; deserializeJson(doc, http.getString());
      const char* status = doc["status"];
      
      if (strcmp(status, "LINK") == 0) { 
        mode = LINKING; actieveGebruiker = doc["username"].as<String>(); 
        lcd.clear(); lcd.print("Koppel: "); lcd.setCursor(0,1); lcd.print(actieveGebruiker); 
      }
      else if (strcmp(status, "PAY") == 0) { 
        mode = PAYING; lcd.clear(); lcd.print("Scan Pas..."); 
      }
      else if (strcmp(status, "IDLE") == 0) {
        if (mode != STATUS_IDLE) { // Reset alleen als we niet al IDLE waren
          mode = STATUS_IDLE;
          lcd.clear(); lcd.print("WerkPay USB");
        }
      }
    }
    http.end();
  }

  // 2. NFC Logica
  uint8_t uid[7]; uint8_t len;
  if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &len, 10)) {
    actieveUid = "";
    for(int i=0; i<len; i++) actieveUid += String(uid[i], HEX);
    actieveUid.toUpperCase();

    if (mode == LINKING) {
      HTTPClient http; http.begin(client, serverUrl + "/api/hardware/link-card");
      http.addHeader("Content-Type", "application/json");
      String json = "{\"username\":\"" + actieveGebruiker + "\",\"uid\":\"" + actieveUid + "\"}";
      http.POST(json); http.end();
      mode = STATUS_IDLE; lcd.clear(); lcd.print("Gekoppeld!"); delay(2000);
    } 
    else if (mode == PAYING) {
      lcd.clear(); lcd.print("PIN Invoeren:"); ingevoerdePin = "";
    }
  }

  // 3. Keypad logica
  if (mode == PAYING && actieveUid != "") {
    char key = keypad.getKey();
    if (key) {
      if (key == '#') { 
        HTTPClient http; http.begin(client, serverUrl + "/api/hardware/verify-payment");
        http.addHeader("Content-Type", "application/json");
        String json = "{\"uid\":\"" + actieveUid + "\",\"pin\":\"" + ingevoerdePin + "\"}";
        int res = http.POST(json);
        lcd.clear(); lcd.print(res == 200 ? "Betaling OK!" : "Geweigerd!");
        delay(2000); mode = STATUS_IDLE; http.end();
      } else if (key >= '0' && key <= '9') {
        ingevoerdePin += key;
        lcd.setCursor(0, 1); lcd.print(ingevoerdePin);
      }
    }
  }
  delay(1000);
}

/*
 * ==============================================================================
 *  WERKPAY - DIY PINAPPARAAT (RASPBERRY PI PICO W + FIREBASE CLOUD RELAY)
 * ==============================================================================
 *  Microcontroller : Raspberry Pi Pico W (RP2040)
 *  Verbinding      : Direct via WiFi + HTTPS naar Firebase Firestore REST API
 *                    (Geen browser cookies of proxy-redirects nodig!)
 *  I2C Bus (LCD + NFC): SDA = GP4 (Pin 6), SCL = GP5 (Pin 7)
 *  Keypad 4x4      : Rijen = GP6, GP7, GP8, GP9 | Kolommen = GP10, GP11, GP12, GP13
 *  Buzzer          : GP14 (Pin 19)
 * ==============================================================================
 */

// 1. Netwerk & JSON headers ALTIJD EERST (voorkomt 'CLOSED'/'HIGH' macro-conflict in lwip/tcpbase.h)
#include <Arduino.h>
#ifdef CLOSED
  #undef CLOSED
#endif
#ifdef OPEN
  #undef OPEN
#endif
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// 2. Hardware libraries DAARNA (Keypad.h definieert zelf CLOSED=HIGH)
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_PN532.h>
#include <Keypad.h>

// --- WIFI & FIREBASE CONFIGURATIE ---
const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

// Directe Firestore REST endpoint (geen Cloud Run cookies nodig)
const char* FIRESTORE_DOC_URL =
  "https://firestore.googleapis.com/v1/projects/gen-lang-client-0031413083/databases/ai-studio-werkpayposwe-c139ebd2-3939-4781-ab60-f1b99421ae53/documents/hardware_terminals/pico_main?key=AIzaSyD9k7jmxRN-Xs2vX598yaUKhUAijPPA9fg";

// --- HARDWARE PINOUT (RASPBERRY PI PICO W) ---
#define I2C_SDA_PIN 4
#define I2C_SCL_PIN 5
#define BUZZER_PIN  14
#define PN532_IRQ   2
#define PN532_RESET 3

LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET, &Wire);

const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {6, 7, 8, 9};
byte colPins[COLS] = {10, 11, 12, 13};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// --- SYSTEEM STATUS ---
enum TerminalState {
  STATE_IDLE,
  STATE_LINKING,
  STATE_WAITING_CARD,
  STATE_WAITING_PIN,
  STATE_WAITING_RESULT
};

TerminalState currentState = STATE_IDLE;
String activeUsername = "";
String pendingAmount = "0.00";
String pendingOrderNo = "0";
String scannedUid = "";
String enteredPin = "";
unsigned long stateTimer = 0;
unsigned long lastPollMs = 0;

WiFiClientSecure secureClient;

void beep(int freq, int ms) {
  tone(BUZZER_PIN, freq, ms);
  delay(ms);
  noTone(BUZZER_PIN);
}

void lcdShow(const String& line1, const String& line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void setIdleScreen() {
  currentState = STATE_IDLE;
  activeUsername = "";
  pendingAmount = "0.00";
  pendingOrderNo = "0";
  scannedUid = "";
  enteredPin = "";
  lcdShow("WerkPay Terminal", "Klaar voor order");
}

void updatePinDisplay() {
  lcd.setCursor(9, 1);
  lcd.print("       ");
  lcd.setCursor(9, 1);
  for (unsigned int i = 0; i < enteredPin.length(); i++) {
    lcd.print("*");
  }
}

bool patchFirestore(const String& maskQuery, const JsonDocument& doc) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[FIREBASE] Kan niet patchen: geen WiFi");
    return false;
  }

  String body;
  serializeJson(doc, body);

  String url = String(FIRESTORE_DOC_URL) + maskQuery;
  HTTPClient http;
  secureClient.setInsecure();
  http.setTimeout(5000);

  if (!http.begin(secureClient, url)) {
    Serial.println("[FIREBASE] http.begin mislukt");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int code = http.sendRequest("PATCH", body);
  Serial.print("[FIREBASE] PATCH code: ");
  Serial.println(code);

  if (code < 200 || code >= 300) {
    Serial.print("[FIREBASE] Fout: ");
    Serial.println(http.errorToString(code));
    Serial.println(http.getString());
    http.end();
    return false;
  }

  http.end();
  return true;
}

void patchStatusIdle(const String& reason = "") {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "IDLE";
  fields["reason"]["stringValue"] = reason;
  fields["scannedUid"]["stringValue"] = "";
  fields["enteredPin"]["stringValue"] = "";
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=reason&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=enteredPin&updateMask.fieldPaths=updatedAt",
    doc
  );
}

void patchCardScanned(const String& uid) {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "CARD_SCANNED";
  fields["scannedUid"]["stringValue"] = uid;
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=updatedAt",
    doc
  );
}

void patchPaymentSubmitted(const String& uid, const String& pin) {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "SUBMITTED";
  fields["scannedUid"]["stringValue"] = uid;
  fields["enteredPin"]["stringValue"] = pin;
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=enteredPin&updateMask.fieldPaths=updatedAt",
    doc
  );
}

void pollFirestore() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  secureClient.setInsecure();
  http.setTimeout(5000);

  if (!http.begin(secureClient, FIRESTORE_DOC_URL)) {
    Serial.println("[FIREBASE] Poll begin mislukt");
    return;
  }

  int code = http.GET();
  if (code == 404) {
    Serial.println("[FIREBASE] Document bestaat nog niet, initialiseren naar IDLE...");
    http.end();
    patchStatusIdle("Boot");
    return;
  }

  if (code != 200) {
    Serial.print("[FIREBASE] Poll HTTP fout: ");
    Serial.print(code);
    Serial.print(" - ");
    Serial.println(http.errorToString(code));
    http.end();
    return;
  }

  String payload = http.getString();
  http.end();

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.print("[JSON] Parse fout: ");
    Serial.println(err.c_str());
    return;
  }

  JsonObject fields = doc["fields"];
  String status = fields["status"]["stringValue"] | "IDLE";

  if (currentState == STATE_IDLE) {
    if (status == "LINK") {
      activeUsername = fields["username"]["stringValue"] | "gebruiker";
      currentState = STATE_LINKING;
      stateTimer = millis();
      Serial.println("[MODUS] LINK ontvangen voor: " + activeUsername);
      beep(2400, 100);
      lcdShow("Koppel pas:", activeUsername);
    } else if (status == "PAY") {
      double amt = 0.0;
      if (fields["amount"]["doubleValue"].is<double>()) {
        amt = fields["amount"]["doubleValue"].as<double>();
      } else if (fields["amount"]["integerValue"].is<const char*>()) {
        amt = atof(fields["amount"]["integerValue"].as<const char*>());
      }
      pendingAmount = String(amt, 2);
      pendingOrderNo = fields["orderNo"]["integerValue"] | "0";
      currentState = STATE_WAITING_CARD;
      stateTimer = millis();
      Serial.println("[MODUS] PAY ontvangen: EUR " + pendingAmount + " (Order #" + pendingOrderNo + ")");
      beep(2400, 100);
      lcdShow("WerkPay EUR " + pendingAmount, "Scan pas / kaart");
    }
  } else if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD) {
    if (status == "IDLE") {
      Serial.println("[MODUS] Web app keerde terug naar IDLE");
      setIdleScreen();
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (status == "LINKED") {
      Serial.println("[RESULT] Pas succesvol gekoppeld!");
      beep(2200, 100);
      beep(2800, 180);
      lcdShow("Pas Gekoppeld!", activeUsername);
      delay(2500);
      patchStatusIdle("");
      setIdleScreen();
    } else if (status == "APPROVED") {
      Serial.println("[RESULT] Betaling GOEDGEKEURD!");
      beep(2000, 100);
      beep(2500, 100);
      beep(3000, 200);
      lcdShow("Betaling Gelukt!", "Eet smakelijk! :)");
      delay(3000);
      patchStatusIdle("");
      setIdleScreen();
    } else if (status == "DECLINED") {
      String reason = fields["reason"]["stringValue"] | "Geweigerd";
      Serial.println("[RESULT] Betaling AFGEWEZEN: " + reason);
      beep(700, 250);
      beep(500, 400);
      lcdShow("Afgewezen!", reason);
      delay(3000);
      patchStatusIdle("");
      setIdleScreen();
    } else if (status == "IDLE") {
      setIdleScreen();
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.println("\n=== WerkPay Pico W Terminal (Firebase Cloud) ===");

  pinMode(BUZZER_PIN, OUTPUT);

  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.begin();

  lcd.init();
  lcd.backlight();
  lcdShow("WerkPay Pico W", "WiFi verbinden..");

  Serial.print("[WIFI] Verbinden met: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] Online! IP: ");
    Serial.println(WiFi.localIP());
    lcdShow("WiFi Online!", WiFi.localIP().toString());
    delay(1000);
  } else {
    Serial.println("[WIFI] Verbinding mislukt!");
    lcdShow("WiFi Fout!", "Controleer SSID");
    delay(2000);
  }

  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("[NFC] PN532 niet gevonden op I2C (GP4/GP5)!");
    lcdShow("NFC Fout!", "Check GP4/GP5");
    delay(1500);
  } else {
    Serial.print("[NFC] PN532 gevonden! Firmware v");
    Serial.print((versiondata >> 16) & 0xFF, DEC);
    Serial.print(".");
    Serial.println((versiondata >> 8) & 0xFF, DEC);
    nfc.SAMConfig();
  }

  secureClient.setInsecure();
  patchStatusIdle("Online");
  beep(2000, 100);
  beep(3000, 150);
  setIdleScreen();
  Serial.println("[SYSTEM] Gereed!");
}

void loop() {
  unsigned long now = millis();

  // Poll Firebase op gepaste intervallen zonder keypad/NFC te blokkeren
  unsigned long pollInterval = (currentState == STATE_WAITING_RESULT) ? 800 : 1200;
  if (currentState != STATE_WAITING_PIN && (now - lastPollMs >= pollInterval)) {
    lastPollMs = now;
    pollFirestore();
  }

  if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD) {
    char cancelKey = keypad.getKey();
    if (cancelKey == 'D') {
      Serial.println("[KEYPAD] Geannuleerd met D");
      beep(800, 200);
      lcdShow("Geannuleerd!", "");
      patchStatusIdle("Geannuleerd door gebruiker");
      delay(1200);
      setIdleScreen();
      return;
    }

    uint8_t uid[7];
    uint8_t uidLength = 0;
    if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 40) && uidLength > 0) {
      scannedUid = "";
      for (uint8_t i = 0; i < uidLength; i++) {
        if (uid[i] < 0x10) scannedUid += "0";
        scannedUid += String(uid[i], HEX);
      }
      scannedUid.toUpperCase();
      Serial.println("[NFC] Kaart gescand UID: " + scannedUid);
      beep(2500, 120);

      if (currentState == STATE_LINKING) {
        currentState = STATE_WAITING_RESULT;
        stateTimer = millis();
        lcdShow("Pas Gezien!", "Koppelen...");
        patchCardScanned(scannedUid);
      } else {
        currentState = STATE_WAITING_PIN;
        enteredPin = "";
        stateTimer = millis();
        lcdShow("Pas herkend!", "Pincode: ");
      }
    }
  } else if (currentState == STATE_WAITING_PIN) {
    char key = keypad.getKey();
    if (key) {
      Serial.print("[KEYPAD] Toets: ");
      Serial.println(key);

      if (key == 'D') {
        beep(800, 200);
        lcdShow("Geannuleerd!", "");
        patchStatusIdle("Geannuleerd door gebruiker");
        delay(1200);
        setIdleScreen();
        return;
      } else if (key == '*') {
        if (enteredPin.length() > 0) {
          enteredPin.remove(enteredPin.length() - 1);
          beep(1500, 50);
          updatePinDisplay();
        }
      } else if (key == '#' || key == 'A') {
        if (enteredPin.length() >= 4) {
          beep(2800, 150);
          currentState = STATE_WAITING_RESULT;
          stateTimer = millis();
          lcdShow("Verifieren...", "Even geduld a.u.b.");
          patchPaymentSubmitted(scannedUid, enteredPin);
        } else {
          beep(600, 300);
        }
      } else if (key >= '0' && key <= '9') {
        if (enteredPin.length() < 6) {
          enteredPin += key;
          beep(2000, 40);
          updatePinDisplay();
        }
      }
    }

    if (now - stateTimer > 45000) {
      Serial.println("[PIN] Timeout");
      lcdShow("PIN Timeout", "");
      patchStatusIdle("PIN timeout");
      delay(1500);
      setIdleScreen();
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (now - stateTimer > 25000) {
      Serial.println("[RESULT] Timeout wachtend op POS");
      setIdleScreen();
    }
  }
}

/*
 * ==============================================================================
 *  WERKPAY - DIY PINAPPARAAT (RASPBERRY PI PICO W + FIREBASE CLOUD RELAY)
 * ==============================================================================
 *  - Ghost-toets vrije keypad scanner (dubbele verificatie + key-release)
 *  - Schone TLS Keep-Alive HTTPS client met automatische socket-recovery (werkt
 *    onbeperkt vaak achter elkaar zonder opnieuw opstarten!)
 *  - Verbeterde 16x2 LCD teksten (altijd passend, zonder afgekapte essentie)
 *  - Exacte hardware pinout:
 *      LCD & PN532 NFC (I2C): SDA = GP4, SCL = GP5 (PN532 IRQ=-1, RESET=-1)
 *      4x4 Matrix Keypad    : Rijen = {13, 12, 11, 10}, Kolommen = {9, 8, 7, 6}
 *      Buzzer               : GP14
 * ==============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_PN532.h>

// --- WIFI & FIREBASE CONFIGURATIE ---
const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";

const char* FIRESTORE_DOC_URL =
  "https://firestore.googleapis.com/v1/projects/gen-lang-client-0031413083/databases/ai-studio-werkpayposwe-c139ebd2-3939-4781-ab60-f1b99421ae53/documents/hardware_terminals/pico_main?key=AIzaSyD9k7jmxRN-Xs2vX598yaUKhUAijPPA9fg";

// --- HARDWARE PINOUT (RASPBERRY PI PICO W) ---
#define I2C_SDA_PIN 4
#define I2C_SCL_PIN 5
#define BUZZER_PIN  14
#define PN532_IRQ   (-1)
#define PN532_RESET (-1)

LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET, &Wire);

// --- GHOST-VRIJE KEYPAD CONFIGURATIE ---
const byte ROWS = 4;
const byte COLS = 4;

char hexaKeys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

byte rowPins[ROWS] = {13, 12, 11, 10};
byte colPins[COLS] = {9, 8, 7, 6};

unsigned long laatsteToetsTijd = 0;
const unsigned long DEBOUNCE_DELAY = 300;
bool toetsIngedruktVorigeKeer = false;

enum TerminalState {
  STATE_IDLE,
  STATE_LINKING,
  STATE_WAITING_CARD,
  STATE_WAITING_PIN,
  STATE_WAITING_RESULT,
  STATE_SHOW_RESULT
};

TerminalState currentState = STATE_IDLE;
String activeUsername = "";
String pendingAmount = "0.00";
String pendingOrderNo = "0";
String scannedUid = "";
String enteredPin = "";
String lastReceiptCard = "";
String lastReceiptAmount = "";
bool betalingGeslaagd = false;

unsigned long stateTimer = 0;
unsigned long resultDurationMs = 2400;
unsigned long lastPollMs = 0;

WiFiClientSecure secureClient;

void beep(int freq, int ms) {
  tone(BUZZER_PIN, freq, ms);
  delay(ms);
  noTone(BUZZER_PIN);
}

String pad16(const String& s) {
  String clean = s;
  clean.replace("\xC3\xAB", "e");
  clean.replace("\xC3\xA9", "e");
  clean.replace("\xC3\xAF", "i");
  clean.replace("\xE2\x82\xAC", "EUR");
  if (clean.length() > 16) {
    clean = clean.substring(0, 16);
  }
  while (clean.length() < 16) {
    clean += ' ';
  }
  return clean;
}

void lcdShow(const String& line1, const String& line2) {
  lcd.setCursor(0, 0);
  lcd.print(pad16(line1));
  lcd.setCursor(0, 1);
  lcd.print(pad16(line2));
}

String formatShortReason(const String& rawReason) {
  String low = rawReason;
  low.toLowerCase();
  if (low.indexOf("saldo") >= 0) return "Te weinig saldo!";
  if (low.indexOf("pin") >= 0 || low.indexOf("wachtwoord") >= 0) return "Foute pincode!";
  if (low.indexOf("kaart") >= 0 || low.indexOf("pas") >= 0 || low.indexOf("uid") >= 0 || low.indexOf("autorisatie") >= 0) {
    return "Pas onbekend!";
  }
  if (low.indexOf("geblokkeerd") >= 0 || low.indexOf("ban") >= 0) return "Pas geblokkeerd";
  if (rawReason.length() == 0) return "Mislukt";
  return rawReason.substring(0, 16);
}

void setIdleScreen() {
  currentState = STATE_IDLE;
  activeUsername = "";
  pendingAmount = "0.00";
  pendingOrderNo = "0";
  scannedUid = "";
  enteredPin = "";
  if (betalingGeslaagd) {
    lcdShow("WerkPay Terminal", "D = Print Bon");
  } else {
    lcdShow("WerkPay Terminal", "Wacht op kassa..");
  }
}

void toonPincodeScherm() {
  lcdShow("#OK *Wis  A=Stop", "PIN: ");
}

void updatePinDisplay() {
  lcd.setCursor(5, 1);
  String stars = "";
  for (unsigned int i = 0; i < enteredPin.length() && i < 11; i++) {
    stars += "*";
  }
  while (stars.length() < 11) {
    stars += " ";
  }
  lcd.print(stars);
}

// Ghost-toets vrije scanner: dubbele verificatie (200us) + key-release detectie + debounce
char scanKeypad() {
  char gevondenToets = 0;

  for (int c = 0; c < COLS; c++) {
    digitalWrite(colPins[c], LOW);
    delayMicroseconds(30);

    for (int r = 0; r < ROWS; r++) {
      if (digitalRead(rowPins[r]) == LOW) {
        delayMicroseconds(200);
        if (digitalRead(rowPins[r]) == LOW) {
          gevondenToets = hexaKeys[r][c];
          break;
        }
      }
    }
    digitalWrite(colPins[c], HIGH);
    if (gevondenToets != 0) break;
  }

  if (gevondenToets == 0) {
    toetsIngedruktVorigeKeer = false;
    return 0;
  }

  if (toetsIngedruktVorigeKeer) {
    return 0;
  }

  if (millis() - laatsteToetsTijd < DEBOUNCE_DELAY) {
    return 0;
  }

  toetsIngedruktVorigeKeer = true;
  laatsteToetsTijd = millis();
  return gevondenToets;
}

// Schone HTTPS-hulpfunctie: leest ALTIJD de response uit en sluit/heropent bij fouten
bool firestoreRequest(const String& method, const String& url, const String& body, int& outCode, String& outPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(ssid, password);
    unsigned long startWait = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startWait < 3000) {
      delay(50);
    }
    if (WiFi.status() != WL_CONNECTED) {
      outCode = -99;
      return false;
    }
  }

  for (int attempt = 0; attempt < 2; attempt++) {
    HTTPClient http;
    secureClient.setInsecure();
    secureClient.setTimeout(3500);
    http.setReuse(true);
    http.setTimeout(3500);

    if (!http.begin(secureClient, url)) {
      http.end();
      secureClient.stop();
      outCode = -100;
      continue;
    }

    if (method == "PATCH") {
      http.addHeader("Content-Type", "application/json");
    }
    http.addHeader("Connection", "keep-alive");

    outCode = (method == "GET") ? http.GET() : http.sendRequest(method.c_str(), body);

    if (outCode > 0) {
      outPayload = http.getString();
      http.end();
      return true;
    }

    Serial.print("[HTTP] Herstel TLS socket na foutcode: ");
    Serial.println(outCode);
    http.end();
    secureClient.stop();
    delay(25);
  }
  return false;
}

bool patchFirestore(const String& maskQuery, const JsonDocument& doc) {
  String body;
  serializeJson(doc, body);
  String url = String(FIRESTORE_DOC_URL) + maskQuery;
  int code = 0;
  String resp;
  if (!firestoreRequest("PATCH", url, body, code, resp)) return false;
  return (code >= 200 && code < 300);
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

void annuleerDirect() {
  Serial.println("Transactie geannuleerd door gebruiker.");
  beep(800, 120);
  lcdShow("Geannuleerd!", "Terug naar start");
  patchStatusIdle("Geannuleerd door gebruiker");
  currentState = STATE_SHOW_RESULT;
  stateTimer = millis();
  resultDurationMs = 900;
}

void simuleerBonPrinten() {
  lcdShow("Bon geprint!", "Zie USB Monitor");
  Serial.println("\n====== WERKPAY KASSABON ======");
  Serial.println("Terminal: #001 (CLOUD)");
  Serial.print("Kaart:    ****-****-****-");
  Serial.println(lastReceiptCard.length() >= 4 ? lastReceiptCard.substring(0, 4) : "****");
  Serial.println("Omschrijving: WerkPay Transactie");
  Serial.println("Bedrag:   EUR " + lastReceiptAmount);
  Serial.println("Status:   SUCCES / BETAALD");
  Serial.println("==============================\n");
  betalingGeslaagd = false;
  currentState = STATE_SHOW_RESULT;
  stateTimer = millis();
  resultDurationMs = 1500;
}

void startLinkingState(const String& user) {
  activeUsername = user;
  currentState = STATE_LINKING;
  stateTimer = millis();
  beep(2400, 90);
  lcdShow("Koppel: " + activeUsername, "Houd pas  A=Stop");
}

void startPayState(const String& amtStr, const String& ordNo) {
  pendingAmount = amtStr;
  pendingOrderNo = ordNo;
  currentState = STATE_WAITING_CARD;
  stateTimer = millis();
  beep(2400, 90);

  String topLine = "EUR " + pendingAmount;
  if (pendingOrderNo != "0" && (topLine.length() + 2 + pendingOrderNo.length()) <= 16) {
    topLine += " #" + pendingOrderNo;
  }
  lcdShow(topLine, "Houd pas  A=Stop");
}

void pollFirestore() {
  int code = 0;
  String payload;
  if (!firestoreRequest("GET", String(FIRESTORE_DOC_URL), "", code, payload)) {
    return;
  }

  if (code == 404) {
    patchStatusIdle("Boot");
    return;
  }
  if (code != 200) {
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, payload)) return;
  JsonObject fields = doc["fields"];
  String status = fields["status"]["stringValue"] | "IDLE";

  if (currentState == STATE_IDLE || currentState == STATE_SHOW_RESULT) {
    if (status == "LINK") {
      startLinkingState(fields["username"]["stringValue"] | "gebruiker");
    } else if (status == "PAY") {
      double amt = 0.0;
      if (fields["amount"]["doubleValue"].is<double>()) {
        amt = fields["amount"]["doubleValue"].as<double>();
      } else if (fields["amount"]["integerValue"].is<const char*>()) {
        amt = atof(fields["amount"]["integerValue"].as<const char*>());
      }
      startPayState(String(amt, 2), fields["orderNo"]["integerValue"] | "0");
    }
  } else if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD || currentState == STATE_WAITING_PIN) {
    if (status == "IDLE") {
      beep(700, 100);
      lcdShow("Geannuleerd!", "Door kassa");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 900;
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (status == "LINKED") {
      beep(2200, 100); beep(2800, 180);
      lcdShow("Pas gekoppeld!", activeUsername);
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 2200;
    } else if (status == "APPROVED") {
      lastReceiptCard = scannedUid;
      lastReceiptAmount = pendingAmount;
      betalingGeslaagd = true;
      beep(2000, 100); beep(2500, 100); beep(3000, 200);
      lcdShow("Betaald! Bedankt", "EUR " + pendingAmount + " OK");
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 2500;
    } else if (status == "DECLINED") {
      betalingGeslaagd = false;
      String reason = fields["reason"]["stringValue"] | "Geweigerd";
      beep(700, 220); beep(500, 320);
      lcdShow("Geweigerd!", formatShortReason(reason));
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 2600;
    } else if (status == "IDLE") {
      setIdleScreen();
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);

  for (int i = 0; i < ROWS; i++) {
    pinMode(rowPins[i], INPUT_PULLUP);
  }
  for (int i = 0; i < COLS; i++) {
    pinMode(colPins[i], OUTPUT);
    digitalWrite(colPins[i], HIGH);
  }

  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.begin();

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcdShow("WerkPay Terminal", "WiFi verbinden..");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(400);
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    lcdShow("WiFi Verbonden!", WiFi.localIP().toString());
    delay(700);
  } else {
    lcdShow("WiFi Fout!", "Check WiFi naam");
    delay(1500);
  }

  nfc.begin();
  if (nfc.getFirmwareVersion()) {
    nfc.SAMConfig();
  }

  secureClient.setInsecure();
  patchStatusIdle("Online");
  beep(2000, 100);
  beep(3000, 150);
  setIdleScreen();
}

void loop() {
  unsigned long now = millis();

  // 1. Scan keypad ALTIJD eerst zodat Annuleren/toetsen direct reageren
  char key = scanKeypad();

  if (currentState == STATE_IDLE || currentState == STATE_SHOW_RESULT) {
    if (key == 'D' && betalingGeslaagd) {
      simuleerBonPrinten();
      return;
    }
    if (currentState == STATE_SHOW_RESULT && (now - stateTimer >= resultDurationMs)) {
      setIdleScreen();
      return;
    }
  } else if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD) {
    if (key == 'A' || key == 'D') {
      annuleerDirect();
      return;
    }

    uint8_t uid[7];
    uint8_t uidLength = 0;
    if (nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 20) && uidLength > 0) {
      scannedUid = "";
      for (uint8_t i = 0; i < uidLength; i++) {
        if (uid[i] < 0x10) scannedUid += "0";
        scannedUid += String(uid[i], HEX);
      }
      scannedUid.toUpperCase();
      beep(2500, 100);

      if (currentState == STATE_LINKING) {
        currentState = STATE_WAITING_RESULT;
        stateTimer = millis();
        lcdShow("Pas gescand!", "Koppelen...");
        patchCardScanned(scannedUid);
      } else {
        currentState = STATE_WAITING_PIN;
        enteredPin = "";
        stateTimer = millis();
        toonPincodeScherm();
      }
      return;
    }
  } else if (currentState == STATE_WAITING_PIN) {
    if (key) {
      stateTimer = now;
      if (key == 'A' || key == 'D') {
        annuleerDirect();
        return;
      } else if (key == '*' || key == 'C') {
        if (enteredPin.length() > 0) {
          enteredPin.remove(enteredPin.length() - 1);
          beep(1500, 45);
          updatePinDisplay();
        }
      } else if (key == '#') {
        if (enteredPin.length() >= 4) {
          beep(2800, 120);
          currentState = STATE_WAITING_RESULT;
          stateTimer = millis();
          lcdShow("Controleren...", "Even geduld...");
          patchPaymentSubmitted(scannedUid, enteredPin);
          return;
        } else {
          beep(600, 200);
        }
      } else if (key >= '0' && key <= '9') {
        if (enteredPin.length() < 6) {
          enteredPin += key;
          beep(2000, 35);
          updatePinDisplay();
        }
      }
    }

    if (now - stateTimer > 45000) {
      lcdShow("Tijd verstreken", "Opnieuw scannen");
      patchStatusIdle("PIN timeout");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 1500;
      return;
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (key == 'A' || key == 'D') {
      annuleerDirect();
      return;
    }
    if (now - stateTimer > 25000) {
      lcdShow("Geen reactie", "Terug naar start");
      patchStatusIdle("Timeout");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 1500;
      return;
    }
  }

  // 2. Slimme polling (snelle schone Keep-Alive; tijdens PIN alleen als even niet getypt wordt)
  unsigned long pollInterval = (currentState == STATE_WAITING_PIN) ? 1200 : 550;
  bool magPollen = (currentState != STATE_WAITING_PIN) || (now - laatsteToetsTijd > 650);
  if (magPollen && (now - lastPollMs >= pollInterval)) {
    lastPollMs = now;
    pollFirestore();
  }
}

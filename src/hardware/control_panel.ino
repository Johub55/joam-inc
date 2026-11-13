/*
 * ==============================================================================
 *  WERKPAY - DIY PINAPPARAAT (RASPBERRY PI PICO W + FIREBASE CLOUD RELAY)
 * ==============================================================================
 *  - Ghost-toets vrije keypad scanner (eigen row/col scan met dubbele verificatie)
 *  - Snelle TLS Keep-Alive polling zodat Annuleren direct werkt (< 1 sec)
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
const unsigned long DEBOUNCE_DELAY = 320;
bool toetsIngedruktVorigeKeer = false;

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
String lastReceiptCard = "";
String lastReceiptAmount = "";
bool betalingGeslaagd = false;

unsigned long stateTimer = 0;
unsigned long lastPollMs = 0;

WiFiClientSecure secureClient;
HTTPClient sharedHttp;

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
  if (betalingGeslaagd) {
    lcdShow("=== WERK_PAY ===", "D: Print Bon");
  } else {
    lcdShow("WerkPay Terminal", "Klaar voor order");
  }
}

void toonPincodeScherm() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("PIN + # | A=Stop");
  lcd.setCursor(0, 1);
  lcd.print("PIN: ");
}

void updatePinDisplay() {
  lcd.setCursor(5, 1);
  lcd.print("           ");
  lcd.setCursor(5, 1);
  for (unsigned int i = 0; i < enteredPin.length(); i++) {
    lcd.print("*");
  }
}

// Ghost-toets vrije scanner: dubbele verificatie (200us) + key-release detectie + debounce
char scanKeypad() {
  char gevondenToets = 0;

  for (int c = 0; c < COLS; c++) {
    digitalWrite(colPins[c], LOW);
    delayMicroseconds(30);

    for (int r = 0; r < ROWS; r++) {
      if (digitalRead(rowPins[r]) == LOW) {
        // Dubbele check tegen elektromagnetische storing / ghost toetsen
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

  // Wacht op loslaten voordat dezelfde/volgende toets opnieuw telt (voorkomt dubbelklikken)
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

bool patchFirestore(const String& maskQuery, const JsonDocument& doc) {
  if (WiFi.status() != WL_CONNECTED) return false;
  String body;
  serializeJson(doc, body);
  String url = String(FIRESTORE_DOC_URL) + maskQuery;

  secureClient.setInsecure();
  sharedHttp.setReuse(true);
  sharedHttp.setTimeout(2500);
  if (!sharedHttp.begin(secureClient, url)) return false;
  sharedHttp.addHeader("Content-Type", "application/json");
  sharedHttp.addHeader("Connection", "keep-alive");
  int code = sharedHttp.sendRequest("PATCH", body);
  if (code < 200 || code >= 300) {
    sharedHttp.end();
    return false;
  }
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

void annuleerDirect() {
  Serial.println("Transactie direct geannuleerd door gebruiker.");
  beep(800, 120);
  lcdShow("Afgebroken...", "Even geduld");
  patchStatusIdle("Geannuleerd door gebruiker");
  delay(450);
  setIdleScreen();
}

void simuleerBonPrinten() {
  lcdShow("Bon printen...", "Zie monitor!");
  Serial.println("\n======= WERK_PAY KASSABON =======");
  Serial.println("Terminal: #001 (CLOUD)");
  Serial.print("Kaart:    ****-****-****-");
  Serial.println(lastReceiptCard.length() >= 4 ? lastReceiptCard.substring(0, 4) : "****");
  Serial.println("Omschrijving: WerkPay Transactie");
  Serial.println("Bedrag:   EUR " + lastReceiptAmount);
  Serial.println("Status:   SUCCES / BETAALD");
  Serial.println("=================================\n");
  delay(1500);
  betalingGeslaagd = false;
  setIdleScreen();
}

void pollFirestore() {
  if (WiFi.status() != WL_CONNECTED) return;

  secureClient.setInsecure();
  sharedHttp.setReuse(true);
  sharedHttp.setTimeout(2500);
  if (!sharedHttp.begin(secureClient, FIRESTORE_DOC_URL)) return;
  sharedHttp.addHeader("Connection", "keep-alive");

  int code = sharedHttp.GET();
  if (code == 404) {
    sharedHttp.end();
    patchStatusIdle("Boot");
    return;
  }
  if (code != 200) {
    sharedHttp.end();
    return;
  }
  String payload = sharedHttp.getString();

  JsonDocument doc;
  if (deserializeJson(doc, payload)) return;
  JsonObject fields = doc["fields"];
  String status = fields["status"]["stringValue"] | "IDLE";

  if (currentState == STATE_IDLE) {
    if (status == "LINK") {
      activeUsername = fields["username"]["stringValue"] | "gebruiker";
      currentState = STATE_LINKING;
      stateTimer = millis();
      beep(2400, 90);
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
      beep(2400, 90);
      lcdShow("WerkPay EUR " + pendingAmount, "Scan pas | A=Stop");
    }
  } else if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD || currentState == STATE_WAITING_PIN) {
    if (status == "IDLE") {
      beep(700, 100);
      lcdShow("Geannuleerd", "Via kassa...");
      delay(450);
      setIdleScreen();
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (status == "LINKED") {
      beep(2200, 100); beep(2800, 180);
      lcdShow("Pas Gekoppeld!", activeUsername);
      delay(2000);
      patchStatusIdle("");
      setIdleScreen();
    } else if (status == "APPROVED") {
      lastReceiptCard = scannedUid;
      lastReceiptAmount = pendingAmount;
      betalingGeslaagd = true;
      beep(2000, 100); beep(2500, 100); beep(3000, 200);
      lcdShow("Betaling Gelukt!", "Eet smakelijk! :)");
      delay(2200);
      patchStatusIdle("");
      setIdleScreen();
    } else if (status == "DECLINED") {
      betalingGeslaagd = false;
      String reason = fields["reason"]["stringValue"] | "Geweigerd";
      beep(700, 250); beep(500, 350);
      lcdShow("Afgewezen!", reason);
      delay(2500);
      patchStatusIdle("");
      setIdleScreen();
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
  lcdShow("WERKPAY TERMINAL", "WiFi verbinden..");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(400);
    tries++;
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

  // 1. Scan keypad ALTIJD eerst zodat Annuleren/toetsen meteen reageren
  char key = scanKeypad();

  if (currentState == STATE_IDLE) {
    if (key == 'D' && betalingGeslaagd) {
      simuleerBonPrinten();
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
        lcdShow("Pas Gezien!", "Koppelen...");
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
          lcdShow("Verifieren...", "Even geduld a.u.b.");
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
      lcdShow("PIN Timeout", "");
      patchStatusIdle("PIN timeout");
      delay(800);
      setIdleScreen();
      return;
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (key == 'A' || key == 'D') {
      annuleerDirect();
      return;
    }
    if (now - stateTimer > 25000) {
      setIdleScreen();
      return;
    }
  }

  // 2. Slimme polling (snelle Keep-Alive; tijdens PIN alleen als even niet getypt wordt)
  unsigned long pollInterval = (currentState == STATE_WAITING_PIN) ? 1200 : 550;
  bool magPollen = (currentState != STATE_WAITING_PIN) || (now - laatsteToetsTijd > 650);
  if (magPollen && (now - lastPollMs >= pollInterval)) {
    lastPollMs = now;
    pollFirestore();
  }
}

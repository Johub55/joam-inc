/*
 * ==============================================================================
 *  WERKPAY - DIY PINAPPARAAT (RASPBERRY PI PICO W + FIREBASE CLOUD RELAY)
 * ==============================================================================
 *  - Multi-Terminal support (eigen Terminal-ID zelf instellen via code / AP / USB)
 *  - Werkt voor Betalingen, NFC Pas-Login & Vergrendelen
 *  - Slaat WiFi & Terminal-ID op in EEPROM: vul ze direct in bovenaan de .INO
 *    of stel ze draadloos in via de hotspot WerkPay-Setup (192.168.4.1)
 *  - Vereiste Arduino Libraries (Library Manager):
 *      1. LiquidCrystal I2C (Frank de Brabander / Marco Schwartz)
 *      2. Adafruit PN532 (Adafruit)
 *      3. ArduinoJson (Benoit Blanchon - versie 7+)
 *  - Exacte hardware pinout (Raspberry Pi Pico W):
 *      LCD (0x27) & PN532 (I2C): SDA = GP4, SCL = GP5 (IRQ=-1, RESET=-1)
 *      4x4 Matrix Keypad       : Rijen = {13, 12, 11, 10}, Kolommen = {9, 8, 7, 6}
 *      Buzzer                  : GP14
 * ==============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <EEPROM.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_PN532.h>

// --- WIFI, TERMINAL & FIREBASE CONFIGURATIE ---
const char* ssid = "JOUW_WIFI_NAAM";
const char* password = "JOUW_WIFI_WACHTWOORD";
const char* terminalId = "";

const char* FIRESTORE_DOC_BASE =
  "https://firestore.googleapis.com/v1/projects/gen-lang-client-0031413083/databases/ai-studio-werkpayposwe-c139ebd2-3939-4781-ab60-f1b99421ae53/documents/hardware_terminals/";
const char* FIRESTORE_API_KEY = "AIzaSyD9k7jmxRN-Xs2vX598yaUKhUAijPPA9fg";

// --- HARDWARE PINOUT (RASPBERRY PI PICO W) ---
#define I2C_SDA_PIN 4
#define I2C_SCL_PIN 5
#define BUZZER_PIN  14
#define PN532_IRQ   (-1)
#define PN532_RESET (-1)

LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_PN532 nfc(PN532_IRQ, PN532_RESET, &Wire);
WebServer setupPortalServer(80);

// --- EEPROM WIFI & TERMINAL OPSLAG ---
struct WifiPrefsV1 {
  char magic[4];
  char ssid[64];
  char pass[64];
};

struct WifiPrefsV2 {
  char magic[4];
  char ssid[64];
  char pass[64];
  char terminalId[32];
};

String activeSsid = "";
String activePass = "";
String activeTerminalId = "";
bool apPortalActive = false;
String serialRxBuffer = "";

// --- GHOST-VRIJE KEYPAD CONFIGURATIE ---
const byte ROWS = 4;
const byte COLS = 4;

char hexaKeys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};

byte rowPins[ROWS] = {13, 12, 11, 10};
byte colPins[COLS] = {9, 8, 7, 6};

unsigned long laatsteToetsTijd = 0;
unsigned long lastKeyActivityMs = 0;
const unsigned long KEY_PRESS_DEBOUNCE_MS = 14;
const unsigned long KEY_RELEASE_DEBOUNCE_MS = 30;
char debouncedKey = 0;
char candidateKey = 0;
unsigned long candidateSinceMs = 0;

unsigned long buzzerOffAt = 0;
bool buzzerActive = false;
bool nfcReady = false;
bool nfcScanArmed = false;
unsigned long nfcArmedAtMs = 0;
unsigned long lastNfcScanMs = 0;
unsigned long lastNfcReadyCheckMs = 0;
unsigned long lastNfcRecoverMs = 0;
byte nfcConsecutiveErrors = 0;
const unsigned long NFC_SCAN_INTERVAL_MS = 160;

enum TerminalState {
  STATE_IDLE,
  STATE_LINKING,
  STATE_WAITING_CARD,
  STATE_WAITING_PIN,
  STATE_CHECK_CARD,
  STATE_WAITING_RESULT,
  STATE_SHOW_RESULT
};

TerminalState currentState = STATE_IDLE;
String activeUsername = "";
String pendingAmount = "0.00";
String pendingOrderNo = "0";
bool isLoginSession = false;
String scannedUid = "";
String enteredPin = "";
String lastReceiptCard = "";
String lastReceiptAmount = "";
bool betalingGeslaagd = false;

unsigned long stateTimer = 0;
unsigned long resultDurationMs = 2400;
unsigned long lastPollMs = 0;

WiFiClientSecure secureClient;

// --- EXPLICIETE FUNCTIE-DECLARATIES (VOORKOMT ARDUINO IDE PROTOTYPE FOUTEN) ---
String getFirestoreDocUrl();
String sanitizeTerminalId(const String& raw);
String escapeHtmlAttr(const String& raw);
void beep(int freq, int ms);
void beepAsync(int freq, int ms);
void updateBuzzer();
String pad16(const String& s);
void lcdShow(const String& line1, const String& line2);
String formatShortReason(const String& rawReason);
void saveConfigToEeprom(const String& newSsid, const String& newPass, const String& newTermId);
void loadWifiConfig();
void handlePortalRoot();
void handlePortalSave();
void startApSetupPortal();
bool connectWifiBlocking(int maxTries);
void handleSerialCommands();
void setIdleScreen();
void toonPincodeScherm();
void updatePinDisplay();
void resetKeypadState();
char readRawKeypadOnce();
char readRawKeypadStable();
char scanKeypad();
void recoverI2CAndNfc();
bool pollNfcCardNonBlocking(String& outUid);
bool firestoreRequestEx(const String& method, const String& url, const String& body, int& outCode, String& outPayload, int maxAttempts, unsigned long timeoutMs);
bool firestoreRequest(const String& method, const String& url, const String& body, int& outCode, String& outPayload);
bool patchFirestore(const String& maskQuery, const JsonDocument& doc);
bool patchStatusIdle(const String& reason = "");
bool patchCardScanned(const String& uid);
bool patchCheckCard(const String& uid);
bool patchPaymentSubmitted(const String& uid, const String& pin);
void annuleerDirect();
void simuleerBonPrinten();
void startBalanceCheckState();
void startLinkingState(const String& user);
void startPayState(double amt, const String& ordNo, const String& payUser);
void pollFirestore();

String getFirestoreDocUrl() {
  if (activeTerminalId.length() == 0) return String("");
  return String(FIRESTORE_DOC_BASE) + activeTerminalId + "?key=" + String(FIRESTORE_API_KEY);
}

String sanitizeTerminalId(const String& raw) {
  String out = "";
  for (unsigned int i = 0; i < raw.length() && out.length() < 30; i++) {
    char c = raw.charAt(i);
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
      out += c;
    } else if (c == ' ') {
      out += '_';
    }
  }
  return out;
}

String escapeHtmlAttr(const String& raw) {
  String out = raw;
  out.replace("&", "&amp;");
  out.replace("'", "&#39;");
  out.replace("\"", "&quot;");
  out.replace("<", "&lt;");
  out.replace(">", "&gt;");
  return out;
}

void beep(int freq, int ms) {
  buzzerActive = false;
  tone(BUZZER_PIN, freq, ms);
  delay(ms);
  noTone(BUZZER_PIN);
}

void beepAsync(int freq, int ms) {
  tone(BUZZER_PIN, freq);
  buzzerOffAt = millis() + (unsigned long)ms;
  buzzerActive = true;
}

void updateBuzzer() {
  if (buzzerActive && (long)(millis() - buzzerOffAt) >= 0) {
    noTone(BUZZER_PIN);
    buzzerActive = false;
  }
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

void saveConfigToEeprom(const String& newSsid, const String& newPass, const String& newTermId) {
  WifiPrefsV2 prefs;
  memset(&prefs, 0, sizeof(prefs));
  memcpy(prefs.magic, "WPW2", 4);
  newSsid.substring(0, 63).toCharArray(prefs.ssid, sizeof(prefs.ssid));
  newPass.substring(0, 63).toCharArray(prefs.pass, sizeof(prefs.pass));
  String safeTid = sanitizeTerminalId(newTermId);
  safeTid.substring(0, 31).toCharArray(prefs.terminalId, sizeof(prefs.terminalId));
  EEPROM.put(0, prefs);
  EEPROM.commit();
  activeSsid = newSsid.substring(0, 63);
  activePass = newPass.substring(0, 63);
  activeTerminalId = safeTid;
}

void loadWifiConfig() {
  String compiledSsid = String(ssid);
  compiledSsid.trim();
  String compiledPass = String(password);
  String defaultTid = String(terminalId);
  defaultTid.trim();

  bool hasSketchSsid = (compiledSsid.length() > 0 && compiledSsid != "JOUW_WIFI_NAAM" && !compiledSsid.startsWith("__WP_SSID"));
  bool hasSketchTid = (defaultTid.length() > 0 && !defaultTid.startsWith("__WP_"));

  if (hasSketchTid) {
    activeTerminalId = sanitizeTerminalId(defaultTid);
  }

  if (hasSketchSsid) {
    activeSsid = compiledSsid.substring(0, 63);
    activePass = (compiledPass == "JOUW_WIFI_WACHTWOORD" || compiledPass.startsWith("__WP_"))
      ? String("")
      : compiledPass.substring(0, 63);
    Serial.println("[CONFIG] WiFi uit sketch code: " + activeSsid + " | Terminal=" + activeTerminalId);

    if (activeTerminalId.length() > 0) {
      WifiPrefsV2 existing;
      EEPROM.get(0, existing);
      existing.ssid[sizeof(existing.ssid) - 1] = '\0';
      existing.pass[sizeof(existing.pass) - 1] = '\0';
      existing.terminalId[sizeof(existing.terminalId) - 1] = '\0';
      bool eepromMatches = (memcmp(existing.magic, "WPW2", 4) == 0) &&
        (String(existing.ssid) == activeSsid) &&
        (String(existing.pass) == activePass) &&
        (String(existing.terminalId) == activeTerminalId);
      if (!eepromMatches) {
        saveConfigToEeprom(activeSsid, activePass, activeTerminalId);
      }
      return;
    }
  }

  WifiPrefsV2 prefsV2;
  EEPROM.get(0, prefsV2);
  if (memcmp(prefsV2.magic, "WPW2", 4) == 0) {
    prefsV2.ssid[sizeof(prefsV2.ssid) - 1] = '\0';
    prefsV2.pass[sizeof(prefsV2.pass) - 1] = '\0';
    prefsV2.terminalId[sizeof(prefsV2.terminalId) - 1] = '\0';

    if (strlen(prefsV2.terminalId) > 0 && activeTerminalId.length() == 0) {
      activeTerminalId = sanitizeTerminalId(String(prefsV2.terminalId));
    }
    if (!hasSketchSsid && strlen(prefsV2.ssid) > 0) {
      activeSsid = String(prefsV2.ssid);
      activePass = String(prefsV2.pass);
      Serial.println("[CONFIG] Geladen uit EEPROM (WPW2): " + activeSsid + " | Terminal=" + activeTerminalId);
      return;
    }
  }

  WifiPrefsV1 prefsV1;
  EEPROM.get(0, prefsV1);
  if (memcmp(prefsV1.magic, "WPW1", 4) == 0) {
    prefsV1.ssid[sizeof(prefsV1.ssid) - 1] = '\0';
    prefsV1.pass[sizeof(prefsV1.pass) - 1] = '\0';
    if (!hasSketchSsid && strlen(prefsV1.ssid) > 0) {
      activeSsid = String(prefsV1.ssid);
      activePass = String(prefsV1.pass);
      Serial.println("[WIFI] Inladen uit EEPROM (WPW1): " + activeSsid);
      return;
    }
  }

  if (!hasSketchSsid) {
    Serial.println("[CONFIG] Geen WiFi opgeslagen");
  }
}

void handlePortalRoot() {
  int n = WiFi.scanNetworks();
  String options = "";
  for (int i = 0; i < n; i++) {
    String net = WiFi.SSID(i);
    if (net.length() > 0) {
      String safeNet = escapeHtmlAttr(net);
      options += "<option value='" + safeNet + "'>" + safeNet + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    }
  }
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>WerkPay WiFi &amp; Terminal Setup</title>"
                "<style>body{font-family:sans-serif;background:#020617;color:#f8fafc;padding:20px;max-width:420px;margin:auto}"
                "input,select,button{width:100%;padding:12px;margin:8px 0;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;box-sizing:border-box}"
                "label{font-size:12px;color:#94a3b8;font-weight:bold;display:block;margin-top:8px}"
                "button{background:#06b6d4;color:#020617;font-weight:bold;border:none;margin-top:12px}</style></head><body>"
                "<h2>WerkPay Pinapparaat Setup</h2><p>Stel je WiFi-netwerk en het Terminal-ID in:</p>"
                "<form method='POST' action='/save'>"
                "<label>Gescande WiFi-netwerken</label>"
                "<select onchange=\"document.getElementById('s').value=this.value\"><option value=''>-- Scan resultaten --</option>" + options + "</select>"
                "<label>WiFi Naam (SSID)</label>"
                "<input id='s' name='ssid' placeholder='WiFi Naam (SSID)' required value='" + escapeHtmlAttr(activeSsid) + "'>"
                "<label>WiFi Wachtwoord (leeg = open netwerk)</label>"
                "<input name='pass' type='password' placeholder='WiFi Wachtwoord'>"
                "<label>Terminal ID (zelf instellen, verplicht)</label>"
                "<input name='termid' placeholder='Bijv. kassa1 of bar1' required value='" + escapeHtmlAttr(activeTerminalId) + "'>"
                "<button type='submit'>Opslaan &amp; Verbinden</button></form></body></html>";
  setupPortalServer.send(200, "text/html", html);
}

void handlePortalSave() {
  String s = setupPortalServer.arg("ssid");
  String p = setupPortalServer.arg("pass");
  String t = setupPortalServer.arg("termid");
  s.trim();
  t.trim();
  String nextTid = t.length() > 0 ? sanitizeTerminalId(t) : activeTerminalId;
  if (s.length() == 0 || nextTid.length() == 0) {
    setupPortalServer.send(400, "text/plain", "WiFi SSID en Terminal ID zijn verplicht.");
    return;
  }
  saveConfigToEeprom(s, p, nextTid);
  Serial.println("[SETUP] Opgeslagen: SSID=" + s + " Terminal=" + nextTid);
  setupPortalServer.send(200, "text/html", "<html><body style='font-family:sans-serif;background:#020617;color:#10b981;padding:24px'><h2>Opgeslagen!</h2><p>Terminal <b>" + escapeHtmlAttr(nextTid) + "</b> herstart nu en verbindt met " + escapeHtmlAttr(s) + "...</p></body></html>");
  lcdShow("WiFi Opgeslagen", nextTid);
  delay(800);
  rp2040.reboot();
}

void startApSetupPortal() {
  if (apPortalActive) return;
  apPortalActive = true;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP("WerkPay-Setup");
  setupPortalServer.on("/", HTTP_GET, handlePortalRoot);
  setupPortalServer.on("/save", HTTP_POST, handlePortalSave);
  setupPortalServer.begin();
  Serial.println("[SETUP] Hotspot actief: 'WerkPay-Setup' -> http://192.168.4.1");
  if (activeTerminalId.length() == 0 && WiFi.status() == WL_CONNECTED) {
    lcdShow("Geen Terminal-ID", "AP:192.168.4.1");
  } else {
    lcdShow("WiFi:WerkPay-Set", "IP: 192.168.4.1");
  }
}

bool connectWifiBlocking(int maxTries) {
  if (activeSsid.length() == 0) return false;
  Serial.println("[WIFI] Verbinden met '" + activeSsid + "' (2.4 GHz)...");
  WiFi.disconnect();
  delay(120);
  WiFi.mode(WIFI_STA);
  if (activePass.length() == 0) {
    WiFi.begin(activeSsid.c_str());
  } else {
    WiFi.begin(activeSsid.c_str(), activePass.c_str());
  }
  for (int i = 0; i < maxTries; i++) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("[WIFI] Verbonden! IP=" + WiFi.localIP().toString());
      return true;
    }
    delay(350);
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WIFI] Verbonden! IP=" + WiFi.localIP().toString());
    return true;
  }
  Serial.println("[WIFI] Verbinden mislukt (status=" + String((int)WiFi.status()) + ")");
  return false;
}

void handleSerialCommands() {
  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      String cmd = serialRxBuffer;
      serialRxBuffer = "";
      cmd.trim();
      if (cmd == "PING") {
        Serial.println("PONG:WERKPAY_TERMINAL:" + activeTerminalId);
      } else if (cmd == "CLEAR_WIFI") {
        WifiPrefsV2 empty;
        memset(&empty, 0, sizeof(empty));
        EEPROM.put(0, empty);
        EEPROM.commit();
        activeSsid = "";
        activePass = "";
        activeTerminalId = "";
        Serial.println("WIFI_CLEARED");
      } else if (cmd.startsWith("SET_TERM:")) {
        String newTerm = sanitizeTerminalId(cmd.substring(9));
        if (newTerm.length() > 0) {
          saveConfigToEeprom(activeSsid, activePass, newTerm);
          Serial.println("TERM_SAVED:" + activeTerminalId);
          lcdShow("Terminal ID:", activeTerminalId);
          beep(2400, 100);
          delay(900);
          setIdleScreen();
        } else {
          Serial.println("ERR:EMPTY_TERM");
        }
      } else if (cmd.startsWith("SET_WIFI:")) {
        String rest = cmd.substring(9);
        int sep1 = rest.indexOf('\t');
        if (sep1 < 0) sep1 = rest.indexOf('|');
        String newSsid = (sep1 >= 0) ? rest.substring(0, sep1) : rest;
        String newPass = "";
        String newTerm = activeTerminalId;
        if (sep1 >= 0) {
          String afterPass = rest.substring(sep1 + 1);
          int sep2 = afterPass.indexOf('\t');
          if (sep2 < 0) sep2 = afterPass.indexOf('|');
          if (sep2 >= 0) {
            newPass = afterPass.substring(0, sep2);
            String rawT = afterPass.substring(sep2 + 1);
            rawT.trim();
            if (rawT.length() > 0) newTerm = sanitizeTerminalId(rawT);
          } else {
            newPass = afterPass;
          }
        }
        newSsid.trim();
        if (newSsid.length() > 0) {
          saveConfigToEeprom(newSsid, newPass, newTerm);
          apPortalActive = false;
          lcdShow("Nieuwe WiFi...", newSsid);
          if (connectWifiBlocking(30)) {
            Serial.println("WIFI_SAVED:" + activeSsid + " TERM=" + activeTerminalId + " IP=" + WiFi.localIP().toString());
            lcdShow("WiFi Verbonden!", WiFi.localIP().toString());
            beep(2400, 120);
            delay(800);
            setIdleScreen();
          } else {
            Serial.println("WIFI_SAVED:" + activeSsid + " (verbinden mislukt)");
            startApSetupPortal();
          }
        }
      }
    } else if (serialRxBuffer.length() < 192) {
      serialRxBuffer += ch;
    }
  }
}

void setIdleScreen() {
  bool wasBusy = (currentState != STATE_IDLE);
  currentState = STATE_IDLE;
  nfcScanArmed = false;
  activeUsername = "";
  pendingAmount = "0.00";
  pendingOrderNo = "0";
  isLoginSession = false;
  scannedUid = "";
  enteredPin = "";
  if (apPortalActive && WiFi.status() != WL_CONNECTED) {
    lcdShow("WiFi:WerkPay-Set", "IP: 192.168.4.1");
  } else if (activeTerminalId.length() == 0) {
    lcdShow("Geen Terminal-ID", apPortalActive ? "AP:192.168.4.1" : "Stel in USB / AP");
  } else {
    lcdShow("WerkPay Terminal", "");
  }
  if (wasBusy) {
    Serial.println("[STATE] Klaar (IDLE)");
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

void resetKeypadState() {
  debouncedKey = 0;
  candidateKey = 0;
  candidateSinceMs = millis();
  lastKeyActivityMs = millis();
}

// High-Z matrix scan met actieve ontlading en anti-ghosting (negeert meerdere toetsen tegelijk)
char readRawKeypadOnce() {
  char gevonden = 0;
  byte aantalIngedrukt = 0;

  for (int c = 0; c < COLS; c++) {
    pinMode(colPins[c], OUTPUT);
    digitalWrite(colPins[c], LOW);
    delayMicroseconds(80);

    for (int r = 0; r < ROWS; r++) {
      if (digitalRead(rowPins[r]) == LOW) {
        gevonden = hexaKeys[r][c];
        aantalIngedrukt++;
      }
    }

    // Kolom kort HIGH sturen voor High-Z voorkomt overspraak door kabelcapaciteit
    digitalWrite(colPins[c], HIGH);
    delayMicroseconds(12);
    pinMode(colPins[c], INPUT);
  }

  return (aantalIngedrukt == 1) ? gevonden : 0;
}

// Dubbele controle tegen RF/WiFi storingsspikes
char readRawKeypadStable() {
  char r1 = readRawKeypadOnce();
  if (r1 == 0) return 0;
  delayMicroseconds(150);
  char r2 = readRawKeypadOnce();
  return (r1 == r2) ? r1 : 0;
}

// Stabiele state-machine debounce: snelle invoer zonder dubbele of gemiste toetsen
char scanKeypad() {
  char raw = readRawKeypadStable();
  unsigned long now = millis();

  if (raw != 0) {
    lastKeyActivityMs = now;
  }

  if (raw != candidateKey) {
    candidateKey = raw;
    candidateSinceMs = now;
    return 0;
  }

  if (candidateKey != debouncedKey) {
    unsigned long neededMs = (candidateKey == 0) ? KEY_RELEASE_DEBOUNCE_MS : KEY_PRESS_DEBOUNCE_MS;
    if (now - candidateSinceMs >= neededMs) {
      debouncedKey = candidateKey;
      if (debouncedKey != 0) {
        laatsteToetsTijd = now;
        return debouncedKey;
      }
    }
  }

  return 0;
}

// Herstelt een vastgelopen I2C-bus (bijv. na PN532 RF-piek) zonder reboot
void recoverI2CAndNfc() {
  unsigned long now = millis();
  if (now - lastNfcRecoverMs < 2500) return;
  lastNfcRecoverMs = now;
  nfcScanArmed = false;

  Serial.println("[NFC] I2C & PN532 herstel uitvoeren...");
  Wire.end();
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(I2C_SCL_PIN, OUTPUT);
  for (int i = 0; i < 9; i++) {
    digitalWrite(I2C_SCL_PIN, LOW);
    delayMicroseconds(10);
    digitalWrite(I2C_SCL_PIN, HIGH);
    delayMicroseconds(10);
  }
  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeout(25);
  Wire.begin();
  delay(20);

  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (versiondata) {
    nfc.SAMConfig();
    nfc.setPassiveActivationRetries(0x01);
    nfcReady = true;
    nfcConsecutiveErrors = 0;
    Serial.println("[NFC] PN532 hersteld!");
  } else {
    nfcReady = false;
    Serial.println("[NFC] PN532 reageert nog niet op I2C");
  }
}

// Non-blocking NFC detectie: blokkeert loop() nooit zodat Annuleren (A/D) altijd direct werkt
bool pollNfcCardNonBlocking(String& outUid) {
  unsigned long now = millis();
  if (!nfcReady) {
    if (now - lastNfcRecoverMs >= 3000) {
      recoverI2CAndNfc();
    }
    return false;
  }

  if (!nfcScanArmed) {
    if (now - lastNfcScanMs < NFC_SCAN_INTERVAL_MS) {
      return false;
    }
    lastNfcScanMs = now;
    if (nfc.startPassiveTargetIDDetection(PN532_MIFARE_ISO14443A)) {
      nfcScanArmed = true;
      nfcArmedAtMs = now;
      lastNfcReadyCheckMs = now;
      nfcConsecutiveErrors = 0;
    } else {
      nfcConsecutiveErrors++;
      if (nfcConsecutiveErrors >= 3) {
        recoverI2CAndNfc();
      }
    }
    return false;
  }

  if (now - lastNfcReadyCheckMs >= 20) {
    lastNfcReadyCheckMs = now;
    byte got = Wire.requestFrom((uint8_t)0x24, (uint8_t)1);
    if (got == 1 && Wire.available() >= 1) {
      uint8_t st = Wire.read();
      if (st == 0x01) {
        nfcScanArmed = false;
        lastNfcScanMs = now;
        uint8_t uid[7];
        uint8_t uidLength = 0;
        if (nfc.readDetectedPassiveTargetID(uid, &uidLength) && uidLength > 0) {
          outUid = "";
          for (uint8_t i = 0; i < uidLength; i++) {
            if (uid[i] < 0x10) outUid += "0";
            outUid += String(uid[i], HEX);
          }
          outUid.toUpperCase();
          return true;
        }
        return false;
      }
    }
  }

  if (now - nfcArmedAtMs >= 750) {
    nfcScanArmed = false;
    lastNfcScanMs = now;
  }
  return false;
}

// Schone HTTPS-hulpfunctie: geen hangende BearSSL keep-alive sockets tussen GET en PATCH
bool firestoreRequestEx(const String& method, const String& url, const String& body, int& outCode, String& outPayload, int maxAttempts, unsigned long timeoutMs) {
  static bool wifiLostLogged = false;
  if (WiFi.status() != WL_CONNECTED) {
    if (!wifiLostLogged) {
      Serial.println("[WIFI] Verbinding kwijt, herstellen...");
      wifiLostLogged = true;
    }
    if (activeSsid.length() == 0) {
      outCode = -99;
      return false;
    }
    WiFi.disconnect();
    if (activePass.length() == 0) {
      WiFi.begin(activeSsid.c_str());
    } else {
      WiFi.begin(activeSsid.c_str(), activePass.c_str());
    }
    unsigned long startWait = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startWait < 2500) {
      delay(40);
      yield();
    }
    if (WiFi.status() != WL_CONNECTED) {
      outCode = -99;
      return false;
    }
    Serial.println("[WIFI] Herverbonden! IP=" + WiFi.localIP().toString());
  }
  wifiLostLogged = false;

  for (int attempt = 0; attempt < maxAttempts; attempt++) {
    secureClient.stop();
    yield();

    HTTPClient http;
    secureClient.setInsecure();
    secureClient.setTimeout(timeoutMs);
    http.setReuse(false);
    http.setTimeout(timeoutMs);

    if (!http.begin(secureClient, url)) {
      http.end();
      secureClient.stop();
      outCode = -100;
      delay(25);
      yield();
      continue;
    }

    if (method == "PATCH") {
      http.addHeader("Content-Type", "application/json");
    }
    http.addHeader("Connection", "close");

    outCode = (method == "GET") ? http.GET() : http.sendRequest(method.c_str(), body);
    yield();

    if (outCode > 0) {
      outPayload = http.getString();
      http.end();
      secureClient.stop();
      yield();
      return true;
    }

    Serial.print("[HTTP] Herstel TLS socket na foutcode: ");
    Serial.println(outCode);
    http.end();
    secureClient.stop();
    delay(30);
    yield();
  }
  return false;
}

bool firestoreRequest(const String& method, const String& url, const String& body, int& outCode, String& outPayload) {
  unsigned long t = (currentState == STATE_WAITING_PIN) ? 2000 : 3200;
  return firestoreRequestEx(method, url, body, outCode, outPayload, 2, t);
}

bool patchFirestore(const String& maskQuery, const JsonDocument& doc) {
  if (activeTerminalId.length() == 0) return false;
  String body;
  serializeJson(doc, body);
  String url = getFirestoreDocUrl() + maskQuery;

  for (int retry = 0; retry < 2; retry++) {
    int code = 0;
    String resp;
    if (firestoreRequest("PATCH", url, body, code, resp)) {
      if (code >= 200 && code < 300) {
        return true;
      }
      Serial.println("[CLOUD] PATCH HTTP fout: " + String(code));
    }
    delay(50);
    yield();
  }
  return false;
}

bool patchStatusIdle(const String& reason) {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "IDLE";
  fields["reason"]["stringValue"] = reason;
  fields["scannedUid"]["stringValue"] = "";
  fields["enteredPin"]["stringValue"] = "";
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  return patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=reason&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=enteredPin&updateMask.fieldPaths=updatedAt",
    doc
  );
}

bool patchCardScanned(const String& uid) {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "CARD_SCANNED";
  fields["scannedUid"]["stringValue"] = uid;
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  return patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=updatedAt",
    doc
  );
}

bool patchCheckCard(const String& uid) {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "CHECK_CARD";
  fields["scannedUid"]["stringValue"] = uid;
  fields["enteredPin"]["stringValue"] = "";
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  return patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=enteredPin&updateMask.fieldPaths=updatedAt",
    doc
  );
}

bool patchPaymentSubmitted(const String& uid, const String& pin) {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "SUBMITTED";
  fields["scannedUid"]["stringValue"] = uid;
  fields["enteredPin"]["stringValue"] = pin;
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  return patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=enteredPin&updateMask.fieldPaths=updatedAt",
    doc
  );
}

void annuleerDirect() {
  Serial.println("[STATE] Geannuleerd op keypad");
  nfcScanArmed = false;
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
  Serial.println("Terminal: " + activeTerminalId);
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

void startBalanceCheckState() {
  currentState = STATE_CHECK_CARD;
  nfcScanArmed = false;
  lastNfcScanMs = millis();
  stateTimer = millis();
  resetKeypadState();
  beep(2200, 75);
  Serial.println("[STATE] Saldo checken");
  lcdShow("Scan pas: Saldo", "Houd pas  A=Stop");
}

void startLinkingState(const String& user) {
  activeUsername = user;
  String lowUser = user;
  lowUser.toLowerCase();
  isLoginSession = (
    lowUser.indexOf("inlog") >= 0 ||
    lowUser.indexOf("login") >= 0 ||
    lowUser.indexOf("ontgrendel") >= 0 ||
    lowUser == "werkpay"
  );
  currentState = STATE_LINKING;
  nfcScanArmed = false;
  lastNfcScanMs = millis();
  stateTimer = millis();
  resetKeypadState();
  beep(2400, 90);
  Serial.println(isLoginSession ? "[STATE] Snelle pas-login gestart" : ("[STATE] Pas koppelen: " + activeUsername));
  lcdShow(isLoginSession ? "WerkPay Login" : ("Koppel: " + activeUsername), "Houd pas  A=Stop");
}

void startPayState(double amt, const String& ordNo, const String& payUser) {
  pendingAmount = String(amt, 2);
  pendingOrderNo = ordNo;
  isLoginSession = (amt <= 0.001);
  currentState = STATE_WAITING_CARD;
  nfcScanArmed = false;
  lastNfcScanMs = millis();
  stateTimer = millis();
  resetKeypadState();
  beep(2400, 90);

  String topLine;
  if (isLoginSession) {
    topLine = payUser.length() > 0 ? payUser : "WerkPay Login";
    Serial.println("[STATE] Login/2FA met PIN: " + topLine);
  } else {
    topLine = "EUR " + pendingAmount;
    if (pendingOrderNo != "0" && (topLine.length() + 2 + pendingOrderNo.length()) <= 16) {
      topLine += " #" + pendingOrderNo;
    }
    Serial.println("[STATE] Betaling: EUR " + pendingAmount + " #" + pendingOrderNo);
  }
  lcdShow(topLine, "Houd pas  A=Stop");
}

void pollFirestore() {
  if (activeTerminalId.length() == 0) return;
  static int lastHttpErr = 0;
  int code = 0;
  String payload;
  if (!firestoreRequestEx("GET", getFirestoreDocUrl(), "", code, payload, 1, 1600)) {
    return;
  }

  if (code == 404) {
    if (lastHttpErr != 404) {
      Serial.println("[CLOUD] Terminal doc aanmaken...");
      lastHttpErr = 404;
    }
    patchStatusIdle("Boot");
    return;
  }
  if (code != 200) {
    if (lastHttpErr != code) {
      Serial.println("[CLOUD] HTTP fout: " + String(code));
      lastHttpErr = code;
    }
    return;
  }
  lastHttpErr = 0;

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
      String ordNo = "0";
      if (fields["orderNo"]["integerValue"].is<const char*>()) {
        ordNo = fields["orderNo"]["integerValue"].as<const char*>();
      } else if (fields["orderNo"]["doubleValue"].is<double>()) {
        ordNo = String((long)fields["orderNo"]["doubleValue"].as<double>());
      } else if (fields["orderNo"]["stringValue"].is<const char*>()) {
        ordNo = fields["orderNo"]["stringValue"].as<const char*>();
      }
      String payUser = fields["username"]["stringValue"] | "";
      startPayState(amt, ordNo, payUser);
    }
  } else if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD || currentState == STATE_WAITING_PIN) {
    if (status == "IDLE") {
      Serial.println("[STATE] Geannuleerd door kassa");
      beep(700, 100);
      lcdShow("Geannuleerd!", "Door kassa");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 900;
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (status == "CHECK_RESULT") {
      String holder = fields["username"]["stringValue"] | "WerkPay";
      String reasonRaw = fields["reason"]["stringValue"] | "";
      String tier = "";
      int pipeIdx = reasonRaw.indexOf('|');
      if (pipeIdx >= 0) {
        tier = reasonRaw.substring(pipeIdx + 1);
        tier.trim();
      }

      double bal = 0.0;
      if (fields["amount"]["doubleValue"].is<double>()) {
        bal = fields["amount"]["doubleValue"].as<double>();
      } else if (fields["amount"]["integerValue"].is<const char*>()) {
        bal = atof(fields["amount"]["integerValue"].as<const char*>());
      }
      long coins = 0;
      if (fields["orderNo"]["integerValue"].is<const char*>()) {
        coins = atol(fields["orderNo"]["integerValue"].as<const char*>());
      } else if (fields["orderNo"]["doubleValue"].is<double>()) {
        coins = (long)fields["orderNo"]["doubleValue"].as<double>();
      }

      String line1 = holder;
      if (tier.length() > 0 && (line1.length() + tier.length() + 3) <= 16) {
        line1 += " [" + tier + "]";
      } else if (tier.length() > 0) {
        line1 = holder.substring(0, 10) + " " + tier.substring(0, 5);
      }

      String line2 = "EUR " + String(bal, 2);
      String coinsSuffix = " " + String(coins) + "C";
      if (line2.length() + coinsSuffix.length() <= 16) {
        line2 += coinsSuffix;
      }

      Serial.println("[CLOUD] Saldo: " + holder + " EUR " + String(bal, 2));
      beep(2400, 80);
      beep(3000, 140);
      lcdShow(line1, line2);
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 4500;
    } else if (status == "LINKED") {
      String linkedUser = fields["username"]["stringValue"] | "";
      String lowLinked = linkedUser;
      lowLinked.toLowerCase();
      bool wasLogin = isLoginSession || (lowLinked.indexOf("inlog") >= 0 || lowLinked.indexOf("login") >= 0);
      Serial.println(wasLogin ? "[AUTH] Ingelogd via pas" : ("[LINK] Pas gekoppeld: " + activeUsername));
      beep(2200, 100);
      beep(2800, 180);
      lcdShow(wasLogin ? "Ingelogd!" : "Pas gekoppeld!", wasLogin ? "Welkom!" : activeUsername);
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 2000;
    } else if (status == "APPROVED") {
      beep(2000, 100);
      beep(2500, 100);
      beep(3000, 200);
      if (isLoginSession) {
        Serial.println("[AUTH] Ingelogd met PIN");
        lcdShow("Ingelogd!", "Welkom!");
      } else {
        Serial.println("[PAY] Betaald: EUR " + pendingAmount);
        lastReceiptCard = scannedUid;
        lastReceiptAmount = pendingAmount;
        betalingGeslaagd = true;
        lcdShow("Betaald! Bedankt", "EUR " + pendingAmount + " OK");
      }
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 2500;
    } else if (status == "DECLINED") {
      betalingGeslaagd = false;
      String reason = fields["reason"]["stringValue"] | "Geweigerd";
      Serial.println("[PAY] Geweigerd: " + reason);
      beep(700, 220);
      beep(500, 320);
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
  unsigned long serWait = millis();
  while (!Serial && millis() - serWait < 1200) {
    delay(20);
  }
  Serial.println("[BOOT] WerkPay Terminal start...");

  EEPROM.begin(256);
  pinMode(BUZZER_PIN, OUTPUT);

  for (int i = 0; i < ROWS; i++) {
    pinMode(rowPins[i], INPUT_PULLUP);
  }
  for (int i = 0; i < COLS; i++) {
    pinMode(colPins[i], INPUT);
  }

  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeout(25);
  Wire.begin();
  delay(100);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcdShow("WerkPay Terminal", "WiFi verbinden..");

  loadWifiConfig();
  if (connectWifiBlocking(45)) {
    lcdShow("WiFi Verbonden!", WiFi.localIP().toString());
    delay(700);
    if (activeTerminalId.length() == 0) {
      startApSetupPortal();
      delay(900);
    }
  } else {
    if (activeSsid.length() > 0) {
      lcdShow("WiFi fout (" + String((int)WiFi.status()) + ")", activeSsid);
      delay(1200);
    }
    startApSetupPortal();
    delay(1200);
  }

  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (versiondata) {
    nfc.SAMConfig();
    nfc.setPassiveActivationRetries(0x01);
    nfcReady = true;
    Serial.println("[NFC] PN532 OK (v" + String((versiondata >> 16) & 0xFF) + "." + String((versiondata >> 8) & 0xFF) + ")");
  } else {
    nfcReady = false;
    Serial.println("[NFC] PN532 niet gevonden!");
  }

  secureClient.setInsecure();
  if (WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0) {
    patchStatusIdle("Online");
  }
  Serial.println("[READY] Terminal=" + (activeTerminalId.length() > 0 ? activeTerminalId : String("(geen)")) + " IP=" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("offline")));
  beep(2000, 100);
  beep(3000, 150);
  setIdleScreen();
}

void loop() {
  unsigned long now = millis();

  // 0. Non-blocking buzzer, USB configuratie en AP Setup portaal altijd responsief houden
  updateBuzzer();
  handleSerialCommands();
  if (apPortalActive) {
    setupPortalServer.handleClient();
    if (WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0) {
      apPortalActive = false;
      WiFi.softAPdisconnect(true);
      Serial.println("[WIFI] Online! IP=" + WiFi.localIP().toString() + " Terminal=" + activeTerminalId);
      patchStatusIdle("Online");
      setIdleScreen();
    }
  }

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
  } else if (currentState == STATE_CHECK_CARD) {
    if (key == 'A' || key == 'D') {
      Serial.println("[KEY] Annuleren ingedrukt: " + String(key));
      nfcScanArmed = false;
      beepAsync(800, 100);
      setIdleScreen();
      return;
    }

    String foundUid;
    if (pollNfcCardNonBlocking(foundUid)) {
      scannedUid = foundUid;
      Serial.println("[NFC] Pas check: " + scannedUid);
      beep(2500, 100);

      lcdShow("Pas checken...", "Even geduld...");
      if (patchCheckCard(scannedUid)) {
        currentState = STATE_WAITING_RESULT;
        stateTimer = millis();
      } else {
        Serial.println("[ERR] PATCH check card mislukt");
        beep(600, 220);
        lcdShow("Verbindingsfout", "Probeer opnieuw");
        currentState = STATE_SHOW_RESULT;
        stateTimer = millis();
        resultDurationMs = 1800;
      }
      return;
    }

    if (now - stateTimer > 25000) {
      setIdleScreen();
      return;
    }
  } else if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD) {
    if (key == 'A' || key == 'D') {
      Serial.println("[KEY] Annuleren ingedrukt: " + String(key));
      annuleerDirect();
      return;
    }

    String foundUid;
    if (pollNfcCardNonBlocking(foundUid)) {
      scannedUid = foundUid;
      Serial.println("[NFC] Pas: " + scannedUid);
      beep(2500, 100);

      if (currentState == STATE_LINKING) {
        lcdShow("Pas gescand!", isLoginSession ? "Inloggen..." : "Koppelen...");
        if (patchCardScanned(scannedUid)) {
          currentState = STATE_WAITING_RESULT;
          stateTimer = millis();
        } else {
          Serial.println("[ERR] PATCH card scanned mislukt");
          beep(600, 220);
          lcdShow("Verbindingsfout", "Probeer opnieuw");
          currentState = STATE_SHOW_RESULT;
          stateTimer = millis();
          resultDurationMs = 1800;
        }
      } else {
        currentState = STATE_WAITING_PIN;
        enteredPin = "";
        stateTimer = millis();
        resetKeypadState();
        Serial.println("[PIN] Wacht op pincode...");
        toonPincodeScherm();
      }
      return;
    }

    if (now - stateTimer > 90000) {
      Serial.println("[TIMEOUT] Wachten op pas verlopen");
      lcdShow("Tijd verstreken", "Terug naar start");
      patchStatusIdle("Timeout");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 1500;
      return;
    }
  } else if (currentState == STATE_WAITING_PIN) {
    if (key) {
      stateTimer = now;
      if (key == 'A' || key == 'D') {
        Serial.println("[KEY] Annuleren ingedrukt: " + String(key));
        annuleerDirect();
        return;
      } else if (key == '*' || key == 'C') {
        if (enteredPin.length() > 0) {
          enteredPin.remove(enteredPin.length() - 1);
          beepAsync(1500, 45);
          updatePinDisplay();
        }
      } else if (key == '#') {
        if (enteredPin.length() >= 4) {
          Serial.println("[PIN] Ingevoerd (" + String(enteredPin.length()) + " cijfers)");
          beep(2800, 120);
          lcdShow("Controleren...", "Even geduld...");
          if (patchPaymentSubmitted(scannedUid, enteredPin)) {
            currentState = STATE_WAITING_RESULT;
            stateTimer = millis();
          } else {
            Serial.println("[ERR] PATCH submit mislukt");
            beep(600, 220);
            lcdShow("Verbindingsfout", "Probeer opnieuw");
            currentState = STATE_SHOW_RESULT;
            stateTimer = millis();
            resultDurationMs = 1800;
          }
          return;
        } else {
          Serial.println("[PIN] Minimaal 4 cijfers");
          beepAsync(600, 180);
        }
      } else if (key >= '0' && key <= '9') {
        if (enteredPin.length() < 6) {
          enteredPin += key;
          beepAsync(2000, 35);
          updatePinDisplay();
        }
      }
    }

    if (now - stateTimer > 45000) {
      Serial.println("[TIMEOUT] PIN tijd verstreken");
      lcdShow("Tijd verstreken", "Opnieuw scannen");
      patchStatusIdle("PIN timeout");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 1500;
      return;
    }
  } else if (currentState == STATE_WAITING_RESULT) {
    if (key == 'A' || key == 'D') {
      Serial.println("[KEY] Annuleren ingedrukt: " + String(key));
      annuleerDirect();
      return;
    }
    if (now - stateTimer > 25000) {
      Serial.println("[TIMEOUT] Geen reactie van kassa");
      lcdShow("Geen reactie", "Terug naar start");
      patchStatusIdle("Timeout");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 1500;
      return;
    }
  }

  // 2. Slimme polling (tijdens wachten op pas/PIN minder vaak, zodat NFC & keypad voorrang krijgen)
  unsigned long pollInterval = 650;
  if (currentState == STATE_LINKING || currentState == STATE_WAITING_CARD || currentState == STATE_CHECK_CARD) {
    pollInterval = 2400;
  } else if (currentState == STATE_WAITING_PIN || currentState == STATE_WAITING_RESULT) {
    pollInterval = 1800;
  }
  unsigned long keyQuietMs = (currentState == STATE_WAITING_PIN) ? 2000 : 450;
  bool magPollen = (now - lastKeyActivityMs > keyQuietMs);
  if (WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0 && magPollen && (now - lastPollMs >= pollInterval)) {
    lastPollMs = now;
    pollFirestore();
  }
}

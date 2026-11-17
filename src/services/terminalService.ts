/**
 * Service voor communicatie met het DIY WerkPay Pinapparaat
 * Ondersteunt Web Serial API (Chrome / Edge / Chromium) voor directe USB verbinding met de Arduino,
 * en bevat een ingebouwde simulator voor testen in de browser.
 */

export interface TerminalCallbacks {
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'waiting_card' | 'pin_entered' | 'processing' | 'approved' | 'declined') => void;
  onPaymentData?: (data: { uid: string; pin: string }) => void;
  onCancel?: () => void;
  onLog?: (msg: string) => void;
}

export const ARDUINO_SKETCH_CODE = `/*
 * ==============================================================================
 *  WERKPAY & WERKDONALDS - DIY PINAPPARAAT (POS TERMINAL)
 * ==============================================================================
 *  Hardware componenten:
 *  1. Arduino Uno / Nano / Mega / ESP32 (5V compatibel)
 *  2. 5V I2C LCD Scherm (16x2 of 20x4, PCF8574 backpack op adres 0x27 of 0x3F)
 *  3. 13.56 MHz RFID / NFC Lezer (RC522 module)
 *  4. 4x4 Matrix Toetsenbord (Keypad: 0-9, *, #, A, B, C, D)
 *  5. Optioneel: Passieve/Actieve Buzzer voor audio feedback (D14 / A1)
 *
 *  AANSLUITSCHEMA (Arduino Uno / Nano):
 *  ----------------------------------------------------------------------------
 *  A) 5V I2C LCD Display (1602 / 2004):
 *     - VCC  -> 5V
 *     - GND  -> GND
 *     - SDA  -> Pin A4 (Uno/Nano)
 *     - SCL  -> Pin A5 (Uno/Nano)
 *
 *  B) RFID-RC522 (NFC / RFID lezer):
 *     - 3.3V -> 3.3V (LET OP: RC522 werkt op 3.3V voeding!)
 *     - RST  -> Pin D9
 *     - GND  -> GND
 *     - MISO -> Pin D12 (SPI MISO)
 *     - MOSI -> Pin D11 (SPI MOSI)
 *     - SCK  -> Pin D13 (SPI SCK)
 *     - SDA  -> Pin D10 (SPI SS / Chip Select)
 *
 *  C) 4x4 Matrix Keypad (8 pinnen):
 *     - Rij 1 (R1) -> Pin D2
 *     - Rij 2 (R2) -> Pin D3
 *     - Rij 3 (R3) -> Pin D4
 *     - Rij 4 (R4) -> Pin D5
 *     - Kol 1 (C1) -> Pin D6
 *     - Kol 2 (C2) -> Pin D7
 *     - Kol 3 (C3) -> Pin D8
 *     - Kol 4 (C4) -> Pin A0 (D14)
 *
 *  D) Buzzer (Optioneel):
 *     - Positief (+) -> Pin A1
 *     - Negatief (-) -> GND
 *
 *  VEREISTE ARDUINO LIBRARIES (installeer via Arduino Library Manager):
 *  - "LiquidCrystal I2C" door Frank de Brabander / Marco Schwartz
 *  - "MFRC522" door GithubCommunity
 *  - "Keypad" door Mark Stanley, Alexander Brevig
 * ==============================================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Keypad.h>

#define RST_PIN         9
#define SS_PIN          10
#define BUZZER_PIN      A1

LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522 mfrc522(SS_PIN, RST_PIN);

const byte ROWS = 4; 
const byte COLS = 4; 
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {2, 3, 4, 5};
byte colPins[COLS] = {6, 7, 8, A0};

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

enum TerminalState {
  STATE_IDLE,
  STATE_WAITING_CARD,
  STATE_WAITING_PIN,
  STATE_PROCESSING,
  STATE_RESULT
};

TerminalState currentState = STATE_IDLE;
String pendingAmount = "0.00";
String pendingOrderId = "";
String scannedUid = "";
String enteredPin = "";
unsigned long stateTimer = 0;

void beep(int frequency, int durationMs) {
  #if defined(BUZZER_PIN)
    tone(BUZZER_PIN, frequency, durationMs);
    delay(durationMs);
    noTone(BUZZER_PIN);
  #else
    delay(durationMs);
  #endif
}

void setup() {
  Serial.begin(115200);
  while (!Serial) { ; }

  #if defined(BUZZER_PIN)
    pinMode(BUZZER_PIN, OUTPUT);
  #endif

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WerkPay Terminal");
  lcd.setCursor(0, 1);
  lcd.print("Opstarten...");

  SPI.begin();
  mfrc522.PCD_Init();
  delay(100);

  beep(2000, 100);
  beep(3000, 150);

  setIdleScreen();
  Serial.println("READY:WERKPAY_DIY_V1.0");
}

void setIdleScreen() {
  currentState = STATE_IDLE;
  pendingAmount = "0.00";
  pendingOrderId = "";
  scannedUid = "";
  enteredPin = "";

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WerkPay POS");
  lcd.setCursor(0, 1);
  lcd.print("Klaar voor order");
}

void loop() {
  handleSerialInput();

  switch (currentState) {
    case STATE_IDLE:
      break;

    case STATE_WAITING_CARD:
      char cancelKey = keypad.getKey();
      if (cancelKey == 'D' || cancelKey == '*') {
        beep(800, 200);
        Serial.println("RESULT:CANCELLED");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Geannuleerd!");
        delay(1200);
        setIdleScreen();
        return;
      }

      if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        scannedUid = "";
        for (byte i = 0; i < mfrc522.uid.size; i++) {
          if (mfrc522.uid.uidByte[i] < 0x10) scannedUid += "0";
          scannedUid += String(mfrc522.uid.uidByte[i], HEX);
        }
        scannedUid.toUpperCase();
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();

        beep(2500, 120);

        currentState = STATE_WAITING_PIN;
        enteredPin = "";
        stateTimer = millis();

        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Pas herkend!");
        lcd.setCursor(0, 1);
        lcd.print("Pincode: ");
      }
      break;

    case STATE_WAITING_PIN:
      char key = keypad.getKey();
      if (key) {
        if (key == 'D') {
          beep(800, 200);
          Serial.println("RESULT:CANCELLED");
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Geannuleerd!");
          delay(1200);
          setIdleScreen();
          return;
        } 
        else if (key == '*') {
          if (enteredPin.length() > 0) {
            enteredPin.remove(enteredPin.length() - 1);
            beep(1500, 50);
            updatePinDisplay();
          }
        } 
        else if (key == '#' || key == 'A') {
          if (enteredPin.length() >= 4) {
            beep(2800, 150);
            currentState = STATE_PROCESSING;
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print("Controleren...");
            lcd.setCursor(0, 1);
            lcd.print("Even geduld...");

            Serial.print("RESULT:OK:UID=");
            Serial.print(scannedUid);
            Serial.print(":PIN=");
            Serial.println(enteredPin);
          } else {
            beep(600, 300);
          }
        } 
        else if (key >= '0' && key <= '9') {
          if (enteredPin.length() < 6) {
            enteredPin += key;
            beep(2000, 40);
            updatePinDisplay();
          }
        }
      }

      if (millis() - stateTimer > 30000) {
        Serial.println("RESULT:TIMEOUT");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("PIN Timeout");
        delay(1500);
        setIdleScreen();
      }
      break;

    case STATE_PROCESSING:
      break;

    case STATE_RESULT:
      if (millis() - stateTimer > 3500) {
        setIdleScreen();
      }
      break;
  }
}

void updatePinDisplay() {
  lcd.setCursor(9, 1);
  lcd.print("       ");
  lcd.setCursor(9, 1);
  for (unsigned int i = 0; i < enteredPin.length(); i++) {
    lcd.print("*");
  }
}

void handleSerialInput() {
  if (!Serial.available()) return;

  String line = Serial.readStringUntil('\\n');
  line.trim();
  if (line.length() == 0) return;

  if (line.startsWith("PAY:")) {
    int firstColon = line.indexOf(':');
    int secondColon = line.indexOf(':', firstColon + 1);

    if (secondColon != -1) {
      pendingAmount = line.substring(firstColon + 1, secondColon);
      pendingOrderId = line.substring(secondColon + 1);
    } else {
      pendingAmount = line.substring(firstColon + 1);
      pendingOrderId = "0000";
    }

    currentState = STATE_WAITING_CARD;
    stateTimer = millis();

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("EUR " + pendingAmount);

    lcd.setCursor(0, 1);
    lcd.print("Houd pas  D=Stop");

    beep(2400, 100);
    Serial.println("ACK:WAITING_FOR_CARD");
  }
  else if (line.startsWith("APPROVED")) {
    currentState = STATE_RESULT;
    stateTimer = millis();

    beep(2000, 100);
    beep(2500, 100);
    beep(3000, 200);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Betaald! Bedankt");
    lcd.setCursor(0, 1);
    lcd.print("EUR " + pendingAmount + " OK");
  }
  else if (line.startsWith("DECLINED")) {
    currentState = STATE_RESULT;
    stateTimer = millis();

    beep(700, 250);
    beep(500, 400);

    String reason = "Mislukt!";
    int c = line.indexOf(':');
    if (c != -1) reason = line.substring(c + 1);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Afgewezen!");
    lcd.setCursor(0, 1);
    lcd.print(reason.substring(0, 16));
  }
  else if (line == "RESET" || line == "CANCEL") {
    setIdleScreen();
    Serial.println("ACK:RESET");
  }
  else if (line == "PING") {
    Serial.println("PONG:WERKPAY_PINPAD");
  }
}
`;

export const PICO_W_SKETCH_CODE = `/*
 * ==============================================================================
 *  WERKPAY & WERKDONALDS - DIY PINAPPARAAT (RASPBERRY PI PICO W 2022)
 * ==============================================================================
 *  Microcontroller: Raspberry Pi Pico W (RP2040)
 *  Ontwikkelomgeving: Arduino IDE v2 (met Earle Philhower RP2040 core)
 *  Logische spanning: 3.3V (LET OP: GPIO pinnen zijn NIET 5V tolerant!)
 *
 *  AANSLUITSCHEMA BREADBOARD (Raspberry Pi Pico W):
 *  ----------------------------------------------------------------------------
 *  A) I2C LCD Display (1602 of 2004 met PCF8574 backpack):
 *     - VCC  -> Pin 36 (3V3 OUT - Aanbevolen, I2C pull-ups trekken dan veilig naar 3.3V!)
 *               (Optioneel: Pin 40 VBUS = 5V alleen met bi-directionele logic level shifter)
 *     - GND  -> Pin 8 (GND) of Pin 3
 *     - SDA  -> Pin 6 (GP4 - I2C0 SDA)
 *     - SCL  -> Pin 7 (GP5 - I2C0 SCL)
 *
 *  B) RFID-RC522 (NFC / RFID lezer):
 *     - 3.3V -> Pin 36 (3V3 OUT) [LET OP: Nooit op 5V/VBUS aansluiten!]
 *     - RST  -> Pin 26 (GP20)
 *     - GND  -> Pin 23 (GND) of Pin 38
 *     - MISO -> Pin 21 (GP16 - SPI0 RX)
 *     - MOSI -> Pin 25 (GP19 - SPI0 TX)
 *     - SCK  -> Pin 24 (GP18 - SPI0 SCK)
 *     - SDA  -> Pin 22 (GP17 - SPI0 CS / SS)
 *
 *  C) 4x4 Matrix Keypad (8 pinnen op een rij):
 *     - R1 (Rij 1) -> Pin 9  (GP6)
 *     - R2 (Rij 2) -> Pin 10 (GP7)
 *     - R3 (Rij 3) -> Pin 11 (GP8)
 *     - R4 (Rij 4) -> Pin 12 (GP9)
 *     - C1 (Kol 1) -> Pin 14 (GP10)
 *     - C2 (Kol 2) -> Pin 15 (GP11)
 *     - C3 (Kol 3) -> Pin 16 (GP12)
 *     - C4 (Kol 4) -> Pin 17 (GP13)
 *
 *  D) Passieve of Actieve Buzzer (Optioneel):
 *     - Positief (+) -> Pin 19 (GP14)
 *     - Negatief (-) -> Pin 18 (GND)
 *
 *  VEREISTE ARDUINO LIBRARIES (Arduino IDE v2 -> Tools -> Manage Libraries):
 *  1. "LiquidCrystal I2C" door Frank de Brabander of Marco Schwartz
 *  2. "MFRC522" door GithubCommunity
 *  3. "Keypad" door Mark Stanley, Alexander Brevig
 *
 *  ARDUINO IDE V2 INSTALLATIE:
 *  1. Ga naar Bestand -> Voorkeuren (File -> Preferences)
 *  2. Voeg deze URL toe bij "Additional boards manager URLs":
 *     https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
 *  3. Ga naar Hulpmiddelen -> Board -> Boards Manager en zoek "pico"
 *  4. Installeer "Raspberry Pi Pico/RP2040 by Earle F. Philhower"
 *  5. Selecteer Board: "Raspberry Pi Pico W"
 *  6. Sluit Pico W aan met USB (eerste keer met BOOTSEL ingedrukt) en upload!
 * ==============================================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Keypad.h>

// Pinnen voor Raspberry Pi Pico W
#define I2C_SDA_PIN     4   // GP4 (Fysieke pin 6)
#define I2C_SCL_PIN     5   // GP5 (Fysieke pin 7)

#define SPI_MISO_PIN    16  // GP16 (Fysieke pin 21)
#define SPI_CS_PIN      17  // GP17 (Fysieke pin 22 - SDA op RC522)
#define SPI_SCK_PIN     18  // GP18 (Fysieke pin 24)
#define SPI_MOSI_PIN    19  // GP19 (Fysieke pin 25)
#define RST_PIN         20  // GP20 (Fysieke pin 26)

#define BUZZER_PIN      14  // GP14 (Fysieke pin 19)

LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522 mfrc522(SPI_CS_PIN, RST_PIN);

const byte ROWS = 4; 
const byte COLS = 4; 
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {6, 7, 8, 9};      // GP6, GP7, GP8, GP9 (Pinnen 9, 10, 11, 12)
byte colPins[COLS] = {10, 11, 12, 13};  // GP10, GP11, GP12, GP13 (Pinnen 14, 15, 16, 17)

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

enum TerminalState {
  STATE_IDLE,
  STATE_WAITING_CARD,
  STATE_WAITING_PIN,
  STATE_PROCESSING,
  STATE_RESULT
};

TerminalState currentState = STATE_IDLE;
String pendingAmount = "0.00";
String pendingOrderId = "";
String scannedUid = "";
String enteredPin = "";
unsigned long stateTimer = 0;

void beep(int frequency, int durationMs) {
  #if defined(BUZZER_PIN)
    tone(BUZZER_PIN, frequency, durationMs);
    delay(durationMs);
    noTone(BUZZER_PIN);
  #else
    delay(durationMs);
  #endif
}

void setIdleScreen() {
  currentState = STATE_IDLE;
  pendingAmount = "0.00";
  pendingOrderId = "";
  scannedUid = "";
  enteredPin = "";

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WerkPay POS");
  lcd.setCursor(0, 1);
  lcd.print("Klaar voor order");
}

void setup() {
  Serial.begin(115200);

  #if defined(BUZZER_PIN)
    pinMode(BUZZER_PIN, OUTPUT);
  #endif

  // I2C pinnen instellen voor Raspberry Pi Pico W
  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.begin();

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WerkPay Pico W");
  lcd.setCursor(0, 1);
  lcd.print("Opstarten...");

  // SPI pinnen instellen voor Raspberry Pi Pico W
  SPI.setRX(SPI_MISO_PIN);
  SPI.setTX(SPI_MOSI_PIN);
  SPI.setSCK(SPI_SCK_PIN);
  SPI.begin();

  mfrc522.PCD_Init();
  delay(100);

  beep(2000, 100);
  beep(3000, 150);

  setIdleScreen();
  Serial.println("READY:WERKPAY_PICOW_V1.0");
}

void loop() {
  handleSerialInput();

  switch (currentState) {
    case STATE_IDLE:
      break;

    case STATE_WAITING_CARD:
      char cancelKey = keypad.getKey();
      if (cancelKey == 'D' || cancelKey == '*') {
        beep(800, 200);
        Serial.println("RESULT:CANCELLED");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Geannuleerd!");
        delay(1200);
        setIdleScreen();
        return;
      }

      if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        scannedUid = "";
        for (byte i = 0; i < mfrc522.uid.size; i++) {
          if (mfrc522.uid.uidByte[i] < 0x10) scannedUid += "0";
          scannedUid += String(mfrc522.uid.uidByte[i], HEX);
        }
        scannedUid.toUpperCase();
        mfrc522.PICC_HaltA();
        mfrc522.PCD_StopCrypto1();

        beep(2500, 120);

        currentState = STATE_WAITING_PIN;
        enteredPin = "";
        stateTimer = millis();

        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Pas herkend!");
        lcd.setCursor(0, 1);
        lcd.print("Pincode: ");
      }
      break;

    case STATE_WAITING_PIN:
      char key = keypad.getKey();
      if (key) {
        if (key == 'D') {
          beep(800, 200);
          Serial.println("RESULT:CANCELLED");
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Geannuleerd!");
          delay(1200);
          setIdleScreen();
          return;
        } 
        else if (key == '*') {
          if (enteredPin.length() > 0) {
            enteredPin.remove(enteredPin.length() - 1);
            beep(1500, 50);
            updatePinDisplay();
          }
        } 
        else if (key == '#' || key == 'A') {
          if (enteredPin.length() >= 4) {
            beep(2800, 150);
            currentState = STATE_PROCESSING;
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print("Controleren...");
            lcd.setCursor(0, 1);
            lcd.print("Even geduld...");

            Serial.print("RESULT:OK:UID=");
            Serial.print(scannedUid);
            Serial.print(":PIN=");
            Serial.println(enteredPin);
          } else {
            beep(600, 300);
          }
        } 
        else if (key >= '0' && key <= '9') {
          if (enteredPin.length() < 6) {
            enteredPin += key;
            beep(2000, 40);
            updatePinDisplay();
          }
        }
      }

      if (millis() - stateTimer > 30000) {
        Serial.println("RESULT:TIMEOUT");
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("PIN Timeout");
        delay(1500);
        setIdleScreen();
      }
      break;

    case STATE_PROCESSING:
      break;

    case STATE_RESULT:
      if (millis() - stateTimer > 3500) {
        setIdleScreen();
      }
      break;
  }
}

void updatePinDisplay() {
  lcd.setCursor(9, 1);
  lcd.print("       ");
  lcd.setCursor(9, 1);
  for (unsigned int i = 0; i < enteredPin.length(); i++) {
    lcd.print("*");
  }
}

void handleSerialInput() {
  if (!Serial.available()) return;

  String line = Serial.readStringUntil('\\n');
  line.trim();
  if (line.length() == 0) return;

  if (line.startsWith("PAY:")) {
    int firstColon = line.indexOf(':');
    int secondColon = line.indexOf(':', firstColon + 1);

    if (secondColon != -1) {
      pendingAmount = line.substring(firstColon + 1, secondColon);
      pendingOrderId = line.substring(secondColon + 1);
    } else {
      pendingAmount = line.substring(firstColon + 1);
      pendingOrderId = "0000";
    }

    currentState = STATE_WAITING_CARD;
    stateTimer = millis();

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("EUR " + pendingAmount);

    lcd.setCursor(0, 1);
    lcd.print("Houd pas  D=Stop");

    beep(2400, 100);
    Serial.println("ACK:WAITING_FOR_CARD");
  }
  else if (line.startsWith("APPROVED")) {
    currentState = STATE_RESULT;
    stateTimer = millis();

    beep(2000, 100);
    beep(2500, 100);
    beep(3000, 200);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Betaald! Bedankt");
    lcd.setCursor(0, 1);
    lcd.print("EUR " + pendingAmount + " OK");
  }
  else if (line.startsWith("DECLINED")) {
    currentState = STATE_RESULT;
    stateTimer = millis();

    beep(700, 250);
    beep(500, 400);

    String reason = "Mislukt!";
    int c = line.indexOf(':');
    if (c != -1) reason = line.substring(c + 1);

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Afgewezen!");
    lcd.setCursor(0, 1);
    lcd.print(reason.substring(0, 16));
  }
  else if (line == "RESET" || line == "CANCEL") {
    setIdleScreen();
    Serial.println("ACK:RESET");
  }
  else if (line == "PING") {
    Serial.println("PONG:WERKPAY_PINPAD");
  }
}
`;

export const PICO_W_I2C_NFC_SKETCH_CODE = `/*
 * ==============================================================================
 *  WERKPAY - DIY PINAPPARAAT (RASPBERRY PI PICO W + FIREBASE CLOUD RELAY)
 * ==============================================================================
 *  - Multi-Terminal support (eigen Terminal-ID zelf instellen via Website/USB/AP)
 *  - Werkt voor Betalingen, NFC Pas-Login, Vergrendelen & Snelle Saldo/Coins Check (B-toets)
 *  - Slaat WiFi & Terminal-ID op in EEPROM: instellen kan via WerkPay-Setup AP (192.168.4.1)
 *    óf direct via USB vanuit de website ("Stuur WiFi / Terminal via USB")!
 *  - Ghost-toets vrije keypad scanner + schone Keep-Alive HTTPS client
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

void beep(int freq, int ms) {
  tone(BUZZER_PIN, freq, ms);
  delay(ms);
  noTone(BUZZER_PIN);
}

String pad16(const String& s) {
  String clean = s;
  clean.replace("\\xC3\\xAB", "e");
  clean.replace("\\xC3\\xA9", "e");
  clean.replace("\\xC3\\xAF", "i");
  clean.replace("\\xE2\\x82\\xAC", "EUR");
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
  String defaultTid = String(terminalId);
  if (defaultTid.length() > 0 && !defaultTid.startsWith("__WP_")) {
    activeTerminalId = sanitizeTerminalId(defaultTid);
  }

  WifiPrefsV2 prefsV2;
  EEPROM.get(0, prefsV2);
  if (memcmp(prefsV2.magic, "WPW2", 4) == 0) {
    if (strlen(prefsV2.terminalId) > 0) {
      activeTerminalId = sanitizeTerminalId(String(prefsV2.terminalId));
    }
    if (strlen(prefsV2.ssid) > 0) {
      activeSsid = String(prefsV2.ssid);
      activePass = String(prefsV2.pass);
      Serial.println("[CONFIG] Geladen uit EEPROM (WPW2): " + activeSsid + " | Terminal=" + activeTerminalId);
      return;
    }
  }

  WifiPrefsV1 prefsV1;
  EEPROM.get(0, prefsV1);
  if (memcmp(prefsV1.magic, "WPW1", 4) == 0 && strlen(prefsV1.ssid) > 0) {
    activeSsid = String(prefsV1.ssid);
    activePass = String(prefsV1.pass);
    Serial.println("[WIFI] Inladen uit EEPROM (WPW1): " + activeSsid);
    return;
  }

  String compiledSsid = String(ssid);
  if (compiledSsid.length() > 0 && compiledSsid != "JOUW_WIFI_NAAM" && !compiledSsid.startsWith("__WP_SSID")) {
    activeSsid = compiledSsid;
    activePass = String(password);
    Serial.println("[WIFI] Inladen uit sketch: " + activeSsid + " | Terminal=" + activeTerminalId);
  }
}

void handlePortalRoot() {
  int n = WiFi.scanNetworks();
  String options = "";
  for (int i = 0; i < n; i++) {
    String net = WiFi.SSID(i);
    if (net.length() > 0) {
      options += "<option value='" + net + "'>" + net + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    }
  }
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>WerkPay WiFi & Terminal Setup</title>"
                "<style>body{font-family:sans-serif;background:#020617;color:#f8fafc;padding:20px;max-width:420px;margin:auto}"
                "input,select,button{width:100%;padding:12px;margin:8px 0;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#fff;box-sizing:border-box}"
                "label{font-size:12px;color:#94a3b8;font-weight:bold;display:block;margin-top:8px}"
                "button{background:#06b6d4;color:#020617;font-weight:bold;border:none;margin-top:12px}</style></head><body>"
                "<h2>WerkPay Pinapparaat Setup</h2><p>Stel je WiFi-netwerk en het Terminal-ID in:</p>"
                "<form method='POST' action='/save'>"
                "<label>Gescande WiFi-netwerken</label>"
                "<select onchange=\\"document.getElementById('s').value=this.value\\"><option value=''>-- Scan resultaten --</option>" + options + "</select>"
                "<label>WiFi Naam (SSID)</label>"
                "<input id='s' name='ssid' placeholder='WiFi Naam (SSID)' required value='" + activeSsid + "'>"
                "<label>WiFi Wachtwoord (leeg = open netwerk)</label>"
                "<input name='pass' type='password' placeholder='WiFi Wachtwoord'>"
                "<label>Terminal ID (zelf instellen, verplicht)</label>"
                "<input name='termid' placeholder='Bijv. kassa_1 of bar_links' required value='" + activeTerminalId + "'>"
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
  setupPortalServer.send(200, "text/html", "<html><body style='font-family:sans-serif;background:#020617;color:#10b981;padding:24px'><h2>Opgeslagen!</h2><p>Terminal <b>" + nextTid + "</b> herstart nu en verbindt met " + s + "...</p></body></html>");
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
  Serial.println("[SETUP] Hotspot actief: 'WerkPay-Setup' -> open http://192.168.4.1");
  lcdShow("WiFi:WerkPay-Set", "IP: 192.168.4.1");
}

bool connectWifiBlocking(int maxTries) {
  if (activeSsid.length() == 0) return false;
  WiFi.mode(WIFI_STA);
  if (activePass.length() == 0) {
    WiFi.begin(activeSsid.c_str());
  } else {
    WiFi.begin(activeSsid.c_str(), activePass.c_str());
  }
  for (int i = 0; i < maxTries; i++) {
    if (WiFi.status() == WL_CONNECTED) return true;
    delay(350);
  }
  return (WiFi.status() == WL_CONNECTED);
}

void handleSerialCommands() {
  while (Serial.available() > 0) {
    char ch = (char)Serial.read();
    if (ch == '\\r') continue;
    if (ch == '\\n') {
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
        int sep1 = rest.indexOf('\\t');
        if (sep1 < 0) sep1 = rest.indexOf('|');
        String newSsid = (sep1 >= 0) ? rest.substring(0, sep1) : rest;
        String newPass = "";
        String newTerm = activeTerminalId;
        if (sep1 >= 0) {
          String afterPass = rest.substring(sep1 + 1);
          int sep2 = afterPass.indexOf('\\t');
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
  currentState = STATE_IDLE;
  activeUsername = "";
  pendingAmount = "0.00";
  pendingOrderNo = "0";
  isLoginSession = false;
  scannedUid = "";
  enteredPin = "";
  if (apPortalActive && WiFi.status() != WL_CONNECTED) {
    lcdShow("WiFi:WerkPay-Set", "IP: 192.168.4.1");
  } else if (activeTerminalId.length() == 0) {
    lcdShow("Geen Terminal-ID", "Stel in USB / AP");
  } else if (betalingGeslaagd) {
    lcdShow("WerkPay Terminal", "D=Bon  B=Saldo");
  } else {
    lcdShow("WerkPay [" + activeTerminalId.substring(0, 6) + "]", "B=Saldo/PasCheck");
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
  if (activeTerminalId.length() == 0) return false;
  String body;
  serializeJson(doc, body);
  String url = getFirestoreDocUrl() + maskQuery;
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

void patchCheckCard(const String& uid) {
  JsonDocument doc;
  JsonObject fields = doc["fields"].to<JsonObject>();
  fields["status"]["stringValue"] = "CHECK_CARD";
  fields["scannedUid"]["stringValue"] = uid;
  fields["enteredPin"]["stringValue"] = "";
  fields["updatedAt"]["stringValue"] = "pico-" + String(millis());
  patchFirestore(
    "&updateMask.fieldPaths=status&updateMask.fieldPaths=scannedUid&updateMask.fieldPaths=enteredPin&updateMask.fieldPaths=updatedAt",
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
  Serial.println("\\n====== WERKPAY KASSABON ======");
  Serial.println("Terminal: " + activeTerminalId);
  Serial.print("Kaart:    ****-****-****-");
  Serial.println(lastReceiptCard.length() >= 4 ? lastReceiptCard.substring(0, 4) : "****");
  Serial.println("Omschrijving: WerkPay Transactie");
  Serial.println("Bedrag:   EUR " + lastReceiptAmount);
  Serial.println("Status:   SUCCES / BETAALD");
  Serial.println("==============================\\n");
  betalingGeslaagd = false;
  currentState = STATE_SHOW_RESULT;
  stateTimer = millis();
  resultDurationMs = 1500;
}

void startBalanceCheckState() {
  currentState = STATE_CHECK_CARD;
  stateTimer = millis();
  beep(2200, 75);
  lcdShow("Scan pas: Saldo", "Houd pas  A=Stop");
}

void startLinkingState(const String& user) {
  activeUsername = user;
  isLoginSession = (user == "Inloggen");
  currentState = STATE_LINKING;
  stateTimer = millis();
  beep(2400, 90);
  lcdShow(isLoginSession ? "WerkPay Login" : ("Koppel: " + activeUsername), "Houd pas  A=Stop");
}

void startPayState(double amt, const String& ordNo, const String& payUser) {
  pendingAmount = String(amt, 2);
  pendingOrderNo = ordNo;
  isLoginSession = (amt <= 0.001);
  currentState = STATE_WAITING_CARD;
  stateTimer = millis();
  beep(2400, 90);

  String topLine;
  if (isLoginSession) {
    topLine = payUser.length() > 0 ? payUser : "WerkPay Login";
  } else {
    topLine = "EUR " + pendingAmount;
    if (pendingOrderNo != "0" && (topLine.length() + 2 + pendingOrderNo.length()) <= 16) {
      topLine += " #" + pendingOrderNo;
    }
  }
  lcdShow(topLine, "Houd pas  A=Stop");
}

void pollFirestore() {
  if (activeTerminalId.length() == 0) return;
  int code = 0;
  String payload;
  if (!firestoreRequest("GET", getFirestoreDocUrl(), "", code, payload)) {
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
      String ordNo = fields["orderNo"]["integerValue"] | "0";
      String payUser = fields["username"]["stringValue"] | "";
      startPayState(amt, ordNo, payUser);
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

      beep(2400, 80); beep(3000, 140);
      lcdShow(line1, line2);
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 4500;
    } else if (status == "LINKED") {
      beep(2200, 100); beep(2800, 180);
      lcdShow(isLoginSession ? "Ingelogd!" : "Pas gekoppeld!", isLoginSession ? "Welkom!" : activeUsername);
      patchStatusIdle("Klaar");
      currentState = STATE_SHOW_RESULT;
      stateTimer = millis();
      resultDurationMs = 2000;
    } else if (status == "APPROVED") {
      beep(2000, 100); beep(2500, 100); beep(3000, 200);
      if (isLoginSession) {
        lcdShow("Ingelogd!", "Welkom!");
      } else {
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
  delay(400);
  Serial.println("\\n=== WerkPay Pico W Terminal (Multi-Terminal + WiFi EEPROM + Saldo Check) ===");

  EEPROM.begin(256);
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

  loadWifiConfig();
  if (connectWifiBlocking(28)) {
    lcdShow("WiFi Verbonden!", WiFi.localIP().toString());
    delay(700);
  } else {
    startApSetupPortal();
    delay(1200);
  }

  nfc.begin();
  if (nfc.getFirmwareVersion()) {
    nfc.SAMConfig();
  }

  secureClient.setInsecure();
  if (WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0) {
    patchStatusIdle("Online");
  }
  beep(2000, 100);
  beep(3000, 150);
  setIdleScreen();
}

void loop() {
  unsigned long now = millis();

  // 0. USB WiFi/Terminal config en AP Setup portaal altijd responsief houden
  handleSerialCommands();
  if (apPortalActive) {
    setupPortalServer.handleClient();
    if (WiFi.status() == WL_CONNECTED) {
      apPortalActive = false;
      WiFi.softAPdisconnect(true);
      if (activeTerminalId.length() > 0) {
        patchStatusIdle("Online");
      }
      setIdleScreen();
    }
  }

  // 1. Scan keypad ALTIJD eerst zodat Annuleren/Saldo/toetsen direct reageren
  char key = scanKeypad();

  if (currentState == STATE_IDLE || currentState == STATE_SHOW_RESULT) {
    if (key == 'B' && WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0) {
      startBalanceCheckState();
      return;
    }
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
      beep(800, 100);
      setIdleScreen();
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

      currentState = STATE_WAITING_RESULT;
      stateTimer = millis();
      lcdShow("Pas checken...", "Even geduld...");
      patchCheckCard(scannedUid);
      return;
    }

    if (now - stateTimer > 25000) {
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
        lcdShow("Pas gescand!", isLoginSession ? "Inloggen..." : "Koppelen...");
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
  if (WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0 && magPollen && (now - lastPollMs >= pollInterval)) {
    lastPollMs = now;
    pollFirestore();
  }
}
`;

class TerminalManager {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private isConnected = false;
  private callbacks: TerminalCallbacks = {};
  private keepReading = false;

  public isWebSerialAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public setCallbacks(cb: TerminalCallbacks) {
    this.callbacks = cb;
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public async connect(): Promise<{ success: boolean; message: string }> {
    if (!this.isWebSerialAvailable()) {
      return { 
        success: false, 
        message: 'Web Serial API wordt niet ondersteund in deze browser. Gebruik Google Chrome of Microsoft Edge.' 
      };
    }

    try {
      this.callbacks.onStatusChange?.('connecting');
      // @ts-ignore
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });

      this.isConnected = true;
      this.keepReading = true;
      this.callbacks.onStatusChange?.('connected');
      this.callbacks.onLog?.('USB Serial verbonden op 115200 baud met Arduino.');

      // Start asynchronous read loop
      this.startReadLoop();

      // Send ping to verify
      await this.sendLine('PING');

      return { success: true, message: 'Verbonden met Arduino Pinapparaat!' };
    } catch (err: any) {
      this.isConnected = false;
      this.callbacks.onStatusChange?.('disconnected');
      return { 
        success: false, 
        message: err?.message || 'Kon geen verbinding maken met COM poort.' 
      };
    }
  }

  public async disconnect() {
    this.keepReading = false;
    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
      }
      if (this.writer) {
        this.writer.releaseLock();
      }
      if (this.port) {
        await this.port.close();
      }
    } catch (e) {
      // Ignored
    } finally {
      this.port = null;
      this.reader = null;
      this.writer = null;
      this.isConnected = false;
      this.callbacks.onStatusChange?.('disconnected');
      this.callbacks.onLog?.('Verbinding met Arduino verbroken.');
    }
  }

  private async startReadLoop() {
    let buffer = '';
    // @ts-ignore
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    try {
      while (this.keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const clean = line.trim();
            if (clean) this.processIncomingLine(clean);
          }
        }
      }
    } catch (error) {
      if (this.keepReading) {
        this.callbacks.onLog?.(`Leesfout: ${error}`);
      }
    } finally {
      try {
        this.reader.releaseLock();
      } catch {}
    }
  }

  private processIncomingLine(line: string) {
    this.callbacks.onLog?.(`[Arduino -> POS]: ${line}`);

    if (line.startsWith('RESULT:OK:')) {
      // Format: RESULT:OK:UID=4129883155049012:PIN=1234
      const parts = line.split(':');
      let uid = '';
      let pin = '';
      for (const p of parts) {
        if (p.startsWith('UID=')) uid = p.substring(4);
        if (p.startsWith('PIN=')) pin = p.substring(4);
      }
      this.callbacks.onStatusChange?.('processing');
      this.callbacks.onPaymentData?.({ uid, pin });
    } else if (line.startsWith('RESULT:CANCEL')) {
      this.callbacks.onStatusChange?.('connected');
      this.callbacks.onCancel?.();
    } else if (line.startsWith('ACK:WAITING_FOR_CARD')) {
      this.callbacks.onStatusChange?.('waiting_card');
    }
  }

  public async sendLine(line: string): Promise<boolean> {
    if (!this.isConnected || !this.port) return false;
    try {
      const encoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      await writer.write(encoder.encode(line + '\n'));
      writer.releaseLock();
      this.callbacks.onLog?.(`[POS -> Arduino]: ${line}`);
      return true;
    } catch (e) {
      this.callbacks.onLog?.(`Schrijffout: ${e}`);
      return false;
    }
  }

  public async startPayment(amount: number, orderNo: number): Promise<boolean> {
    const cmd = `PAY:${amount.toFixed(2)}:${orderNo}`;
    return await this.sendLine(cmd);
  }

  public async notifyApproved(msg: string = 'Bedankt!'): Promise<boolean> {
    return await this.sendLine(`APPROVED:${msg}`);
  }

  public async notifyDeclined(reason: string = 'Afgewezen'): Promise<boolean> {
    return await this.sendLine(`DECLINED:${reason}`);
  }

  public async cancel(): Promise<boolean> {
    return await this.sendLine('CANCEL');
  }
}

export const terminalManager = new TerminalManager();

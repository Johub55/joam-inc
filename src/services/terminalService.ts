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

    case STATE_WAITING_CARD: {
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
    }

    case STATE_WAITING_PIN: {
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
    }

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

    case STATE_WAITING_CARD: {
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
    }

    case STATE_WAITING_PIN: {
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
    }

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
 *  - Multi-Terminal support (eigen Terminal-ID zelf instellen via code / AP / USB)
 *  - Werkt voor Betalingen, NFC Pas-Login & Vergrendelen
 *  - Slaat WiFi & Terminal-ID op in EEPROM: vul ze direct in bovenaan de .INO
 *    of stel ze draadloos in via de hotspot WerkPay-Setup (192.168.4.1)
 *  - Vereiste Arduino Libraries (Library Manager):
 *      1. LiquidCrystal I2C (Frank de Brabander / Marco Schwartz)
 *      2. ArduinoJson (Benoit Blanchon - versie 7+)
 *      (Geen Adafruit_PN532 library meer nodig: ingebouwde pure I2C PN532 driver!)
 *  - Exacte hardware pinout (Raspberry Pi Pico W):
 *      LCD (0x27) & PN532 (0x24): SDA = GP4, SCL = GP5 (Switch 1=ON/1, Switch 2=OFF/0)
 *      4x4 Matrix Keypad        : Rijen = {13, 12, 11, 10}, Kolommen = {9, 8, 7, 6}
 *      Buzzer                   : GP14
 * ==============================================================================
 */

#include <Arduino.h>
#if __has_include("secrets.h")
  #include "secrets.h"
#endif
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <EEPROM.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// --- WIFI, TERMINAL & FIREBASE CONFIGURATIE ---
// Tip: maak in Arduino IDE v2 een tabblad 'secrets.h' aan OF sla alles 1x op via 192.168.4.1 / IP-website (/secrets.json + EEPROM).
#ifndef SECRET_WIFI_SSID
  #define SECRET_WIFI_SSID "JOUW_WIFI_NAAM"
#endif
#ifndef SECRET_WIFI_PASS
  #define SECRET_WIFI_PASS "JOUW_WIFI_WACHTWOORD"
#endif
#ifndef SECRET_TERMINAL_ID
  #define SECRET_TERMINAL_ID ""
#endif
#ifndef SECRET_FIRESTORE_DOC_BASE
  #define SECRET_FIRESTORE_DOC_BASE "https://firestore.googleapis.com/v1/projects/gen-lang-client-0031413083/databases/ai-studio-werkpayposwe-c139ebd2-3939-4781-ab60-f1b99421ae53/documents/hardware_terminals/"
#endif
#ifndef SECRET_FIRESTORE_API_KEY
  #define SECRET_FIRESTORE_API_KEY "AIzaSyD9k7jmxRN-Xs2vX598yaUKhUAijPPA9fg"
#endif

const char* ssid = SECRET_WIFI_SSID;
const char* password = SECRET_WIFI_PASS;
const char* terminalId = SECRET_TERMINAL_ID;

const char* FIRESTORE_DOC_BASE = SECRET_FIRESTORE_DOC_BASE;
const char* FIRESTORE_API_KEY = SECRET_FIRESTORE_API_KEY;

// --- HARDWARE PINOUT (RASPBERRY PI PICO W) ---
#define I2C_SDA_PIN 4
#define I2C_SCL_PIN 5
#define BUZZER_PIN  14
#define PN532_I2C_ADDR 0x24

LiquidCrystal_I2C lcd(0x27, 16, 2);
WebServer setupPortalServer(80);

// --- EEPROM & LITTLEFS SECRETS OPSLAG ---
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

struct WifiPrefsV3 {
  char magic[4];
  char ssid[64];
  char pass[64];
  char terminalId[32];
  char firestoreDocBase[192];
  char firebaseApiKey[64];
};

String activeSsid = "";
String activePass = "";
String activeTerminalId = "";
String activeFirestoreDocBase = FIRESTORE_DOC_BASE;
String activeFirestoreApiKey = FIRESTORE_API_KEY;
bool littleFsReady = false;
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

#define FIRMWARE_VERSION "v3.5"

unsigned long laatsteToetsTijd = 0;
unsigned long lastKeyActivityMs = 0;
const unsigned long KEY_RELEASE_DEBOUNCE_MS = 25;
bool keyArmed = true;
char lastRawKey = 0;
unsigned long keyZeroSinceMs = 0;

unsigned long buzzerOffAt = 0;
bool buzzerActive = false;
bool nfcReady = false;
bool useSoftI2cNfc = false;
String nfcFirmwareText = "";
String nfcDiagNote = "Controleren...";
String lastBbDiag = "";
byte lastNfcWriteErr = 0;
uint32_t activeI2cClock = 100000;
enum NfcPollPhase {
  NFC_IDLE,
  NFC_WAIT_ACK,
  NFC_WAIT_TAG
};
NfcPollPhase nfcPhase = NFC_IDLE;
unsigned long nfcPhaseAtMs = 0;
unsigned long lastNfcScanMs = 0;
unsigned long lastNfcReadyCheckMs = 0;
unsigned long lastNfcRecoverMs = 0;
unsigned long lastScanUiTickMs = 0;
bool scanUiDotOn = false;
byte nfcConsecutiveErrors = 0;
const unsigned long NFC_SCAN_INTERVAL_MS = 140;

bool webServerStarted = false;
bool needsBootOnlinePatch = false;
int lastCloudHttpCode = 0;
String lastCloudNote = "Nog niet verbonden";
String lastUidSeen = "";
char lastKeySeen = 0;

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
String escapeJsonStr(const String& raw);
String getStateName();
void beep(int freq, int ms);
void beepAsync(int freq, int ms);
void updateBuzzer();
String pad16(const String& s);
void lcdShow(const String& line1, const String& line2);
String formatShortReason(const String& rawReason);
void saveSecrets(const String& newSsid, const String& newPass, const String& newTermId, const String& newDocBase, const String& newApiKey);
void saveConfigToEeprom(const String& newSsid, const String& newPass, const String& newTermId);
void loadWifiConfig();
void handleWebRoot();
void handleApiStatus();
void handleApiAction();
void handleSecretsDownload();
void handlePortalSave();
void registerWebRoutes();
void startLocalWebServer();
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
bool isI2CDevicePresent(uint8_t addr);
String scanI2CAddresses();
bool bbSclHighWait(unsigned long maxMs);
bool bbStart();
void bbStop();
bool bbWriteByte(uint8_t b, bool& ack);
bool bbReadByte(bool sendAck, uint8_t& outByte);
bool bbI2cWrite(uint8_t addr7, const uint8_t* data, uint8_t len);
byte bbI2cRead(uint8_t addr7, uint8_t* outBuf, uint8_t len);
bool pn532WriteFrame(const uint8_t* frame, uint8_t frameLen);
byte pn532ReadRawBytes(uint8_t* outBuf, uint8_t count);
bool pn532WriteCommand(const uint8_t* payload, uint8_t payloadLen);
bool pn532WaitAck(unsigned long timeoutMs, String& debugHex);
bool pn532ReadResponse(uint8_t* outPayload, uint8_t maxPayload, uint8_t& outLen, unsigned long timeoutMs, String& debugHex);
bool pn532SendCommand(const uint8_t* cmd, uint8_t cmdLen, uint8_t* resp, uint8_t maxResp, uint8_t& respLen, unsigned long timeoutMs);
bool pn532InitRaw();
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
  if (activeTerminalId.length() == 0 || activeFirestoreDocBase.length() == 0) return String("");
  String base = activeFirestoreDocBase;
  if (!base.endsWith("/")) base += "/";
  return base + activeTerminalId + "?key=" + activeFirestoreApiKey;
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
  out.replace("\\"", "&quot;");
  out.replace("<", "&lt;");
  out.replace(">", "&gt;");
  return out;
}

String escapeJsonStr(const String& raw) {
  String out = raw;
  out.replace("\\\\", "\\\\\\\\");
  out.replace("\\"", "\\\\\\"");
  out.replace("\\n", " ");
  out.replace("\\r", " ");
  return out;
}

String getStateName() {
  switch (currentState) {
    case STATE_IDLE: return "IDLE (Klaar)";
    case STATE_LINKING: return "LINKING (Pas koppelen/login)";
    case STATE_WAITING_CARD: return "WAITING_CARD (Wacht op pas)";
    case STATE_WAITING_PIN: return "WAITING_PIN (Wacht op pincode)";
    case STATE_CHECK_CARD: return "CHECK_CARD (Saldo check)";
    case STATE_WAITING_RESULT: return "WAITING_RESULT (Wacht op kassa)";
    case STATE_SHOW_RESULT: return "SHOW_RESULT";
  }
  return "ONBEKEND";
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

void saveSecrets(const String& newSsid, const String& newPass, const String& newTermId, const String& newDocBase, const String& newApiKey) {
  String cleanSsid = newSsid;
  cleanSsid.trim();
  String safeTid = sanitizeTerminalId(newTermId);
  String cleanBase = newDocBase;
  cleanBase.trim();
  if (cleanBase.length() == 0) cleanBase = String(FIRESTORE_DOC_BASE);
  if (!cleanBase.endsWith("/")) cleanBase += "/";
  String cleanKey = newApiKey;
  cleanKey.trim();
  if (cleanKey.length() == 0) cleanKey = String(FIRESTORE_API_KEY);

  WifiPrefsV3 prefs;
  memset(&prefs, 0, sizeof(prefs));
  memcpy(prefs.magic, "WPW3", 4);
  cleanSsid.substring(0, 63).toCharArray(prefs.ssid, sizeof(prefs.ssid));
  newPass.substring(0, 63).toCharArray(prefs.pass, sizeof(prefs.pass));
  safeTid.substring(0, 31).toCharArray(prefs.terminalId, sizeof(prefs.terminalId));
  cleanBase.substring(0, 191).toCharArray(prefs.firestoreDocBase, sizeof(prefs.firestoreDocBase));
  cleanKey.substring(0, 63).toCharArray(prefs.firebaseApiKey, sizeof(prefs.firebaseApiKey));
  EEPROM.put(0, prefs);
  EEPROM.commit();

  activeSsid = cleanSsid.substring(0, 63);
  activePass = newPass.substring(0, 63);
  activeTerminalId = safeTid;
  activeFirestoreDocBase = cleanBase.substring(0, 191);
  activeFirestoreApiKey = cleanKey.substring(0, 63);

  if (littleFsReady) {
    File f = LittleFS.open("/secrets.json", "w");
    if (f) {
      JsonDocument doc;
      doc["ssid"] = activeSsid;
      doc["password"] = activePass;
      doc["terminalId"] = activeTerminalId;
      doc["firestoreDocBase"] = activeFirestoreDocBase;
      doc["firebaseApiKey"] = activeFirestoreApiKey;
      serializeJsonPretty(doc, f);
      f.close();
      Serial.println("[SECRETS] Opgeslagen in /secrets.json + EEPROM (WPW3)");
    } else {
      Serial.println("[SECRETS] Kon /secrets.json niet schrijven, wel in EEPROM opgeslagen");
    }
  }
}

void saveConfigToEeprom(const String& newSsid, const String& newPass, const String& newTermId) {
  saveSecrets(newSsid, newPass, newTermId, activeFirestoreDocBase, activeFirestoreApiKey);
}

void loadWifiConfig() {
  activeFirestoreDocBase = String(FIRESTORE_DOC_BASE);
  activeFirestoreApiKey = String(FIRESTORE_API_KEY);

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

  // 1. Direct ingevuld in sketch of secrets.h
  if (hasSketchSsid) {
    activeSsid = compiledSsid.substring(0, 63);
    activePass = (compiledPass == "JOUW_WIFI_WACHTWOORD" || compiledPass.startsWith("__WP_"))
      ? String("")
      : compiledPass.substring(0, 63);
    Serial.println("[CONFIG] WiFi uit sketch/secrets.h: " + activeSsid + " | Terminal=" + activeTerminalId);

    if (activeTerminalId.length() > 0) {
      saveSecrets(activeSsid, activePass, activeTerminalId, activeFirestoreDocBase, activeFirestoreApiKey);
      return;
    }
  }

  // 2. Persistent /secrets.json bestand op Pico flash (LittleFS) — blijft behouden bij Arduino IDE upload!
  if (littleFsReady && LittleFS.exists("/secrets.json")) {
    File f = LittleFS.open("/secrets.json", "r");
    if (f) {
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, f);
      f.close();
      if (!err) {
        String fsSsid = doc["ssid"] | "";
        String fsPass = doc["password"] | "";
        String fsTid = doc["terminalId"] | "";
        String fsBase = doc["firestoreDocBase"] | "";
        String fsKey = doc["firebaseApiKey"] | "";
        fsSsid.trim();
        fsTid.trim();
        fsBase.trim();
        fsKey.trim();

        if (fsBase.length() > 0) activeFirestoreDocBase = fsBase.substring(0, 191);
        if (fsKey.length() > 0) activeFirestoreApiKey = fsKey.substring(0, 63);
        if (fsTid.length() > 0 && activeTerminalId.length() == 0) {
          activeTerminalId = sanitizeTerminalId(fsTid);
        }
        if (!hasSketchSsid && fsSsid.length() > 0) {
          activeSsid = fsSsid.substring(0, 63);
          activePass = fsPass.substring(0, 63);
          Serial.println("[SECRETS] Geladen uit LittleFS (/secrets.json): " + activeSsid + " | Terminal=" + activeTerminalId);
          return;
        }
      }
    }
  }

  // 3. EEPROM fallback (WPW3 -> WPW2 -> WPW1)
  WifiPrefsV3 prefsV3;
  EEPROM.get(0, prefsV3);
  if (memcmp(prefsV3.magic, "WPW3", 4) == 0) {
    prefsV3.ssid[sizeof(prefsV3.ssid) - 1] = '\\0';
    prefsV3.pass[sizeof(prefsV3.pass) - 1] = '\\0';
    prefsV3.terminalId[sizeof(prefsV3.terminalId) - 1] = '\\0';
    prefsV3.firestoreDocBase[sizeof(prefsV3.firestoreDocBase) - 1] = '\\0';
    prefsV3.firebaseApiKey[sizeof(prefsV3.firebaseApiKey) - 1] = '\\0';

    if (strlen(prefsV3.firestoreDocBase) > 0) activeFirestoreDocBase = String(prefsV3.firestoreDocBase);
    if (strlen(prefsV3.firebaseApiKey) > 0) activeFirestoreApiKey = String(prefsV3.firebaseApiKey);
    if (strlen(prefsV3.terminalId) > 0 && activeTerminalId.length() == 0) {
      activeTerminalId = sanitizeTerminalId(String(prefsV3.terminalId));
    }
    if (!hasSketchSsid && strlen(prefsV3.ssid) > 0) {
      activeSsid = String(prefsV3.ssid);
      activePass = String(prefsV3.pass);
      Serial.println("[CONFIG] Geladen uit EEPROM (WPW3): " + activeSsid + " | Terminal=" + activeTerminalId);
      if (littleFsReady && !LittleFS.exists("/secrets.json")) {
        saveSecrets(activeSsid, activePass, activeTerminalId, activeFirestoreDocBase, activeFirestoreApiKey);
      }
      return;
    }
  }

  WifiPrefsV2 prefsV2;
  EEPROM.get(0, prefsV2);
  if (memcmp(prefsV2.magic, "WPW2", 4) == 0) {
    prefsV2.ssid[sizeof(prefsV2.ssid) - 1] = '\\0';
    prefsV2.pass[sizeof(prefsV2.pass) - 1] = '\\0';
    prefsV2.terminalId[sizeof(prefsV2.terminalId) - 1] = '\\0';

    if (strlen(prefsV2.terminalId) > 0 && activeTerminalId.length() == 0) {
      activeTerminalId = sanitizeTerminalId(String(prefsV2.terminalId));
    }
    if (!hasSketchSsid && strlen(prefsV2.ssid) > 0) {
      activeSsid = String(prefsV2.ssid);
      activePass = String(prefsV2.pass);
      Serial.println("[CONFIG] Geladen uit EEPROM (WPW2): " + activeSsid + " | Terminal=" + activeTerminalId);
      saveSecrets(activeSsid, activePass, activeTerminalId, activeFirestoreDocBase, activeFirestoreApiKey);
      return;
    }
  }

  WifiPrefsV1 prefsV1;
  EEPROM.get(0, prefsV1);
  if (memcmp(prefsV1.magic, "WPW1", 4) == 0) {
    prefsV1.ssid[sizeof(prefsV1.ssid) - 1] = '\\0';
    prefsV1.pass[sizeof(prefsV1.pass) - 1] = '\\0';
    if (!hasSketchSsid && strlen(prefsV1.ssid) > 0) {
      activeSsid = String(prefsV1.ssid);
      activePass = String(prefsV1.pass);
      Serial.println("[WIFI] Inladen uit EEPROM (WPW1): " + activeSsid);
      return;
    }
  }

  if (!hasSketchSsid) {
    Serial.println("[CONFIG] Geen WiFi / secrets opgeslagen");
  }
}

void handleWebRoot() {
  bool doScan = (apPortalActive && WiFi.status() != WL_CONNECTED) || setupPortalServer.hasArg("scan");
  String options = "";
  if (doScan) {
    int n = WiFi.scanNetworks();
    for (int i = 0; i < n; i++) {
      String net = WiFi.SSID(i);
      if (net.length() > 0) {
        String safeNet = escapeHtmlAttr(net);
        options += "<option value='" + safeNet + "'>" + safeNet + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
      }
    }
  }

  String ipStr = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : String("192.168.4.1");
  String scanBlock = "";
  if (doScan) {
    scanBlock = "<label>Gescande WiFi-netwerken</label>"
                "<select onchange=\\"document.getElementById('s').value=this.value\\"><option value=''>-- Kies netwerk --</option>" + options + "</select>";
  } else {
    scanBlock = "<div style='margin-bottom:8px'><a href='/?scan=1' style='color:#38bdf8;font-size:12px;font-weight:bold'>WiFi netwerken scannen...</a></div>";
  }

  String fsStatusText = littleFsReady
    ? String("LittleFS (/secrets.json) + EEPROM")
    : String("Alleen EEPROM (zet Arduino IDE Flash Size op 64KB/1MB FS voor /secrets.json)");

  String html =
    "<!DOCTYPE html><html lang='nl'><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>WerkPay Pinapparaat (" + escapeHtmlAttr(activeTerminalId.length() ? activeTerminalId : String("Setup")) + ")</title>"
    "<style>"
    "*{box-sizing:border-box}"
    "body{font-family:system-ui,-apple-system,sans-serif;background:#020617;color:#f8fafc;margin:0;padding:16px}"
    ".wrap{max-width:500px;margin:auto}"
    ".card{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:16px;margin-bottom:14px}"
    "h1{font-size:19px;margin:0 0 4px;display:flex;align-items:center;justify-content:space-between}"
    ".sub{font-size:12px;color:#94a3b8;margin:0 0 12px}"
    ".badge{font-size:11px;padding:3px 8px;border-radius:6px;background:#083344;color:#22d3ee;border:1px solid #155e75}"
    ".grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px}"
    ".kv{background:#020617;border:1px solid #1e293b;border-radius:10px;padding:8px 10px}"
    ".k{color:#94a3b8;font-size:10px;text-transform:uppercase;display:block;margin-bottom:2px}"
    ".v{font-weight:700;word-break:break-word}"
    ".ok{color:#34d399}.err{color:#fb7185}.warn{color:#fbbf24}"
    ".btns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}"
    "button{width:100%;padding:10px;border-radius:10px;border:none;font-weight:700;font-size:12px;cursor:pointer}"
    ".b-pri{background:#06b6d4;color:#020617;margin-top:10px}"
    ".b-sec{background:#1e293b;color:#e2e8f0;border:1px solid #334155}"
    ".b-sec:hover{background:#334155}"
    "input,select{width:100%;padding:10px;margin:6px 0 10px;border-radius:10px;border:1px solid #334155;background:#020617;color:#fff;font-size:13px}"
    "input[type=checkbox]{width:auto;margin:0 8px 0 0}"
    "label{font-size:12px;color:#cbd5e1;font-weight:600;display:block}"
    ".row{display:flex;align-items:center;font-size:12px;color:#94a3b8;margin:2px 0 10px}"
    "#msg{font-size:12px;margin-top:8px;min-height:16px;color:#38bdf8}"
    "</style></head><body><div class='wrap'>"
    "<div class='card'>"
    "<h1><span>WerkPay Pinapparaat</span><span class='badge'>" + String(FIRMWARE_VERSION) + "</span></h1>"
    "<p class='sub'>IP: <b>" + ipStr + "</b> &middot; Terminal: <b id='tid'>" + escapeHtmlAttr(activeTerminalId.length() ? activeTerminalId : String("(geen)")) + "</b></p>"
    "<div class='grid'>"
    "<div class='kv'><span class='k'>Status</span><span class='v' id='st'>Laden...</span></div>"
    "<div class='kv'><span class='k'>NFC Lezer (0x24)</span><span class='v' id='nfc'>...</span></div>"
    "<div class='kv'><span class='k'>WiFi</span><span class='v' id='wifi'>...</span></div>"
    "<div class='kv'><span class='k'>Cloud (Firestore)</span><span class='v' id='cloud'>...</span></div>"
    "<div class='kv'><span class='k'>Laatste Pas UID</span><span class='v' id='uid'>-</span></div>"
    "<div class='kv'><span class='k'>Laatste Toets / Uptime</span><span class='v' id='key'>-</span></div>"
    "<div class='kv' style='grid-column:span 2'><span class='k'>I2C Bus Scan (GP4/GP5)</span><span class='v' id='i2c'>...</span></div>"
    "</div>"
    "<div class='btns'>"
    "<button class='b-sec' type='button' onclick=\\"act('beep')\\">Test Pieper</button>"
    "<button class='b-sec' type='button' onclick=\\"act('nfc_recover')\\">Herstel NFC / I2C</button>"
    "<button class='b-sec' type='button' onclick=\\"act('cloud_test')\\">Test Cloud</button>"
    "<button class='b-sec' type='button' onclick=\\"act('reset')\\">Reset naar IDLE</button>"
    "</div>"
    "<div id='msg'></div>"
    "</div>"
    "<div class='card'>"
    "<h1 style='font-size:15px;margin-bottom:4px'>Blijvend Secrets Bestand (WiFi, ID &amp; Firebase)</h1>"
    "<p class='sub'>Opslag: <b>" + fsStatusText + "</b> &middot; <a href='/secrets.json' style='color:#38bdf8'>Download secrets.json</a></p>"
    "<form method='POST' action='/save'>"
    + scanBlock +
    "<label>WiFi Naam (SSID)</label>"
    "<input id='s' name='ssid' placeholder='WiFi Naam (SSID)' required value='" + escapeHtmlAttr(activeSsid) + "'>"
    "<label>WiFi Wachtwoord (leeg laten = huidig wachtwoord behouden)</label>"
    "<input name='pass' type='password' placeholder='Nieuw wachtwoord of leeg laten'>"
    "<label class='row'><input type='checkbox' name='openwifi' value='1'>Open WiFi netwerk zonder wachtwoord</label>"
    "<label>Terminal ID</label>"
    "<input name='termid' placeholder='Bijv. kassa1 of pin01' required value='" + escapeHtmlAttr(activeTerminalId) + "'>"
    "<details style='margin:6px 0 8px'><summary style='font-size:12px;color:#94a3b8;cursor:pointer;font-weight:bold'>Firebase API &amp; Database URL (optioneel)</summary>"
    "<div style='margin-top:8px'>"
    "<label>Firestore Document Base URL</label>"
    "<input name='fburl' value='" + escapeHtmlAttr(activeFirestoreDocBase) + "'>"
    "<label>Firebase API Key</label>"
    "<input name='fbkey' value='" + escapeHtmlAttr(activeFirestoreApiKey) + "'>"
    "</div></details>"
    "<button class='b-pri' type='submit'>Opslaan in Secrets &amp; Herstarten</button>"
    "</form></div></div>"
    "<script>"
    "function rf(){"
    "fetch('/api/status').then(function(r){return r.json();}).then(function(d){"
    "document.getElementById('st').textContent=d.state;"
    "document.getElementById('tid').textContent=d.terminalId||'(geen)';"
    "var n=document.getElementById('nfc');n.textContent=d.nfcReady?('OK (0x24 '+d.nfcFw+')'):(d.nfcDiag||'NIET GEVONDEN (0x24)');n.className='v '+(d.nfcReady?'ok':'err');"
    "var w=document.getElementById('wifi');w.textContent=d.wifiConnected?(d.ssid+' ('+d.rssi+' dBm)'):'Niet verbonden';"
    "var c=document.getElementById('cloud');c.textContent=(d.lastHttp>0?('HTTP '+d.lastHttp+': '):'')+d.cloudNote;c.className='v '+(d.lastHttp===200?'ok':(d.lastHttp===0?'warn':'err'));"
    "document.getElementById('uid').textContent=d.lastUid||'-';"
    "document.getElementById('key').textContent=(d.lastKey||'-')+' / '+d.uptimeSec+'s';"
    "document.getElementById('i2c').textContent=d.i2cAddrs||'Geen';}"
    ").catch(function(){});"
    "}"
    "function act(cmd){"
    "document.getElementById('msg').textContent='Uitvoeren: '+cmd+'...';"
    "fetch('/api/action?cmd='+encodeURIComponent(cmd),{method:'POST'}).then(function(r){return r.text();}).then(function(t){"
    "document.getElementById('msg').textContent=t;rf();"
    "}).catch(function(e){document.getElementById('msg').textContent='Fout: '+e;});"
    "}"
    "rf();setInterval(rf,2000);"
    "</script></body></html>";

  setupPortalServer.send(200, "text/html", html);
}

void handleApiStatus() {
  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  static String cachedI2cList = "";
  static bool cachedI2cAck = false;
  static unsigned long lastI2cScanMs = 0;
  unsigned long now = millis();
  if (currentState == STATE_IDLE && nfcPhase == NFC_IDLE && (lastI2cScanMs == 0 || now - lastI2cScanMs >= 10000)) {
    lastI2cScanMs = now;
    cachedI2cAck = isI2CDevicePresent(PN532_I2C_ADDR);
    cachedI2cList = scanI2CAddresses();
  }
  bool i2cAck = cachedI2cAck;
  String i2cList = cachedI2cList;
  String keyStr = (lastKeySeen >= 32 && lastKeySeen <= 126) ? String(lastKeySeen) : String("");
  String json = "{";
  json += "\\"fw\\":\\"" + escapeJsonStr(String(FIRMWARE_VERSION)) + "\\",";
  json += "\\"state\\":\\"" + escapeJsonStr(getStateName()) + "\\",";
  json += "\\"terminalId\\":\\"" + escapeJsonStr(activeTerminalId) + "\\",";
  json += "\\"ssid\\":\\"" + escapeJsonStr(activeSsid) + "\\",";
  json += "\\"ip\\":\\"" + (wifiOk ? WiFi.localIP().toString() : String("192.168.4.1")) + "\\",";
  json += "\\"wifiConnected\\":" + String(wifiOk ? "true" : "false") + ",";
  json += "\\"rssi\\":" + String(wifiOk ? WiFi.RSSI() : 0) + ",";
  json += "\\"nfcReady\\":" + String(nfcReady ? "true" : "false") + ",";
  json += "\\"nfcFw\\":\\"" + escapeJsonStr(nfcFirmwareText) + "\\",";
  json += "\\"nfcDiag\\":\\"" + escapeJsonStr(nfcDiagNote) + "\\",";
  json += "\\"i2cAck\\":" + String(i2cAck ? "true" : "false") + ",";
  json += "\\"i2cAddrs\\":\\"" + escapeJsonStr(i2cList) + "\\",";
  json += "\\"littleFs\\":" + String(littleFsReady ? "true" : "false") + ",";
  json += "\\"lastHttp\\":" + String(lastCloudHttpCode) + ",";
  json += "\\"cloudNote\\":\\"" + escapeJsonStr(lastCloudNote) + "\\",";
  json += "\\"lastUid\\":\\"" + escapeJsonStr(lastUidSeen) + "\\",";
  json += "\\"lastKey\\":\\"" + escapeJsonStr(keyStr) + "\\",";
  json += "\\"uptimeSec\\":" + String(millis() / 1000UL);
  json += "}";
  setupPortalServer.send(200, "application/json", json);
}

void handleApiAction() {
  String cmd = setupPortalServer.arg("cmd");
  if (cmd == "beep") {
    beepAsync(2400, 140);
    setupPortalServer.send(200, "text/plain", "Pieper getest!");
  } else if (cmd == "nfc_recover") {
    lastNfcRecoverMs = 0;
    recoverI2CAndNfc();
    String scanRes = scanI2CAddresses();
    setupPortalServer.send(200, "text/plain", nfcReady
      ? ("PN532 NFC actief (" + nfcFirmwareText + ")! I2C: " + scanRes)
      : ("PN532 fout: " + nfcDiagNote + " | I2C: " + scanRes));
  } else if (cmd == "cloud_test") {
    if (activeTerminalId.length() == 0) {
      setupPortalServer.send(200, "text/plain", "Stel eerst een Terminal ID in.");
      return;
    }
    pollFirestore();
    setupPortalServer.send(200, "text/plain", "Cloud test klaar: HTTP " + String(lastCloudHttpCode) + " (" + lastCloudNote + ")");
  } else if (cmd == "reset") {
    nfcPhase = NFC_IDLE;
    setIdleScreen();
    patchStatusIdle("Reset via web");
    setupPortalServer.send(200, "text/plain", "Terminal gereset naar IDLE.");
  } else {
    setupPortalServer.send(400, "text/plain", "Onbekende actie");
  }
}

void handleSecretsDownload() {
  JsonDocument doc;
  doc["ssid"] = activeSsid;
  doc["password"] = activePass;
  doc["terminalId"] = activeTerminalId;
  doc["firestoreDocBase"] = activeFirestoreDocBase;
  doc["firebaseApiKey"] = activeFirestoreApiKey;
  String out;
  serializeJsonPretty(doc, out);
  setupPortalServer.sendHeader("Content-Disposition", "attachment; filename=\\"secrets.json\\"");
  setupPortalServer.send(200, "application/json", out);
}

void handlePortalSave() {
  String s = setupPortalServer.arg("ssid");
  String p = setupPortalServer.arg("pass");
  bool openWifi = setupPortalServer.hasArg("openwifi");
  String t = setupPortalServer.arg("termid");
  String fbUrl = setupPortalServer.arg("fburl");
  String fbKey = setupPortalServer.arg("fbkey");
  s.trim();
  t.trim();
  fbUrl.trim();
  fbKey.trim();

  String nextPass = openWifi ? String("") : (p.length() > 0 ? p : activePass);
  String nextTid = t.length() > 0 ? sanitizeTerminalId(t) : activeTerminalId;
  String nextBase = fbUrl.length() > 0 ? fbUrl : activeFirestoreDocBase;
  String nextKey = fbKey.length() > 0 ? fbKey : activeFirestoreApiKey;

  if (s.length() == 0 || nextTid.length() == 0) {
    setupPortalServer.send(400, "text/plain", "WiFi SSID en Terminal ID zijn verplicht.");
    return;
  }
  saveSecrets(s, nextPass, nextTid, nextBase, nextKey);
  Serial.println("[SETUP] Opgeslagen: SSID=" + s + " Terminal=" + nextTid);
  setupPortalServer.send(200, "text/html", "<html><body style='font-family:sans-serif;background:#020617;color:#10b981;padding:24px'><h2>Opgeslagen!</h2><p>Secrets opgeslagen voor terminal <b>" + escapeHtmlAttr(nextTid) + "</b>. Herstarten...</p></body></html>");
  lcdShow("Secrets bewaard", nextTid);
  delay(800);
  rp2040.reboot();
}

void registerWebRoutes() {
  static bool routesRegistered = false;
  if (routesRegistered) return;
  routesRegistered = true;
  setupPortalServer.on("/", HTTP_GET, handleWebRoot);
  setupPortalServer.on("/api/status", HTTP_GET, handleApiStatus);
  setupPortalServer.on("/api/action", HTTP_POST, handleApiAction);
  setupPortalServer.on("/secrets.json", HTTP_GET, handleSecretsDownload);
  setupPortalServer.on("/save", HTTP_POST, handlePortalSave);
}

void startLocalWebServer() {
  if (webServerStarted) return;
  registerWebRoutes();
  setupPortalServer.begin();
  webServerStarted = true;
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[WEB] Dashboard actief op http://" + WiFi.localIP().toString() + "/");
  }
}

void startApSetupPortal() {
  if (!apPortalActive) {
    apPortalActive = true;
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP("WerkPay-Setup");
    Serial.println("[SETUP] Hotspot actief: 'WerkPay-Setup' -> http://192.168.4.1");
  }
  startLocalWebServer();
  if (activeTerminalId.length() == 0 && WiFi.status() == WL_CONNECTED) {
    lcdShow("Geen Terminal-ID", WiFi.localIP().toString());
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
    if (ch == '\\r') continue;
    if (ch == '\\n') {
      String cmd = serialRxBuffer;
      serialRxBuffer = "";
      cmd.trim();
      if (cmd == "PING") {
        Serial.println("PONG:WERKPAY_TERMINAL:" + activeTerminalId + ":" + String(FIRMWARE_VERSION));
      } else if (cmd == "STATUS") {
        Serial.println("[STATUS] FW=" + String(FIRMWARE_VERSION) +
          " State=" + String((int)currentState) +
          " NFC=" + String(nfcReady ? "OK" : "ERR") +
          " I2C_0x24=" + String(isI2CDevicePresent(0x24) ? "ACK" : "NOACK") +
          " WiFi=" + String((int)WiFi.status()) +
          " Term=" + activeTerminalId);
      } else if (cmd == "CLEAR_WIFI") {
        WifiPrefsV3 empty;
        memset(&empty, 0, sizeof(empty));
        EEPROM.put(0, empty);
        EEPROM.commit();
        if (littleFsReady && LittleFS.exists("/secrets.json")) {
          LittleFS.remove("/secrets.json");
        }
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
            startLocalWebServer();
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
  nfcPhase = NFC_IDLE;
  activeUsername = "";
  pendingAmount = "0.00";
  pendingOrderNo = "0";
  isLoginSession = false;
  scannedUid = "";
  enteredPin = "";
  if (apPortalActive && WiFi.status() != WL_CONNECTED) {
    lcdShow("WiFi:WerkPay-Set", "IP: 192.168.4.1");
  } else if (activeTerminalId.length() == 0) {
    lcdShow("Geen Terminal-ID", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("AP: 192.168.4.1"));
  } else {
    String top = (activeTerminalId.length() <= 7) ? ("WerkPay " + activeTerminalId) : String("WerkPay " + String(FIRMWARE_VERSION));
    String bot = (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : String("Geen WiFi");
    lcdShow(top, bot);
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
  keyArmed = true;
  lastRawKey = 0;
  keyZeroSinceMs = millis();
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
  delay(3);
  char r2 = readRawKeypadOnce();
  return (r1 == r2) ? r1 : 0;
}

// Directe 1-pass toetsdetectie: mist nooit een toets ook tijdens netwerkpolling
char scanKeypad() {
  char raw = readRawKeypadStable();
  unsigned long now = millis();

  if (raw != 0) {
    lastKeyActivityMs = now;
    if (keyArmed) {
      keyArmed = false;
      lastRawKey = raw;
      lastKeySeen = raw;
      laatsteToetsTijd = now;
      return raw;
    }
    return 0;
  }

  if (!keyArmed) {
    if (lastRawKey != 0) {
      lastRawKey = 0;
      keyZeroSinceMs = now;
    } else if (now - keyZeroSinceMs >= KEY_RELEASE_DEBOUNCE_MS) {
      keyArmed = true;
    }
  }
  return 0;
}

bool isI2CDevicePresent(uint8_t addr) {
  Wire.beginTransmission(addr);
  return (Wire.endTransmission() == 0);
}

String scanI2CAddresses() {
  String found = "";
  for (uint8_t addr = 0x08; addr <= 0x77; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      if (found.length() > 0) found += ", ";
      found += "0x";
      if (addr < 16) found += "0";
      found += String(addr, HEX);
    }
  }
  return found.length() > 0 ? found : String("Geen");
}

bool bbSclHighWait(unsigned long maxMs) {
  pinMode(I2C_SCL_PIN, INPUT_PULLUP);
  unsigned long t0 = millis();
  while (digitalRead(I2C_SCL_PIN) == LOW) {
    if (millis() - t0 >= maxMs) return false;
    delayMicroseconds(20);
  }
  return true;
}

bool bbStart() {
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  pinMode(I2C_SCL_PIN, INPUT_PULLUP);
  delayMicroseconds(10);
  if (digitalRead(I2C_SCL_PIN) == LOW) { lastBbDiag = "SCL laag voor start"; return false; }
  if (digitalRead(I2C_SDA_PIN) == LOW) { lastBbDiag = "SDA laag voor start"; return false; }
  pinMode(I2C_SDA_PIN, OUTPUT);
  digitalWrite(I2C_SDA_PIN, LOW);
  delayMicroseconds(8);
  pinMode(I2C_SCL_PIN, OUTPUT);
  digitalWrite(I2C_SCL_PIN, LOW);
  delayMicroseconds(8);
  return true;
}

void bbStop() {
  pinMode(I2C_SDA_PIN, OUTPUT);
  digitalWrite(I2C_SDA_PIN, LOW);
  delayMicroseconds(8);
  bbSclHighWait(40);
  delayMicroseconds(8);
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  delayMicroseconds(10);
}

bool bbWriteByte(uint8_t b, bool& ack) {
  for (int i = 7; i >= 0; i--) {
    if ((b >> i) & 0x01) {
      pinMode(I2C_SDA_PIN, INPUT_PULLUP);
    } else {
      pinMode(I2C_SDA_PIN, OUTPUT);
      digitalWrite(I2C_SDA_PIN, LOW);
    }
    delayMicroseconds(6);
    if (!bbSclHighWait(80)) { lastBbDiag = "SCL timeout bit"; return false; }
    delayMicroseconds(8);
    pinMode(I2C_SCL_PIN, OUTPUT);
    digitalWrite(I2C_SCL_PIN, LOW);
    delayMicroseconds(6);
  }
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  delayMicroseconds(6);
  if (!bbSclHighWait(80)) { lastBbDiag = "SCL timeout ACK"; return false; }
  delayMicroseconds(6);
  ack = (digitalRead(I2C_SDA_PIN) == LOW);
  pinMode(I2C_SCL_PIN, OUTPUT);
  digitalWrite(I2C_SCL_PIN, LOW);
  delayMicroseconds(6);
  return true;
}

bool bbReadByte(bool sendAck, uint8_t& outByte) {
  uint8_t val = 0;
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  for (int i = 7; i >= 0; i--) {
    delayMicroseconds(6);
    if (!bbSclHighWait(80)) { lastBbDiag = "SCL timeout read"; return false; }
    if (digitalRead(I2C_SDA_PIN) == HIGH) val |= (1 << i);
    delayMicroseconds(6);
    pinMode(I2C_SCL_PIN, OUTPUT);
    digitalWrite(I2C_SCL_PIN, LOW);
    delayMicroseconds(6);
  }
  if (sendAck) {
    pinMode(I2C_SDA_PIN, OUTPUT);
    digitalWrite(I2C_SDA_PIN, LOW);
  } else {
    pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  }
  delayMicroseconds(6);
  if (!bbSclHighWait(80)) { lastBbDiag = "SCL timeout rACK"; return false; }
  delayMicroseconds(6);
  pinMode(I2C_SCL_PIN, OUTPUT);
  digitalWrite(I2C_SCL_PIN, LOW);
  pinMode(I2C_SDA_PIN, INPUT_PULLUP);
  delayMicroseconds(6);
  outByte = val;
  return true;
}

bool bbI2cWrite(uint8_t addr7, const uint8_t* data, uint8_t len) {
  Wire.end();
  delayMicroseconds(40);
  lastBbDiag = "";
  bool ok = false;
  if (bbStart()) {
    bool ack = false;
    if (bbWriteByte((uint8_t)(addr7 << 1), ack)) {
      if (!ack) {
        lastBbDiag = "Addr 0x" + String(addr7 << 1, HEX) + " NACK";
      } else {
        ok = true;
        for (uint8_t i = 0; i < len; i++) {
          bool bAck = false;
          if (!bbWriteByte(data[i], bAck)) { ok = false; break; }
          if (!bAck) { lastBbDiag = "Data NACK b" + String(i); ok = false; break; }
        }
      }
    }
    bbStop();
  }
  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.begin();
  return ok;
}

byte bbI2cRead(uint8_t addr7, uint8_t* outBuf, uint8_t len) {
  Wire.end();
  delayMicroseconds(40);
  byte got = 0;
  if (bbStart()) {
    bool ack = false;
    if (bbWriteByte((uint8_t)((addr7 << 1) | 0x01), ack) && ack) {
      for (uint8_t i = 0; i < len; i++) {
        uint8_t b = 0;
        if (!bbReadByte(i + 1 < len, b)) break;
        outBuf[got++] = b;
      }
    }
    bbStop();
  }
  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.begin();
  return got;
}

bool pn532WriteFrame(const uint8_t* frame, uint8_t frameLen) {
  if (!useSoftI2cNfc) {
    Wire.beginTransmission((uint8_t)PN532_I2C_ADDR);
    Wire.write(frame, frameLen);
    lastNfcWriteErr = Wire.endTransmission();
    if (lastNfcWriteErr == 0) {
      return true;
    }
    // Hardware Wire faalde (bijv. RP2040 clock-stretch timeout err=5): schakel over op open-drain Soft I2C!
    bool bbOk = bbI2cWrite(PN532_I2C_ADDR, frame, frameLen);
    if (!bbOk) {
      delay(12);
      bbOk = bbI2cWrite(PN532_I2C_ADDR, frame, frameLen);
    }
    if (bbOk) {
      useSoftI2cNfc = true;
      Serial.println("[NFC] Hardware Wire err=" + String(lastNfcWriteErr) + " -> overgeschakeld op Soft I2C!");
      return true;
    }
    return false;
  }

  if (bbI2cWrite(PN532_I2C_ADDR, frame, frameLen)) {
    return true;
  }
  delay(8);
  return bbI2cWrite(PN532_I2C_ADDR, frame, frameLen);
}

byte pn532ReadRawBytes(uint8_t* outBuf, uint8_t count) {
  if (useSoftI2cNfc) {
    return bbI2cRead(PN532_I2C_ADDR, outBuf, count);
  }
  byte got = Wire.requestFrom((uint8_t)PN532_I2C_ADDR, count);
  byte idx = 0;
  while (Wire.available() && idx < count) {
    outBuf[idx++] = Wire.read();
  }
  while (Wire.available()) Wire.read();
  return idx;
}

bool pn532WriteCommand(const uint8_t* payload, uint8_t payloadLen) {
  if (payloadLen == 0 || payloadLen > 32) return false;
  uint8_t frame[40];
  uint8_t len = payloadLen + 1; // +1 voor TFI (0xD4)
  uint8_t lcs = (uint8_t)(0x100 - len);
  uint8_t sum = 0xD4;
  for (uint8_t i = 0; i < payloadLen; i++) {
    sum += payload[i];
  }
  uint8_t dcs = (uint8_t)(0x100 - sum);

  frame[0] = 0x00;
  frame[1] = 0x00;
  frame[2] = 0xFF;
  frame[3] = len;
  frame[4] = lcs;
  frame[5] = 0xD4;
  memcpy(&frame[6], payload, payloadLen);
  frame[6 + payloadLen] = dcs;
  frame[7 + payloadLen] = 0x00;
  uint8_t frameLen = (uint8_t)(8 + payloadLen);

  return pn532WriteFrame(frame, frameLen);
}

bool pn532WaitAck(unsigned long timeoutMs, String& debugHex) {
  debugHex = "";
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    uint8_t buf[8] = {0};
    byte idx = pn532ReadRawBytes(buf, 7);

    if (idx > 0) {
      debugHex = "got=" + String(idx) + " [";
      for (byte i = 0; i < idx && i < 7; i++) {
        if (i > 0) debugHex += " ";
        if (buf[i] < 16) debugHex += "0";
        debugHex += String(buf[i], HEX);
      }
      debugHex += "]";
    }

    if (idx >= 6 && (buf[0] & 0x01) == 0x01) {
      for (byte off = 1; off + 4 < idx; off++) {
        if (buf[off] == 0x00 && buf[off + 1] == 0x00 && buf[off + 2] == 0xFF &&
            buf[off + 3] == 0x00 && buf[off + 4] == 0xFF) {
          return true;
        }
      }
    }
    delay(4);
  }
  if (debugHex.length() == 0) debugHex = "geen bytes (NACK)";
  return false;
}

bool pn532ReadResponse(uint8_t* outPayload, uint8_t maxPayload, uint8_t& outLen, unsigned long timeoutMs, String& debugHex) {
  outLen = 0;
  debugHex = "";
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    uint8_t buf[32] = {0};
    uint8_t reqLen = (uint8_t)min((int)(maxPayload + 10), 32);
    byte idx = pn532ReadRawBytes(buf, reqLen);

    if (idx > 0) {
      debugHex = "got=" + String(idx) + " [";
      for (byte i = 0; i < idx && i < 10; i++) {
        if (i > 0) debugHex += " ";
        if (buf[i] < 16) debugHex += "0";
        debugHex += String(buf[i], HEX);
      }
      debugHex += "]";
    }

    if (idx >= 9 && (buf[0] & 0x01) == 0x01) {
      for (byte off = 1; off + 6 < idx; off++) {
        if (buf[off] == 0x00 && buf[off + 1] == 0x00 && buf[off + 2] == 0xFF) {
          uint8_t len = buf[off + 3];
          uint8_t lcs = buf[off + 4];
          if (len >= 2 && ((uint8_t)(len + lcs) == 0x00) && (off + 5 + len) <= idx) {
            if (buf[off + 5] == 0xD5) {
              uint8_t payloadBytes = len - 1;
              if (payloadBytes <= maxPayload) {
                memcpy(outPayload, &buf[off + 6], payloadBytes);
                outLen = payloadBytes;
                return true;
              }
            }
          }
        }
      }
    }
    delay(5);
  }
  if (debugHex.length() == 0) debugHex = "timeout";
  return false;
}

bool pn532SendCommand(const uint8_t* cmd, uint8_t cmdLen, uint8_t* resp, uint8_t maxResp, uint8_t& respLen, unsigned long timeoutMs) {
  String dbg;
  if (!pn532WriteCommand(cmd, cmdLen)) {
    nfcDiagNote = "0x24 HW err=" + String(lastNfcWriteErr) + (lastBbDiag.length() > 0 ? (" | BB: " + lastBbDiag) : "");
    return false;
  }
  if (!pn532WaitAck(180, dbg)) {
    nfcDiagNote = "0x24 geen frame-ACK (" + dbg + ")";
    return false;
  }
  if (!pn532ReadResponse(resp, maxResp, respLen, timeoutMs, dbg)) {
    nfcDiagNote = "0x24 geen antwoord (" + dbg + ")";
    return false;
  }
  return true;
}

bool pn532InitRaw() {
  nfcFirmwareText = "";
  useSoftI2cNfc = false;

  uint8_t resp[24] = {0};
  uint8_t respLen = 0;
  for (int attempt = 0; attempt < 2; attempt++) {
    const uint8_t cmdFw[1] = {0x02}; // GetFirmwareVersion
    if (pn532SendCommand(cmdFw, 1, resp, sizeof(resp), respLen, 220)) {
      if (respLen >= 5 && resp[0] == 0x03) {
        uint8_t icType = resp[1];
        nfcFirmwareText = "v" + String(resp[2]) + "." + String(resp[3]);
        const uint8_t cmdSam[4] = {0x14, 0x01, 0x14, 0x01};
        if (pn532SendCommand(cmdSam, 4, resp, sizeof(resp), respLen, 220) && respLen >= 1 && resp[0] == 0x15) {
          const uint8_t cmdRetries[5] = {0x32, 0x05, 0xFF, 0x01, 0x01};
          pn532SendCommand(cmdRetries, 5, resp, sizeof(resp), respLen, 160);

          nfcReady = true;
          nfcConsecutiveErrors = 0;
          String busMode = useSoftI2cNfc ? String("SoftI2C") : String("HW");
          nfcDiagNote = "OK (" + nfcFirmwareText + " " + busMode + ")";
          Serial.println("[NFC] PN532 OK (" + nfcFirmwareText + ", IC=0x" + String(icType, HEX) + ", " + busMode + ")");
          return true;
        } else {
          nfcDiagNote = "FW " + nfcFirmwareText + " ok, SAMConfig mislukt";
        }
      } else {
        nfcDiagNote = "0x24 onverwachte FW-bytes (len=" + String(respLen) + ")";
      }
    }
    delay(25);
  }

  nfcReady = false;
  Serial.println("[NFC] Init mislukt: " + nfcDiagNote);
  return false;
}

// Herstelt een vastgelopen I2C-bus (bijv. na PN532 RF-piek) zonder reboot
void recoverI2CAndNfc() {
  unsigned long now = millis();
  if (now - lastNfcRecoverMs < 2500) return;
  lastNfcRecoverMs = now;
  nfcPhase = NFC_IDLE;

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
  Wire.begin();
  delay(25);

  if (isI2CDevicePresent(0x27)) {
    lcd.init();
    lcd.backlight();
  }

  pn532InitRaw();
}

// Volledig non-blocking single-shot I2C PN532 detectie (< 1ms per loop)
bool pollNfcCardNonBlocking(String& outUid) {
  unsigned long now = millis();
  if (!nfcReady) {
    if (now - lastNfcRecoverMs >= 3000) {
      recoverI2CAndNfc();
    }
    return false;
  }

  if (nfcPhase == NFC_IDLE) {
    if (now - lastNfcScanMs < NFC_SCAN_INTERVAL_MS) {
      return false;
    }
    lastNfcScanMs = now;

    // Stuur InListPassiveTarget (MaxTg=1, 106kbps Type A)
    const uint8_t cmdInList[11] = {
      0x00, 0x00, 0xFF, 0x04, 0xFC, 0xD4, 0x4A, 0x01, 0x00, 0xE1, 0x00
    };
    if (pn532WriteFrame(cmdInList, sizeof(cmdInList))) {
      nfcPhase = NFC_WAIT_ACK;
      nfcPhaseAtMs = now;
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

  if (nfcPhase == NFC_WAIT_ACK) {
    if (now - lastNfcReadyCheckMs >= 5) {
      lastNfcReadyCheckMs = now;
      uint8_t ackBuf[8] = {0};
      byte idx = pn532ReadRawBytes(ackBuf, 7);

      if (idx >= 6 && (ackBuf[0] & 0x01) == 0x01) {
        bool validAck = false;
        for (byte off = 1; off + 4 < idx; off++) {
          if (ackBuf[off] == 0x00 && ackBuf[off + 1] == 0x00 && ackBuf[off + 2] == 0xFF &&
              ackBuf[off + 3] == 0x00 && ackBuf[off + 4] == 0xFF) {
            validAck = true;
            break;
          }
        }
        if (validAck) {
          nfcPhase = NFC_WAIT_TAG;
          nfcPhaseAtMs = now;
          lastNfcReadyCheckMs = now;
          return false;
        }
        nfcPhase = NFC_IDLE;
        lastNfcScanMs = now;
        return false;
      }
    }
    if (now - nfcPhaseAtMs >= 70) {
      nfcPhase = NFC_IDLE;
      lastNfcScanMs = now;
      nfcConsecutiveErrors++;
      if (nfcConsecutiveErrors >= 3) {
        recoverI2CAndNfc();
      }
    }
    return false;
  }

  // NFC_WAIT_TAG: single-shot 28 bytes (RDY byte + max 10-byte UID response frame)
  if (now - lastNfcReadyCheckMs >= 16) {
    lastNfcReadyCheckMs = now;
    uint8_t buf[28] = {0};
    byte idx = pn532ReadRawBytes(buf, 28);

    if (idx >= 10 && (buf[0] & 0x01) == 0x01) {
      nfcPhase = NFC_IDLE;
      lastNfcScanMs = now;

      for (byte off = 1; off + 8 < idx; off++) {
        if (buf[off] == 0x00 && buf[off + 1] == 0x00 && buf[off + 2] == 0xFF &&
            buf[off + 5] == 0xD5 && buf[off + 6] == 0x4B) {
          if (buf[off + 7] >= 1 && (off + 13) < idx) {
            uint8_t uidLen = buf[off + 12];
            if (uidLen > 0 && uidLen <= 10 && (off + 13 + uidLen) <= idx) {
              outUid = "";
              for (uint8_t i = 0; i < uidLen; i++) {
                if (buf[off + 13 + i] < 0x10) outUid += "0";
                outUid += String(buf[off + 13 + i], HEX);
              }
              outUid.toUpperCase();
              lastUidSeen = outUid;
              return true;
            }
          }
          return false;
        }
      }
      return false;
    }
  }

  if (now - nfcPhaseAtMs >= 450) {
    nfcPhase = NFC_IDLE;
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
      lastCloudHttpCode = code;
      if (code >= 200 && code < 300) {
        lastCloudNote = "OK (PATCH)";
        return true;
      }
      lastCloudNote = "PATCH fout " + String(code);
      Serial.println("[CLOUD] PATCH HTTP fout: " + String(code));
    } else {
      lastCloudHttpCode = code;
      lastCloudNote = "Geen verbinding (" + String(code) + ")";
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
  nfcPhase = NFC_IDLE;
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
  nfcPhase = NFC_IDLE;
  lastNfcScanMs = millis();
  stateTimer = millis();
  lastScanUiTickMs = millis();
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
  nfcPhase = NFC_IDLE;
  lastNfcScanMs = millis();
  stateTimer = millis();
  lastScanUiTickMs = millis();
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
  nfcPhase = NFC_IDLE;
  lastNfcScanMs = millis();
  stateTimer = millis();
  lastScanUiTickMs = millis();
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
    lastCloudHttpCode = code;
    lastCloudNote = "Time-out / Netwerkfout (" + String(code) + ")";
    return;
  }

  lastCloudHttpCode = code;
  if (code == 404) {
    lastCloudNote = "Doc aanmaken (404)";
    if (lastHttpErr != 404) {
      Serial.println("[CLOUD] Terminal doc aanmaken...");
      lastHttpErr = 404;
    }
    patchStatusIdle("Boot");
    return;
  }
  if (code != 200) {
    lastCloudNote = "HTTP fout " + String(code);
    if (lastHttpErr != code) {
      Serial.println("[CLOUD] HTTP fout: " + String(code));
      lastHttpErr = code;
    }
    return;
  }
  lastHttpErr = 0;
  lastCloudNote = "Online";

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
  Serial.println("[BOOT] WerkPay Terminal " + String(FIRMWARE_VERSION) + " start...");

  EEPROM.begin(512);
  littleFsReady = LittleFS.begin();
  Serial.println(littleFsReady ? "[SECRETS] LittleFS actief (/secrets.json ondersteund)" : "[SECRETS] LittleFS niet actief (Flash Size staat op 'no FS', EEPROM wordt gebruikt)");
  pinMode(BUZZER_PIN, OUTPUT);

  for (int i = 0; i < ROWS; i++) {
    pinMode(rowPins[i], INPUT_PULLUP);
  }
  for (int i = 0; i < COLS; i++) {
    pinMode(colPins[i], INPUT);
  }

  Wire.setSDA(I2C_SDA_PIN);
  Wire.setSCL(I2C_SCL_PIN);
  Wire.begin();
  delay(100);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcdShow("WerkPay " + String(FIRMWARE_VERSION), "NFC checken...");
  pn532InitRaw();

  lcdShow("WerkPay " + String(FIRMWARE_VERSION), "WiFi verbinden..");

  loadWifiConfig();
  if (connectWifiBlocking(45)) {
    lcdShow("WiFi Verbonden!", WiFi.localIP().toString());
    startLocalWebServer();
    delay(650);
    if (activeTerminalId.length() == 0) {
      startApSetupPortal();
      delay(800);
    }
  } else {
    if (activeSsid.length() > 0) {
      lcdShow("WiFi fout (" + String((int)WiFi.status()) + ")", activeSsid);
      delay(1200);
    }
    startApSetupPortal();
    delay(1200);
  }

  if (!nfcReady) {
    lcdShow("NFC checken...", (WiFi.status() == WL_CONNECTED) ? WiFi.localIP().toString() : String("192.168.4.1"));
    if (!pn532InitRaw()) {
      lcdShow("NFC fout (0x24)", nfcDiagNote);
      delay(900);
    }
  }

  secureClient.setInsecure();
  needsBootOnlinePatch = (WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0);
  Serial.println("[READY] " + String(FIRMWARE_VERSION) + " Terminal=" + (activeTerminalId.length() > 0 ? activeTerminalId : String("(geen)")) + " IP=" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : String("offline")));
  beep(2000, 90);
  beep(3000, 130);
  setIdleScreen();
}

void loop() {
  unsigned long now = millis();

  // 0. Non-blocking buzzer, USB configuratie en lokale website / AP portaal altijd responsief houden
  updateBuzzer();
  handleSerialCommands();
  if (webServerStarted) {
    setupPortalServer.handleClient();
  }
  if (apPortalActive && WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0) {
    apPortalActive = false;
    WiFi.softAPdisconnect(true);
    Serial.println("[WIFI] Online! IP=" + WiFi.localIP().toString() + " Terminal=" + activeTerminalId);
    needsBootOnlinePatch = true;
    setIdleScreen();
  }
  if (needsBootOnlinePatch && WiFi.status() == WL_CONNECTED && activeTerminalId.length() > 0) {
    needsBootOnlinePatch = false;
    patchStatusIdle("Online");
  }

  // 1. Scan keypad ALTIJD eerst zodat Annuleren/toetsen direct reageren
  char key = scanKeypad();

  if (currentState == STATE_IDLE || currentState == STATE_SHOW_RESULT) {
    if (key == 'B' && currentState == STATE_IDLE) {
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
      Serial.println("[KEY] Annuleren ingedrukt: " + String(key));
      nfcPhase = NFC_IDLE;
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

    // Live heartbeat dot op LCD (col 8, row 1): bewijst dat loop() draait en toont ! als NFC niet reageert
    if (now - lastScanUiTickMs >= 550) {
      lastScanUiTickMs = now;
      scanUiDotOn = !scanUiDotOn;
      lcd.setCursor(8, 1);
      lcd.print(!nfcReady ? "!" : (scanUiDotOn ? "." : " "));
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
    pollInterval = 3200;
  } else if (currentState == STATE_WAITING_PIN || currentState == STATE_WAITING_RESULT) {
    pollInterval = 1800;
  }
  unsigned long keyQuietMs = (currentState == STATE_WAITING_PIN) ? 2000 : 350;
  bool magPollen = (now - lastKeyActivityMs > keyQuietMs);
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

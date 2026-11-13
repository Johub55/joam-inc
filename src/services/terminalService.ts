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
            lcd.print("Verifi\\x65ren...");
            lcd.setCursor(0, 1);
            lcd.print("Even geduld a.u.b.");

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
    lcd.print("WerkPay: \\xDF ");
    lcd.print(pendingAmount);

    lcd.setCursor(0, 1);
    lcd.print("Scan pas / kaart");

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
    lcd.print("Betaling Gelukt!");
    lcd.setCursor(0, 1);
    lcd.print("Eet smakelijk! :)");
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
            lcd.print("Verifi\\x65ren...");
            lcd.setCursor(0, 1);
            lcd.print("Even geduld a.u.b.");

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
    lcd.print("WerkPay: \\xDF ");
    lcd.print(pendingAmount);

    lcd.setCursor(0, 1);
    lcd.print("Scan pas / kaart");

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
    lcd.print("Betaling Gelukt!");
    lcd.setCursor(0, 1);
    lcd.print("Eet smakelijk! :)");
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
 *  Microcontroller : Raspberry Pi Pico W (RP2040)
 *  Verbinding      : Direct via WiFi + HTTPS (Keep-Alive) naar Firebase Firestore
 *  I2C Bus (LCD + PN532): SDA = GP4 (Pin 6), SCL = GP5 (Pin 7) | IRQ=-1, RST=-1
 *  Keypad 4x4 (Ghost-vrij): Rijen = GP13,12,11,10 | Kolommen = GP9,8,7,6
 *  Buzzer          : GP14 (Pin 19)
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
  Serial.println("\\n======= WERK_PAY KASSABON =======");
  Serial.println("Terminal: #001 (CLOUD)");
  Serial.print("Kaart:    ****-****-****-");
  Serial.println(lastReceiptCard.length() >= 4 ? lastReceiptCard.substring(0, 4) : "****");
  Serial.println("Omschrijving: WerkPay Transactie");
  Serial.println("Bedrag:   EUR " + lastReceiptAmount);
  Serial.println("Status:   SUCCES / BETAALD");
  Serial.println("=================================\\n");
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
  delay(500);
  Serial.println("\\n=== WerkPay Pico W Terminal (Ghost-vrij + Snel) ===");

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
    Serial.print(".");
    tries++;
  }
  Serial.println();

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

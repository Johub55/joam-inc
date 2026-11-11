import React, { useState, useEffect } from 'react';
import { 
  terminalManager, 
  ARDUINO_SKETCH_CODE, 
  PICO_W_SKETCH_CODE,
  PICO_W_I2C_NFC_SKETCH_CODE,
  TerminalCallbacks 
} from '../../services/terminalService';
import { showToast } from '../../services/appToast';
import { 
  Cpu, 
  Usb, 
  Download, 
  Copy, 
  Check, 
  X, 
  Radio, 
  Key, 
  Sparkles, 
  AlertCircle, 
  Play, 
  Layers,
  HelpCircle,
  Smartphone,
  Info,
  ShieldAlert
} from 'lucide-react';

interface DiyTerminalModalProps {
  onClose: () => void;
  onSimulateCardScan?: (uid: string, pin: string) => void;
}

export const DiyTerminalModal: React.FC<DiyTerminalModalProps> = ({ onClose, onSimulateCardScan }) => {
  const [selectedBoard, setSelectedBoard] = useState<'pico_w' | 'arduino'>('pico_w');
  const [nfcMode, setNfcMode] = useState<'i2c' | 'spi'>('i2c');
  const [isConnected, setIsConnected] = useState<boolean>(terminalManager.getIsConnected());
  const [terminalStatus, setTerminalStatus] = useState<string>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'connect' | 'code' | 'wiring' | 'guide' | 'simulator'>('wiring');

  // Simulator State
  const [simLcdLine1, setSimLcdLine1] = useState<string>('Werkdonalds POS');
  const [simLcdLine2, setSimLcdLine2] = useState<string>('Klaar voor order');
  const [simUid, setSimUid] = useState<string>('4129883155049012');
  const [simPin, setSimPin] = useState<string>('');
  const [simState, setSimState] = useState<'idle' | 'card_scanned' | 'approved' | 'declined'>('idle');

  const currentSketchCode = selectedBoard === 'pico_w' 
    ? (nfcMode === 'i2c' ? PICO_W_I2C_NFC_SKETCH_CODE : PICO_W_SKETCH_CODE)
    : ARDUINO_SKETCH_CODE;
  const currentFilename = selectedBoard === 'pico_w' 
    ? (nfcMode === 'i2c' ? 'WerkPay_PicoW_I2C_NFC_Terminal.ino' : 'WerkPay_PicoW_Terminal.ino')
    : 'WerkPay_DIY_Terminal.ino';

  useEffect(() => {
    const callbacks: TerminalCallbacks = {
      onStatusChange: (status) => {
        setTerminalStatus(status);
        setIsConnected(terminalManager.getIsConnected());
      },
      onLog: (msg) => {
        setLogs(prev => [msg, ...prev.slice(0, 40)]);
      },
      onPaymentData: (data) => {
        if (onSimulateCardScan) {
          onSimulateCardScan(data.uid, data.pin);
        }
      }
    };
    terminalManager.setCallbacks(callbacks);
  }, [onSimulateCardScan]);

  const handleConnectUsb = async () => {
    const res = await terminalManager.connect();
    setIsConnected(terminalManager.getIsConnected());
    if (!res.success) {
      showToast(res.message, 'error');
    }
  };

  const handleDisconnectUsb = async () => {
    await terminalManager.disconnect();
    setIsConnected(false);
  };

  const handleCopyCode = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentSketchCode);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = currentSketchCode;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (e) {
      console.warn("Fallback copy method used due to clipboard error:", e);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadIno = () => {
    const blob = new Blob([currentSketchCode], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = currentFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  // Simulator actions
  const handleSimTapCard = () => {
    setSimState('card_scanned');
    setSimLcdLine1('Pas herkend!');
    setSimLcdLine2('Pincode: ');
    setSimPin('');
  };

  const handleSimKeyPress = (char: string) => {
    if (simState !== 'card_scanned') return;

    if (char === '*') {
      setSimPin(prev => prev.slice(0, -1));
      return;
    }
    if (char === 'D') {
      setSimState('idle');
      setSimLcdLine1('Geannuleerd!');
      setSimLcdLine2('');
      setTimeout(() => {
        setSimLcdLine1('Werkdonalds POS');
        setSimLcdLine2('Klaar voor order');
      }, 1200);
      return;
    }
    if (char === '#' || char === 'A') {
      if (simPin.length >= 4) {
        setSimLcdLine1('Verifiëren...');
        setSimLcdLine2('Even geduld a.u.b.');
        setTimeout(() => {
          setSimState('approved');
          setSimLcdLine1('Betaling Gelukt!');
          setSimLcdLine2('Eet smakelijk! :)');
          if (onSimulateCardScan) {
            onSimulateCardScan(simUid, simPin);
          }
          setTimeout(() => {
            setSimState('idle');
            setSimLcdLine1('Werkdonalds POS');
            setSimLcdLine2('Klaar voor order');
            setSimPin('');
          }, 2500);
        }, 1000);
      }
      return;
    }
    if (simPin.length < 6) {
      setSimPin(prev => prev + char);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>DIY Pinapparaat (Hardware Terminal)</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
                  isConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {isConnected ? '● USB Verbonden' : '○ Standby / Niet Verbonden'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Ondersteunt Raspberry Pi Pico W (2022 RP2040) &amp; Arduino Uno/Nano met I2C LCD, RC522 RFID en 4x4 Keypad.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Board Selection Bar */}
        <div className="px-5 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Board:</span>
              <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedBoard('pico_w')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${
                    selectedBoard === 'pico_w'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>🍓 Raspberry Pi Pico W (2022)</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-900/40 text-cyan-950 font-bold">Aanbevolen</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBoard('arduino')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition ${
                    selectedBoard === 'arduino'
                      ? 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Arduino Uno / Nano (5V)
                </button>
              </div>
            </div>

            {selectedBoard === 'pico_w' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">NFC Type:</span>
                <div className="inline-flex p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setNfcMode('i2c')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                      nfcMode === 'i2c'
                        ? 'bg-purple-500 text-white shadow font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>I2C Bus (SDA/SCL)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNfcMode('spi')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                      nfcMode === 'spi'
                        ? 'bg-purple-500 text-white shadow font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>SPI Bus</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-cyan-400 font-medium hidden lg:block">
            {selectedBoard === 'pico_w' 
              ? `⚡ 3.3V Logic · RP2040 Chip · NFC via ${nfcMode.toUpperCase()}` 
              : '⚡ 5V Logic · ATmega328P · 16 MHz'}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-2 text-xs font-bold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('wiring')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'wiring' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Aansluitschema (Breadboard)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'guide' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Arduino IDE v2 Handleiding</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'code' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{selectedBoard === 'pico_w' ? 'Pico W .INO Code' : 'Arduino .INO Code'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('connect')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'connect' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>USB Koppeling &amp; Serial Monitor</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl transition ${
              activeTab === 'simulator' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Browser Simulator</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          
          {/* TAB: WIRING */}
          {activeTab === 'wiring' && (
            <div className="space-y-4">
              {selectedBoard === 'pico_w' ? (
                <>
                  {/* Warning banner */}
                  <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex items-start gap-3 text-xs">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-slate-300">
                      <strong className="text-amber-300 block font-bold">
                        Scherp opgemerkt: Spanning (3.3V) &amp; I2C Pull-ups op Raspberry Pi Pico W!
                      </strong>
                      <p>
                        De Raspberry Pi Pico W werkt op <strong>3.3V logica</strong>! Sluit <strong>nooit</strong> 5V aan op de GPIO pinnen (GP0 t/m GP28).
                      </p>
                      <div className="mt-2 space-y-1.5 text-slate-400">
                        <p>
                          • <strong>RC522 RFID lezer:</strong> Sluit altijd aan op <strong>Pin 36 (3V3_OUT)</strong>. Zowel de Pico W als de RC522 zijn native 3.3V, dus dat sluit direct en veilig op elkaar aan.
                        </p>
                        <p>
                          • <strong>I2C LCD Scherm (Veiligste optie):</strong> Sluit VCC van het LCD aan op <strong>Pin 36 (3V3_OUT)</strong>! Vrijwel alle PCF8574 backpacks werken op 3.3V. Draai even met een kleine schroevendraaier aan de <em>blauwe contrast-potmeter</em> achterop het LCD om de letters scherp te stellen. De pull-up weerstandjes trekken dan veilig naar 3.3V!
                        </p>
                        <p>
                          • <strong>LCD op 5V (Pin 40 / VBUS)?</strong> Als je het LCD per se op 5V wilt voor een fellere achtergrond, trekken de ingebouwde pull-up weerstandjes op het I2C-rugzakje de lijnen naar 5V. Gebruik in dat geval een <em>bi-directionele I2C logic level shifter</em> (3.3V &lt;-&gt; 5V) tussen de Pico en het display, of desoldeer de twee pull-up weerstandjes van het I2C-bordje.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Breadboard Setup Tip */}
                  <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 text-xs text-slate-300 space-y-2">
                    <h4 className="font-black text-cyan-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      Plaatsing op het breadboard (sketchboard)
                    </h4>
                    <p>
                      Druk de Raspberry Pi Pico W over de <strong>centrale middengleuf</strong> van je breadboard, met de Micro-USB poort naar boven gericht. Zo heb je aan weerszijden van de Pico (links pinnen 1-20, rechts pinnen 21-40) voldoende gaatjes voor je jumper wires!
                    </p>
                  </div>

                  {/* Pinout Table */}
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-black text-sm text-cyan-300">
                        Aansluittabel: Raspberry Pi Pico W (2022) op Breadboard
                      </h3>
                      <span className="text-[11px] text-slate-400 font-mono">Microcontroller: RP2040</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-bold">
                            <th className="py-2.5 px-3">Module</th>
                            <th className="py-2.5 px-3">Pin op Module</th>
                            <th className="py-2.5 px-3">Fysieke Pico Pin #</th>
                            <th className="py-2.5 px-3">Pico GPIO Naam</th>
                            <th className="py-2.5 px-3">Instructie / Opmerking</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 text-slate-300 font-mono text-[11px]">
                          {/* LCD */}
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3 text-cyan-400 font-sans font-bold" rowSpan={4}>
                              I2C LCD Display<br />
                              <span className="text-[10px] text-slate-400 font-normal">(1602 of 2004)</span>
                            </td>
                            <td className="py-2 px-3">VCC</td>
                            <td className="py-2 px-3 text-emerald-400 font-bold">Pin 36 (of Pin 40)</td>
                            <td className="py-2 px-3 text-emerald-400 font-bold">3V3_OUT (Aanbevolen)</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">
                              Op 3.3V zijn de I2C pull-ups 100% veilig! Draai potmeter achterop voor contrast. (Alleen 5V Pin 40 gebruiken met level shifter).
                            </td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">GND</td>
                            <td className="py-2 px-3 text-slate-400">Pin 38 of Pin 8</td>
                            <td className="py-2 px-3 text-slate-400">GND</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Massa</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">SDA</td>
                            <td className="py-2 px-3 text-emerald-400 font-bold">Pin 6</td>
                            <td className="py-2 px-3 text-emerald-400 font-bold">GP4 (I2C0 SDA)</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Data signaal (I2C)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">SCL</td>
                            <td className="py-2 px-3 text-emerald-400 font-bold">Pin 7</td>
                            <td className="py-2 px-3 text-emerald-400 font-bold">GP5 (I2C0 SCL)</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Klok signaal (I2C)</td>
                          </tr>

                          {/* RFID NFC Lezer */}
                          {nfcMode === 'i2c' ? (
                            <>
                              <tr>
                                <td className="py-2 px-3 text-purple-400 font-sans font-bold" rowSpan={4}>
                                  I2C NFC/RFID Lezer<br />
                                  <span className="text-[10px] text-slate-400 font-normal">(PN532 of RC522 I2C)</span>
                                </td>
                                <td className="py-2 px-3 text-rose-400 font-bold">VCC (3.3V)</td>
                                <td className="py-2 px-3 text-rose-400 font-bold">Pin 36</td>
                                <td className="py-2 px-3 text-rose-400 font-bold">3V3_OUT</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">3.3V voeding (zelfde als LCD)</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">GND</td>
                                <td className="py-2 px-3 text-slate-400">Pin 38 of Pin 23</td>
                                <td className="py-2 px-3 text-slate-400">GND</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">Massa</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3 text-emerald-400 font-bold">SDA</td>
                                <td className="py-2 px-3 text-emerald-400 font-bold">Pin 6</td>
                                <td className="py-2 px-3 text-emerald-400 font-bold">GP4 (I2C0 SDA)</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">Gedeelde I2C Data (samen met LCD op Pin 6!)</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3 text-emerald-400 font-bold">SCL</td>
                                <td className="py-2 px-3 text-emerald-400 font-bold">Pin 7</td>
                                <td className="py-2 px-3 text-emerald-400 font-bold">GP5 (I2C0 SCL)</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">Gedeelde I2C Klok (samen met LCD op Pin 7!)</td>
                              </tr>
                            </>
                          ) : (
                            <>
                              <tr>
                                <td className="py-2 px-3 text-purple-400 font-sans font-bold" rowSpan={7}>
                                  RC522 RFID Lezer<br />
                                  <span className="text-[10px] text-slate-400 font-normal">(13.56 MHz SPI NFC)</span>
                                </td>
                                <td className="py-2 px-3 text-rose-400 font-bold">3.3V (VCC)</td>
                                <td className="py-2 px-3 text-rose-400 font-bold">Pin 36</td>
                                <td className="py-2 px-3 text-rose-400 font-bold">3V3_OUT</td>
                                <td className="py-2 px-3 text-rose-400 font-sans font-bold">LET OP: ALLEEN 3.3V! Nooit op 5V!</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">RST</td>
                                <td className="py-2 px-3 text-purple-300">Pin 26</td>
                                <td className="py-2 px-3 text-purple-300">GP20</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">Reset pin van RFID chip</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">GND</td>
                                <td className="py-2 px-3 text-slate-400">Pin 23 of Pin 18</td>
                                <td className="py-2 px-3 text-slate-400">GND</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">Massa</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">MISO</td>
                                <td className="py-2 px-3 text-purple-300">Pin 21</td>
                                <td className="py-2 px-3 text-purple-300">GP16 (SPI0 RX)</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">SPI Data van RFID naar Pico</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">MOSI</td>
                                <td className="py-2 px-3 text-purple-300">Pin 25</td>
                                <td className="py-2 px-3 text-purple-300">GP19 (SPI0 TX)</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">SPI Data van Pico naar RFID</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">SCK</td>
                                <td className="py-2 px-3 text-purple-300">Pin 24</td>
                                <td className="py-2 px-3 text-purple-300">GP18 (SPI0 SCK)</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">SPI Klok signaal</td>
                              </tr>
                              <tr>
                                <td className="py-2 px-3">SDA (SS / CS)</td>
                                <td className="py-2 px-3 text-purple-300">Pin 22</td>
                                <td className="py-2 px-3 text-purple-300">GP17 (SPI0 CSn)</td>
                                <td className="py-2 px-3 text-slate-400 font-sans">Chip Select</td>
                              </tr>
                            </>
                          )}

                          {/* 4x4 Keypad */}
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3 text-amber-400 font-sans font-bold" rowSpan={8}>
                              4x4 Matrix Keypad<br />
                              <span className="text-[10px] text-slate-400 font-normal">(8 pinnen op een rij)</span>
                            </td>
                            <td className="py-2 px-3">Rij 1 (R1)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 9</td>
                            <td className="py-2 px-3 text-amber-300">GP6</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Rij 1 (toetsen 1, 2, 3, A)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">Rij 2 (R2)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 10</td>
                            <td className="py-2 px-3 text-amber-300">GP7</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Rij 2 (toetsen 4, 5, 6, B)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">Rij 3 (R3)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 11</td>
                            <td className="py-2 px-3 text-amber-300">GP8</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Rij 3 (toetsen 7, 8, 9, C)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">Rij 4 (R4)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 12</td>
                            <td className="py-2 px-3 text-amber-300">GP9</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Rij 4 (toetsen *, 0, #, D)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">Kolom 1 (C1)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 14</td>
                            <td className="py-2 px-3 text-amber-300">GP10</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Kolom 1 (toetsen 1, 4, 7, *)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">Kolom 2 (C2)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 15</td>
                            <td className="py-2 px-3 text-amber-300">GP11</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Kolom 2 (toetsen 2, 5, 8, 0)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">Kolom 3 (C3)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 16</td>
                            <td className="py-2 px-3 text-amber-300">GP12</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Kolom 3 (toetsen 3, 6, 9, #)</td>
                          </tr>
                          <tr className="bg-slate-900/40">
                            <td className="py-2 px-3">Kolom 4 (C4)</td>
                            <td className="py-2 px-3 text-amber-300">Pin 17</td>
                            <td className="py-2 px-3 text-amber-300">GP13</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Kolom 4 (toetsen A, B, C, D)</td>
                          </tr>

                          {/* Buzzer */}
                          <tr>
                            <td className="py-2 px-3 text-rose-400 font-sans font-bold" rowSpan={2}>
                              Zoemer / Buzzer<br />
                              <span className="text-[10px] text-slate-400 font-normal">(Optioneel)</span>
                            </td>
                            <td className="py-2 px-3">+ (Positief)</td>
                            <td className="py-2 px-3 text-rose-300">Pin 19</td>
                            <td className="py-2 px-3 text-rose-300">GP14</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Audio piepjes</td>
                          </tr>
                          <tr>
                            <td className="py-2 px-3">- (Negatief)</td>
                            <td className="py-2 px-3 text-slate-400">Pin 18 of Pin 13</td>
                            <td className="py-2 px-3 text-slate-400">GND</td>
                            <td className="py-2 px-3 text-slate-400 font-sans">Massa</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                /* Arduino Uno / Nano wiring */
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <h3 className="font-black text-sm text-cyan-300">Aansluittabel voor Arduino Uno / Nano</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2 px-3 font-bold">Component</th>
                          <th className="py-2 px-3 font-bold">Pin op Component</th>
                          <th className="py-2 px-3 font-bold">Arduino Pin</th>
                          <th className="py-2 px-3 font-bold">Opmerking</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850 text-slate-300 font-mono text-[11px]">
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">5V I2C LCD (1602/2004)</td>
                          <td className="py-2 px-3">VCC &amp; GND</td>
                          <td className="py-2 px-3 text-amber-400">5V &amp; GND</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">Voeding display</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">5V I2C LCD (1602/2004)</td>
                          <td className="py-2 px-3">SDA &amp; SCL</td>
                          <td className="py-2 px-3 text-cyan-400">A4 (SDA) &amp; A5 (SCL)</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">I2C bus (adres 0x27 of 0x3F)</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">RFID-RC522 (NFC/RFID)</td>
                          <td className="py-2 px-3">3.3V &amp; GND</td>
                          <td className="py-2 px-3 text-rose-400">3.3V (NIET 5V!) &amp; GND</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">RC522 vereist 3.3V spanning</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">RFID-RC522 (NFC/RFID)</td>
                          <td className="py-2 px-3">RST, SDA (SS)</td>
                          <td className="py-2 px-3 text-cyan-400">D9 (RST) &amp; D10 (SS)</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">Reset &amp; Chip Select</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">RFID-RC522 (NFC/RFID)</td>
                          <td className="py-2 px-3">MOSI, MISO, SCK</td>
                          <td className="py-2 px-3 text-cyan-400">D11, D12, D13</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">Hardware SPI pinnen</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">4x4 Matrix Keypad</td>
                          <td className="py-2 px-3">Rij 1, 2, 3, 4 (R1-R4)</td>
                          <td className="py-2 px-3 text-cyan-400">D2, D3, D4, D5</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">Digitale rijen</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">4x4 Matrix Keypad</td>
                          <td className="py-2 px-3">Kol 1, 2, 3, 4 (C1-C4)</td>
                          <td className="py-2 px-3 text-cyan-400">D6, D7, D8, A0</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">Digitale kolommen</td>
                        </tr>
                        <tr>
                          <td className="py-2 px-3 text-white font-sans font-bold">Zoemer / Buzzer</td>
                          <td className="py-2 px-3">+ en -</td>
                          <td className="py-2 px-3 text-cyan-400">A1 &amp; GND</td>
                          <td className="py-2 px-3 text-slate-400 font-sans">Audio feedback bij pas &amp; toetsen</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: GUIDE (ARDUINO IDE V2) */}
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 space-y-2">
                <h3 className="font-extrabold text-sm text-cyan-200 flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  Stappenplan: Raspberry Pi Pico W programmeren met Arduino IDE v2
                </h3>
                <p className="text-xs text-slate-300">
                  Volg deze 5 eenvoudige stappen in Arduino IDE v2 om je Pico W binnen enkele minuten gereed te hebben.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {/* Stap 1 */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs">1</span>
                    <span>Board URL toevoegen in Arduino IDE v2</span>
                  </div>
                  <p className="text-slate-300">
                    Open Arduino IDE v2 en ga naar: <strong>Bestand (File) &gt; Voorkeuren (Preferences)</strong>.
                  </p>
                  <p className="text-slate-400">
                    Plak onderstaande URL in het veld <em>"Additional boards manager URLs"</em> (gescheiden met een komma als er al iets staat):
                  </p>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-cyan-300 break-all select-all">
                    https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json
                  </div>
                </div>

                {/* Stap 2 */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs">2</span>
                    <span>Raspberry Pi Pico/RP2040 Board Package installeren</span>
                  </div>
                  <p className="text-slate-300">
                    Klik in het linkermenu van Arduino IDE v2 op het <strong>Boards Manager icoontje</strong> (of ga naar <em>Tools &gt; Board &gt; Boards Manager</em>).
                  </p>
                  <p className="text-slate-400">
                    Zoek naar: <code className="text-white bg-slate-900 px-1.5 py-0.5 rounded">pico</code> en installeer het pakket: <strong>Raspberry Pi Pico/RP2040 by Earle F. Philhower, III</strong>.
                  </p>
                </div>

                {/* Stap 3 */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs">3</span>
                    <span>De 3 benodigde Libraries installeren</span>
                  </div>
                  <p className="text-slate-300">
                    Klik links op het <strong>Library Manager icoontje</strong> (stapel boeken) en zoek &amp; installeer:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1 font-mono text-[11px]">
                    <li><strong className="text-white font-sans">LiquidCrystal I2C</strong> (door Frank de Brabander of Marco Schwartz)</li>
                    <li><strong className="text-white font-sans">MFRC522</strong> (door GithubCommunity)</li>
                    <li><strong className="text-white font-sans">Keypad</strong> (door Mark Stanley, Alexander Brevig)</li>
                  </ul>
                </div>

                {/* Stap 4 */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs">4</span>
                    <span>Board &amp; Poort selecteren</span>
                  </div>
                  <p className="text-slate-300">
                    Ga naar <strong>Hulpmiddelen (Tools) &gt; Board &gt; Raspberry Pi RP2040 Boards &gt; Raspberry Pi Pico W</strong>.
                  </p>
                  <p className="text-slate-400">
                    💡 <em>Eerste keer uploaden?</em> Houd de witte <strong>BOOTSEL knop</strong> op de Raspberry Pi Pico W ingedrukt terwijl je de Micro-USB kabel in de computer steekt. Laat de knop na 2 seconden los. Arduino IDE v2 vindt de Pico W dan automatisch als UF2 drive en uploadt de code!
                  </p>
                </div>

                {/* Stap 5 */}
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-cyan-400 font-bold">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-xs">5</span>
                    <span>Code plakken en Uploaden</span>
                  </div>
                  <p className="text-slate-300">
                    Kopieer de code uit het tabblad <strong>"Pico W .INO Code"</strong>, plak deze in Arduino IDE v2 en klik linksboven op de ronde pijl <strong>Uploaden (Ctrl+U)</strong>!
                  </p>
                  <p className="text-emerald-400">
                    Zodra de upload klaar is, toont het LCD scherm: <span className="font-mono bg-slate-900 px-2 py-0.5 rounded text-white">WerkPay Pico W - Opstarten...</span> en piept de buzzer!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CODE */}
          {activeTab === 'code' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <span>Code voor {selectedBoard === 'pico_w' ? 'Raspberry Pi Pico W' : 'Arduino Uno/Nano'}:</span>
                  <span className="font-mono text-cyan-400 bg-slate-950 px-2 py-0.5 rounded text-[11px] border border-slate-800">
                    {currentFilename}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadIno}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{downloaded ? 'Gedownload!' : 'Download .ino'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Gekopieerd!' : 'Kopieer Code'}</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono h-96 overflow-y-auto whitespace-pre">
                  {currentSketchCode}
                </pre>
              </div>
            </div>
          )}

          {/* TAB: CONNECT */}
          {activeTab === 'connect' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-extrabold text-sm text-cyan-200 flex items-center gap-2">
                    <Usb className="w-4 h-4" />
                    Directe Web Serial koppeling via USB
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                    Sluit je {selectedBoard === 'pico_w' ? 'Raspberry Pi Pico W' : 'Arduino'} met een USB-kabel aan op je computer. Klik op de knop hiernaast en selecteer de COM-poort (bijv. <em>RaspberryPi Pico Serial</em> of <em>USB Serial CDC</em>). De kassa stuurt live bedragen en ontvangt pas-UID's en pincodes!
                  </p>
                </div>

                {isConnected ? (
                  <button
                    type="button"
                    onClick={handleDisconnectUsb}
                    className="px-4 py-2.5 rounded-xl font-black text-xs bg-rose-600 hover:bg-rose-500 text-white transition shadow shrink-0"
                  >
                    Koppeling Verbreken
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectUsb}
                    className="px-4 py-2.5 rounded-xl font-black text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition shadow-lg shadow-cyan-500/20 shrink-0 flex items-center gap-2"
                  >
                    <Usb className="w-4 h-4" />
                    <span>Verbind via USB</span>
                  </button>
                )}
              </div>

              {/* Status and logs */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">Seriële Terminal Monitor (115200 Baud):</span>
                  <span className="text-[11px] font-mono text-cyan-400">
                    Status: {terminalStatus}
                  </span>
                </div>
                <div className="h-44 overflow-y-auto bg-slate-900 border border-slate-800/80 rounded-xl p-3 font-mono text-[11px] text-emerald-400 space-y-1">
                  {logs.length === 0 ? (
                    <span className="text-slate-500 italic">Geen seriële activiteit. Verbind je hardware om berichten te zien...</span>
                  ) : (
                    logs.map((l, i) => <div key={i}>{l}</div>)
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: SIMULATOR */}
          {activeTab === 'simulator' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400">
                💡 <strong>Interactieve Simulator:</strong> Hiermee test je het 5V I2C LCD scherm en het 4x4 matrix keypad direct in de browser vóórdat je de fysieke hardware aansluit!
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {/* Visual Pinapparaat */}
                <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-700 p-5 rounded-3xl shadow-2xl space-y-4 max-w-sm mx-auto w-full">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-black text-cyan-400 tracking-wider">WERKPAY TERMINAL</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>

                  {/* 16x2 I2C LCD Emulatie */}
                  <div className="bg-[#003882] border-4 border-slate-800 p-3.5 rounded-xl shadow-inner font-mono text-cyan-100 space-y-1 select-none">
                    <div className="text-xs font-bold tracking-widest h-4 overflow-hidden whitespace-pre">
                      {simLcdLine1.padEnd(16, ' ')}
                    </div>
                    <div className="text-xs font-bold tracking-widest h-4 overflow-hidden whitespace-pre flex items-center">
                      <span>{simLcdLine2}</span>
                      {simState === 'card_scanned' && (
                        <span className="tracking-widest text-amber-300 font-bold">
                          {'*'.repeat(simPin.length)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* RFID Tap Zone */}
                  <div 
                    onClick={handleSimTapCard}
                    className={`p-3 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition ${
                      simState === 'card_scanned' 
                        ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300' 
                        : 'border-cyan-500/40 bg-cyan-950/20 text-cyan-300 hover:border-cyan-400'
                    }`}
                  >
                    <Radio className="w-6 h-6 animate-pulse" />
                    <span className="text-xs font-black">
                      {simState === 'card_scanned' ? '✓ Pas Aangeboden' : 'Houd Pas Hier (Klik om te scannen)'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">UID: {simUid}</span>
                  </div>

                  {/* 4x4 Matrix Keypad */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      '1','2','3','A',
                      '4','5','6','B',
                      '7','8','9','C',
                      '*','0','#','D'
                    ].map(key => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSimKeyPress(key)}
                        className={`h-10 rounded-xl font-mono font-black text-sm transition shadow flex items-center justify-center ${
                          key === '#' || key === 'A' 
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                            : key === '*' || key === 'D'
                            ? 'bg-rose-600 hover:bg-rose-500 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {key === '#' ? 'OK' : key === '*' ? 'DEL' : key}
                      </button>
                    ))}
                  </div>
                  <div className="text-[10px] text-slate-400 text-center">
                    Toets: <strong>[0-9]</strong> PIN, <strong>[DEL/*]</strong> Wissen, <strong>[OK/#]</strong> Bevestigen
                  </div>
                </div>

                {/* Simulator Settings */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
                  <h4 className="font-extrabold text-slate-200">Simuleer Klant Pas &amp; Rekening</h4>
                  <div>
                    <label className="text-slate-400 block mb-1">Simulatie Pas-UID (Hex of Kaartnummer):</label>
                    <input
                      type="text"
                      value={simUid}
                      onChange={e => setSimUid(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-xs"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Wanneer je op "Houd Pas Hier" klikt en 4 cijfers intoetst gevolgd door <strong># (OK)</strong>, wordt dit direct doorgestuurd naar de Werkdonalds kassa alsof de fysieke hardware verbonden is!
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            DIY Pinapparaat klaar voor gebruik via USB (Chrome / Edge) of als standalone hardware terminal.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-black bg-slate-800 hover:bg-slate-700 text-white transition"
          >
            Sluiten
          </button>
        </div>

      </div>
    </div>
  );
};

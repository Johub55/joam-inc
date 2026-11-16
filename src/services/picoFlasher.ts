import { PICO_W_I2C_NFC_SKETCH_CODE, PICO_W_SKETCH_CODE } from './terminalService';

export type FlasherPlatform = 'android' | 'ios' | 'desktop';

export interface FlasherCapabilities {
  platform: FlasherPlatform;
  isMobileOrTablet: boolean;
  hasWebSerial: boolean;
  hasWebUsb: boolean;
  hasDirectoryPicker: boolean;
  hasFileShare: boolean;
  isSecureContext: boolean;
}

export interface PicoWifiConfig {
  ssid: string;
  password: string;
  nfcBus?: 'i2c' | 'spi';
  lcdAddress?: '0x27' | '0x3F' | 'auto';
}

export interface SavedWifiProfile {
  ssid: string;
  password: string;
  lcdAddress: 'auto' | '0x27' | '0x3F';
  savedAt: string;
}

export interface CppFirmwareMetadata {
  ok: boolean;
  filename: string;
  size: number;
  language: 'C++ (RP2040 Arduino)';
}

const UF2_MAGIC_START0 = 0x0a324655;
const UF2_MAGIC_START1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16f30;
const UF2_BLOCK_SIZE = 512;

const SSID_MARKER = '__WP_SSID_MARKER_0001__';
const PASS_MARKER = '__WP_PASS_MARKER_0001__';
const LCD_MARKER = '__WP_LCD_AUTO__';
const WIFI_PROFILES_STORAGE_KEY = 'wp_pico_wifi_profiles_v1';

export function isLocalDevOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function resolveFirmwareAssetUrl(): string {
  const base = (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) || './';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}firmware/werkpay_picow_i2c_pn532.uf2`;
}

export function getSavedWifiProfiles(): SavedWifiProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WIFI_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWifiProfile(profile: Omit<SavedWifiProfile, 'savedAt'>): SavedWifiProfile[] {
  const cleanSsid = profile.ssid.trim();
  if (!cleanSsid) return getSavedWifiProfiles();
  const existing = getSavedWifiProfiles().filter(
    (p) => p.ssid.toLowerCase() !== cleanSsid.toLowerCase()
  );
  const next: SavedWifiProfile[] = [
    {
      ssid: cleanSsid,
      password: profile.password,
      lcdAddress: profile.lcdAddress || 'auto',
      savedAt: new Date().toISOString()
    },
    ...existing
  ].slice(0, 8);
  try {
    localStorage.setItem(WIFI_PROFILES_STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function removeWifiProfile(ssid: string): SavedWifiProfile[] {
  const next = getSavedWifiProfiles().filter(
    (p) => p.ssid.toLowerCase() !== ssid.trim().toLowerCase()
  );
  try {
    localStorage.setItem(WIFI_PROFILES_STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function validateWifiCredentials(cfg: PicoWifiConfig): void {
  const encoder = new TextEncoder();
  const cleanSsid = (cfg.ssid || '').trim();
  if (!cleanSsid) {
    throw new Error('Vul eerst je WiFi-naam (SSID) in voordat je de C++ .UF2 flasht.');
  }
  const ssidBytes = encoder.encode(cleanSsid).length;
  if (ssidBytes > 63) {
    throw new Error(
      `WiFi-naam (SSID) is te lang (${ssidBytes} bytes, maximaal 63 UTF-8 bytes toegestaan in de .UF2 firmware).`
    );
  }
  const passBytes = encoder.encode(cfg.password || '').length;
  if (passBytes > 63) {
    throw new Error(
      `WiFi-wachtwoord is te lang (${passBytes} bytes, maximaal 63 UTF-8 bytes toegestaan in de .UF2 firmware).`
    );
  }
}

export function detectFlasherCapabilities(): FlasherCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      platform: 'desktop',
      isMobileOrTablet: false,
      hasWebSerial: false,
      hasWebUsb: false,
      hasDirectoryPicker: false,
      hasFileShare: false,
      isSecureContext: false
    };
  }

  const ua = navigator.userAgent || '';
  const isIpadDesktopMode =
    navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  const isIos = /iPhone|iPad|iPod/i.test(ua) || isIpadDesktopMode;
  const isAndroid = /Android/i.test(ua);

  const platform: FlasherPlatform = isIos ? 'ios' : isAndroid ? 'android' : 'desktop';
  const isMobileOrTablet = platform !== 'desktop' || window.innerWidth < 1024;

  return {
    platform,
    isMobileOrTablet,
    hasWebSerial: 'serial' in navigator,
    hasWebUsb: 'usb' in navigator,
    hasDirectoryPicker: typeof (window as any).showDirectoryPicker === 'function',
    hasFileShare: typeof navigator.share === 'function' && typeof navigator.canShare === 'function',
    isSecureContext: Boolean(window.isSecureContext)
  };
}

/**
 * Vervangt WiFi SSID & wachtwoord in de echte Arduino C++ (.INO) code
 */
export function generateConfiguredPicoIno(cfg: PicoWifiConfig): { code: string; filename: string } {
  const baseCode = cfg.nfcBus === 'spi' ? PICO_W_SKETCH_CODE : PICO_W_I2C_NFC_SKETCH_CODE;
  const safeSsid = (cfg.ssid || 'JOUW_WIFI_NAAM').replace(/"/g, '\\"');
  const safePass = (cfg.password || 'JOUW_WIFI_WACHTWOORD').replace(/"/g, '\\"');

  let patched = baseCode
    .replace(/const char\*\s+ssid\s*=\s*"[^"]*";/, `const char* ssid = "${safeSsid}";`)
    .replace(/const char\*\s+password\s*=\s*"[^"]*";/, `const char* password = "${safePass}";`);

  if (cfg.lcdAddress === '0x3F') {
    patched = patched.replace(/LiquidCrystal_I2C lcd\(0x27,\s*16,\s*2\);/, 'LiquidCrystal_I2C lcd(0x3F, 16, 2);');
  }

  return {
    code: patched,
    filename:
      cfg.nfcBus === 'spi'
        ? 'WerkPay_PicoW_SPI_Terminal.ino'
        : 'WerkPay_PicoW_I2C_NFC_Terminal.ino'
  };
}

function findAsciiSubarray(haystack: Uint8Array, needleStr: string): number {
  const needle = new TextEncoder().encode(needleStr);
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function writeFixedCString(target: Uint8Array, offset: number, slotBytes: number, value: string): void {
  const encoded = new TextEncoder().encode(value);
  const copyLen = Math.min(encoded.length, slotBytes - 1);
  for (let i = 0; i < slotBytes; i++) {
    target[offset + i] = i < copyLen ? encoded[i] : 0x00;
  }
}

/**
 * Patchet de echte gecompileerde C++ (.UF2) binary rechtstreeks met jouw WiFi-naam,
 * wachtwoord en I2C LCD adres (veilig over 256-byte UF2 payload blokgrenzen heen).
 */
export function patchCppUf2Firmware(uf2Buffer: ArrayBuffer, cfg: PicoWifiConfig): ArrayBuffer {
  validateWifiCredentials(cfg);

  if (uf2Buffer.byteLength === 0 || uf2Buffer.byteLength % UF2_BLOCK_SIZE !== 0) {
    throw new Error('Ongeldig .UF2 firmware-bestand (blokgrootte klopt niet).');
  }

  const outBytes = new Uint8Array(uf2Buffer.slice(0));
  const view = new DataView(outBytes.buffer);
  const blockCount = outBytes.byteLength / UF2_BLOCK_SIZE;

  const slices: Array<{ blockOffset: number; payloadSize: number; flatStart: number }> = [];
  let totalPayloadBytes = 0;

  for (let b = 0; b < blockCount; b++) {
    const blockOffset = b * UF2_BLOCK_SIZE;
    const m0 = view.getUint32(blockOffset, true);
    const m1 = view.getUint32(blockOffset + 4, true);
    const mEnd = view.getUint32(blockOffset + 508, true);

    if (m0 !== UF2_MAGIC_START0 || m1 !== UF2_MAGIC_START1 || mEnd !== UF2_MAGIC_END) {
      throw new Error(`Ongeldig UF2-blok op index ${b}.`);
    }

    const payloadSize = view.getUint32(blockOffset + 16, true);
    if (payloadSize === 0 || payloadSize > 476) {
      throw new Error(`Onverwachte payloadgrootte (${payloadSize}) in UF2-blok ${b}.`);
    }

    slices.push({ blockOffset, payloadSize, flatStart: totalPayloadBytes });
    totalPayloadBytes += payloadSize;
  }

  const flatPayload = new Uint8Array(totalPayloadBytes);
  for (const s of slices) {
    flatPayload.set(outBytes.subarray(s.blockOffset + 32, s.blockOffset + 32 + s.payloadSize), s.flatStart);
  }

  const ssidIdx = findAsciiSubarray(flatPayload, SSID_MARKER);
  const passIdx = findAsciiSubarray(flatPayload, PASS_MARKER);
  const lcdIdx = findAsciiSubarray(flatPayload, LCD_MARKER);

  if (ssidIdx === -1 || passIdx === -1) {
    throw new Error(
      'C++ firmware mist de WiFi-configuratieslots. Download in dat geval het gevulde .INO bestand hieronder.'
    );
  }

  const cleanSsid = (cfg.ssid || '').trim();
  writeFixedCString(flatPayload, ssidIdx, 64, cleanSsid);
  writeFixedCString(flatPayload, passIdx, 64, cfg.password || '');

  if (lcdIdx !== -1) {
    const lcdVal =
      cfg.lcdAddress === '0x3F'
        ? '0x3F'
        : cfg.lcdAddress === '0x27'
        ? '0x27'
        : '__WP_LCD_AUTO__';
    writeFixedCString(flatPayload, lcdIdx, 16, lcdVal);
  }

  for (const s of slices) {
    outBytes.set(flatPayload.subarray(s.flatStart, s.flatStart + s.payloadSize), s.blockOffset + 32);
  }

  return outBytes.buffer;
}

/**
 * Haalt de gecompileerde C++ Pico W .UF2 firmware op (GitHub Pages subpath-safe)
 * en injecteert direct jouw WiFi-gegevens.
 */
export async function buildConfiguredCppUf2Blob(
  cfg: PicoWifiConfig,
  onLog: (msg: string) => void
): Promise<{ blob: Blob; filename: string }> {
  validateWifiCredentials(cfg);
  onLog('⚙️ Gecompileerde C++ firmware ophalen (Adafruit PN532 + LCD + WiFi Cloud)...');

  const candidates = [
    resolveFirmwareAssetUrl(),
    './firmware/werkpay_picow_i2c_pn532.uf2',
    ...(isLocalDevOrigin() ? ['/api/pico/cpp-uf2'] : [])
  ];

  let rawBuf: ArrayBuffer | null = null;
  let lastStatus = 0;

  for (const url of candidates) {
    try {
      const res = await fetch(url);
      lastStatus = res.status;
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (buf.byteLength >= 512 && buf.byteLength % UF2_BLOCK_SIZE === 0) {
          rawBuf = buf;
          break;
        }
      }
    } catch {
      // try next URL
    }
  }

  if (!rawBuf) {
    throw new Error(`C++ .UF2 firmware kon niet worden geladen (HTTP ${lastStatus || 404}).`);
  }

  onLog(`📦 Base C++ .UF2 geladen (${(rawBuf.byteLength / 1024).toFixed(0)} KB). WiFi invullen...`);

  const patchedBuf = patchCppUf2Firmware(rawBuf, cfg);
  onLog(`✓ WiFi "${cfg.ssid.trim()}" ingebakken in de C++ binary.`);

  return {
    blob: new Blob([patchedBuf], { type: 'application/octet-stream' }),
    filename: 'WerkPay_PicoW_Cpp.uf2'
  };
}

/**
 * 1-Stap Flashen (Desktop Chrome/Edge): Schrijft de gepatchte C++ .UF2 direct naar de RPI-RP2 schijf
 */
export async function flashCppUf2ViaDirectoryPicker(
  cfg: PicoWifiConfig,
  onLog: (msg: string) => void
): Promise<void> {
  const picker = (window as any).showDirectoryPicker;
  if (typeof picker !== 'function') {
    throw new Error(
      'Deze browser ondersteunt geen directe schijf-toegang. Gebruik "Download C++ .UF2" en kopieer naar RPI-RP2.'
    );
  }

  const { blob, filename } = await buildConfiguredCppUf2Blob(cfg, onLog);
  onLog('📂 Selecteer nu in het pop-up venster de USB-schijf "RPI-RP2" (BOOTSEL)...');
  const dirHandle = await picker({ mode: 'readwrite' });

  onLog(`💾 Echte C++ firmware (${filename}) flashen naar "${dirHandle.name}"...`);
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  onLog('✅ KLAAR! C++ .UF2 is geflasht. De Pico W herstart nu automatisch en verbindt met WiFi!');
}

/**
 * 1-Stap Flashen (Telefoon / Tablet / iPad / Overige browsers):
 * Maakt de kant-en-klare C++ .UF2 en downloadt of opent het Deel-menu om op RPI-RP2 te zetten.
 */
export async function exportCppUf2ForMobileOrDownload(
  cfg: PicoWifiConfig,
  onLog: (msg: string) => void,
  preferShareSheet = false
): Promise<void> {
  const { blob, filename } = await buildConfiguredCppUf2Blob(cfg, onLog);
  const file = new File([blob], filename, { type: 'application/octet-stream' });

  if (
    preferShareSheet &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      onLog('📤 Deel-menu openen: kies "Bewaar in Bestanden" en selecteer "RPI-RP2"...');
      await navigator.share({
        files: [file],
        title: 'WerkPay Pico W C++ Firmware',
        text: 'Kopieer dit .uf2 bestand naar de RPI-RP2 USB-schijf (BOOTSEL).'
      });
      onLog('✅ C++ .UF2 klaargezet! Zodra hij op RPI-RP2 staat herstart de Pico direct in C++.');
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        onLog('ℹ️ Delen geannuleerd, schakelen over naar directe download...');
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  onLog(`✅ ${filename} gedownload! Kopieer dit bestand naar de "RPI-RP2" schijf van je Pico W.`);
}

/**
 * WebSerial Live Monitor voor de Raspberry Pi Pico W (115200 baud, normale USB-modus ná BOOTSEL).
 * Toont live WiFi-, LCD-, PN532- en Firestore-statusberichten uit Serial.println().
 */
export async function connectPicoSerialMonitor(
  onLine: (line: string) => void,
  onDisconnect: () => void
): Promise<{ disconnect: () => Promise<void> }> {
  const serial = (navigator as any).serial;
  if (!serial) {
    throw new Error('WebSerial wordt alleen ondersteund op desktop in Chrome of Edge.');
  }

  const port = await serial.requestPort();
  await port.open({ baudRate: 115200 });

  let cancelled = false;
  const decoder = new TextDecoderStream();
  const readableStreamClosed = port.readable.pipeTo(decoder.writable).catch(() => {});
  const reader = decoder.readable.getReader();

  (async () => {
    let buffer = '';
    try {
      while (!cancelled) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const l of lines) {
            if (l.trim()) onLine(l);
          }
        }
      }
    } catch {
      // closed
    } finally {
      try {
        reader.releaseLock();
      } catch {}
      onDisconnect();
    }
  })();

  return {
    disconnect: async () => {
      cancelled = true;
      try {
        await reader.cancel();
      } catch {}
      await readableStreamClosed;
      try {
        await port.close();
      } catch {}
    }
  };
}

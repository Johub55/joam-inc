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
  if (!cleanSsid) {
    throw new Error('Vul eerst je WiFi-naam (SSID) in voordat je de C++ .UF2 flasht.');
  }

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

  // Schrijf de gepatchte payload terug in de exacte 512-byte UF2 blokken
  for (const s of slices) {
    outBytes.set(flatPayload.subarray(s.flatStart, s.flatStart + s.payloadSize), s.blockOffset + 32);
  }

  return outBytes.buffer;
}

/**
 * Haalt de gecompileerde C++ Pico W .UF2 firmware op en injecteert direct jouw WiFi-gegevens
 */
export async function buildConfiguredCppUf2Blob(
  cfg: PicoWifiConfig,
  onLog: (msg: string) => void
): Promise<{ blob: Blob; filename: string }> {
  onLog('⚙️ Gecompileerde C++ firmware ophalen (Adafruit PN532 + LCD + WiFi Cloud)...');

  let res = await fetch('/firmware/werkpay_picow_i2c_pn532.uf2');
  if (!res.ok) {
    res = await fetch('/api/pico/cpp-uf2');
  }
  if (!res.ok) {
    throw new Error(`C++ .UF2 firmware kon niet worden geladen (HTTP ${res.status}).`);
  }

  const rawBuf = await res.arrayBuffer();
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

import type { Order } from '../types';

export type ReceiptSizeId = '44mm' | '58mm' | '76mm' | '80mm' | 'a4';

export interface ReceiptSizePreset {
  id: ReceiptSizeId;
  label: string;
  shortLabel: string;
  paperWidthMm: number;
  printableWidthMm: number;
  previewMaxWidthPx: number;
  escPosCols: number;
  pageCssSize: string;
  description: string;
}

export const RECEIPT_SIZE_PRESETS: Record<ReceiptSizeId, ReceiptSizePreset> = {
  '44mm': {
    id: '44mm',
    label: 'Smal 44mm (Compact)',
    shortLabel: '44mm',
    paperWidthMm: 44,
    printableWidthMm: 40,
    previewMaxWidthPx: 230,
    escPosCols: 24,
    pageCssSize: '44mm auto',
    description: '24 kolommen · Compacte rol',
  },
  '58mm': {
    id: '58mm',
    label: 'Mini 58mm (Pin/Mobiel)',
    shortLabel: '58mm',
    paperWidthMm: 58,
    printableWidthMm: 48,
    previewMaxWidthPx: 280,
    escPosCols: 32,
    pageCssSize: '58mm auto',
    description: '32 kolommen · Bluetooth/mobiele rol',
  },
  '76mm': {
    id: '76mm',
    label: 'Middel 76mm (Matrix/Keuken)',
    shortLabel: '76mm',
    paperWidthMm: 76,
    printableWidthMm: 68,
    previewMaxWidthPx: 340,
    escPosCols: 42,
    pageCssSize: '76mm auto',
    description: '42 kolommen · Keuken & horeca rol',
  },
  '80mm': {
    id: '80mm',
    label: 'Standaard 80mm (Kassa)',
    shortLabel: '80mm',
    paperWidthMm: 80,
    printableWidthMm: 72,
    previewMaxWidthPx: 370,
    escPosCols: 48,
    pageCssSize: '80mm auto',
    description: '48 kolommen · Standaard thermische bon',
  },
  a4: {
    id: 'a4',
    label: 'Kantoor A4 (PDF / Factuur)',
    shortLabel: 'A4',
    paperWidthMm: 210,
    printableWidthMm: 185,
    previewMaxWidthPx: 540,
    escPosCols: 48,
    pageCssSize: 'A4 portrait',
    description: 'Volledige pagina voor A4 printer of PDF',
  },
};

export const RECEIPT_SIZE_LIST: ReceiptSizePreset[] = [
  RECEIPT_SIZE_PRESETS['44mm'],
  RECEIPT_SIZE_PRESETS['58mm'],
  RECEIPT_SIZE_PRESETS['76mm'],
  RECEIPT_SIZE_PRESETS['80mm'],
  RECEIPT_SIZE_PRESETS['a4'],
];

const RECEIPT_SIZE_STORAGE_KEY = 'wd_receipt_size';

export function getSavedReceiptSize(): ReceiptSizeId {
  if (typeof window === 'undefined') return '80mm';
  try {
    const raw = localStorage.getItem(RECEIPT_SIZE_STORAGE_KEY) as ReceiptSizeId | null;
    if (raw && raw in RECEIPT_SIZE_PRESETS) return raw;
  } catch {}
  return '80mm';
}

export function setSavedReceiptSize(size: ReceiptSizeId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECEIPT_SIZE_STORAGE_KEY, size);
  } catch {}
}

function sanitizeAscii(text: string): string {
  return String(text || '')
    .replace(/€/g, 'EUR ')
    .replace(/[ëéèê]/g, 'e')
    .replace(/[ïíìî]/g, 'i')
    .replace(/[öóòô]/g, 'o')
    .replace(/[üúùû]/g, 'u')
    .replace(/[äáàâ]/g, 'a')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatEurPlain(val: number): string {
  const num = Number(val || 0);
  return `EUR ${num.toFixed(2).replace('.', ',')}`;
}

function formatTwoColLine(left: string, right: string, cols: number): string {
  const cleanL = sanitizeAscii(left);
  const cleanR = sanitizeAscii(right);
  const minGap = 1;
  if (cleanL.length + cleanR.length + minGap <= cols) {
    return cleanL + ' '.repeat(cols - cleanL.length - cleanR.length) + cleanR;
  }
  const maxLeft = Math.max(4, cols - cleanR.length - minGap);
  const truncLeft = cleanL.slice(0, maxLeft);
  const pad = Math.max(1, cols - truncLeft.length - cleanR.length);
  return truncLeft + ' '.repeat(pad) + cleanR;
}

function wrapTextLines(text: string, cols: number): string[] {
  const clean = sanitizeAscii(text);
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w.slice(0, cols);
    } else if (cur.length + 1 + w.length <= cols) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w.slice(0, cols);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

class EscPosBuilder {
  private bytes: number[] = [];

  public raw(...vals: number[]): this {
    this.bytes.push(...vals);
    return this;
  }

  public init(): this {
    return this.raw(0x1b, 0x40); // ESC @
  }

  public align(mode: 'left' | 'center' | 'right'): this {
    const n = mode === 'center' ? 1 : mode === 'right' ? 2 : 0;
    return this.raw(0x1b, 0x61, n); // ESC a n
  }

  public bold(on: boolean): this {
    return this.raw(0x1b, 0x45, on ? 1 : 0); // ESC E n
  }

  public size(doubleWidth: boolean, doubleHeight: boolean): this {
    const val = (doubleWidth ? 0x10 : 0) | (doubleHeight ? 0x01 : 0);
    return this.raw(0x1d, 0x21, val); // GS ! n
  }

  public line(text: string = ''): this {
    const clean = sanitizeAscii(text);
    for (let i = 0; i < clean.length; i++) {
      this.bytes.push(clean.charCodeAt(i) & 0x7f);
    }
    this.bytes.push(0x0a); // LF
    return this;
  }

  public feedAndCut(lines = 4): this {
    for (let i = 0; i < lines; i++) {
      this.bytes.push(0x0a);
    }
    return this.raw(0x1d, 0x56, 66, 0); // GS V 66 0 (partial cut)
  }

  public openCashDrawer(): this {
    return this.raw(0x1b, 0x70, 0x00, 0x19, 0xfa); // ESC p 0 25 250
  }

  public toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

export function buildEscPosReceiptBytes(
  order: Order,
  size: ReceiptSizeId = '80mm',
  options?: { openCashDrawer?: boolean }
): Uint8Array {
  const preset = RECEIPT_SIZE_PRESETS[size] || RECEIPT_SIZE_PRESETS['80mm'];
  const cols = preset.escPosCols;
  const sep = '-'.repeat(cols);
  const dblSep = '='.repeat(cols);
  const brand = sanitizeAscii(order.paymentMeta?.brandName || 'WERKDONALDS').toUpperCase();

  const b = new EscPosBuilder().init();

  if (options?.openCashDrawer) {
    b.openCashDrawer();
  }

  // Header
  b.align('center')
    .bold(true)
    .size(cols >= 32, true)
    .line(brand)
    .size(false, false)
    .bold(false)
    .line('Filiaal #1 · Kassa Bon')
    .line(`${order.time || ''} ${new Date(order.timestamp || Date.now()).toLocaleDateString('nl-NL')}`)
    .line(dblSep);

  // Order meta
  b.align('left')
    .bold(true)
    .line(
      formatTwoColLine(
        `BON #${order.no}`,
        order.orderType === 'dine_in' ? 'OPETEN' : order.orderType === 'delivery' ? 'BEZORG' : 'MEENEMEN',
        cols
      )
    )
    .bold(false);

  if (order.identifier) {
    for (const l of wrapTextLines(`Klant: ${order.identifier}`, cols)) {
      b.line(l);
    }
  }
  b.line(sep);

  // Items
  for (const item of order.items) {
    const qtyName = `${item.qty}x ${item.name}`;
    const linePrice = formatEurPlain(item.price * item.qty);
    b.bold(true).line(formatTwoColLine(qtyName, linePrice, cols)).bold(false);

    if (item.itemNote) {
      for (const noteLine of wrapTextLines(`  > ${item.itemNote}`, cols)) {
        b.line(noteLine);
      }
    }
  }

  b.line(sep);

  if (order.discount > 0) {
    b.line(formatTwoColLine('Korting:', `-${formatEurPlain(order.discount)}`, cols));
  }

  b.bold(true)
    .size(false, true)
    .line(formatTwoColLine('TOTAAL', formatEurPlain(order.total), cols))
    .size(false, false)
    .bold(false)
    .line(sep);

  // Payment breakdown
  const methodLabel =
    order.paymentMethod === 'workpay'
      ? 'WerkPay Bank'
      : order.paymentMethod === 'cash'
      ? 'Contant'
      : 'Cadeaubon';

  b.line(formatTwoColLine('Betaald via:', methodLabel, cols));
  if (order.paymentMeta?.account) {
    b.line(formatTwoColLine('Rekening:', `@${order.paymentMeta.account}`, cols));
  }
  if (order.paymentMeta?.balance_after !== undefined) {
    b.line(formatTwoColLine('Nieuw saldo:', formatEurPlain(order.paymentMeta.balance_after), cols));
  }
  if (order.paymentMeta?.received > 0) {
    b.line(formatTwoColLine('Ontvangen:', formatEurPlain(order.paymentMeta.received), cols));
  }
  if (order.paymentMeta?.change > 0) {
    b.line(formatTwoColLine('Wisselgeld:', formatEurPlain(order.paymentMeta.change), cols));
  }
  if (order.paymentMeta?.tipAmount > 0) {
    b.line(formatTwoColLine('Waarvan fooi:', formatEurPlain(order.paymentMeta.tipAmount), cols));
  }

  b.line(dblSep)
    .align('center')
    .line(`Bedankt voor je bestelling`)
    .line(`bij ${brand}!`)
    .line(`[Formaat: ${preset.shortLabel}]`)
    .feedAndCut(4);

  return b.toUint8Array();
}

export function buildEscPosTestPageBytes(size: ReceiptSizeId = '80mm'): Uint8Array {
  const preset = RECEIPT_SIZE_PRESETS[size] || RECEIPT_SIZE_PRESETS['80mm'];
  const cols = preset.escPosCols;
  const b = new EscPosBuilder().init();

  b.align('center')
    .bold(true)
    .size(cols >= 32, true)
    .line('WERKDONALDS POS')
    .size(false, false)
    .bold(false)
    .line('Testbon Thermische Printer')
    .line('='.repeat(cols))
    .align('left')
    .line(formatTwoColLine('Formaat:', preset.label, cols))
    .line(formatTwoColLine('Kolommen:', `${cols} tekens`, cols))
    .line('-'.repeat(cols))
    .line('123456789012345678901234567890123456789012345678'.slice(0, cols))
    .line('-'.repeat(cols))
    .align('center')
    .line('Printkwaliteit OK!')
    .feedAndCut(4);

  return b.toUint8Array();
}

export type ThermalTransportType = 'serial' | 'usb' | 'ble' | null;

export interface ThermalPrinterConnectionInfo {
  connected: boolean;
  transport: ThermalTransportType;
  deviceName: string;
}

export interface PrinterCapabilities {
  hasWebSerial: boolean;
  hasWebUsb: boolean;
  hasWebBluetooth: boolean;
}

const THERMAL_BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];

class ReceiptPrinterManager {
  private transport: ThermalTransportType = null;
  private deviceName: string = '';

  // Web Serial
  private serialPort: any = null;

  // Web USB
  private usbDevice: any = null;
  private usbInterfaceNumber: number = 0;
  private usbEndpointOut: number = 1;

  // Web Bluetooth
  private bleDevice: any = null;
  private bleCharacteristic: any = null;

  public getCapabilities(): PrinterCapabilities {
    if (typeof navigator === 'undefined') {
      return { hasWebSerial: false, hasWebUsb: false, hasWebBluetooth: false };
    }
    return {
      hasWebSerial: 'serial' in navigator,
      hasWebUsb: 'usb' in navigator,
      hasWebBluetooth: 'bluetooth' in navigator,
    };
  }

  public getConnectionInfo(): ThermalPrinterConnectionInfo {
    return {
      connected: this.transport !== null,
      transport: this.transport,
      deviceName: this.deviceName,
    };
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.serialPort) {
        await this.serialPort.close();
      }
    } catch {}
    try {
      if (this.usbDevice) {
        await this.usbDevice.close();
      }
    } catch {}
    try {
      if (this.bleDevice?.gatt?.connected) {
        this.bleDevice.gatt.disconnect();
      }
    } catch {}

    this.serialPort = null;
    this.usbDevice = null;
    this.bleDevice = null;
    this.bleCharacteristic = null;
    this.transport = null;
    this.deviceName = '';
  }

  public async connectSerial(baudRate: number = 9600): Promise<ThermalPrinterConnectionInfo> {
    const serial = (navigator as any).serial;
    if (!serial) {
      throw new Error('Web Serial wordt alleen ondersteund in Chrome / Edge / Android Chromium.');
    }
    await this.disconnect();
    const port = await serial.requestPort();
    await port.open({ baudRate });
    this.serialPort = port;
    this.transport = 'serial';
    this.deviceName = `COM / USB-Serieel (${baudRate} baud)`;
    return this.getConnectionInfo();
  }

  public async connectUsb(): Promise<ThermalPrinterConnectionInfo> {
    const usb = (navigator as any).usb;
    if (!usb) {
      throw new Error('WebUSB wordt alleen ondersteund in Chrome / Edge via HTTPS.');
    }
    await this.disconnect();

    const device = await usb.requestDevice({ filters: [] });
    await device.open();
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }

    let chosenInterface = 0;
    let chosenEndpointOut = 1;
    let found = false;

    const interfaces = device.configuration?.interfaces || [];
    for (const iface of interfaces) {
      for (const alt of iface.alternates || []) {
        const outEp = (alt.endpoints || []).find((ep: any) => ep.direction === 'out');
        if (outEp) {
          chosenInterface = iface.interfaceNumber;
          chosenEndpointOut = outEp.endpointNumber;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    await device.claimInterface(chosenInterface);
    this.usbDevice = device;
    this.usbInterfaceNumber = chosenInterface;
    this.usbEndpointOut = chosenEndpointOut;
    this.transport = 'usb';
    this.deviceName = device.productName || 'USB Thermische Printer';
    return this.getConnectionInfo();
  }

  public async connectBle(): Promise<ThermalPrinterConnectionInfo> {
    const bluetooth = (navigator as any).bluetooth;
    if (!bluetooth) {
      throw new Error('Web Bluetooth wordt niet ondersteund in deze browser.');
    }
    await this.disconnect();

    const device = await bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: THERMAL_BLE_SERVICES,
    });
    const server = await device.gatt.connect();
    let writableChar: any = null;

    for (const svcUuid of THERMAL_BLE_SERVICES) {
      try {
        const service = await server.getPrimaryService(svcUuid);
        const chars = await service.getCharacteristics();
        const foundChar = chars.find(
          (c: any) => c.properties?.write || c.properties?.writeWithoutResponse
        );
        if (foundChar) {
          writableChar = foundChar;
          break;
        }
      } catch {
        // try next BLE printer service
      }
    }

    if (!writableChar) {
      try {
        device.gatt.disconnect();
      } catch {}
      throw new Error(
        'Geen standaard ESC/POS Bluetooth schrijf-kanaal gevonden. Probeer eventueel Systeem Print.'
      );
    }

    this.bleDevice = device;
    this.bleCharacteristic = writableChar;
    this.transport = 'ble';
    this.deviceName = device.name || 'Bluetooth Bonprinter';
    return this.getConnectionInfo();
  }

  public async writeRaw(bytes: Uint8Array): Promise<void> {
    if (!this.transport) {
      throw new Error('Geen thermische printer verbonden. Verbind eerst via USB, Serieel of Bluetooth.');
    }

    if (this.transport === 'serial' && this.serialPort?.writable) {
      const writer = this.serialPort.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
      return;
    }

    if (this.transport === 'usb' && this.usbDevice) {
      await this.usbDevice.transferOut(this.usbEndpointOut, bytes);
      return;
    }

    if (this.transport === 'ble' && this.bleCharacteristic) {
      const chunkSize = 20;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        if (this.bleCharacteristic.properties?.writeWithoutResponse) {
          await this.bleCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.bleCharacteristic.writeValue(chunk);
        }
        await new Promise((r) => setTimeout(r, 12));
      }
      return;
    }

    throw new Error('Printerverbinding is verbroken. Maak opnieuw verbinding.');
  }

  public async printOrder(
    order: Order,
    size: ReceiptSizeId = '80mm',
    options?: { openCashDrawer?: boolean }
  ): Promise<void> {
    const bytes = buildEscPosReceiptBytes(order, size, options);
    await this.writeRaw(bytes);
  }

  public async printTestPage(size: ReceiptSizeId = '80mm'): Promise<void> {
    const bytes = buildEscPosTestPageBytes(size);
    await this.writeRaw(bytes);
  }
}

export const receiptPrinter = new ReceiptPrinterManager();

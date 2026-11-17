import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { showToast } from '../../services/appToast';
import {
  RECEIPT_SIZE_LIST,
  RECEIPT_SIZE_PRESETS,
  ReceiptSizeId,
  getSavedReceiptSize,
  setSavedReceiptSize,
  receiptPrinter,
  ThermalPrinterConnectionInfo
} from '../../services/receiptPrinter';
import { Printer, X, CheckCircle2, Clock, Usb, Bluetooth, Cable, Receipt, Zap } from 'lucide-react';

export const ReceiptModal: React.FC = () => {
  const { activeReceiptOrder, setActiveReceiptOrder, setTrackedOrderNo } = useApp();
  const [receiptSize, setReceiptSize] = useState<ReceiptSizeId>(() => getSavedReceiptSize());
  const [printerInfo, setPrinterInfo] = useState<ThermalPrinterConnectionInfo>(() =>
    receiptPrinter.getConnectionInfo()
  );
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [openCashDrawer, setOpenCashDrawer] = useState<boolean>(false);
  const [printerBusy, setPrinterBusy] = useState<boolean>(false);

  if (!activeReceiptOrder) return null;

  const preset = RECEIPT_SIZE_PRESETS[receiptSize] || RECEIPT_SIZE_PRESETS['80mm'];
  const caps = receiptPrinter.getCapabilities();
  const isNarrow = receiptSize === '44mm';
  const isCompactRoll = receiptSize === '44mm' || receiptSize === '58mm';
  const isA4 = receiptSize === 'a4';

  const handleChangeSize = (next: ReceiptSizeId) => {
    setReceiptSize(next);
    setSavedReceiptSize(next);
  };

  const handlePrintSystem = () => {
    window.print();
  };

  const handleConnectSerial = async () => {
    setPrinterBusy(true);
    try {
      const info = await receiptPrinter.connectSerial(baudRate);
      setPrinterInfo(info);
      showToast(`Bonprinter verbonden (${info.deviceName})`, 'success');
    } catch (e: any) {
      if (!String(e?.message || '').toLowerCase().includes('no port selected')) {
        showToast(e?.message || 'Kon USB-Serieel printer niet verbinden.', 'error');
      }
    } finally {
      setPrinterBusy(false);
    }
  };

  const handleConnectUsb = async () => {
    setPrinterBusy(true);
    try {
      const info = await receiptPrinter.connectUsb();
      setPrinterInfo(info);
      showToast(`USB Bonprinter verbonden (${info.deviceName})`, 'success');
    } catch (e: any) {
      if (!String(e?.message || '').toLowerCase().includes('no device selected')) {
        showToast(e?.message || 'Kon WebUSB printer niet verbinden.', 'error');
      }
    } finally {
      setPrinterBusy(false);
    }
  };

  const handleConnectBle = async () => {
    setPrinterBusy(true);
    try {
      const info = await receiptPrinter.connectBle();
      setPrinterInfo(info);
      showToast(`Bluetooth Bonprinter verbonden (${info.deviceName})`, 'success');
    } catch (e: any) {
      if (!String(e?.message || '').toLowerCase().includes('cancelled')) {
        showToast(e?.message || 'Kon Bluetooth printer niet verbinden.', 'error');
      }
    } finally {
      setPrinterBusy(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await receiptPrinter.disconnect();
    setPrinterInfo(receiptPrinter.getConnectionInfo());
    showToast('Bonprinter losgekoppeld.', 'info');
  };

  const handleEscPosPrint = async () => {
    setPrinterBusy(true);
    try {
      await receiptPrinter.printOrder(activeReceiptOrder, receiptSize, { openCashDrawer });
      showToast(`Bon #${activeReceiptOrder.no} (${preset.shortLabel}) direct geprint!`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'Direct ESC/POS printen mislukt.', 'error');
    } finally {
      setPrinterBusy(false);
    }
  };

  const handleEscPosTest = async () => {
    setPrinterBusy(true);
    try {
      await receiptPrinter.printTestPage(receiptSize);
      showToast(`Testbon (${preset.shortLabel}) verstuurd naar printer!`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'Testbon versturen mislukt.', 'error');
    } finally {
      setPrinterBusy(false);
    }
  };

  const handleTrackLive = () => {
    const num = activeReceiptOrder.no;
    setActiveReceiptOrder(null);
    setTrackedOrderNo(num);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <style>{`@page { size: ${preset.pageCssSize}; margin: ${isA4 ? '12mm' : '2mm'}; }`}</style>

      <div
        className={`bg-slate-900 border border-slate-700 rounded-3xl w-full ${
          isA4 ? 'max-w-2xl' : 'max-w-md'
        } max-h-[94vh] overflow-hidden shadow-2xl flex flex-col transition-all`}
      >
        {/* Top bar */}
        <div className="no-print px-4 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Bestelling Geslaagd · Bon #{activeReceiptOrder.no}</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveReceiptOrder(null)}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center text-xs"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Receipt Format Selector Bar */}
        <div className="no-print px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5 text-cyan-400" />
              <span>Bonformaat:</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">{preset.description}</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {RECEIPT_SIZE_LIST.map((sz) => (
              <button
                key={sz.id}
                type="button"
                onClick={() => handleChangeSize(sz.id)}
                className={`py-1.5 px-1 rounded-lg text-[11px] font-black border transition ${
                  receiptSize === sz.id
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {sz.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Live Paper Preview Container */}
        <div className="flex-1 overflow-y-auto bg-slate-800/40 p-3 sm:p-4 flex justify-center">
          <div
            style={
              {
                maxWidth: `${preset.previewMaxWidthPx}px`,
                '--wd-receipt-print-width': `${preset.printableWidthMm}mm`,
              } as React.CSSProperties
            }
            className={`printable-receipt-sheet w-full bg-white text-slate-900 font-mono shadow-xl select-text rounded-lg ${
              isNarrow
                ? 'p-2.5 text-[10px] leading-snug'
                : isCompactRoll
                ? 'p-3.5 text-[11px] leading-snug'
                : isA4
                ? 'p-7 text-sm leading-relaxed'
                : 'p-5 text-xs'
            }`}
          >
            <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
              <div
                className={`${
                  isNarrow ? 'w-6 h-6 text-sm' : isA4 ? 'w-11 h-11 text-2xl' : 'w-8 h-8 text-xl'
                } mx-auto rounded-lg bg-amber-400 font-black text-slate-950 flex items-center justify-center mb-1`}
              >
                W
              </div>
              <h2 className={`font-extrabold tracking-wider uppercase ${isA4 ? 'text-lg' : isNarrow ? 'text-xs' : 'text-sm'}`}>
                {activeReceiptOrder.paymentMeta?.brandName || 'WERKDONALDS'}
              </h2>
              <p className={`${isA4 ? 'text-xs' : 'text-[10px]'} text-slate-500`}>Filiaal #1 · Kassa Systeem</p>
              <p className={`${isA4 ? 'text-xs' : 'text-[10px]'} text-slate-500`}>
                {activeReceiptOrder.time} · {new Date().toLocaleDateString('nl-NL')}
              </p>
            </div>

            <div className="py-2.5 border-b-2 border-dashed border-slate-300 flex justify-between items-center font-bold gap-1 flex-wrap">
              <span className={`${isA4 ? 'text-base' : isNarrow ? 'text-xs' : 'text-sm'} text-slate-950`}>
                BON #{activeReceiptOrder.no}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 border border-slate-200">
                {activeReceiptOrder.orderType === 'dine_in'
                  ? '🍽️ Opeten'
                  : activeReceiptOrder.orderType === 'delivery'
                  ? '🛵 Bezorg'
                  : '🛍️ Meenemen'}
              </span>
            </div>

            {activeReceiptOrder.identifier && (
              <div className="py-1 text-[11px] text-slate-600">
                Klant/Tafel: <strong className="text-slate-950">{activeReceiptOrder.identifier}</strong>
              </div>
            )}

            {/* Items */}
            <div className="py-2.5 space-y-1.5 border-b-2 border-dashed border-slate-300">
              {activeReceiptOrder.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between font-bold gap-2">
                    <span className="break-words">{item.qty}× {item.name}</span>
                    <span className="shrink-0">{euro(item.price * item.qty)}</span>
                  </div>
                  {item.itemNote && (
                    <div className="text-[10px] text-slate-500 pl-2 italic break-words">
                      ↳ {item.itemNote}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Breakdown */}
            <div className="py-2.5 space-y-1">
              {activeReceiptOrder.discount > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Korting:</span>
                  <span>- {euro(activeReceiptOrder.discount)}</span>
                </div>
              )}
              <div className={`flex justify-between font-black pt-1 border-t border-slate-200 ${isA4 ? 'text-lg' : isNarrow ? 'text-xs' : 'text-sm'}`}>
                <span>TOTAAL:</span>
                <span>{euro(activeReceiptOrder.total)}</span>
              </div>
            </div>

            {/* Payment Method Details */}
            <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-600 space-y-0.5">
              <div className="flex justify-between gap-2">
                <span>Betaald via:</span>
                <strong className="uppercase text-slate-900">
                  {activeReceiptOrder.paymentMethod === 'workpay'
                    ? '💳 WerkPay Bank'
                    : activeReceiptOrder.paymentMethod === 'cash'
                    ? '💵 Contant'
                    : '🎁 Cadeaubon'}
                </strong>
              </div>
              {activeReceiptOrder.paymentMeta?.account && (
                <div className="flex justify-between gap-2">
                  <span>WerkPay Rekening:</span>
                  <span>@{activeReceiptOrder.paymentMeta.account}</span>
                </div>
              )}
              {activeReceiptOrder.paymentMeta?.balance_after !== undefined && (
                <div className="flex justify-between gap-2">
                  <span>Nieuw Saldo:</span>
                  <span>{euro(activeReceiptOrder.paymentMeta.balance_after)}</span>
                </div>
              )}
              {activeReceiptOrder.paymentMeta?.change > 0 && (
                <div className="flex justify-between gap-2">
                  <span>Wisselgeld:</span>
                  <span>{euro(activeReceiptOrder.paymentMeta.change)}</span>
                </div>
              )}
              <div className="text-center pt-2 text-[10px] text-slate-400">
                Bedankt bij {activeReceiptOrder.paymentMeta?.brandName || 'Werkdonalds'}! ({preset.shortLabel})
              </div>
            </div>
          </div>
        </div>

        {/* Thermal ESC/POS Printer Controls + Modal Actions */}
        <div className="no-print p-3.5 sm:p-4 bg-slate-950 border-t border-slate-800 space-y-2.5 text-xs">
          {/* Printer Bar */}
          {!isA4 && (
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 font-bold text-[11px]">
                  <Zap className={`w-3.5 h-3.5 ${printerInfo.connected ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className={printerInfo.connected ? 'text-emerald-300' : 'text-slate-300'}>
                    {printerInfo.connected
                      ? `Verbonden: ${printerInfo.deviceName}`
                      : 'Directe Thermische Bonprinter (ESC/POS)'}
                  </span>
                </div>
                {!printerInfo.connected && caps.hasWebSerial && (
                  <select
                    value={baudRate}
                    onChange={(e) => setBaudRate(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded-md px-1.5 py-0.5 text-[10px] text-slate-300 font-mono"
                    title="Baudrate voor Serieel"
                  >
                    <option value={9600}>9600 baud</option>
                    <option value={38400}>38400 baud</option>
                    <option value={115200}>115200 baud</option>
                  </select>
                )}
              </div>

              {printerInfo.connected ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={openCashDrawer}
                      onChange={(e) => setOpenCashDrawer(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950"
                    />
                    <span>Open kassalade</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={printerBusy}
                      onClick={handleEscPosTest}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px]"
                    >
                      Testbon ({preset.shortLabel})
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectPrinter}
                      className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 font-bold text-[11px]"
                    >
                      Verbreken
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {caps.hasWebSerial && (
                    <button
                      type="button"
                      disabled={printerBusy}
                      onClick={handleConnectSerial}
                      className="flex-1 min-w-[90px] py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1"
                    >
                      <Cable className="w-3 h-3 text-cyan-400" />
                      <span>USB-Serieel</span>
                    </button>
                  )}
                  {caps.hasWebUsb && (
                    <button
                      type="button"
                      disabled={printerBusy}
                      onClick={handleConnectUsb}
                      className="flex-1 min-w-[85px] py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1"
                    >
                      <Usb className="w-3 h-3 text-emerald-400" />
                      <span>WebUSB</span>
                    </button>
                  )}
                  {caps.hasWebBluetooth && (
                    <button
                      type="button"
                      disabled={printerBusy}
                      onClick={handleConnectBle}
                      className="flex-1 min-w-[95px] py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1"
                    >
                      <Bluetooth className="w-3 h-3 text-blue-400" />
                      <span>Bluetooth</span>
                    </button>
                  )}
                  {!caps.hasWebSerial && !caps.hasWebUsb && !caps.hasWebBluetooth && (
                    <span className="text-[10px] text-slate-400">
                      Gebruik Systeem Print / PDF hieronder voor printen op dit apparaat.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleTrackLive}
            className="w-full py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-1.5 transition shadow"
          >
            <Clock className="w-4 h-4" />
            <span>🔔 Volg Bereiding Live Status (Pop-up)</span>
          </button>

          <div className="flex gap-2">
            {printerInfo.connected && !isA4 && (
              <button
                type="button"
                disabled={printerBusy}
                onClick={handleEscPosPrint}
                className="flex-1 py-2 rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center gap-1.5 transition"
              >
                <Zap className="w-4 h-4" />
                <span>Direct ESC/POS ({preset.shortLabel})</span>
              </button>
            )}
            <button
              type="button"
              onClick={handlePrintSystem}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Systeem Print ({preset.shortLabel})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveReceiptOrder(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Sluiten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

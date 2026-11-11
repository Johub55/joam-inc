import React from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { Printer, X, CheckCircle2, Clock } from 'lucide-react';

export const ReceiptModal: React.FC = () => {
  const { activeReceiptOrder, setActiveReceiptOrder, setTrackedOrderNo } = useApp();

  if (!activeReceiptOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleTrackLive = () => {
    const num = activeReceiptOrder.no;
    setActiveReceiptOrder(null);
    setTrackedOrderNo(num);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
        
        {/* Top bar */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
            <CheckCircle2 className="w-4 h-4" />
            <span>Bestelling Geslaagd</span>
          </div>
          <button
            onClick={() => setActiveReceiptOrder(null)}
            className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 flex items-center justify-center text-xs"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Receipt Paper Design */}
        <div className="p-5 bg-white text-slate-900 font-mono text-xs overflow-y-auto max-h-[70vh] shadow-inner select-text">
          <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
            <div className="w-8 h-8 mx-auto rounded-lg bg-amber-400 font-black text-slate-950 text-xl flex items-center justify-center mb-1">
              W
            </div>
            <h2 className="font-extrabold text-sm tracking-wider uppercase">WERKDONALDS</h2>
            <p className="text-[10px] text-slate-500">Filiaal #1 · Kassa Systeem</p>
            <p className="text-[10px] text-slate-500">{activeReceiptOrder.time} · {new Date().toLocaleDateString('nl-NL')}</p>
          </div>

          <div className="py-2.5 border-b-2 border-dashed border-slate-300 flex justify-between items-center font-bold">
            <span className="text-sm text-slate-950">BESTELLING #{activeReceiptOrder.no}</span>
            <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 border border-slate-200">
              {activeReceiptOrder.orderType === 'dine_in' ? '🍽️ Opeten' : '🛍️ Meenemen'}
            </span>
          </div>

          {activeReceiptOrder.identifier && (
            <div className="py-1 text-[11px] text-slate-600">
              Klant/Tafel: <strong className="text-slate-950">{activeReceiptOrder.identifier}</strong>
            </div>
          )}

          {/* Items */}
          <div className="py-2.5 space-y-2 border-b-2 border-dashed border-slate-300">
            {activeReceiptOrder.items.map((item, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex justify-between font-bold">
                  <span>{item.qty}× {item.name}</span>
                  <span>{euro(item.price * item.qty)}</span>
                </div>
                {item.itemNote && (
                  <div className="text-[10px] text-slate-500 pl-2 italic">
                    ↳ {item.itemNote}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="py-2.5 space-y-1 text-[11px]">
            {activeReceiptOrder.discount > 0 && (
              <div className="flex justify-between text-rose-600 font-bold">
                <span>Korting:</span>
                <span>- {euro(activeReceiptOrder.discount)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-200">
              <span>TOTAAL:</span>
              <span>{euro(activeReceiptOrder.total)}</span>
            </div>
          </div>

          {/* Payment Method Details */}
          <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-600 space-y-0.5">
            <div className="flex justify-between">
              <span>Betaald via:</span>
              <strong className="uppercase text-slate-900">
                {activeReceiptOrder.paymentMethod === 'workpay' ? '💳 WerkPay Bank' : activeReceiptOrder.paymentMethod === 'cash' ? '💵 Contant' : '🎁 Cadeaubon'}
              </strong>
            </div>
            {activeReceiptOrder.paymentMeta?.account && (
              <div className="flex justify-between">
                <span>WerkPay Rekening:</span>
                <span>@{activeReceiptOrder.paymentMeta.account}</span>
              </div>
            )}
            {activeReceiptOrder.paymentMeta?.balance_after !== undefined && (
              <div className="flex justify-between">
                <span>Nieuw Saldo:</span>
                <span>{euro(activeReceiptOrder.paymentMeta.balance_after)}</span>
              </div>
            )}
            {activeReceiptOrder.paymentMeta?.change > 0 && (
              <div className="flex justify-between">
                <span>Wisselgeld gegeven:</span>
                <span>{euro(activeReceiptOrder.paymentMeta.change)}</span>
              </div>
            )}
            <div className="text-center pt-3 text-[10px] text-slate-400">
              Bedankt voor je bestelling bij Werkdonalds!
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2">
          <button
            onClick={handleTrackLive}
            className="w-full py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-1.5 transition shadow"
          >
            <Clock className="w-4 h-4" />
            <span>🔔 Volg Bereiding Live Status (Pop-up)</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Print Bon</span>
            </button>
            <button
              onClick={() => setActiveReceiptOrder(null)}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Sluiten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

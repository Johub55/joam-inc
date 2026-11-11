import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { AudioFX } from '../../services/audio';
import { Banknote, Check, X, AlertTriangle, ShieldCheck, DollarSign } from 'lucide-react';

export const StaffCashRequestNotifier: React.FC = () => {
  const { cashRequests, approveCashRequest, rejectCashRequest, currentPosUser } = useApp();
  
  // Pending cash payment requests
  const pendingRequests = cashRequests.filter(r => r.status === 'pending');
  const activeReq = pendingRequests.length > 0 ? pendingRequests[0] : null;

  const [receivedInput, setReceivedInput] = useState<string>('');
  const [lastNotifiedId, setLastNotifiedId] = useState<string>('');

  // Bell chime when a new cash request comes in
  useEffect(() => {
    if (activeReq && activeReq.id !== lastNotifiedId) {
      AudioFX.bell();
      setLastNotifiedId(activeReq.id);
      setReceivedInput(activeReq.total.toFixed(2));
    }
  }, [activeReq, lastNotifiedId]);

  // Only employees with cash authorization see this pop-up on their screen (ignore kiosk mode)
  const isKiosk = currentPosUser?.username === 'bestel_kassa';
  const isAuthorizedEmployee = !isKiosk && (
    !currentPosUser || 
    currentPosUser.is_admin || 
    currentPosUser.perms?.includes('cash_pay') || 
    currentPosUser.perms?.includes('pos')
  );

  if (!isAuthorizedEmployee || !activeReq) return null;

  const total = activeReq.total;
  const receivedNum = parseFloat(receivedInput) || total;
  const changeAmount = Math.max(0, receivedNum - total);

  const handleApprove = () => {
    const cashierName = currentPosUser?.name || 'Kassa Medewerker';
    AudioFX.bell();
    approveCashRequest(activeReq.id, cashierName, receivedNum, changeAmount);
  };

  const handleReject = () => {
    rejectCashRequest(activeReq.id, 'Geweigerd door kassamedewerker');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-bounce-short">
      <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl shadow-2xl overflow-hidden p-5 text-slate-100 flex flex-col gap-3 ring-4 ring-emerald-500/20">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 animate-pulse">
              <Banknote className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-emerald-400 uppercase tracking-wide">
                  Contant Betaalverzoek!
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  #{activeReq.orderNo}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Klant vraagt om contante betaling op een ander scherm.
              </p>
            </div>
          </div>

          <button
            onClick={handleReject}
            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
            title="Weigeren"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Order Details */}
        <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">
              {activeReq.orderType === 'dine_in' ? '🍽️ Opeten in zaak' : '🛍️ Meenemen'}
              {activeReq.identifier ? ` (${activeReq.identifier})` : ''}
            </span>
            <span className="font-bold text-slate-200">
              Te ontvangen bedrag:
            </span>
          </div>
          <span className="font-black text-xl text-emerald-400 font-mono">
            {euro(total)}
          </span>
        </div>

        {/* Received Cash Calculator */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <label className="text-slate-300 font-bold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              Ontvangen contant geld:
            </label>
            <span className="text-slate-400 text-[11px]">
              Wisselgeld: <strong className="text-emerald-300 font-mono">{euro(changeAmount)}</strong>
            </span>
          </div>

          <input
            type="number"
            step="0.05"
            value={receivedInput}
            onChange={e => setReceivedInput(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-white font-mono focus:outline-none focus:border-emerald-400"
          />

          {/* Quick cash pills */}
          <div className="flex gap-1.5 pt-1">
            {[total, Math.ceil(total / 5) * 5, 20, 50].map((amt, idx) => {
              if (amt < total) return null;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setReceivedInput(amt.toFixed(2))}
                  className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700 transition"
                >
                  {euro(amt)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleReject}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-rose-400 text-xs font-bold transition border border-slate-700 hover:border-rose-500 flex items-center gap-1.5"
          >
            <X className="w-4 h-4" />
            <span>Weigeren</span>
          </button>

          <button
            type="button"
            disabled={receivedNum < total}
            onClick={handleApprove}
            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-black transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Accepteer Contant &amp; Open Lade</span>
          </button>
        </div>

        {pendingRequests.length > 1 && (
          <p className="text-[10px] text-center text-slate-500">
            Nog {pendingRequests.length - 1} ander(e) contant verzoek(en) in de wachtrij
          </p>
        )}

      </div>
    </div>
  );
};

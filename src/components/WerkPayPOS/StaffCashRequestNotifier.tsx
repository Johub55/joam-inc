import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { AudioFX } from '../../services/audio';
import { Banknote, Check, X, AlertTriangle, DollarSign } from 'lucide-react';

export const StaffCashRequestNotifier: React.FC = () => {
  const {
    cashRequests,
    approveCashRequest,
    rejectCashRequest,
    currentPosUser,
    managerOverride,
    authorizeCashStaffUser
  } = useApp();

  // Only pending requests
  const pendingRequests = cashRequests.filter(r => r.status === 'pending');
  const activeReq = pendingRequests.length > 0 ? pendingRequests[0] : null;

  const [receivedInput, setReceivedInput] = useState<string>('');
  const [lastNotifiedId, setLastNotifiedId] = useState<string>('');
  const [approvalError, setApprovalError] = useState<string>('');

  // Bell chime when a new cash request comes in
  useEffect(() => {
    if (activeReq && activeReq.id !== lastNotifiedId) {
      AudioFX.bell();
      setLastNotifiedId(activeReq.id);
      setReceivedInput(activeReq.total.toFixed(2));
      setApprovalError('');
    }
  }, [activeReq, lastNotifiedId]);

  // Strict authorization: must be an active, logged-in, non-kiosk staff member with cash_pay or managerOverride
  const isAuthorizedEmployee = Boolean(managerOverride || authorizeCashStaffUser(currentPosUser));

  if (!isAuthorizedEmployee || !activeReq) return null;

  const total = activeReq.total;
  const normalizedInput = receivedInput.replace(',', '.').trim();
  const parsedReceived = normalizedInput === '' ? NaN : Number(normalizedInput);
  const isValidAmount = Number.isFinite(parsedReceived) && parsedReceived >= total - 0.01;
  const changeAmount = isValidAmount ? Math.max(0, Math.round((parsedReceived - total) * 100) / 100) : 0;

  const handleApprove = () => {
    setApprovalError('');
    if (!isValidAmount) {
      setApprovalError(`Voer een geldig ontvangen bedrag in (minimaal ${euro(total)}).`);
      return;
    }
    const cashierName = currentPosUser?.name || 'Kassamedewerker';
    const res = approveCashRequest(activeReq.id, cashierName, parsedReceived, changeAmount);
    if (!res.success) {
      setApprovalError(res.message);
      return;
    }
    AudioFX.bell();
  };

  const handleReject = () => {
    setApprovalError('');
    rejectCashRequest(activeReq.id, `Geweigerd door ${currentPosUser?.name || 'kassamedewerker'}`);
  };

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 max-w-md sm:w-full">
      <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl shadow-2xl overflow-hidden p-5 text-slate-100 flex flex-col gap-3 ring-4 ring-emerald-500/20">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Banknote className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-emerald-400 uppercase tracking-wide">
                  Contant Betaalverzoek
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono font-bold tabular-nums">
                  #{activeReq.orderNo}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Klant wacht op kassa-autorisatie ({currentPosUser?.name || 'Medewerker'}).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReject}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
            title="Weigeren"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Order Details */}
        <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400 block text-[11px]">
              {activeReq.orderType === 'dine_in' ? '🍽️ Opeten in zaak' : activeReq.orderType === 'delivery' ? '🛵 Bezorgen' : '🛍️ Meenemen'}
              {activeReq.identifier ? ` · ${activeReq.identifier}` : ''}
            </span>
            <span className="font-bold text-slate-200">
              Te ontvangen bedrag:
            </span>
          </div>
          <span className="font-black text-xl text-emerald-400 font-mono tabular-nums">
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
              Wisselgeld:{' '}
              <strong className={`font-mono tabular-nums ${isValidAmount ? 'text-emerald-300' : 'text-rose-400'}`}>
                {isValidAmount ? euro(changeAmount) : 'Onvolledig'}
              </strong>
            </span>
          </div>

          <input
            type="text"
            inputMode="decimal"
            value={receivedInput}
            onChange={e => {
              setReceivedInput(e.target.value);
              if (approvalError) setApprovalError('');
            }}
            placeholder={total.toFixed(2)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-bold text-white font-mono tabular-nums focus:outline-none focus:border-emerald-400"
          />

          {/* Quick cash options */}
          <div className="flex gap-1.5 pt-1">
            {[total, Math.ceil(total / 5) * 5, 20, 50].map((amt, idx) => {
              if (amt < total) return null;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setReceivedInput(amt.toFixed(2));
                    if (approvalError) setApprovalError('');
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold font-mono tabular-nums border border-slate-700 transition"
                >
                  {euro(amt)}
                </button>
              );
            })}
          </div>
        </div>

        {approvalError && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{approvalError}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={handleReject}
            className="px-4 min-h-[44px] rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-rose-400 text-xs font-bold transition border border-slate-700 hover:border-rose-500 flex items-center gap-1.5"
          >
            <X className="w-4 h-4" />
            <span>Weigeren</span>
          </button>

          <button
            type="button"
            disabled={!isValidAmount}
            onClick={handleApprove}
            className="flex-1 min-h-[44px] rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-black transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Accepteer Contant &amp; Open Lade</span>
          </button>
        </div>

        {pendingRequests.length > 1 && (
          <p className="text-[11px] text-center text-slate-500 tabular-nums">
            Nog {pendingRequests.length - 1} ander(e) contant verzoek(en) in de wachtrij
          </p>
        )}

      </div>
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { broadcastSync } from '../../services/syncHelpers';
import { AudioFX } from '../../services/audio';
import { showToast } from '../../services/appToast';
import { ShieldCheck, Check, X, MapPin, Tv2 } from 'lucide-react';

export interface PaalPairRequest {
  id: string;
  terminalId: string;
  paalName: string;
  targetKassaUser: string;
  timestamp: number;
}

export const StaffPaalPairingNotifier: React.FC = () => {
  const { currentPosUser } = useApp();
  const [pairRequest, setPairRequest] = useState<PaalPairRequest | null>(null);

  useEffect(() => {
    // Listen for broadcast pair requests
    if (typeof window === 'undefined') return;

    let ch: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        ch = new BroadcastChannel('wd_unified_sync_channel');
        ch.onmessage = (evt) => {
          if (evt.data?.type === 'SPAARPAAL_PAIR_REQUEST') {
            const req = evt.data.payload as PaalPairRequest;
            // Check if this Kassa user is target or general
            if (!req.targetKassaUser || req.targetKassaUser === 'all' || req.targetKassaUser === currentPosUser?.username || req.targetKassaUser === currentPosUser?.name) {
              setPairRequest(req);
              AudioFX.bell();
            }
          } else if (evt.data?.type === 'SPAARPAAL_PAIR_CANCEL') {
            setPairRequest(null);
          }
        };
      }
    } catch (e) {
      console.debug('BroadcastChannel error in StaffPaalPairingNotifier', e);
    }

    return () => {
      if (ch) ch.close();
    };
  }, [currentPosUser]);

  // Don't show if no request or if on bestel account or rpi
  if (!pairRequest || currentPosUser?.username === 'bestel_kassa' || currentPosUser?.username === 'rpi') {
    return null;
  }

  const handleAccept = () => {
    AudioFX.success();
    const cashierName = currentPosUser?.name || 'Kassa Medewerker';
    
    // Broadcast acceptance back to the RPI Spaarpaal
    broadcastSync('SPAARPAAL_PAIR_ACCEPTED', {
      requestId: pairRequest.id,
      terminalId: pairRequest.terminalId,
      paalName: pairRequest.paalName,
      kassaUser: cashierName,
      timestamp: Date.now()
    });

    localStorage.setItem('wd_paired_paal_terminal', pairRequest.paalName);
    setPairRequest(null);
    showToast(`🟢 Kassa succesvol gekoppeld aan Spaarpaal '${pairRequest.paalName}'!`, 'success');
  };

  const handleReject = () => {
    AudioFX.click();
    broadcastSync('SPAARPAAL_PAIR_REJECTED', {
      requestId: pairRequest.id,
      terminalId: pairRequest.terminalId
    });
    setPairRequest(null);
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 max-w-sm w-full animate-bounce-short">
      <div className="bg-slate-900 border-2 border-amber-500 rounded-3xl shadow-2xl p-4 text-slate-100 space-y-3 ring-4 ring-amber-500/20">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-black shrink-0 animate-pulse text-lg">
              👑
            </div>
            <div>
              <span className="font-black text-xs text-amber-400 uppercase tracking-wide block">
                Verzoek Koppeling Spaarpaal!
              </span>
              <p className="text-[11px] text-slate-300 font-bold flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-emerald-400" />
                <span>{pairRequest.paalName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleReject}
            className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 text-xs font-bold"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info */}
        <p className="text-xs text-slate-300 leading-snug">
          Een Touchscreen Spaarpaal verzoekt live koppeling met deze Kassa. Wil je deze kassa-sessie koppelen?
        </p>

        {/* Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleReject}
            className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            Weigeren
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 py-2 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-1 shadow-lg shadow-emerald-500/20"
          >
            <Check className="w-4 h-4" />
            <span>Accepteren</span>
          </button>
        </div>

      </div>
    </div>
  );
};

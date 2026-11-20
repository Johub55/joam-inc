import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  claimHardwareTerminalLinkMode,
  claimHardwareTerminalPayMode,
  extractTerminalLockOwner,
  getTerminalTabSessionId,
  HardwareTerminalState,
  isHardwareTerminalBusy,
  releaseHardwareTerminalIfOwned,
  setHardwareTerminalIdle,
  setHardwareTerminalLinked,
  setHardwareTerminalResult,
  subscribeHardwareTerminal,
  toPicoShortReason,
} from '../services/firebase';
import { showToast } from '../services/appToast';
import { TerminalSelector } from './WerkPayPOS/TerminalSelector';
import { getActiveHardwareTerminalId, HARDWARE_TERMINAL_EVENT } from '../services/firebase';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Radio,
  RotateCcw,
  Zap,
} from 'lucide-react';

interface PicoCardLoginPanelProps {
  mode: 'pos' | 'werkpay' | 'unlock';
  compact?: boolean;
  forcePinOnly?: boolean;
  onSuccess?: () => void;
  onCustomCardAuth?: (
    uid: string,
    pin: string | undefined,
    style: 'pin' | 'quick'
  ) => Promise<{ success: boolean; message: string; requires2FA?: boolean }>;
}

export const PicoCardLoginPanel: React.FC<PicoCardLoginPanelProps> = ({
  mode,
  compact = false,
  forcePinOnly = false,
  onSuccess,
  onCustomCardAuth,
}) => {
  const { loginPosWithCard, loginWerkPayWithCard } = useApp();

  const [terminalId, setTerminalId] = useState<string>(() => getActiveHardwareTerminalId());
  const [authStyle, setAuthStyle] = useState<'pin' | 'quick'>('pin');
  const [waiting, setWaiting] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [liveState, setLiveState] = useState<HardwareTerminalState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('');
  const [busyWarning, setBusyWarning] = useState<string>('');

  const effectiveAuthStyle: 'pin' | 'quick' = forcePinOnly ? 'pin' : authStyle;

  const isMountedRef = useRef<boolean>(true);
  const terminalIdRef = useRef<string>(terminalId);
  terminalIdRef.current = terminalId;
  const activeClaimTokenRef = useRef<string>('');
  const waitingRef = useRef<boolean>(false);
  const sawActiveForClaimRef = useRef<boolean>(false);
  const authStyleRef = useRef<'pin' | 'quick'>(effectiveAuthStyle);
  authStyleRef.current = effectiveAuthStyle;
  const handledSigRef = useRef<string>('');
  const onCustomCardAuthRef = useRef(onCustomCardAuth);
  onCustomCardAuthRef.current = onCustomCardAuth;

  type CardAuthResult = { success: boolean; message: string; requires2FA?: boolean };

  const withTimeout = function <T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  };

  const performLoginRef = useRef<
    (uid: string, pin: string | undefined, style: 'pin' | 'quick') => Promise<void>
  >(async () => {});

  performLoginRef.current = async (uid, pin, style) => {
    // Synchronously release local waiting/claim state BEFORE running login so an unmount
    // triggered by setting the logged-in user never calls releaseHardwareTerminalIfOwned.
    waitingRef.current = false;
    activeClaimTokenRef.current = '';
    if (isMountedRef.current) {
      setWaiting(false);
      setVerifying(true);
      setErrorMsg('');
    }
    const currentTermId = terminalIdRef.current;
    try {
      const authPromise: Promise<CardAuthResult> = onCustomCardAuthRef.current
        ? onCustomCardAuthRef.current(uid, pin, style)
        : (mode === 'pos' ? loginPosWithCard : loginWerkPayWithCard)(uid, pin, style === 'pin');

      const res: CardAuthResult = await withTimeout<CardAuthResult>(
        authPromise,
        12000,
        'Time-out bij controleren van pas/pincode. Probeer opnieuw.'
      );

      if (res.success) {
        await withTimeout<void>(
          style === 'quick'
            ? setHardwareTerminalLinked('Ingelogd', uid, currentTermId)
            : setHardwareTerminalResult('APPROVED', 'Welkom!', currentTermId),
          5000,
          'Terminal feedback time-out'
        ).catch(() => {});

        if (isMountedRef.current) {
          setStatusNote(res.message);
        }
        showToast(res.message, 'success');
        if (onSuccess) onSuccess();
      } else {
        await setHardwareTerminalResult('DECLINED', toPicoShortReason(res.message), currentTermId).catch(() => {});
        if (isMountedRef.current) {
          setErrorMsg(res.message);
        }
      }
    } catch (err: any) {
      await setHardwareTerminalResult('DECLINED', 'Inlogfout', currentTermId).catch(() => {});
      if (isMountedRef.current) {
        setErrorMsg(err?.message || 'Inloggen via pinapparaat mislukt.');
      }
    } finally {
      if (isMountedRef.current) {
        setVerifying(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const syncTerm = () => {
      if (!waitingRef.current) {
        setTerminalId(getActiveHardwareTerminalId());
      }
    };
    window.addEventListener(HARDWARE_TERMINAL_EVENT, syncTerm);
    return () => window.removeEventListener(HARDWARE_TERMINAL_EVENT, syncTerm);
  }, []);

  // Live subscribe to terminal state (busy indicator + active login listener)
  useEffect(() => {
    sawActiveForClaimRef.current = false;

    const unsub = subscribeHardwareTerminal(
      async (st) => {
        if (!isMountedRef.current) return;
        setLiveState(st);

        if (!waitingRef.current) {
          const check = isHardwareTerminalBusy(st, activeClaimTokenRef.current || undefined);
          setBusyWarning(check.busy ? check.reason || 'Pinapparaat is momenteel bezet.' : '');
          return;
        }

        if (!st) return;

        const expectedToken = activeClaimTokenRef.current;
        const lockOwner = extractTerminalLockOwner(st.reason);
        const belongsToSession = !expectedToken || !lockOwner || lockOwner === expectedToken;

        if (
          st.status !== 'IDLE' &&
          (lockOwner === expectedToken ||
            (belongsToSession && (st.status === 'SUBMITTED' || st.status === 'CARD_SCANNED')))
        ) {
          sawActiveForClaimRef.current = true;
        }

        if (
          authStyleRef.current === 'pin' &&
          st.status === 'SUBMITTED' &&
          st.scannedUid &&
          st.enteredPin &&
          belongsToSession
        ) {
          const sig = `pin:${st.scannedUid}:${st.enteredPin}:${st.updatedAt}`;
          if (handledSigRef.current === sig) return;
          handledSigRef.current = sig;
          waitingRef.current = false;
          activeClaimTokenRef.current = '';
          setWaiting(false);
          await performLoginRef.current(st.scannedUid, st.enteredPin, 'pin');
        } else if (
          authStyleRef.current === 'quick' &&
          st.status === 'CARD_SCANNED' &&
          st.scannedUid &&
          belongsToSession
        ) {
          const sig = `quick:${st.scannedUid}:${st.updatedAt}`;
          if (handledSigRef.current === sig) return;
          handledSigRef.current = sig;
          waitingRef.current = false;
          activeClaimTokenRef.current = '';
          setWaiting(false);
          await performLoginRef.current(st.scannedUid, undefined, 'quick');
        } else if (st.status === 'IDLE' && sawActiveForClaimRef.current) {
          waitingRef.current = false;
          activeClaimTokenRef.current = '';
          setWaiting(false);
          setErrorMsg(st.reason && st.reason !== 'Klaar' ? st.reason : 'Inloggen geannuleerd op het pinapparaat.');
        } else if (st.status === 'DECLINED' && sawActiveForClaimRef.current) {
          waitingRef.current = false;
          activeClaimTokenRef.current = '';
          setWaiting(false);
          setErrorMsg(st.reason || 'Inloggen geweigerd op het pinapparaat.');
        }
      },
      () => {
        if (waitingRef.current && isMountedRef.current) {
          waitingRef.current = false;
          activeClaimTokenRef.current = '';
          setWaiting(false);
          setErrorMsg('Verbinding met Firebase terminal relay onderbroken.');
        }
      },
      terminalId
    );

    return () => {
      unsub();
    };
  }, [terminalId]);

  // Release own lock cleanly when component unmounts while still waiting for scan
  useEffect(() => {
    return () => {
      if (waitingRef.current && activeClaimTokenRef.current) {
        const token = activeClaimTokenRef.current;
        waitingRef.current = false;
        activeClaimTokenRef.current = '';
        releaseHardwareTerminalIfOwned(token, terminalIdRef.current).catch(() => {});
      }
    };
  }, []);

  const handleStartScan = async () => {
    setErrorMsg('');
    setStatusNote('');
    setBusyWarning('');
    handledSigRef.current = '';
    sawActiveForClaimRef.current = false;

    const targetTermId = terminalIdRef.current;
    if (!targetTermId) {
      setErrorMsg('Stel hierboven eerst zelf een pinapparaat (Terminal-ID) in.');
      return;
    }

    const token = `${getTerminalTabSessionId()}_login_${Date.now()}`;
    activeClaimTokenRef.current = token;
    waitingRef.current = true;
    setWaiting(true);

    try {
      const label = forcePinOnly
        ? 'Inloggen: 2FA'
        : mode === 'unlock'
        ? 'Inloggen: Slot'
        : mode === 'pos'
        ? 'Inloggen: POS'
        : 'Inloggen';
      const claimRes =
        effectiveAuthStyle === 'pin'
          ? await claimHardwareTerminalPayMode(0, 0, token, label, targetTermId)
          : await claimHardwareTerminalLinkMode(label, token, targetTermId);

      if (!claimRes.acquired) {
        waitingRef.current = false;
        activeClaimTokenRef.current = '';
        if (isMountedRef.current) {
          setWaiting(false);
          setErrorMsg(
            claimRes.busyMessage ||
              'Het pinapparaat is momenteel bezig met een betaling of andere sessie.'
          );
        }
        return;
      }

      if (!isMountedRef.current) {
        waitingRef.current = false;
        activeClaimTokenRef.current = '';
        releaseHardwareTerminalIfOwned(token, targetTermId).catch(() => {});
      }
    } catch (err: any) {
      waitingRef.current = false;
      activeClaimTokenRef.current = '';
      if (isMountedRef.current) {
        setWaiting(false);
        setErrorMsg(err?.message || 'Kon pinapparaat niet activeren.');
      }
    }
  };

  const handleCancel = async () => {
    const token = activeClaimTokenRef.current;
    waitingRef.current = false;
    activeClaimTokenRef.current = '';
    setWaiting(false);
    if (token) {
      await releaseHardwareTerminalIfOwned(token, terminalIdRef.current).catch(() => {});
    }
  };

  const handleForceReset = async () => {
    setBusyWarning('');
    setErrorMsg('');
    await setHardwareTerminalIdle(terminalIdRef.current).catch(() => {});
    showToast(`Pinapparaat (${terminalIdRef.current}) vrijgegeven (IDLE).`, 'info');
  };

  return (
    <div className={`space-y-3 ${compact ? 'text-xs' : 'text-xs'}`}>
      <TerminalSelector
        compact
        disabled={waiting || verifying}
        value={terminalId}
        onChange={setTerminalId}
      />

      {/* Mode selector (locked to PIN only when forcePinOnly is enabled for 2FA) */}
      {forcePinOnly ? (
        <div className="px-3 py-2 rounded-xl bg-purple-950/50 border border-purple-500/40 text-purple-200 text-[11px] font-bold flex items-center justify-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>2FA Beveiliging: Pincode op keypad is verplicht</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            disabled={waiting || verifying}
            onClick={() => {
              setAuthStyle('pin');
              setErrorMsg('');
            }}
            className={`py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
              effectiveAuthStyle === 'pin'
                ? 'bg-cyan-500 text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Pas + Pincode</span>
          </button>
          <button
            type="button"
            disabled={waiting || verifying}
            onClick={() => {
              setAuthStyle('quick');
              setErrorMsg('');
            }}
            className={`py-2 px-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition ${
              effectiveAuthStyle === 'quick'
                ? 'bg-cyan-500 text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Snelle Pas-Scan</span>
          </button>
        </div>
      )}

      {/* Busy indicator if another checkout/terminal owns Pico */}
      {busyWarning && !waiting && (
        <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 space-y-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-snug font-semibold">{busyWarning}</span>
          </div>
          <button
            type="button"
            onClick={handleForceReset}
            className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Toch vrijgeven (Reset naar IDLE)</span>
          </button>
        </div>
      )}

      {/* Main status box */}
      {!waiting && !verifying ? (
        <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <div className="font-black text-white">
                {effectiveAuthStyle === 'pin'
                  ? 'Inloggen met NFC Pas + Pincode'
                  : 'Direct inloggen door pas te scannen'}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {effectiveAuthStyle === 'pin'
                  ? 'Houd je gekoppelde NFC pas tegen het Pico W pinapparaat en toets je 4-cijferige pincode in op het keypad.'
                  : 'Houd je gekoppelde NFC pas 1 seconde tegen het pinapparaat om zonder typen direct in te loggen.'}
              </p>
            </div>
          </div>

          {!terminalId && (
            <div className="p-2.5 rounded-xl bg-amber-950/35 border border-amber-500/35 text-[11px] text-amber-200 font-semibold">
              Nog geen pinapparaat ingesteld. Voeg hierboven eerst zelf een eigen pinapparaat toe.
            </div>
          )}

          <button
            type="button"
            disabled={!terminalId || Boolean(busyWarning)}
            onClick={handleStartScan}
            className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-45 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-500/20"
          >
            <Radio className="w-4 h-4" />
            <span>{forcePinOnly ? 'Start 2FA Scan (Pas + Pincode)' : 'Activeer Pinapparaat voor Login'}</span>
          </button>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-cyan-400 mx-auto animate-spin" />
          <div className="space-y-1">
            <div className="font-black text-sm text-cyan-200">
              {verifying
                ? 'Pas & gegevens controleren...'
                : effectiveAuthStyle === 'pin'
                ? 'Houd je pas bij het pinapparaat & toets PIN in...'
                : 'Houd nu je NFC pas tegen het pinapparaat...'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Terminal status: <span className="text-white">{liveState?.status || 'ACTIEF'}</span>
            </div>
          </div>
          {!verifying && (
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-2 px-3 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-xs transition"
            >
              Annuleren
            </button>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {statusNote && !errorMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusNote}</span>
        </div>
      )}
    </div>
  );
};

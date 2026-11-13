import React, { useState, useEffect, useRef } from 'react';
import { showToast } from '../../services/appToast';
import { useApp } from '../../context/AppContext';
import {
  setHardwareTerminalLinkMode,
  setHardwareTerminalLinked,
  setHardwareTerminalIdle,
  subscribeHardwareTerminal,
} from '../../services/firebase';
import {
  normalizeCardUid,
  isVirtualCardNumber,
  parseLinkedUids,
} from '../../services/store';
import { CheckCircle2, Radio, Loader2, Tag, AlertTriangle, Plus } from 'lucide-react';

interface LinkCardModalProps {
  onClose: () => void;
  username: string;
  defaultMode?: 'primary' | 'extra';
}

export const LinkCardModal: React.FC<LinkCardModalProps> = ({
  onClose,
  username,
  defaultMode = 'primary',
}) => {
  const { bankAccounts, posUsers, saveBankAccount } = useApp();
  const [status, setStatus] = useState('Terminal activeren via Firebase Cloud...');
  const [linkedUid, setLinkedUid] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<'primary' | 'extra'>(defaultMode);
  const [tagLabel, setTagLabel] = useState<string>('');
  const [manualUid, setManualUid] = useState<string>('');
  const [showManual, setShowManual] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const handledRef = useRef(false);
  const bankAccountsRef = useRef(bankAccounts);
  bankAccountsRef.current = bankAccounts;
  const posUsersRef = useRef(posUsers);
  posUsersRef.current = posUsers;
  const saveBankAccountRef = useRef(saveBankAccount);
  saveBankAccountRef.current = saveBankAccount;
  const linkModeRef = useRef(linkMode);
  linkModeRef.current = linkMode;
  const tagLabelRef = useRef(tagLabel);
  tagLabelRef.current = tagLabel;

  const commitScannedUid = async (rawUid: string, fromPico: boolean) => {
    const uid = normalizeCardUid(rawUid);
    if (!uid) {
      setSaveError('Geen geldige UID opgegeven.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setStatus(`Pas gezien (${uid}) — opslaan naar database...`);

    const accounts = bankAccountsRef.current;
    const cleanUser = username.trim().toLowerCase();
    const targetAcc = accounts.find((a) => a.username.toLowerCase() === cleanUser);
    const matchingPosUser = posUsersRef.current.find((u) => u.username.toLowerCase() === cleanUser);

    // Kijk of deze fysieke UID al aan een ander account hing (voor nette melding)
    const previousOwner = accounts.find((a) => {
      if (a.username.toLowerCase() === cleanUser) return false;
      const prim = normalizeCardUid(a.card_uid);
      const extras = parseLinkedUids(a.linked_uids).map((t) => t.uid);
      return prim === uid || extras.includes(uid);
    });

    const mode = linkModeRef.current;
    const label = tagLabelRef.current.trim();
    const nowIso = new Date().toISOString();

    let res: { success: boolean; message?: string };

    if (targetAcc) {
      const existingExtras = parseLinkedUids(targetAcc.linked_uids || []);
      if (mode === 'extra') {
        const nextExtras = [
          ...existingExtras.filter((t) => t.uid !== uid),
          { uid, label: label || 'Extra NFC Tag', linkedAt: nowIso },
        ];
        res = await saveBankAccountRef.current({
          ...targetAcc,
          linked_uids: nextExtras,
        });
      } else {
        // Vervang hoofdpas (en zorg dat hij niet dubbel als extra staat)
        const nextExtras = existingExtras.filter((t) => t.uid !== uid);
        res = await saveBankAccountRef.current({
          ...targetAcc,
          card_uid: uid,
          linked_uids: nextExtras,
        });
      }
    } else {
      const holderName = matchingPosUser?.name || username.trim();
      res = await saveBankAccountRef.current({
        username: cleanUser,
        account_holder: holderName,
        card_uid: uid,
        linked_uids: mode === 'extra' && label ? [{ uid, label, linkedAt: nowIso }] : [],
        pin_code: '1234',
        balance: 0,
        is_admin: Boolean(matchingPosUser?.is_admin),
      });
    }

    setSaving(false);

    if (!res.success) {
      setSaveError(res.message || 'Opslaan naar database mislukt.');
      setStatus(`Fout bij opslaan van UID ${uid}.`);
      return;
    }

    if (fromPico) {
      await setHardwareTerminalLinked(username, uid).catch(() => {});
    }

    setLinkedUid(uid);
    const transferNote = previousOwner ? ` (overgezet van @${previousOwner.username})` : '';
    const modeLabel = mode === 'extra' ? 'als extra tag toegevoegd aan' : 'gekoppeld als hoofdpas aan';
    setStatus(`✅ Pas ${uid} succesvol ${modeLabel} @${username}${transferNote}!`);
    showToast(`NFC Pas ${uid} opgeslagen voor @${username}${transferNote}!`, 'success');
  };

  useEffect(() => {
    handledRef.current = false;
    let active = true;

    const startLinkMode = async () => {
      try {
        await setHardwareTerminalLinkMode(username);
        if (active) {
          setStatus('📡 Scan nu de NFC pas op het Pico W pinapparaat...');
        }
      } catch (e) {
        console.error('Firebase link mode error:', e);
        if (active) {
          setStatus('Fout bij verbinden met Firebase terminal relay.');
          showToast('Kon de terminal niet in koppelmodus zetten.', 'error');
        }
      }
    };

    startLinkMode();

    const unsub = subscribeHardwareTerminal(
      async (terminalState) => {
        if (!active || !terminalState) return;
        if (terminalState.status === 'CARD_SCANNED' && terminalState.scannedUid && !handledRef.current) {
          handledRef.current = true;
          await commitScannedUid(terminalState.scannedUid, true);
        } else if (
          terminalState.status === 'IDLE' &&
          terminalState.reason?.toLowerCase().includes('geannuleerd') &&
          !handledRef.current
        ) {
          if (active) {
            setStatus('Koppelen geannuleerd op de terminal.');
          }
        }
      },
      () => {
        if (active) {
          setStatus('Fout bij realtime luisteren naar Firebase.');
        }
      }
    );

    return () => {
      active = false;
      unsub();
    };
  }, [username]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeCardUid(manualUid);
    if (!clean) {
      setSaveError('Vul eerst een geldige UID in (bijv. 04A1B2C3).');
      return;
    }
    handledRef.current = true;
    await commitScannedUid(clean, false);
  };

  const handleClose = () => {
    setHardwareTerminalIdle().catch(() => {});
    onClose();
  };

  const targetAcc = bankAccounts.find(
    (a) => a.username.toLowerCase() === username.trim().toLowerCase()
  );
  const currentHasPhysical = targetAcc && !isVirtualCardNumber(targetAcc.card_uid);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-purple-500/50 p-6 rounded-2xl w-full max-w-md text-white shadow-2xl space-y-4">
        <div>
          <h2 className="text-xl font-black mb-1 flex items-center gap-2">
            <Radio className="w-5 h-5 text-purple-400" />
            <span>NFC Pas / UID Koppelen</span>
          </h2>
          <p className="text-sm text-slate-400">
            Voor gebruiker: <b className="text-white">@{username}</b>
            {targetAcc && (
              <span className="ml-2 text-xs text-slate-500 font-mono">
                (Nu: {currentHasPhysical ? targetAcc.card_uid : 'Virtuele kaart'})
              </span>
            )}
          </p>
        </div>

        {/* Koppelmodus: Hoofdpas vervangen vs Extra Tag toevoegen */}
        {!linkedUid && (
          <div className="space-y-2.5 bg-slate-950/70 border border-slate-800 rounded-xl p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLinkMode('primary')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition text-left ${
                  linkMode === 'primary'
                    ? 'bg-purple-600/20 border-purple-500 text-purple-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-black">🔄 Hoofdpas</div>
                <div className="text-[10px] opacity-80">Vervangt hoofd-UID</div>
              </button>
              <button
                type="button"
                onClick={() => setLinkMode('extra')}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition text-left ${
                  linkMode === 'extra'
                    ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <div className="font-black flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Extra Tag
                </div>
                <div className="text-[10px] opacity-80">Voegt extra UID toe</div>
              </button>
            </div>

            {linkMode === 'extra' && (
              <div>
                <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mb-1">
                  <Tag className="w-3 h-3 text-cyan-400" />
                  <span>Naam / label voor deze tag (optioneel)</span>
                </label>
                <input
                  type="text"
                  value={tagLabel}
                  onChange={(e) => setTagLabel(e.target.value)}
                  placeholder="bijv. Blauwe sleutelhanger, Reservepas..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}
          </div>
        )}

        {/* Status Box */}
        <div
          className={`p-5 rounded-xl border text-center text-sm font-mono flex flex-col items-center gap-3 ${
            saveError
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              : linkedUid
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-950 border-slate-800 text-purple-300'
          }`}
        >
          {saveError ? (
            <AlertTriangle className="w-7 h-7 text-rose-400" />
          ) : linkedUid ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          ) : (
            <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
          )}
          <span>{saveError || status}</span>
        </div>

        {/* Handmatige invoer toggle */}
        {!linkedUid && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowManual((prev) => !prev)}
              className="text-[11px] text-slate-400 hover:text-cyan-300 underline font-semibold"
            >
              {showManual ? 'Handmatige invoer verbergen' : 'Of handmatig UID invullen (zonder Pico W scan)'}
            </button>

            {showManual && (
              <form onSubmit={handleManualSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value.toUpperCase())}
                  placeholder="bijv. 04A1B2C3"
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-400"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs font-black text-white transition"
                >
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleClose}
          className="w-full p-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-sm transition"
        >
          {linkedUid ? 'Klaar & Sluiten' : 'Annuleren & Sluiten'}
        </button>
      </div>
    </div>
  );
};

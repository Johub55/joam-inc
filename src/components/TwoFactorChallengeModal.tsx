import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Lock, Key, AlertCircle, CheckCircle2, X, Smartphone, Hash, Laptop, Zap } from 'lucide-react';
import { showToast } from '../services/appToast';

interface TwoFactorChallengeModalProps {
  username: string;
  userTitle?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TwoFactorChallengeModal: React.FC<TwoFactorChallengeModalProps> = ({
  username,
  userTitle,
  onSuccess,
  onCancel
}) => {
  const { confirm2FALogin, verify2FACodeForUser, pending2FALogin, posUsers, bankAccounts } = useApp();
  const [code, setCode] = useState<string>('');
  const [useBackupCode, setUseBackupCode] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  const matchedUser =
    (pending2FALogin?.user?.username?.toLowerCase() === username.toLowerCase() ? pending2FALogin.user : null) ||
    posUsers.find(u => u.username.toLowerCase() === username.toLowerCase()) ||
    bankAccounts.find(a => a.username.toLowerCase() === username.toLowerCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim();
    if (!clean) {
      setErrorMsg('Voer de 6-cijferige Authenticator code of Noodcode in.');
      return;
    }

    setVerifying(true);
    setErrorMsg(null);

    try {
      if (pending2FALogin) {
        const res = await confirm2FALogin(clean);
        if (res.success) {
          showToast('🔐 2FA Verificatie geslaagd!', 'success');
          onSuccess();
        } else {
          setErrorMsg(res.message || 'Ongeldige 2FA Authenticator code of Noodcode.');
        }
      } else {
        // Generic screen-access verification
        const isValid = await verify2FACodeForUser(username, clean);
        if (isValid) {
          showToast('🔐 2FA Verificatie geslaagd!', 'success');
          onSuccess();
        } else {
          setErrorMsg('Ongeldige 2FA Authenticator code of Noodcode.');
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fout bij verifiëren van 2FA code.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-500/40 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 text-white">
        
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-black text-base text-white flex items-center gap-2">
                <span>2FA Tweestapsverificatie</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                  Beveiligd
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Inloggen als <strong className="text-purple-300">@{username}</strong> {userTitle ? `(${userTitle})` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3.5 bg-purple-950/40 border border-purple-500/30 rounded-2xl text-xs text-purple-200 space-y-1">
            <span className="font-bold block flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-purple-400 shrink-0" />
              {useBackupCode ? 'Voer je Noodcode in (bijv. WD-8492-1042):' : 'Open je Authenticator App (Google / Authy / Apple / 1Password):'}
            </span>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {useBackupCode
                ? 'Gebruik één van je opgeslagen 8-cijferige Noodcodes om in te loggen.'
                : 'Voer de huidige 6-cijferige code in die in je Authenticator app of wachtwoordbeheerder staat.'}
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5 flex justify-between items-center">
              <span>{useBackupCode ? '8-Cijferige Noodcode' : '6-Cijferige Authenticator Code'}</span>
              <button
                type="button"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setCode('');
                  setErrorMsg(null);
                }}
                className="text-[11px] text-purple-400 hover:text-purple-300 underline"
              >
                {useBackupCode ? 'Gebruik 6-cijferige Authenticator code' : 'Gebruik Noodcode'}
              </button>
            </label>

            <div className="relative">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder={useBackupCode ? 'WD-8492-1042' : '123456'}
                maxLength={useBackupCode ? 12 : 7}
                autoFocus
                className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
              />
              <Hash className="w-5 h-5 text-slate-500 absolute left-3 top-3.5" />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Annuleren
            </button>

            <button
              type="submit"
              disabled={verifying || !code.trim()}
              className="flex-1 py-2.5 rounded-xl font-black text-xs bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-600/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{verifying ? 'Verifiëren...' : 'Verifieer & Inloggen'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

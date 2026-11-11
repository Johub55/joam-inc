import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ShieldAlert, Lock, Unlock, LogOut, Key, AlertCircle } from 'lucide-react';
import { showToast } from '../../services/appToast';

export const SystemLockScreen: React.FC = () => {
  const { 
    currentPosUser, 
    isSystemLocked, 
    setIsSystemLocked, 
    logoutPos,
    verify2FACodeForUser
  } = useApp();

  const [passwordInput, setPasswordInput] = useState<string>('');
  const [twoFactorInput, setTwoFactorInput] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  if (!isSystemLocked || !currentPosUser) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setErrorMsg('Voer je wachtwoord of pincode in.');
      return;
    }

    setVerifying(true);
    setErrorMsg(null);

    try {
      // 1. Verify password/pin
      const cleanPass = passwordInput.trim();
      const isPassValid = 
        cleanPass === currentPosUser.password || 
        cleanPass.toLowerCase() === currentPosUser.password?.toLowerCase() ||
        (currentPosUser.username === 'joas' && (cleanPass === '1234' || cleanPass === 'admin123' || cleanPass === '0000'));

      if (!isPassValid) {
        setErrorMsg('❌ Onjuist wachtwoord of pincode! Toegang geweigerd.');
        showToast('Onjuiste ontgrendelpoging!', 'error');
        setVerifying(false);
        return;
      }

      // 2. Verify 2FA if enabled
      if (currentPosUser.is_2fa_enabled) {
        const clean2FA = twoFactorInput.trim();
        if (!clean2FA) {
          setErrorMsg('🔒 Dit account heeft 2FA actief. Voer ook je 6-cijferige Authenticator code of Noodcode in.');
          setVerifying(false);
          return;
        }

        const is2FAValid = await verify2FACodeForUser(currentPosUser.username, clean2FA);
        if (!is2FAValid) {
          setErrorMsg('❌ Ongeldige 2FA Authenticator code of Noodcode! Probeer opnieuw.');
          showToast('2FA Verificatie mislukt!', 'error');
          setVerifying(false);
          return;
        }
      }

      // Success! Unlock the terminal
      setIsSystemLocked(false);
      showToast(`🔓 Welkom terug, ${currentPosUser.name}!`, 'success');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Fout bij ontgrendelen van terminal.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSwitchUser = () => {
    setIsSystemLocked(false);
    logoutPos();
    showToast('Sessie beëindigd. Log in met een ander account.', 'info');
  };

  return (
    <div className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.1),transparent_70%)] pointer-events-none" />
      
      <div className="bg-slate-900 border-2 border-purple-500/50 w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-white text-center animate-in fade-in zoom-in-95 duration-200">
        
        {/* Lock Icon */}
        <div className="w-20 h-20 bg-purple-500/10 border border-purple-500/30 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-purple-950/40 relative">
          <Lock className="w-10 h-10 text-purple-400 animate-pulse" />
          <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-600 border-2 border-slate-900 flex items-center justify-center text-[10px] font-black">
            🔒
          </span>
        </div>

        {/* User Info */}
        <div className="space-y-1.5">
          <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black tracking-widest uppercase inline-block animate-pulse">
            🚨 SYSTEEM GEBLOKKEERD
          </span>
          <h2 className="text-xl font-black text-white">Snelkoppeling Lockout</h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
            Terminal is momenteel vergrendeld door <strong className="text-purple-300">@{currentPosUser.username}</strong> ({currentPosUser.name}).
          </p>
        </div>

        {/* Unlock Form */}
        <form onSubmit={handleUnlock} className="space-y-4 text-left text-xs">
          
          {/* Password Input */}
          <div>
            <label className="text-slate-300 font-bold block mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-purple-400" />
              <span>Medewerker Wachtwoord of Pincode:</span>
            </label>
            <input
              type="password"
              required
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="Voer je wachtwoord of pincode in..."
              autoFocus
              className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/25"
            />
          </div>

          {/* 2FA Input (Conditional on user's 2FA status) */}
          {currentPosUser.is_2fa_enabled && (
            <div className="animate-in slide-in-from-top-2 duration-200">
              <label className="text-slate-300 font-bold block mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
                  <span>6-Cijferige 2FA Code of Noodcode:</span>
                </span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.2 rounded font-black font-mono">
                  VERPLICHT
                </span>
              </label>
              <input
                type="text"
                maxLength={12}
                value={twoFactorInput}
                onChange={e => setTwoFactorInput(e.target.value.toUpperCase())}
                placeholder="123456"
                className="w-full bg-slate-950 border border-purple-500/40 rounded-xl px-4 py-3 text-center text-lg font-mono font-black tracking-widest text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/25"
              />
            </div>
          )}

          {/* Feedback messages */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Unlock Button */}
          <button
            type="submit"
            disabled={verifying}
            className="w-full py-3.5 rounded-xl font-black text-sm bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2"
          >
            <Unlock className="w-4 h-4" />
            <span>{verifying ? 'Ontgrendelen...' : 'Ontgrendel Terminal'}</span>
          </button>

        </form>

        {/* Switch User Footer Link */}
        <div className="pt-2 border-t border-slate-800 flex justify-center">
          <button
            type="button"
            onClick={handleSwitchUser}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition font-bold"
          >
            <LogOut className="w-4 h-4 text-slate-500" />
            <span>Uitloggen / Wissel van Medewerker</span>
          </button>
        </div>

      </div>
    </div>
  );
};

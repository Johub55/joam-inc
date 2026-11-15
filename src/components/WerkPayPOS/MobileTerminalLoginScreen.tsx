import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertCircle, CreditCard, Lock, LogIn, Monitor, User } from 'lucide-react';

interface MobileTerminalLoginScreenProps {
  onSwitchToFullVersion: () => void;
}

export const MobileTerminalLoginScreen: React.FC<MobileTerminalLoginScreenProps> = ({
  onSwitchToFullVersion
}) => {
  const { loginPos, brandConfig, customBranding, activeBrand } = useApp();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const isKoekploeg = activeBrand === 'koekploeg';
  const brandName =
    customBranding && customBranding.useCustomBranding
      ? customBranding.storeName
      : brandConfig.name;
  const brandEmoji =
    customBranding && customBranding.useCustomBranding
      ? customBranding.logoEmoji
      : brandConfig.logoEmoji;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError('');
    setIsSubmitting(true);
    try {
      const res = await loginPos(username, password);
      if (!res.success) {
        setError(res.message || 'Inloggen mislukt.');
      }
    } catch (err: any) {
      setError(err?.message || 'Verbindingsfout tijdens inloggen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-950 text-slate-100 px-5 py-6">
      {/* Compact Brand Bar */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-lg ${
              isKoekploeg
                ? 'bg-gradient-to-br from-amber-500 to-yellow-400 text-slate-950'
                : 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white'
            }`}
          >
            {brandEmoji}
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-black text-white truncate">{brandName}</h1>
            <p className="text-xs text-cyan-400 font-semibold truncate">
              SumUp Pocket Terminal · Alleen voor personeel
            </p>
          </div>
        </div>
      </header>

      {/* Main Dedicated Terminal Login Card */}
      <main className="my-auto py-6">
        <div className="max-w-md w-full mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-2xl">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>Speciale Klein-Scherm Modus</span>
            </div>
            <h2 className="text-xl font-black text-white leading-tight">
              Log in op de mobiele terminal
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Op dit kleine scherm zijn het bestel- en afhaalscherm verborgen. Log in als medewerker of manager voor direct afrekenen, bestellingen beheren, NFC passen en de Pico W C++ flasher.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="mobile-terminal-user"
                className="text-xs font-bold text-slate-300 flex items-center gap-1.5"
              >
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Gebruikersnaam</span>
              </label>
              <input
                id="mobile-terminal-user"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="Medewerker gebruikersnaam..."
                className="w-full min-h-[46px] bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="mobile-terminal-pass"
                className="text-xs font-bold text-slate-300 flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Wachtwoord of Pincode</span>
              </label>
              <input
                id="mobile-terminal-pass"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="••••••••"
                className="w-full min-h-[46px] bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 active:scale-[0.98] text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-500/20"
            >
              <LogIn className="w-4 h-4" />
              <span>{isSubmitting ? 'Controleren...' : 'Open SumUp Terminal'}</span>
            </button>
          </form>
        </div>
      </main>

      {/* Quiet Escape Hatch to Full POS */}
      <footer className="max-w-md w-full mx-auto text-center pb-12">
        <button
          type="button"
          onClick={onSwitchToFullVersion}
          className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white inline-flex items-center justify-center gap-1.5 transition"
        >
          <Monitor className="w-3.5 h-3.5" />
          <span>Toch volledig bestel- en afhaalscherm openen</span>
        </button>
      </footer>
    </div>
  );
};

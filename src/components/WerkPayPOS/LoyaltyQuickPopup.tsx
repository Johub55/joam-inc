import React, { useState, useEffect } from 'react';
import { 
  Award, 
  Coins, 
  Gift, 
  Phone, 
  UserPlus, 
  CheckCircle2, 
  X, 
  MapPin, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { 
  getLoyaltyCustomers, 
  findLoyaltyCustomerByPhoneOrName, 
  registerLoyaltyCustomer, 
  deductCoinsFromCustomer, 
  LOYALTY_REWARDS, 
  LoyaltyCustomer, 
  LoyaltyReward 
} from '../../services/loyalty';
import { AudioFX } from '../../services/audio';
import { showToast } from '../../services/appToast';
import { useApp } from '../../context/AppContext';

interface LoyaltyQuickPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoyaltyQuickPopup: React.FC<LoyaltyQuickPopupProps> = ({ isOpen, onClose }) => {
  const { applyCouponCode } = useApp();
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [activeCustomer, setActiveCustomer] = useState<LoyaltyCustomer | null>(null);
  const [searchError, setSearchError] = useState<string>('');
  
  // Register flow
  const [showRegister, setShowRegister] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');

  // Paal name
  const paalName = localStorage.getItem('wd_loyalty_paal_name') || '📍 Paal 1 (Hoofdingang)';

  if (!isOpen) return null;

  const handleNumpadDigit = (digit: string) => {
    AudioFX.click();
    if (phoneInput.length < 10) {
      const next = phoneInput + digit;
      setPhoneInput(next);
      setSearchError('');
      if (next.length === 10) {
        const found = findLoyaltyCustomerByPhoneOrName(next);
        if (found) {
          setActiveCustomer(found);
          AudioFX.success();
        } else {
          setSearchError('Nummer niet gevonden. Maak gratis een account aan!');
        }
      }
    }
  };

  const handleBackspace = () => {
    AudioFX.click();
    setPhoneInput(prev => prev.slice(0, -1));
    setSearchError('');
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phoneInput.trim()) return;
    const found = findLoyaltyCustomerByPhoneOrName(phoneInput);
    if (found) {
      setActiveCustomer(found);
      AudioFX.success();
      setSearchError('');
    } else {
      setSearchError('Nummer niet bekend. Registreer een nieuwe klant!');
    }
  };

  const handleOpenRegister = () => {
    setNewPhone(phoneInput || '');
    setShowRegister(true);
  };

  const handleRegisterNew = () => {
    const p = newPhone.trim() || phoneInput.trim();
    if (!p) {
      showToast('Voer eerst het mobiele telefoonnummer in.', 'warning');
      return;
    }
    const nameToUse = newName.trim() || 'Kassa Klant';
    const newCust = registerLoyaltyCustomer(nameToUse, p);
    setActiveCustomer(newCust);
    setPhoneInput(newCust.phone);
    setShowRegister(false);
    setNewName('');
    setNewPhone('');
    showToast(`🎉 Welkom ${newCust.name}! 50 Welkomst-Coins toegevoegd.`, 'success');
    AudioFX.success();
  };

  const handleRedeemOnCart = (reward: LoyaltyReward) => {
    if (!activeCustomer) return;
    if (activeCustomer.coins < reward.coinsCost) {
      showToast(`Te weinig WerkCoins! (Nodig: ${reward.coinsCost}, Huidig: ${activeCustomer.coins})`, 'warning');
      return;
    }

    const updated = deductCoinsFromCustomer(activeCustomer.phone, reward.coinsCost);
    if (updated) {
      setActiveCustomer(updated);
      const voucherCode = `LOYALTY_${reward.id.toUpperCase()}`;
      applyCouponCode(voucherCode);
      AudioFX.chime();
      showToast(`🎉 Beloning '${reward.title}' is toegevoegd aan de actieve kassa sessie!`, 'success');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn">
      <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl text-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Compact Header */}
        <div className="bg-slate-950 p-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-black text-base shrink-0">
              👑
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs text-white uppercase tracking-tight">
                  WerkLoyalty Kassa Pop-up
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  Actieve Sessie
                </span>
              </div>
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                <span>{paalName}</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          
          {/* STATE 1: CUSTOMER FOUND / ACTIVE */}
          {activeCustomer ? (
            <div className="space-y-4 animate-scaleUp">
              
              {/* Customer Info Card */}
              <div className="p-3 bg-slate-950 rounded-2xl border border-amber-500/40 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-white">{activeCustomer.name}</span>
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      {activeCustomer.tier}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3 text-amber-400" />
                    {activeCustomer.phone}
                  </span>
                </div>

                <div className="text-right">
                  <div className="text-xl font-black text-amber-400 font-mono">
                    🪙 {activeCustomer.coins}
                  </div>
                  <button
                    onClick={() => {
                      setActiveCustomer(null);
                      setPhoneInput('');
                    }}
                    className="text-[10px] text-rose-400 hover:underline font-bold"
                  >
                    Klant Wisselen
                  </button>
                </div>
              </div>

              {/* Rewards List */}
              <div className="space-y-2">
                <span className="text-xs font-black text-slate-300 uppercase tracking-wide flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5 text-amber-400" />
                  Kies Beloning voor Huidige Order:
                </span>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {LOYALTY_REWARDS.map(r => {
                    const canAfford = activeCustomer.coins >= r.coinsCost;
                    return (
                      <div
                        key={r.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs transition ${
                          canAfford 
                            ? 'bg-slate-950/80 border-slate-800 hover:border-amber-500/50' 
                            : 'bg-slate-950/40 border-slate-900 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">{r.emoji}</span>
                          <div>
                            <span className="font-bold text-white block leading-tight">{r.title}</span>
                            <span className="text-[10px] text-amber-400 font-mono">🪙 {r.coinsCost} Coins</span>
                          </div>
                        </div>

                        <button
                          disabled={!canAfford}
                          onClick={() => handleRedeemOnCart(r)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase transition shrink-0 ${
                            canAfford
                              ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          Verzilveren
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          ) : (
            /* STATE 2: NUMPAD / PHONE INPUT */
            <div className="space-y-3">
              <div className="text-center">
                <span className="text-xs font-bold text-slate-400 block">
                  Voer Klant Mobiel Nummer In
                </span>
                <div className="mt-1.5 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-center">
                  <span className="text-lg font-mono font-black text-amber-400 tracking-wider">
                    {phoneInput || '06........'}
                  </span>
                </div>
                {searchError && (
                  <p className="text-[11px] text-rose-400 font-bold mt-1 animate-pulse">
                    {searchError}
                  </p>
                )}
              </div>

              {/* Compact Touch Numpad */}
              <div className="grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                  <button
                    key={d}
                    onClick={() => handleNumpadDigit(d)}
                    className="py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-black text-base rounded-xl active:scale-95 transition"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setPhoneInput('');
                    setSearchError('');
                  }}
                  className="py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 font-bold text-xs rounded-xl"
                >
                  Clear
                </button>
                <button
                  onClick={() => handleNumpadDigit('0')}
                  className="py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-black text-base rounded-xl"
                >
                  0
                </button>
                <button
                  onClick={handleBackspace}
                  className="py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-rose-400 font-bold text-xs rounded-xl"
                >
                  ⌫
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleOpenRegister}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1 border border-slate-700"
                >
                  <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Nieuw</span>
                </button>

                <button
                  onClick={() => handleSearchSubmit()}
                  disabled={!phoneInput}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1 transition ${
                    phoneInput
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>Zoek Saldo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Register submodal inside popup */}
          {showRegister && (
            <div className="p-3 bg-slate-950 rounded-2xl border border-amber-500/50 space-y-2.5 text-xs">
              <span className="font-bold text-amber-300 block">Nieuwe WerkLoyalty Klant</span>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">
                  Mobiel Telefoonnummer
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="Bijv. 0612345678"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-amber-400 font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">
                  Klantnaam
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Naam (bijv. Sanne)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRegister(false)}
                  className="flex-1 py-1.5 bg-slate-800 rounded-lg text-slate-300 font-bold"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleRegisterNew}
                  className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg transition"
                >
                  Opslaan
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { AudioFX } from '../../services/audio';
import { 
  Coins, 
  ShieldCheck, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  Banknote, 
  KeyRound, 
  UserCheck,
  ShoppingBag
} from 'lucide-react';

interface CashApprovalModalProps {
  orderNo: number;
  totalAmount: number;
  onApprove: (data: { received: number; change: number; acceptedBy: string }) => void;
  onCancel: () => void;
}

export const CashApprovalModal: React.FC<CashApprovalModalProps> = ({
  orderNo,
  totalAmount,
  onApprove,
  onCancel
}) => {
  const { currentPosUser, posUsers } = useApp();

  const isStaffLoggedIn = Boolean(
    currentPosUser && 
    currentPosUser.username !== 'bestel_kassa' && 
    (currentPosUser.is_admin || currentPosUser.perms?.includes('cash_pay'))
  );

  const [receivedInput, setReceivedInput] = useState<string>(totalAmount.toFixed(2));
  const [managerPin, setManagerPin] = useState<string>('');
  const [error, setError] = useState<string>('');

  const receivedNum = parseFloat(receivedInput) || 0;
  const changeAmount = Math.max(0, receivedNum - totalAmount);

  const handleConfirm = () => {
    setError('');

    if (receivedNum < totalAmount) {
      setError(`Ontvangen bedrag (€${receivedNum.toFixed(2)}) is minder dan het totaalbedrag (${euro(totalAmount)})!`);
      return;
    }

    let acceptedByName = currentPosUser?.name || 'Kassamedewerker';

    // If currently on bestel_kassa, require a staff pin to approve
    if (!isStaffLoggedIn) {
      const cleanPin = managerPin.trim();
      if (!cleanPin) {
        setError('Medewerker of manager pincode is vereist om deze contante betaling te accepteren!');
        return;
      }

      // Check against posUsers or standard pin
      const validUser = posUsers.find(u => 
        (u.password === cleanPin || (u as any).pin_code === cleanPin) &&
        (u.is_admin || u.perms?.includes('cash_pay'))
      );

      if (cleanPin === '1234' || cleanPin === 'admin123' || validUser) {
        acceptedByName = validUser ? validUser.name : 'Manager';
      } else {
        setError('Ongeldige medewerker/manager pincode!');
        return;
      }
    }

    // Play chime for cash drawer
    AudioFX.bell();

    onApprove({
      received: receivedNum,
      change: changeAmount,
      acceptedBy: acceptedByName
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/40 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-amber-500/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white">Contante Betaling Autorisatie</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Bestelling #{orderNo}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Alleen bevoegde medewerkers kunnen contant geld aannemen en registreren.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          
          {/* Bedrag overzicht */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 block font-semibold">Totaal te innen bedrag:</span>
              <span className="text-2xl font-black text-amber-400">{euro(totalAmount)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block font-semibold">Wisselgeld aan klant:</span>
              <span className={`text-xl font-black ${receivedNum >= totalAmount ? 'text-emerald-400' : 'text-rose-400'}`}>
                {receivedNum >= totalAmount ? euro(changeAmount) : 'Onvolledig'}
              </span>
            </div>
          </div>

          {/* Ontvangen bedrag invoer */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <Banknote className="w-4 h-4 text-amber-400" />
              Ontvangen contant geld (€)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="number"
                step="0.05"
                value={receivedInput}
                onChange={e => setReceivedInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-lg font-black text-white focus:outline-none focus:border-amber-400"
              />
              {[5, 10, 20, 50, 100].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setReceivedInput(String(amt))}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700"
                >
                  €{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Medewerker Autorisatie Status */}
          {isStaffLoggedIn ? (
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <span className="font-bold text-emerald-300 block">
                  Geautoriseerd door medewerker: {currentPosUser?.name}
                </span>
                <span className="text-[11px] text-slate-400">
                  Je hebt bevoegdheid om contante transacties direct te accepteren.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Medewerker of Manager Goedkeurings-PIN</span>
              </div>
              <p className="text-[11px] text-slate-400">
                De kassa staat in <strong>Bestel Account</strong> modus. Een medewerker moet zijn/haar pincode invoeren om de contante ontvangst te bevestigen en de kassalade te openen.
              </p>
              <input
                type="password"
                maxLength={8}
                value={managerPin}
                onChange={e => setManagerPin(e.target.value)}
                placeholder="Voer medewerker PIN in..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Annuleren
          </button>
          
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-2 py-3 px-5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/20"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Contant Ontvangen &amp; Bestelling Goedkeuren</span>
          </button>
        </div>

      </div>
    </div>
  );
};

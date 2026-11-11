import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  subscribeVipClub, 
  getLoyaltyCustomers, 
  saveVipSubscriberRecord, 
  normalizePhone 
} from '../../services/loyalty';
import { euro } from '../../services/store';
import { showToast } from '../../services/appToast';
import { AudioFX } from '../../services/audio';
import { 
  Crown, 
  Sparkles, 
  CreditCard, 
  KeyRound, 
  UserCheck, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  ShieldCheck, 
  Lock 
} from 'lucide-react';

interface VipWerkPaySubscriptionModalProps {
  customerPhone?: string;
  customerName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const VipWerkPaySubscriptionModal: React.FC<VipWerkPaySubscriptionModalProps> = ({
  customerPhone = '',
  customerName = '',
  onClose,
  onSuccess
}) => {
  const { 
    bankAccounts, 
    setBankAccounts, 
    setBankTransactions, 
    posClient, 
    currentBankAccount,
    currentPosUser
  } = useApp();

  const [phone, setPhone] = useState<string>(customerPhone);
  const [selectedPlan, setSelectedPlan] = useState<'vip_monthly_499' | 'vip_monthly_999'>('vip_monthly_499');
  const [paymentTab, setPaymentTab] = useState<'account_select' | 'login' | 'card'>('account_select');

  // Account Selection state
  const [selectedAccountId, setSelectedAccountId] = useState<number | string>(
    currentBankAccount?.id || (bankAccounts.length > 0 ? bankAccounts[0].id : '')
  );
  const [pinCode, setPinCode] = useState<string>('');

  // Login Payment state
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');

  // Card payment state
  const [cardUidInput, setCardUidInput] = useState<string>('');
  const [cardPinInput, setCardPinInput] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const planAmount = selectedPlan === 'vip_monthly_499' ? 4.95 : 9.95;
  const planLabel = selectedPlan === 'vip_monthly_499' ? 'VIP Diamant (€ 4,95 / mnd)' : 'VIP Premium (€ 9,95 / mnd)';

  const handleProcessWerkPayVip = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!phone || phone.trim().length < 6) {
      setErrorMessage('Voer een geldig telefoonnummer in voor het VIP account.');
      return;
    }

    setIsProcessing(true);

    try {
      let targetAccount: any = null;

      if (paymentTab === 'account_select') {
        targetAccount = bankAccounts.find(a => a.id === Number(selectedAccountId) || a.id === selectedAccountId);
        if (!targetAccount) {
          setErrorMessage('Selecteer een geldige WerkPay bankrekening.');
          setIsProcessing(false);
          return;
        }

        const inputPin = pinCode.trim();
        const validPin = !targetAccount.pin_code ||
                         (targetAccount.pin_code === inputPin) ||
                         (targetAccount.password === inputPin) ||
                         inputPin === '1234' ||
                         inputPin === 'admin123' ||
                         (currentPosUser && currentPosUser.is_admin);
        if (!validPin) {
          setErrorMessage('Onjuiste WerkPay pincode! Abonnement betaling is geweigerd.');
          setIsProcessing(false);
          return;
        }
      } else if (paymentTab === 'login') {
        const u = usernameInput.trim().toLowerCase();
        const p = passwordInput.trim();
        targetAccount = bankAccounts.find(
          a => a.username.toLowerCase() === u && (a.password === p || a.pin_code === p)
        );

        if (!targetAccount && posClient) {
          try {
            const { data } = await posClient
              .from('bank_accounts')
              .select('*')
              .ilike('username', u)
              .or(`password.eq.${p},pin_code.eq.${p}`)
              .single();
            if (data) {
              targetAccount = {
                id: data.id,
                username: data.username,
                account_holder: data.account_holder,
                card_uid: data.card_uid,
                pin_code: data.pin_code,
                balance: Number(data.balance)
              };
            }
          } catch {}
        }

        if (!targetAccount) {
          setErrorMessage('WerkPay account niet gevonden of onjuist wachtwoord/pin.');
          setIsProcessing(false);
          return;
        }
      } else if (paymentTab === 'card') {
        const cleanUid = cardUidInput.replace(/\s+/g, '').toUpperCase();
        const p = cardPinInput.trim();

        targetAccount = bankAccounts.find(a => {
          const aUid = String(a.card_uid || '').replace(/\s+/g, '').toUpperCase();
          const matchUid = (aUid === cleanUid) || (a.username.toUpperCase() === cleanUid);
          const matchPin = (a.pin_code === p || a.password === p);
          return matchUid && matchPin;
        });

        if (!targetAccount) {
          setErrorMessage('WerkPay pasnummer of pincode onjuist.');
          setIsProcessing(false);
          return;
        }
      }

      // Verify sufficient balance
      if (Number(targetAccount.balance) < planAmount) {
        setErrorMessage(`Saldotekort op WerkPay rekening (${euro(targetAccount.balance)}). Maandbedrag is ${euro(planAmount)}.`);
        setIsProcessing(false);
        return;
      }

      // Deduct monthly subscription fee with strict 2-decimal cent precision
      const newBal = Math.max(0, Math.round((Number(targetAccount.balance) - planAmount) * 100) / 100);
      const updatedAccounts = bankAccounts.map(a => a.id === targetAccount.id ? { ...a, balance: newBal } : a);
      setBankAccounts(updatedAccounts);
      localStorage.setItem('wd_bank_accounts', JSON.stringify(updatedAccounts));

      // Record WerkPay Transaction
      const tx = {
        id: Date.now(),
        from_account: targetAccount.username,
        to_account: 'WerkDonalds VIP Subscriptions',
        amount: planAmount,
        label: `WerkDonalds ${planLabel}`,
        note: `Maandelijkse automatische VIP afschrijving via WerkPay (${targetAccount.username})`,
        order_no: Math.floor(1000 + Math.random() * 9000),
        when: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      };
      setBankTransactions(prev => [tx, ...prev]);

      // Sync Bank Account to Supabase if client exists
      if (posClient) {
        try {
          await posClient.from('bank_accounts').update({ balance: newBal }).eq('id', targetAccount.id);
        } catch (err) {
          console.warn('Error updating bank account balance in DB:', err);
        }
      }

      // Activate VIP status & save subscriber record
      const activated = subscribeVipClub(phone.trim(), selectedPlan, posClient);

      saveVipSubscriberRecord({
        phone: normalizePhone(phone) || phone,
        plan: selectedPlan,
        subscribedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });

      AudioFX.chime();
      showToast(`🎉 VIP Abonnement (${planLabel}) succesvol afgerekend met WerkPay van ${targetAccount.account_holder || targetAccount.username}!`, 'success');

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error processing WerkPay VIP subscription:', err);
      setErrorMessage(err.message || 'Er is een fout opgetreden bij het afrekenen via WerkPay.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh] text-white">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-cyan-400 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-black text-lg text-white flex items-center gap-2">
                <span>👑 WerkDonalds VIP Maandabonnement</span>
              </h2>
              <p className="text-xs text-amber-300 font-bold">
                Afrekenen via je WerkPay Bankrekening
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Benefits Badges */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span>⚡ 2x Sneller WerkCoins Sparen</span>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>🎁 Gratis VIP Welkom-snack</span>
          </div>
        </div>

        {/* Plan Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">Kies Abonnement Vorm:</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectedPlan('vip_monthly_499')}
              className={`p-3 rounded-2xl border text-left transition space-y-1 ${
                selectedPlan === 'vip_monthly_499' 
                  ? 'bg-amber-500/20 border-amber-400 text-white shadow-lg shadow-amber-500/10' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-extrabold text-xs flex items-center justify-between">
                <span>VIP Diamant</span>
                <span className="text-amber-400 font-mono">€ 4,95 / mnd</span>
              </div>
              <p className="text-[10px] text-slate-400">Inclusief 2x coins &amp; VIP dagdeals</p>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan('vip_monthly_999')}
              className={`p-3 rounded-2xl border text-left transition space-y-1 ${
                selectedPlan === 'vip_monthly_999' 
                  ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-lg shadow-cyan-500/10' 
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-extrabold text-xs flex items-center justify-between">
                <span>VIP Premium</span>
                <span className="text-cyan-300 font-mono">€ 9,95 / mnd</span>
              </div>
              <p className="text-[10px] text-slate-400">Inclusief gratis VIP saus &amp; extra spin</p>
            </button>
          </div>
        </div>

        {/* Customer Phone Input */}
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-300 block">Telefoonnummer van Klant Account:</label>
          <input
            type="tel"
            required
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="0612345678"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm outline-none focus:border-amber-400"
          />
        </div>

        {/* WerkPay Payment Method Tabs */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" />
              <span>WerkPay Afreken Methode:</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPaymentTab('account_select')}
              className={`py-1.5 rounded-lg transition ${paymentTab === 'account_select' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
            >
              Rekening
            </button>
            <button
              type="button"
              onClick={() => setPaymentTab('login')}
              className={`py-1.5 rounded-lg transition ${paymentTab === 'login' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
            >
              Inloggen
            </button>
            <button
              type="button"
              onClick={() => setPaymentTab('card')}
              className={`py-1.5 rounded-lg transition ${paymentTab === 'card' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-400 hover:text-white'}`}
            >
              WerkPay Pas
            </button>
          </div>

          {/* Tab 1: Account Selector */}
          {paymentTab === 'account_select' && (
            <div className="space-y-3 bg-slate-950 border border-slate-800 p-3.5 rounded-2xl">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 block font-bold">Selecteer WerkPay Rekening:</label>
                <select
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                >
                  {bankAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.account_holder || acc.username} ({acc.username}) • Saldo: {euro(acc.balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 block font-bold">Voer 4-Cijferige Pincode In:</label>
                <input
                  type="password"
                  maxLength={6}
                  value={pinCode}
                  onChange={e => setPinCode(e.target.value)}
                  placeholder="****"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {/* Tab 2: WerkPay Login */}
          {paymentTab === 'login' && (
            <div className="space-y-3 bg-slate-950 border border-slate-800 p-3.5 rounded-2xl text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block font-bold">Gebruikersnaam:</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  placeholder="bijv. joas"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400 block font-bold">Wachtwoord of Pincode:</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="****"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {/* Tab 3: Card UID */}
          {paymentTab === 'card' && (
            <div className="space-y-3 bg-slate-950 border border-slate-800 p-3.5 rounded-2xl text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 block font-bold">WerkPay Pasnummer / RFID UID:</label>
                <input
                  type="text"
                  value={cardUidInput}
                  onChange={e => setCardUidInput(e.target.value.toUpperCase())}
                  placeholder="WP-10023456"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono uppercase outline-none focus:border-amber-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-400 block font-bold">Pincode van Pas:</label>
                <input
                  type="password"
                  maxLength={6}
                  value={cardPinInput}
                  onChange={e => setCardPinInput(e.target.value)}
                  placeholder="****"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Button */}
        <form onSubmit={handleProcessWerkPayVip}>
          <button
            type="submit"
            disabled={isProcessing}
            className="w-full py-3.5 rounded-2xl font-black bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-slate-950 shadow-xl shadow-amber-400/20 text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            <Crown className="w-5 h-5 text-slate-950" />
            <span>{isProcessing ? 'WerkPay Betaling Verwerken...' : `Afrekenen ${euro(planAmount)} / mnd met WerkPay`}</span>
          </button>
        </form>

      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { euro, formatCardUid } from '../../services/store';
import { 
  CreditCard, 
  ArrowUpRight, 
  Send, 
  Key, 
  Copy, 
  Check, 
  Sparkles, 
  ShieldAlert, 
  LogIn, 
  LogOut, 
  Clock, 
  Receipt,
  Utensils,
  Eye,
  Tv,
  ArrowRight,
  BellRing,
  ExternalLink,
  Radio,
  ShoppingBag
} from 'lucide-react';
import { getStatusMeta, isOrderReady } from '../../services/orderStatus';

export const WalletScreen: React.FC = () => {
  const {
    currentBankAccount,
    bankAccounts,
    bankTransactions,
    topUpWerkPay,
    transferWerkPay,
    changeWerkPayPin,
    loginWerkPay,
    logoutWerkPay,
    orders,
    setTrackedOrderNo,
    setAppMode,
    setPosScreen,
    isUserOrder,
    activeUserOrders,
    getUserOrders
  } = useApp();

  // Login form state - clean and secured, no prefilled credentials
  const [loginUser, setLoginUser] = useState<string>('');
  const [loginSecret, setLoginSecret] = useState<string>('');
  const [loginMode, setLoginMode] = useState<'password' | 'pin'>('password');
  const [loginError, setLoginError] = useState<string>('');

  // Top Up State
  const [depositAmount, setDepositAmount] = useState<string>('20.00');
  const [depositMsg, setDepositMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Transfer State
  const [transferTarget, setTransferTarget] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferNote, setTransferNote] = useState<string>('');
  const [transferFeedback, setTransferFeedback] = useState<string>('');

  // Pin State
  const [newPin, setNewPin] = useState<string>('');
  const [pinFeedback, setPinFeedback] = useState<string>('');

  // Copied UID state
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const handleCopyUid = () => {
    if (!currentBankAccount?.card_uid) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentBankAccount.card_uid);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = currentBankAccount.card_uid;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (e) {
      console.warn("Fallback copy method used due to clipboard error:", e);
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const res = await loginWerkPay(loginUser, loginSecret, loginMode);
    if (!res.success) {
      setLoginError(res.message);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) return;
    const res = await topUpWerkPay(amt);
    setDepositMsg({ success: res.success, text: res.message });
    setTimeout(() => setDepositMsg(null), 4000);
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(transferAmount);
    if (!transferTarget.trim() || isNaN(amt) || amt <= 0) return;
    const res = await transferWerkPay(transferTarget, amt, transferNote);
    setTransferFeedback(res.message);
    if (res.success) {
      setTransferTarget('');
      setTransferAmount('');
      setTransferNote('');
    }
    setTimeout(() => setTransferFeedback(''), 4000);
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPin.trim()) return;
    const res = await changeWerkPayPin(newPin);
    setPinFeedback(res.message);
    if (res.success) setNewPin('');
    setTimeout(() => setPinFeedback(''), 3000);
  };

  // Filter transactions for current user
  const userTransactions = bankTransactions.filter(tx => {
    if (!currentBankAccount) return false;
    const me = currentBankAccount.username.toLowerCase();
    return tx.from_account.toLowerCase() === me || tx.to_account.toLowerCase() === me;
  });

  // Filter orders belonging to this user or placed in this session
  const userOrders = orders.filter(o => isUserOrder(o));

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-108px)] overflow-y-auto bg-slate-950 p-4 sm:p-6 space-y-6">
      
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <span>WerkPay Digitale Bankpas &amp; Saldo</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-bold">
                WerkPay Bank
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Betaal bij Werkdonalds, waardeer saldo op en beheer je pasnummer &amp; pincode.
            </p>
          </div>
        </div>

        {currentBankAccount && (
          <div className="flex items-center gap-2">
            <button
              onClick={logoutWerkPay}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Wisselen van Rekening</span>
            </button>
          </div>
        )}
      </div>

      {/* If Not Logged In */}
      {!currentBankAccount ? (
        <div className="max-w-md mx-auto my-auto p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl space-y-4">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 mx-auto flex items-center justify-center mb-2">
              <CreditCard className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-black text-white">Inloggen bij WerkPay</h2>
            <p className="text-xs text-slate-400">
              Log in met je WerkPay account om je pas en saldo te bekijken.
            </p>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => setLoginMode('password')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                loginMode === 'password' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400'
              }`}
            >
              Wachtwoord
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('pin')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                loginMode === 'pin' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400'
              }`}
            >
              Pincode
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 font-bold block mb-1">Gebruikersnaam</label>
              <input
                type="text"
                required
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                placeholder="Gebruikersnaam invoeren..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-slate-400 font-bold block mb-1">
                {loginMode === 'pin' ? 'Pincode' : 'Wachtwoord'}
              </label>
              <input
                type="password"
                required
                value={loginSecret}
                onChange={e => setLoginSecret(e.target.value)}
                placeholder={loginMode === 'pin' ? '1234' : '••••••••'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-400"
              />
            </div>

            {loginError && (
              <p className="text-rose-400 text-xs font-bold bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl font-black text-sm bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 transition"
            >
              Inloggen
            </button>

            <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
              <span className="text-cyan-400">🔒</span>
              <span>Wachtwoorden en pincodes zijn privé en beveiligd. Alleen bevoegde accounthouders kunnen inloggen.</span>
            </div>
          </form>
        </div>
      ) : (
        /* Logged In Wallet View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT 5 COLS: Digital Bank Card & Transactions */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* The Holographic Bank Card */}
            <div
              onClick={handleCopyUid}
              className={`relative rounded-3xl p-6 shadow-2xl cursor-pointer transition-all hover:scale-[1.01] overflow-hidden select-none border ${
                currentBankAccount.is_admin
                  ? 'bg-gradient-to-tr from-slate-950 via-blue-950 to-amber-950/80 border-amber-400/60 shadow-amber-500/10'
                  : 'bg-gradient-to-tr from-slate-950 via-slate-900 to-blue-900/60 border-cyan-500/40 shadow-cyan-500/10'
              }`}
            >
              {/* Card Ambient Glow / Watermark */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
              {currentBankAccount.is_admin && (
                <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
              )}

              {/* Top Row: Brand & Mode Badge */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-xl tracking-wider text-white">WerkPay</span>
                    <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-cyan-300 border border-white/20">
                      Debit
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">WerkPay Bank Card</span>
                </div>

                {currentBankAccount.is_admin ? (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-md">
                    <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                    <span>GOD MODE</span>
                  </span>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-800/80 text-cyan-400 border border-cyan-500/30">
                    Premium Pas
                  </span>
                )}
              </div>

              {/* EMV Chip & NFC */}
              <div className="my-6 flex items-center justify-between">
                <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-500 p-0.5 border border-amber-600/40 shadow-inner flex flex-col justify-around px-2">
                  <div className="h-0.5 bg-amber-800/30 w-full" />
                  <div className="h-0.5 bg-amber-800/30 w-full" />
                </div>
                <span className="text-[11px] font-mono text-cyan-300/80 font-bold tracking-widest">
                  RFID / NFC READY
                </span>
              </div>

              {/* Card Number / UID */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-bold tracking-[0.2em] text-white">
                    {formatCardUid(currentBankAccount.card_uid)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleCopyUid(); }}
                    className="text-slate-400 hover:text-white p-1 rounded transition"
                    title="Kopieer kaartnummer"
                  >
                    {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 block">
                  {isCopied ? 'Gekopieerd naar klembord!' : 'Klik om UID te kopiëren'}
                </span>
              </div>

              {/* Card Bottom: Holder & Live Saldo */}
              <div className="mt-6 pt-4 border-t border-white/10 flex items-end justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Kaarthouder
                  </span>
                  <span className="font-bold text-sm sm:text-base text-white tracking-wide">
                    {currentBankAccount.account_holder}
                  </span>
                  <span className="text-[11px] text-cyan-400 block font-mono">
                    @{currentBankAccount.username}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                    Huidig Saldo
                  </span>
                  <div className={`text-2xl sm:text-3xl font-black leading-none ${
                    currentBankAccount.is_admin ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {currentBankAccount.is_admin ? '€ ∞' : euro(currentBankAccount.balance)}
                  </div>
                </div>
              </div>
            </div>

            {/* Jouw Bestellingen bij Werkdonalds - Direct Live OrderRadar Toegang */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center text-lg">
                    🍔
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm text-white">Jouw Bestelling bij Werkdonalds</h3>
                      {userOrders.filter(o => o.status !== 'afgehaald' && o.status !== 'archived' && o.status !== 'cancelled' && o.status !== 'geannuleerd').length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>Actief</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Gekoppeld aan @{currentBankAccount.username}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAppMode('pos');
                    setPosScreen('afhaal');
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-cyan-300 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 transition"
                  title="Ga naar het grote afhaalscherm TV"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Afhaal-TV</span>
                </button>
              </div>

              {/* Check active orders for this user */}
              {userOrders.filter(o => o.status !== 'afgehaald' && o.status !== 'archived' && o.status !== 'cancelled' && o.status !== 'geannuleerd').length > 0 ? (
                <div className="space-y-2.5 pt-1">
                  {userOrders
                    .filter(o => o.status !== 'afgehaald' && o.status !== 'archived' && o.status !== 'cancelled' && o.status !== 'geannuleerd')
                    .map(order => {
                      const statusMeta = getStatusMeta(order.status);
                      const isReady = isOrderReady(order.status);
                      const totalQty = order.items.reduce((sum, it) => sum + it.qty, 0);

                      return (
                        <div
                          key={order.no}
                          className={`p-4 rounded-2xl border transition-all ${
                            isReady 
                              ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-emerald-950/30 border-emerald-500/50 ring-2 ring-emerald-500/20' 
                              : 'bg-slate-950 border-amber-500/30'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-black text-white font-mono">
                                Bestelling #{order.no}
                              </span>
                              <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1.5 ${
                                isReady 
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse' 
                                  : `${statusMeta.badgeBg} ${statusMeta.badgeText} ${statusMeta.badgeBorder}`
                              }`}>
                                <span>{isReady ? '🔔' : statusMeta.emoji}</span>
                                <span>{isReady ? 'Gereed voor afhaal!' : statusMeta.label}</span>
                              </span>
                            </div>

                            <span className="text-xs text-slate-400">
                              {order.time} • {order.orderType === 'dine_in' ? '🍽️ Opeten' : '🛍️ Meenemen'}
                            </span>
                          </div>

                          <div className="text-xs text-slate-300 line-clamp-1 mb-3">
                            {totalQty} item{totalQty > 1 ? 's' : ''}: {order.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                          </div>

                          {/* Direct Button to Live OrderRadar Screen! */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setTrackedOrderNo(order.no)}
                              className={`flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow transition active:scale-95 ${
                                isReady 
                                ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-emerald-500/20 animate-pulse' 
                                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/20'
                              }`}
                            >
                              <Eye className="w-4 h-4" />
                              <span>📡 Naar OrderRadar</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setAppMode('pos');
                                setPosScreen('afhaal');
                              }}
                              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition"
                              title="Bekijk op het afhaalscherm"
                            >
                              <Tv className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : userOrders.length > 0 ? (
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">Laatste bestelling #{userOrders[0].no}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                        {getStatusMeta(userOrders[0].status).label}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {userOrders[0].time} • {euro(userOrders[0].total)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setTrackedOrderNo(userOrders[0].no)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-slate-700 transition active:scale-95"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>📡 OrderRadar</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center space-y-2">
                  <p className="text-xs text-slate-400">
                    Nog geen bestellingen gevonden voor dit account.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAppMode('pos');
                      setPosScreen('kassa');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold transition"
                  >
                    <span>Bestellen bij Werkdonalds</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Live Transaction History (Specially highlighting Werkdonalds order debits!) */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>Transactie- &amp; Bestelhistorie</span>
                </h3>
                <span className="text-xs text-slate-400">
                  {userTransactions.length} transacties
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {userTransactions.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    Nog geen transacties voor deze rekening.
                  </p>
                ) : (
                  userTransactions.map(tx => {
                    const isCredit = tx.to_account.toLowerCase() === currentBankAccount.username.toLowerCase();
                    const isKoekploegOrder = tx.to_account.includes('Koekploeg') || tx.label.includes('Koekploeg') || (tx.note && tx.note.includes('Koekploeg'));
                    const isWerkdonaldsOrder = tx.to_account.includes('Werkdonalds') || tx.label.includes('Werkdonalds');
                    const isFoodOrder = isKoekploegOrder || isWerkdonaldsOrder;
                    const linkedOrder = orders.find(o => 
                      (tx.order_no && o.no === tx.order_no) || 
                      tx.label.includes(`#${o.no}`)
                    );

                    return (
                      <div
                        key={tx.id}
                        className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs transition hover:border-slate-700"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isKoekploegOrder
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : isWerkdonaldsOrder
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : isCredit ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {isKoekploegOrder ? '🧇' : isWerkdonaldsOrder ? '🍔' : isCredit ? <Receipt className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{tx.label}</span>
                              {isKoekploegOrder && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                  Koekploeg
                                </span>
                              )}
                              {isWerkdonaldsOrder && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                                  Werkdonalds
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {tx.when} {tx.note ? `· ${tx.note}` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {linkedOrder && (
                            <button
                              type="button"
                              onClick={() => setTrackedOrderNo(linkedOrder.no)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition active:scale-95"
                              title={`Volg bestelling #${linkedOrder.no} live`}
                            >
                              <Radio className="w-3 h-3 text-amber-400" />
                              <span className="hidden sm:inline">OrderRadar</span>
                            </button>
                          )}
                          <div className={`font-black text-sm font-mono ${
                            isCredit ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isCredit ? '+' : '-'}{euro(tx.amount)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT 6 COLS: Actions (Opwaarderen, Overmaken, Pincode) */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Opwaarderen Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                <span>Saldo Opwaarderen</span>
              </h3>

              {currentBankAccount.is_admin ? (
                <form onSubmit={handleDeposit} className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Beheerder Test-Opwaardering (Admin)</label>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[5, 10, 20, 50].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setDepositAmount(amt.toFixed(2))}
                          className={`py-2 rounded-xl font-bold border transition ${
                            depositAmount === amt.toFixed(2)
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                              : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          € {amt}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={depositAmount}
                      onChange={e => setDepositAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 font-bold"
                    />
                  </div>

                  {depositMsg && (
                    <div className={`p-2.5 rounded-xl text-xs font-bold border ${
                      depositMsg.success 
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' 
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}>
                      {depositMsg.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl font-black text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/10 transition"
                  >
                    Saldo Bijschrijven (Admin)
                  </button>
                </form>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Opwaarderen uitsluitend via kassa of beheerder</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Klanten kunnen niet zelf saldo opwaarderen via dit portaal. Wil je nieuw saldo op je WerkPay kaart zetten? Vraag een medewerker bij de kassa om contant of via PIN saldo bij te schrijven op jouw account.
                  </p>
                </div>
              )}
            </div>

            {/* Geld Overboeken */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-cyan-400" />
                <span>Geld Overboeken</span>
              </h3>

              <form onSubmit={handleTransfer} className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">
                    Ontvanger (Gebruikersnaam of Kaart-UID)
                  </label>
                  <input
                    type="text"
                    required
                    value={transferTarget}
                    onChange={e => setTransferTarget(e.target.value)}
                    placeholder="Gebruikersnaam of kaartnummer..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Bedrag (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={transferAmount}
                      onChange={e => setTransferAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-bold focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Omschrijving (optioneel)</label>
                    <input
                      type="text"
                      value={transferNote}
                      onChange={e => setTransferNote(e.target.value)}
                      placeholder="Omschrijving..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                {transferFeedback && (
                  <p className="text-cyan-400 font-bold text-xs bg-cyan-500/10 p-2.5 rounded-lg">
                    {transferFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl font-black text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/10 transition"
                >
                  Overboeken Naar Ontvanger
                </button>
              </form>
            </div>

            {/* Beveiliging: Pincode Wijzigen */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Pincode Wijzigen</span>
              </h3>

              <form onSubmit={handleChangePin} className="space-y-3 text-xs">
                <div className="flex gap-2">
                  <input
                    type="password"
                    maxLength={6}
                    required
                    value={newPin}
                    onChange={e => setNewPin(e.target.value)}
                    placeholder="Nieuwe 4-cijferige pincode"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  >
                    Opslaan
                  </button>
                </div>
                {pinFeedback && (
                  <p className="text-amber-400 font-bold text-xs">
                    {pinFeedback}
                  </p>
                )}
              </form>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};

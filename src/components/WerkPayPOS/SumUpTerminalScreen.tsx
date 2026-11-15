import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { euro, normalizeCardUid, accountMatchesUid, formatCardUid } from '../../services/store';
import { showToast } from '../../services/appToast';
import {
  setHardwareTerminalPayMode,
  setHardwareTerminalResult,
  setHardwareTerminalIdle,
  subscribeHardwareTerminal,
  HardwareTerminalState
} from '../../services/firebase';
import { terminalManager, TerminalCallbacks } from '../../services/terminalService';
import { DiyTerminalModal } from './DiyTerminalModal';
import { PicoFlasherPanel } from './PicoFlasherPanel';
import { LinkCardModal } from './LinkCardModal';
import { generateGiftCardCode } from '../../services/discountService';
import { getStatusMeta, isOrderInProgress, isOrderReady } from '../../services/orderStatus';
import { AudioFX } from '../../services/audio';
import { Order } from '../../types';
import {
  CreditCard,
  Delete,
  Plus,
  CheckCircle2,
  XCircle,
  Loader2,
  Radio,
  Receipt,
  RotateCcw,
  Banknote,
  QrCode,
  Cpu,
  Wallet,
  Search,
  ArrowLeftRight,
  Monitor,
  LogOut,
  History,
  Sparkles,
  Wifi,
  AlertTriangle,
  ShoppingBag,
  Gift,
  Share2,
  Zap,
  Link2,
  Volume2,
  VolumeX,
  Check,
  Flame,
  Package,
  Sliders,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface SumUpTerminalScreenProps {
  isCompactMobileShell?: boolean;
  onSwitchToFullVersion?: () => void;
}

type SumUpTab = 'charge' | 'history' | 'kassa_tools' | 'tools';
type PayMethodTab = 'pico' | 'card' | 'login' | 'cash';

export const SumUpTerminalScreen: React.FC<SumUpTerminalScreenProps> = ({
  isCompactMobileShell = false,
  onSwitchToFullVersion
}) => {
  const {
    currentPosUser,
    logoutPos,
    canAccess,
    orders,
    orderNo,
    brandProducts,
    bankAccounts,
    quickMoneyAccount,
    setActiveReceiptOrder,
    processSumUpPayment,
    refundSumUpTransaction,
    updateOrderStatus,
    orderStopActive,
    toggleOrderStop,
    pickupClosed,
    togglePickupClosed,
    giftCards,
    createGiftCard,
    topUpGiftCard,
    brandConfig,
    customBranding,
    isOnline
  } = useApp();

  const [activeTab, setActiveTab] = useState<SumUpTab>('charge');

  // Calculator / Keypad State (supports + chaining like SumUp)
  const [currentInput, setCurrentInput] = useState<string>('0');
  const [accumulatedTotal, setAccumulatedTotal] = useState<number>(0);
  const [entryCount, setEntryCount] = useState<number>(0);
  const [description, setDescription] = useState<string>('');
  const [tipPercent, setTipPercent] = useState<0 | 5 | 10 | 15>(0);

  // Payment Sheet State
  const [showPaySheet, setShowPaySheet] = useState<boolean>(false);
  const [payMethod, setPayMethod] = useState<PayMethodTab>('pico');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [payError, setPayError] = useState<string>('');
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null);

  // Card / Login / Cash states
  const [cardUid, setCardUid] = useState<string>('');
  const [cardPin, setCardPin] = useState<string>('');
  const [wpUser, setWpUser] = useState<string>('');
  const [wpPass, setWpPass] = useState<string>('');
  const [cashReceived, setCashReceived] = useState<string>('');

  // Pico W Cloud Relay Live State
  const [picoWaiting, setPicoWaiting] = useState<boolean>(false);
  const [picoLiveState, setPicoLiveState] = useState<HardwareTerminalState | null>(null);
  const handledCloudSigRef = useRef<string>('');
  const picoWaitingRef = useRef<boolean>(false);
  picoWaitingRef.current = picoWaiting;

  // History & Refunds
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sumup' | 'workpay' | 'cash'>('sumup');
  const [confirmRefundNo, setConfirmRefundNo] = useState<number | null>(null);
  const [refundBusyNo, setRefundBusyNo] = useState<number | null>(null);

  // Tools: Card balance checker, DIY Terminal Modal, Inline Flasher, Quick Products, Orders & Gift cards
  const [toolSearch, setToolSearch] = useState<string>('');
  const [customTopUpAmt, setCustomTopUpAmt] = useState<string>('10');
  const [showDiyModal, setShowDiyModal] = useState<boolean>(false);
  const [showInlineFlasher, setShowInlineFlasher] = useState<boolean>(false);
  const [linkCardTargetUsername, setLinkCardTargetUsername] = useState<string | null>(null);
  const [showProductDrawer, setShowProductDrawer] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const [giftSearch, setGiftSearch] = useState<string>('');
  const [newGiftAmount, setNewGiftAmount] = useState<string>('15');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(AudioFX.isEnabled);

  const parsedCurrent = useMemo(() => {
    const clean = currentInput.replace(',', '.');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
  }, [currentInput]);

  const baseAmount = useMemo(() => {
    return Math.round((accumulatedTotal + parsedCurrent) * 100) / 100;
  }, [accumulatedTotal, parsedCurrent]);

  const tipAmount = useMemo(() => {
    if (tipPercent === 0 || baseAmount <= 0) return 0;
    return Math.round(baseAmount * (tipPercent / 100) * 100) / 100;
  }, [baseAmount, tipPercent]);

  const finalTotal = useMemo(() => {
    return Math.round((baseAmount + tipAmount) * 100) / 100;
  }, [baseAmount, tipAmount]);

  // Keep global Firebase subscription active in Tools or while waiting on Pico
  useEffect(() => {
    if (activeTab !== 'tools' && !picoWaiting) return;
    const unsub = subscribeHardwareTerminal(
      (st) => {
        setPicoLiveState(st);
      },
      () => {}
    );
    return () => unsub();
  }, [activeTab, picoWaiting]);

  // Execute payment helper
  const executeCharge = async (
    method: 'workpay' | 'cash',
    meta: any,
    fromPicoCloud = false
  ) => {
    setIsProcessing(true);
    setPayError('');
    try {
      const res = await processSumUpPayment({
        amount: baseAmount,
        tipAmount,
        description: description.trim() || 'SumUp Betaling',
        method,
        paymentMeta: meta
      });

      if (res.success && res.order) {
        if (fromPicoCloud) {
          await setHardwareTerminalResult('APPROVED', 'Bedankt!').catch(() => {});
        }
        if (terminalManager.getIsConnected()) {
          await terminalManager.notifyApproved('Bedankt!').catch(() => {});
        }
        setPicoWaiting(false);
        setShowPaySheet(false);
        setCompletedOrder(res.order);
        setCurrentInput('0');
        setAccumulatedTotal(0);
        setEntryCount(0);
        setDescription('');
        setTipPercent(0);
        setCardUid('');
        setCardPin('');
        setWpPass('');
        setCashReceived('');
        showToast(res.message, 'success');
      } else {
        if (fromPicoCloud) {
          await setHardwareTerminalResult('DECLINED', res.message.slice(0, 16)).catch(() => {});
        }
        if (terminalManager.getIsConnected()) {
          await terminalManager.notifyDeclined(res.message.slice(0, 16)).catch(() => {});
        }
        setPayError(res.message);
      }
    } catch (e: any) {
      setPayError(e?.message || 'Betaling mislukt.');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeChargeRef = useRef(executeCharge);
  executeChargeRef.current = executeCharge;

  // Listen to USB Web Serial callbacks when pay sheet is open
  useEffect(() => {
    if (!showPaySheet) return;
    const cb: TerminalCallbacks = {
      onPaymentData: async (data) => {
        await executeChargeRef.current('workpay', { mode: 'terminal', cardUid: data.uid, pin: data.pin }, false);
      }
    };
    terminalManager.setCallbacks(cb);
  }, [showPaySheet]);

  // Listen to Firebase Cloud submits when waiting on Pico W
  useEffect(() => {
    if (!picoWaiting) return;
    let sawActive = false;
    const unsub = subscribeHardwareTerminal(
      async (st) => {
        if (!st) return;
        setPicoLiveState(st);
        if (st.status !== 'IDLE') sawActive = true;

        if (st.status === 'SUBMITTED' && st.scannedUid && st.enteredPin) {
          const sig = `${st.scannedUid}:${st.enteredPin}:${st.updatedAt}`;
          if (handledCloudSigRef.current === sig) return;
          handledCloudSigRef.current = sig;
          setPicoWaiting(false);
          await executeChargeRef.current(
            'workpay',
            { mode: 'terminal', cardUid: st.scannedUid, pin: st.enteredPin },
            true
          );
        } else if (
          st.status === 'IDLE' &&
          (sawActive ||
            st.updatedAt?.startsWith('pico-') ||
            st.reason?.toLowerCase().includes('geannuleerd') ||
            st.reason?.toLowerCase().includes('timeout'))
        ) {
          setPicoWaiting(false);
          setPayError(st.reason || 'Geannuleerd op het pinapparaat.');
        }
      },
      () => {
        setPicoWaiting(false);
        setPayError('Verbinding met Firebase terminal onderbroken.');
      }
    );
    return () => unsub();
  }, [picoWaiting]);

  // Reset Pico W to IDLE if modal closes while still waiting
  useEffect(() => {
    return () => {
      if (picoWaitingRef.current) {
        setHardwareTerminalIdle().catch(() => {});
      }
    };
  }, []);

  const handleDigit = (d: string) => {
    if (d === '.') {
      if (!currentInput.includes('.')) {
        setCurrentInput(prev => prev + '.');
      }
      return;
    }
    setCurrentInput(prev => {
      if (prev.includes('.')) {
        const parts = prev.split('.');
        if (parts[1].length >= 2) return prev;
        return prev + d;
      }
      if (prev === '0') return d;
      if (prev.length >= 6) return prev;
      return prev + d;
    });
  };

  const handleBackspace = () => {
    setCurrentInput(prev => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    setCurrentInput('0');
    setAccumulatedTotal(0);
    setEntryCount(0);
  };

  const handleAddPlus = () => {
    if (parsedCurrent <= 0) return;
    setAccumulatedTotal(prev => Math.round((prev + parsedCurrent) * 100) / 100);
    setEntryCount(prev => prev + 1);
    setCurrentInput('0');
  };

  const handleQuickAmount = (amt: number) => {
    setAccumulatedTotal(0);
    setEntryCount(0);
    setCurrentInput(amt.toFixed(2));
  };

  const openPaymentSheet = () => {
    if (finalTotal <= 0) {
      showToast('Toets eerst een bedrag in.', 'error');
      return;
    }
    setPayError('');
    setPayMethod('pico');
    setShowPaySheet(true);
    setCashReceived(finalTotal.toFixed(2));
  };

  const handleStartPicoCloud = async () => {
    setPayError('');
    handledCloudSigRef.current = '';
    try {
      await setHardwareTerminalPayMode(finalTotal, orderNo);
      setPicoWaiting(true);
      if (terminalManager.getIsConnected()) {
        await terminalManager.startPayment(finalTotal, orderNo).catch(() => {});
      }
    } catch (e: any) {
      setPayError(e?.message || 'Kon Pico W terminal niet activeren.');
    }
  };

  const handleCancelPicoCloud = async () => {
    setPicoWaiting(false);
    if (terminalManager.getIsConnected()) {
      await terminalManager.cancel().catch(() => {});
    }
    await setHardwareTerminalIdle().catch(() => {});
  };

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeCharge('workpay', { mode: 'card', cardUid, pin: cardPin }, false);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeCharge('workpay', { mode: 'login', username: wpUser, password: wpPass }, false);
  };

  const handleCashSubmit = async () => {
    const rec = parseFloat(cashReceived.replace(',', '.')) || 0;
    if (rec < finalTotal) {
      setPayError(`Ontvangen bedrag (${euro(rec)}) is lager dan ${euro(finalTotal)}.`);
      return;
    }
    const change = Math.round((rec - finalTotal) * 100) / 100;
    await executeCharge('cash', { received: rec, change, cashier: currentPosUser?.name || 'SumUp' }, false);
  };

  // History calculations
  const todayStats = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const dayStartMs = startOfDay.getTime();

    const todaysValid = orders.filter(o =>
      (o.timestamp || 0) >= dayStartMs &&
      o.status !== 'cancelled' &&
      o.status !== 'geannuleerd' &&
      !o.paymentMeta?.refunded
    );
    const sumupValid = todaysValid.filter(o => o.paymentMeta?.isSumUp);
    const totalRev = todaysValid.reduce((s, o) => s + Number(o.total || 0), 0);
    const sumupRev = sumupValid.reduce((s, o) => s + Number(o.total || 0), 0);
    const tips = todaysValid.reduce((s, o) => s + Number(o.paymentMeta?.tipAmount || 0), 0);
    const avg = todaysValid.length > 0 ? totalRev / todaysValid.length : 0;

    return {
      count: todaysValid.length,
      sumupCount: sumupValid.length,
      totalRev,
      sumupRev,
      tips,
      avg
    };
  }, [orders]);

  const filteredTransactions = useMemo(() => {
    return orders
      .filter(o => {
        if (historyFilter === 'sumup') return Boolean(o.paymentMeta?.isSumUp);
        if (historyFilter === 'workpay') return o.paymentMethod === 'workpay';
        if (historyFilter === 'cash') return o.paymentMethod === 'cash';
        return true;
      })
      .slice(0, 60);
  }, [orders, historyFilter]);

  const matchingAccounts = useMemo(() => {
    const q = toolSearch.trim().toLowerCase();
    if (!q) return bankAccounts.slice(0, 12);
    const normQ = normalizeCardUid(toolSearch);
    return bankAccounts.filter(a =>
      a.username.toLowerCase().includes(q) ||
      a.account_holder.toLowerCase().includes(q) ||
      (normQ.length >= 2 && accountMatchesUid(a, normQ))
    ).slice(0, 15);
  }, [bankAccounts, toolSearch]);

  const qrDataPayload = useMemo(() => {
    return JSON.stringify({
      type: 'WERKPAY_SUMUP',
      merchant: customBranding?.useCustomBranding ? customBranding.storeName : brandConfig.name,
      amount: finalTotal,
      ref: description.trim() || 'SumUp Betaling',
      orderNo
    });
  }, [finalTotal, description, orderNo, customBranding, brandConfig.name]);

  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrDataPayload)}`;

  const displayBrandName = (customBranding && customBranding.useCustomBranding)
    ? customBranding.storeName
    : brandConfig.name;

  const openKitchenPickupOrders = useMemo(() => {
    return orders
      .filter(o => isOrderInProgress(o.status) || isOrderReady(o.status))
      .slice(0, 25);
  }, [orders]);

  const filteredQuickProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = q
      ? brandProducts.filter(p => p.name.toLowerCase().includes(q) || p.cat.toLowerCase().includes(q))
      : brandProducts;
    return list.slice(0, 24);
  }, [brandProducts, productSearch]);

  const foundGiftCard = useMemo(() => {
    const clean = giftSearch.trim().toUpperCase();
    if (!clean) return null;
    return giftCards.find(g => g.code.toUpperCase() === clean) || null;
  }, [giftCards, giftSearch]);

  const handleQuickAddProduct = (prodName: string, price: number) => {
    setAccumulatedTotal(prev => Math.round((prev + price) * 100) / 100);
    setEntryCount(prev => prev + 1);
    setDescription(prev => {
      if (!prev.trim()) return prodName;
      if (prev.includes(prodName)) return prev;
      return `${prev}, ${prodName}`.slice(0, 60);
    });
    try { AudioFX.beep(); } catch {}
    showToast(`${prodName} (+${euro(price)}) opgeteld`, 'success');
  };

  const handleShareRequest = async () => {
    if (finalTotal <= 0) {
      showToast('Voer eerst een bedrag in om te delen.', 'error');
      return;
    }
    const text = `Betaalverzoek ${displayBrandName}: ${euro(finalTotal)} — ${description.trim() || 'SumUp Betaling'} (Bon #${orderNo})`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${displayBrandName} Betaalverzoek`, text });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Betaalverzoek gekopieerd naar klembord!', 'success');
    } catch {
      showToast(text, 'info');
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Compact SumUp Mobile App Header (only shown when auto-opened in small screen shell without full POS headers) */}
      {isCompactMobileShell && (
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm text-white truncate">WerkPay SumUp</span>
                <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {displayBrandName} · {currentPosUser?.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onSwitchToFullVersion && (
              <button
                type="button"
                onClick={onSwitchToFullVersion}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1"
                title="Ga naar volledige kassa & bestelschermen"
              >
                <Monitor className="w-3.5 h-3.5 text-blue-400" />
                <span>Volledig</span>
              </button>
            )}
            <button
              type="button"
              onClick={logoutPos}
              className="p-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30"
              title="Uitloggen"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sub-navigation Bar (4 SumUp App Tabs) */}
      <div className="px-2.5 sm:px-6 py-2 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5 w-full max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab('charge')}
            className={`py-2 px-1.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1 transition ${
              activeTab === 'charge'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Afrekenen</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2 px-1.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1 transition ${
              activeTab === 'history'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Historie</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('kassa_tools')}
            className={`py-2 px-1.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1 transition relative ${
              activeTab === 'kassa_tools'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Orders</span>
            {openKitchenPickupOrders.length > 0 && (
              <span className="px-1 rounded-full text-[9px] font-black bg-amber-400 text-slate-950">
                {openKitchenPickupOrders.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tools')}
            className={`py-2 px-1.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1 transition ${
              activeTab === 'tools'
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Pi &amp; Pas</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* ============================================================== */}
          {/* TAB 1: SUMUP AFREKENEN (NUMPAD) */}
          {/* ============================================================== */}
          {activeTab === 'charge' && (
            <div className="space-y-3.5">
              {/* Receipt Confirmation Banner right after a payment */}
              {completedOrder && (
                <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-emerald-300">
                        Betaling #{completedOrder.no} Geslaagd · {euro(completedOrder.total)}
                      </p>
                      <p className="text-xs text-slate-300">
                        {completedOrder.identifier} · {completedOrder.paymentMethod === 'cash' ? 'Contant' : 'WerkPay'}
                        {completedOrder.paymentMeta?.account ? ` (@${completedOrder.paymentMeta.account})` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveReceiptOrder(completedOrder)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center gap-1.5"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Bon</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompletedOrder(null)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                    >
                      Sluit
                    </button>
                  </div>
                </div>
              )}

              {/* Amount Display Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>SumUp Betaalverzoek</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {entryCount > 0 && (
                      <span className="font-mono text-cyan-300 bg-cyan-500/15 px-2 py-0.5 rounded-md border border-cyan-500/30">
                        +{entryCount} {entryCount === 1 ? 'post' : 'posten'} ({euro(accumulatedTotal)})
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowProductDrawer(p => !p)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition ${
                        showProductDrawer
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <ShoppingBag className="w-3 h-3" />
                      <span>Artikelen</span>
                      {showProductDrawer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleShareRequest}
                      className="p-1.5 rounded-lg bg-slate-950 text-slate-300 border border-slate-800 hover:text-cyan-300"
                      title="Deel / kopieer betaalverzoek"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Quick 1-Tap Menu Product Tiles Drawer */}
                {showProductDrawer && (
                  <div className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <input
                      type="text"
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      placeholder="Zoek gerecht (bijv. burger, friet, cola)..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                      {filteredQuickProducts.map(prod => {
                        const unitPrice = prod.onSale && prod.salePrice > 0 ? prod.salePrice : prod.price;
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => handleQuickAddProduct(prod.name, unitPrice)}
                            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between gap-1.5 transition active:scale-95"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-base shrink-0">{prod.emoji}</span>
                              <span className="text-[11px] font-bold text-slate-200 truncate">{prod.name}</span>
                            </div>
                            <span className="text-[11px] font-mono font-black text-cyan-300 shrink-0">
                              {euro(unitPrice)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="text-center py-2">
                  <div className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono">
                    {euro(finalTotal)}
                  </div>
                  {tipAmount > 0 && (
                    <div className="text-xs text-emerald-400 font-bold mt-1">
                      Subtotaal {euro(baseAmount)} + {tipPercent}% fooi ({euro(tipAmount)})
                    </div>
                  )}
                </div>

                {/* Description Input + Quick Labels */}
                <div className="space-y-2">
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Omschrijving (bijv. Los drankje, Snack, Tafel)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {['Losse verkoop', 'Drankje', 'Snack', 'Menu', 'Speciaal'].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDescription(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap border transition ${
                          description === preset
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick Amounts & Tip Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Snelle bedragen</div>
                    <div className="flex flex-wrap gap-1.5">
                      {[2.5, 5, 10, 20].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => handleQuickAmount(amt)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold border border-slate-700"
                        >
                          €{amt.toFixed(2).replace('.', ',')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Fooi toevoegen</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([0, 5, 10, 15] as const).map(pct => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setTipPercent(pct)}
                          className={`py-1 rounded-lg text-xs font-bold border transition ${
                            tipPercent === pct
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                              : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          {pct === 0 ? 'Geen' : `+${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* SumUp Tactile Numpad */}
              <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                {['1', '2', '3'].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    className="h-14 sm:h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 text-2xl font-black text-white transition"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-14 sm:h-16 rounded-2xl bg-rose-950/40 hover:bg-rose-900/50 active:scale-95 border border-rose-500/30 text-sm font-black text-rose-300 transition"
                >
                  C
                </button>

                {['4', '5', '6'].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    className="h-14 sm:h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 text-2xl font-black text-white transition"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="h-14 sm:h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 flex items-center justify-center transition"
                  title="Laatste cijfer wissen"
                >
                  <Delete className="w-6 h-6" />
                </button>

                {['7', '8', '9'].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDigit(d)}
                    className="h-14 sm:h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 text-2xl font-black text-white transition"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleAddPlus}
                  className="h-14 sm:h-16 rounded-2xl bg-cyan-950/60 hover:bg-cyan-900/60 active:scale-95 border border-cyan-500/40 text-cyan-300 flex flex-col items-center justify-center transition"
                  title="Bedrag optellen bij subtotaal"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px] font-bold">Tel op</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDigit('.')}
                  className="h-14 sm:h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 text-2xl font-black text-white transition"
                >
                  ,
                </button>
                <button
                  type="button"
                  onClick={() => handleDigit('0')}
                  className="h-14 sm:h-16 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-800 text-2xl font-black text-white transition"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={openPaymentSheet}
                  disabled={finalTotal <= 0}
                  className="col-span-2 h-14 sm:h-16 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 active:scale-[0.98] text-slate-950 font-black text-base sm:text-lg shadow-xl shadow-cyan-500/20 flex items-center justify-center gap-2 transition"
                >
                  <CreditCard className="w-5 h-5" />
                  <span>Afrekenen {finalTotal > 0 ? euro(finalTotal) : ''}</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: TRANSACTIES, OMZET & TERUGBETALEN (REFUNDS) */}
          {/* ============================================================== */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* Today KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Omzet Vandaag</div>
                  <div className="text-lg font-black text-emerald-400 mt-0.5">{euro(todayStats.totalRev)}</div>
                  <div className="text-[10px] text-slate-500">Waarvan SumUp: {euro(todayStats.sumupRev)}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Transacties</div>
                  <div className="text-lg font-black text-white mt-0.5">{todayStats.count}</div>
                  <div className="text-[10px] text-slate-500">{todayStats.sumupCount}x via SumUp app</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Gemiddeld</div>
                  <div className="text-lg font-black text-cyan-400 mt-0.5">{euro(todayStats.avg)}</div>
                  <div className="text-[10px] text-slate-500">Per betaling</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Fooi Vandaag</div>
                  <div className="text-lg font-black text-amber-400 mt-0.5">{euro(todayStats.tips)}</div>
                  <div className="text-[10px] text-slate-500">SumUp fooien</div>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {([
                  { id: 'sumup', label: '💳 Alleen SumUp' },
                  { id: 'all', label: 'Alles (incl. Kassa)' },
                  { id: 'workpay', label: 'WerkPay' },
                  { id: 'cash', label: 'Contant' }
                ] as const).map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setHistoryFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                      historyFilter === f.id
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Transaction List */}
              <div className="space-y-2">
                {filteredTransactions.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
                    Nog geen transacties gevonden voor dit filter.
                  </div>
                ) : (
                  filteredTransactions.map(o => {
                    const isRefunded = o.status === 'cancelled' || o.status === 'geannuleerd' || o.paymentMeta?.refunded;
                    return (
                      <div
                        key={`${o.no}-${o.timestamp}`}
                        className={`bg-slate-900 border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isRefunded ? 'border-rose-500/30 opacity-75' : 'border-slate-800'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-black text-cyan-400">#{o.no}</span>
                            <span className="text-sm font-bold text-white truncate">{o.identifier}</span>
                            {o.paymentMeta?.isSumUp && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold">
                                SumUp
                              </span>
                            )}
                            {isRefunded && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
                                Terugbetaald
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>🕒 {o.time}</span>
                            <span>·</span>
                            <span>{o.paymentMethod === 'cash' ? '💶 Contant' : '💳 WerkPay'}</span>
                            {o.paymentMeta?.account && (
                              <>
                                <span>·</span>
                                <span className="text-slate-300">@{o.paymentMeta.account}</span>
                              </>
                            )}
                            <span>·</span>
                            <span>{o.cashier}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                          <span className={`font-mono font-black text-base ${isRefunded ? 'line-through text-rose-400' : 'text-emerald-400'}`}>
                            {euro(o.total)}
                          </span>

                          <button
                            type="button"
                            onClick={() => setActiveReceiptOrder(o)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1"
                            title="Bekijk bon"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Bon</span>
                          </button>

                          {!isRefunded && (
                            confirmRefundNo === o.no ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={refundBusyNo === o.no}
                                  onClick={async () => {
                                    setRefundBusyNo(o.no);
                                    const res = await refundSumUpTransaction(o.no);
                                    setRefundBusyNo(null);
                                    setConfirmRefundNo(null);
                                    showToast(res.message, res.success ? 'success' : 'error');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black"
                                >
                                  {refundBusyNo === o.no ? '...' : 'Bevestig'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRefundNo(null)}
                                  className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
                                >
                                  Nee
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmRefundNo(o.no)}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1"
                                title="Bedrag terugboeken (Refund)"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Refund</span>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: MOBIELE KASSA, ACTIEVE ORDERS & CADEAUKAARTEN */}
          {/* ============================================================== */}
          {activeTab === 'kassa_tools' && (
            <div className="space-y-4">
              {/* Snelle Kassa & Geluid Schakelaars */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span>Snelle Kassa Schakelaars</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !AudioFX.isEnabled;
                      AudioFX.setEnabled(next);
                      if (next) AudioFX.bell();
                      setSoundEnabled(next);
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black border flex items-center justify-center gap-2 transition ${
                      soundEnabled
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    <span>{soundEnabled ? 'Geluid: AAN' : 'Geluid: UIT'}</span>
                  </button>

                  {(canAccess('manager') || currentPosUser?.is_admin) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          toggleOrderStop();
                          showToast(orderStopActive ? 'Bestelstop opgeheven!' : 'Bestelstop geactiveerd!', 'info');
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-black border flex items-center justify-center gap-2 transition ${
                          orderStopActive
                            ? 'bg-rose-600 text-white border-rose-500 shadow'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span>{orderStopActive ? 'Bestelstop: AAN' : 'Bestelstop: UIT'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          togglePickupClosed();
                          showToast(pickupClosed ? 'Afhaalbalie geopend!' : 'Afhaalbalie gesloten!', 'info');
                        }}
                        className={`py-2.5 px-3 rounded-xl text-xs font-black border flex items-center justify-center gap-2 transition ${
                          pickupClosed
                            ? 'bg-amber-600 text-white border-amber-500 shadow'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <Package className="w-4 h-4" />
                        <span>{pickupClosed ? 'Afhaal: GESLOTEN' : 'Afhaal: OPEN'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Openstaande Bestellingen Snel Beheren */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      <span>Openstaande Bestellingen ({openKitchenPickupOrders.length})</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Zet bestellingen direct vanaf je telefoon op Bereiden, Klaar of Afgehaald.
                    </p>
                  </div>
                </div>

                {openKitchenPickupOrders.length === 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 text-center text-xs text-slate-500">
                    Geen openstaande keuken- of afhaalbestellingen op dit moment.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {openKitchenPickupOrders.map(ord => {
                      const meta = getStatusMeta(ord.status);
                      return (
                        <div
                          key={`${ord.no}-${ord.timestamp}`}
                          className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-black text-xs text-cyan-400">#{ord.no}</span>
                              <span className="font-bold text-xs text-white truncate">{ord.identifier}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${meta.badgeBg} ${meta.badgeBorder} ${meta.badgeText}`}>
                                {meta.emoji} {meta.shortLabel}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 truncate">
                              {ord.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {(ord.status === 'new' || ord.status === 'wachten') && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(ord.no, 'bereiden')}
                                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-black"
                              >
                                🔥 Bereiden
                              </button>
                            )}
                            {isOrderInProgress(ord.status) && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(ord.no, 'klaar')}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Klaar</span>
                              </button>
                            )}
                            {isOrderReady(ord.status) && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(ord.no, 'afgehaald')}
                                className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-[11px] font-black flex items-center gap-1"
                              >
                                <Package className="w-3.5 h-3.5" />
                                <span>Afgehaald</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cadeaukaart Mini-Balie */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Gift className="w-4 h-4 text-purple-400" />
                  <span>Cadeaukaart Check &amp; Uitgeven ({giftCards.length})</span>
                </h3>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={giftSearch}
                    onChange={e => setGiftSearch(e.target.value)}
                    placeholder="Voer cadeaukaart code in (bijv. GIFT-...)..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-purple-500"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={newGiftAmount}
                      onChange={e => setNewGiftAmount(e.target.value)}
                      className="w-16 bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white font-mono text-center"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const amt = Math.max(1, parseFloat(newGiftAmount) || 15);
                        const code = generateGiftCardCode();
                        createGiftCard(code, amt);
                        setGiftSearch(code);
                        showToast(`Nieuwe cadeaukaart ${code} (${euro(amt)}) aangemaakt!`, 'success');
                      }}
                      className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs whitespace-nowrap"
                    >
                      + Nieuwe Kaart
                    </button>
                  </div>
                </div>

                {foundGiftCard && (
                  <div className="bg-slate-950 border border-purple-500/40 rounded-xl p-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-black text-xs text-purple-300">{foundGiftCard.code}</div>
                      <div className="text-xs text-slate-300">
                        Saldo: <strong className="text-emerald-400">{euro(foundGiftCard.current_balance)}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        topUpGiftCard(foundGiftCard.id, 10);
                        showToast(`+€ 10,00 bijgeboekt op ${foundGiftCard.code}`, 'success');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black"
                    >
                      +€10 Opwaarderen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: PI & PAS TOOLS (INCL. INGEBOUWDE PICO W FLASHER) */}
          {/* ============================================================== */}
          {activeTab === 'tools' && (
            <div className="space-y-4">
              {/* Pico W Hardware Terminal Status & Reset */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-cyan-400" />
                      <span>Pico W Pinapparaat (Cloud Relay)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Live status in Firebase, directe reset en ingebouwde Pico W USB/Mobiele flasher.
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black border ${
                    picoLiveState?.status === 'IDLE' || !picoLiveState
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}>
                    {picoLiveState?.status || 'VERBINDEN...'}
                  </span>
                </div>

                {picoLiveState && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono space-y-1 text-slate-300">
                    <div>Laatste UID: <span className="text-cyan-300">{picoLiveState.scannedUid || '—'}</span></div>
                    <div>Reden/Info: <span className="text-slate-400">{picoLiveState.reason || 'Klaar voor betaling'}</span></div>
                    <div>Update: <span className="text-slate-500">{picoLiveState.updatedAt || '—'}</span></div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await setHardwareTerminalIdle();
                      showToast('Pinapparaat teruggezet naar IDLE (klaar voor nieuw gebruik).', 'success');
                    }}
                    className="flex-1 min-w-[160px] py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-black text-xs flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Forceer Reset (IDLE)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowInlineFlasher(p => !p)}
                    className={`flex-1 min-w-[160px] py-2.5 px-3 rounded-xl border font-black text-xs flex items-center justify-center gap-1.5 transition ${
                      showInlineFlasher
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    <Zap className="w-4 h-4" />
                    <span>{showInlineFlasher ? 'Verberg Pi Flasher' : '⚡ Pico W Flashen'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDiyModal(true)}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
                  >
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <span>Schema / .INO</span>
                  </button>
                </div>

                {showInlineFlasher && (
                  <div className="pt-2 border-t border-slate-800">
                    <PicoFlasherPanel compact />
                  </div>
                )}
              </div>

              {/* NFC Saldo Check, Pas Koppelen & Direct Opwaarderen */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-400" />
                      <span>NFC Pas Koppelen, Check &amp; Opwaarderen</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Zoek op naam/UID, waardeer op of koppel direct een nieuwe NFC pas.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={toolSearch}
                      onChange={e => setToolSearch(e.target.value)}
                      placeholder="Zoek klant of plak UID (bijv. 04A1B2C3)..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-bold">Vrij €</span>
                    <input
                      type="number"
                      step="0.50"
                      value={customTopUpAmt}
                      onChange={e => setCustomTopUpAmt(e.target.value)}
                      className="w-20 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {matchingAccounts.map(acc => (
                    <div
                      key={acc.id}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white truncate">{acc.account_holder}</span>
                          <span className="text-[11px] font-mono text-slate-400">@{acc.username}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">
                          Pas: {formatCardUid(acc.card_uid)}
                          {acc.linked_uids && acc.linked_uids.length > 0 ? ` (+${acc.linked_uids.length} tags)` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-between sm:justify-end">
                        <span className="font-mono font-black text-sm text-cyan-300 mr-1">
                          {acc.is_admin ? '€ ∞' : euro(acc.balance)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLinkCardTargetUsername(acc.username)}
                          className="px-2 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[11px] font-black flex items-center gap-1"
                          title="Koppel NFC pas of tag via Pico W"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>Koppel Pas</span>
                        </button>
                        {!acc.is_admin && (
                          <>
                            {[5, 10, 20].map(amt => (
                              <button
                                key={amt}
                                type="button"
                                onClick={async () => {
                                  await quickMoneyAccount(acc.id, amt);
                                  showToast(`+€ ${amt.toFixed(2)} bijgeschreven bij ${acc.account_holder}`, 'success');
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-black"
                              >
                                +€{amt}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={async () => {
                                const val = parseFloat(customTopUpAmt.replace(',', '.')) || 0;
                                if (val === 0) return;
                                await quickMoneyAccount(acc.id, val);
                                showToast(`${val > 0 ? '+' : ''}€ ${val.toFixed(2)} bijgewerkt voor ${acc.account_holder}`, 'success');
                              }}
                              className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-[11px] font-black"
                            >
                              +Vrij
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ============================================================== */}
      {/* PAYMENT METHOD SHEET MODAL */}
      {/* ============================================================== */}
      {showPaySheet && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                  SumUp Afrekenen · {description.trim() || 'SumUp Betaling'}
                </div>
                <div className="text-2xl font-black text-white font-mono">{euro(finalTotal)}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (picoWaiting) handleCancelPicoCloud();
                  setShowPaySheet(false);
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Method Selector */}
            <div className="p-3 bg-slate-950/60 border-b border-slate-800 grid grid-cols-4 gap-1.5">
              {([
                { id: 'pico', label: 'Pinapparaat', icon: Radio },
                { id: 'card', label: 'NFC / UID', icon: CreditCard },
                { id: 'login', label: 'QR / Login', icon: QrCode },
                { id: 'cash', label: 'Contant', icon: Banknote }
              ] as const).map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (picoWaiting && m.id !== 'pico') handleCancelPicoCloud();
                      setPayMethod(m.id);
                      setPayError('');
                    }}
                    className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1 border transition ${
                      payMethod === m.id
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {payError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{payError}</span>
                </div>
              )}

              {/* 1. Pico W Pinapparaat */}
              {payMethod === 'pico' && (
                <div className="space-y-4 text-center">
                  {!picoWaiting ? (
                    <>
                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <Radio className="w-10 h-10 text-cyan-400 mx-auto" />
                        <p className="text-sm font-bold text-white">Stuur {euro(finalTotal)} naar Pico W Pinapparaat</p>
                        <p className="text-xs text-slate-400">
                          De klant houdt zijn NFC-pas bij de terminal en typt de pincode in.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleStartPicoCloud}
                        className="w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                      >
                        <Radio className="w-4 h-4" />
                        <span>Activeer Pinapparaat</span>
                      </button>
                    </>
                  ) : (
                    <div className="p-5 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 space-y-3">
                      <Loader2 className="w-10 h-10 text-cyan-400 mx-auto animate-spin" />
                      <div>
                        <p className="text-sm font-black text-cyan-200">
                          Wachten op pas &amp; PIN op terminal...
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Status: <span className="font-mono text-white">{picoLiveState?.status || 'PAY'}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelPicoCloud}
                        className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs"
                      >
                        Annuleer Terminal Verzoek
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 2. NFC Pas / UID + PIN */}
              {payMethod === 'card' && (
                <form onSubmit={handleCardSubmit} className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">Pasnummer of NFC UID</label>
                    <input
                      type="text"
                      required
                      value={cardUid}
                      onChange={e => setCardUid(e.target.value)}
                      placeholder="Bijv. 04A1B2C3 of 4129 8831..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">4-cijferige Pincode</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      maxLength={6}
                      value={cardPin}
                      onChange={e => setCardPin(e.target.value)}
                      placeholder="••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono tracking-widest focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black text-sm"
                  >
                    {isProcessing ? 'Verwerken...' : `Betaal ${euro(finalTotal)} met Pas`}
                  </button>
                </form>
              )}

              {/* 3. WerkPay QR & Login */}
              {payMethod === 'login' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl p-3 flex flex-col items-center gap-1.5">
                    <img src={qrImgUrl} alt="WerkPay SumUp QR" className="w-36 h-36 rounded-lg" />
                    <span className="text-[11px] font-black text-slate-900 font-mono">
                      WerkPay QR · {euro(finalTotal)}
                    </span>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-2.5 pt-2 border-t border-slate-800">
                    <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Of reken af met WerkPay account:</span>
                    </div>
                    <input
                      type="text"
                      required
                      value={wpUser}
                      onChange={e => setWpUser(e.target.value)}
                      placeholder="Gebruikersnaam..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white"
                    />
                    <input
                      type="password"
                      required
                      value={wpPass}
                      onChange={e => setWpPass(e.target.value)}
                      placeholder="Pincode of wachtwoord..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white"
                    />
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="w-full py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black text-sm"
                    >
                      {isProcessing ? 'Verwerken...' : `Afschrijven ${euro(finalTotal)}`}
                    </button>
                  </form>
                </div>
              )}

              {/* 4. Contant */}
              {payMethod === 'cash' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">Ontvangen contant (€)</label>
                    <input
                      type="number"
                      step="0.05"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-lg font-mono font-bold text-white"
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCashReceived(finalTotal.toFixed(2))}
                      className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-300"
                    >
                      Gepast
                    </button>
                    {[5, 10, 20, 50].map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setCashReceived(b.toFixed(2))}
                        className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-white"
                      >
                        €{b}
                      </button>
                    ))}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-bold">Wisselgeld terug:</span>
                    <span className="font-mono font-black text-base text-emerald-400">
                      {euro(Math.max(0, (parseFloat(cashReceived.replace(',', '.')) || 0) - finalTotal))}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleCashSubmit}
                    className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm"
                  >
                    {isProcessing ? 'Verwerken...' : `Bevestig Contant ${euro(finalTotal)}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDiyModal && (
        <DiyTerminalModal onClose={() => setShowDiyModal(false)} />
      )}

      {linkCardTargetUsername && (
        <LinkCardModal
          username={linkCardTargetUsername}
          onClose={() => setLinkCardTargetUsername(null)}
        />
      )}
    </div>
  );
};

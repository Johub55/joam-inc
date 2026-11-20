import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { euro, normalizeCardUid, accountMatchesUid, formatCardUid } from '../../services/store';
import { showToast } from '../../services/appToast';
import {
  claimHardwareTerminalLinkMode,
  claimHardwareTerminalPayMode,
  extractTerminalLockOwner,
  getActiveHardwareTerminalId,
  getTerminalTabSessionId,
  HARDWARE_TERMINAL_EVENT,
  isHardwareTerminalBusy,
  releaseHardwareTerminalIfOwned,
  setHardwareTerminalLinked,
  setHardwareTerminalResult,
  setHardwareTerminalIdle,
  subscribeHardwareTerminal,
  toPicoShortReason,
  triggerHardwareTerminalCheckCard,
  HardwareTerminalState
} from '../../services/firebase';
import { findLoyaltyCustomerByPhoneOrName } from '../../services/loyalty';
import { terminalManager, TerminalCallbacks } from '../../services/terminalService';
import { DiyTerminalModal } from './DiyTerminalModal';
import { LinkCardModal } from './LinkCardModal';
import { TerminalSelector } from './TerminalSelector';
import { generateGiftCardCode } from '../../services/discountService';
import { getStatusMeta, isOrderInProgress, isOrderReady } from '../../services/orderStatus';
import { AudioFX } from '../../services/audio';
import { Order } from '../../types';
import {
  CreditCard,
  Delete,
  Plus,
  Minus,
  CheckCircle2,
  XCircle,
  Loader2,
  Radio,
  Receipt,
  RotateCcw,
  Undo2,
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
  Link2,
  Volume2,
  VolumeX,
  Check,
  Flame,
  Package,
  Sliders,
  ChevronDown,
  ChevronUp,
  Lock,
  Megaphone,
  Star,
  Clock,
  ChefHat
} from 'lucide-react';

interface SumUpTerminalScreenProps {
  isCompactMobileShell?: boolean;
  onSwitchToFullVersion?: () => void;
}

type SumUpTab = 'charge' | 'history' | 'kassa_tools' | 'tools';
type PayMethodTab = 'pico' | 'card' | 'login' | 'cash';
type MobileOrderFilter = 'open' | 'wachten' | 'bereiden' | 'inpakken' | 'klaar' | 'afgerond';

interface QuickCartEntry {
  name: string;
  price: number;
  qty: number;
  emoji?: string;
}

export const SumUpTerminalScreen: React.FC<SumUpTerminalScreenProps> = ({
  isCompactMobileShell = false,
  onSwitchToFullVersion
}) => {
  const {
    currentPosUser,
    logoutPos,
    canAccess,
    managerOverride,
    authorizeCashStaffUser,
    orders,
    orderNo,
    brandProducts,
    bankAccounts,
    quickMoneyAccount,
    setActiveReceiptOrder,
    processSumUpPayment,
    refundSumUpTransaction,
    refundToWerkPayAccount,
    updateOrderStatus,
    toggleOrderPrio,
    cancelOrder,
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
  const hasCashAuth = Boolean(managerOverride || authorizeCashStaffUser(currentPosUser));

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
  const [cashApprovalPin, setCashApprovalPin] = useState<string>('');

  // Mobile Kitchen Order Builder (optional inside SumUp Charge tab)
  const [quickCart, setQuickCart] = useState<QuickCartEntry[]>([]);
  const [sendToKitchen, setSendToKitchen] = useState<boolean>(false);
  const [mobileOrderType, setMobileOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('takeaway');
  const [mobileIdentifier, setMobileIdentifier] = useState<string>('');
  const [mobileOrderNote, setMobileOrderNote] = useState<string>('');

  // Pico W Cloud Relay Live State
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>(() => getActiveHardwareTerminalId());
  const selectedTerminalIdRef = useRef<string>(selectedTerminalId);
  selectedTerminalIdRef.current = selectedTerminalId;
  const [picoWaiting, setPicoWaiting] = useState<boolean>(false);
  const [picoLiveState, setPicoLiveState] = useState<HardwareTerminalState | null>(null);
  const handledCloudSigRef = useRef<string>('');
  const activeClaimTokenRef = useRef<string>('');
  const picoWaitingRef = useRef<boolean>(false);
  picoWaitingRef.current = picoWaiting;

  // Quick NFC Balance & Loyalty Check state
  const [checkUidInput, setCheckUidInput] = useState<string>('');
  const [lastCheckResult, setLastCheckResult] = useState<{
    holder: string;
    username?: string;
    balance: number;
    coins: number;
    tier: string;
    uid: string;
    at: string;
  } | null>(null);

  // History & Refunds
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sumup' | 'workpay' | 'cash'>('all');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [confirmRefundNo, setConfirmRefundNo] = useState<number | null>(null);
  const [refundBusyNo, setRefundBusyNo] = useState<number | null>(null);

  // Direct WerkPin Refund (Geld Terugboeken) Sheet State
  const [showRefundSheet, setShowRefundSheet] = useState<boolean>(false);
  const [refundMethod, setRefundMethod] = useState<'pico' | 'account' | 'uid'>('pico');
  const [refundPicoWaiting, setRefundPicoWaiting] = useState<boolean>(false);
  const refundPicoWaitingRef = useRef<boolean>(false);
  refundPicoWaitingRef.current = refundPicoWaiting;
  const refundClaimTokenRef = useRef<string>('');
  const handledRefundSigRef = useRef<string>('');
  const [refundProcessing, setRefundProcessing] = useState<boolean>(false);
  const [refundError, setRefundError] = useState<string>('');
  const [refundAccountSearch, setRefundAccountSearch] = useState<string>('');
  const [refundUidInput, setRefundUidInput] = useState<string>('');
  const [completedRefund, setCompletedRefund] = useState<{
    amount: number;
    accountHolder: string;
    username: string;
    newBalance?: number;
    at: string;
  } | null>(null);

  // Mobile Orders Tab State
  const [mobileOrderSearch, setMobileOrderSearch] = useState<string>('');
  const [mobileOrderFilter, setMobileOrderFilter] = useState<MobileOrderFilter>('open');
  const [confirmCancelOrderNo, setConfirmCancelOrderNo] = useState<number | null>(null);
  const [showGiftSection, setShowGiftSection] = useState<boolean>(false);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  // Tools: Card balance checker, DIY Terminal Modal, Quick Products, Orders & Gift cards
  const [toolSearch, setToolSearch] = useState<string>('');
  const [customTopUpAmt, setCustomTopUpAmt] = useState<string>('10');
  const [showDiyModal, setShowDiyModal] = useState<boolean>(false);
  const [linkCardTargetUsername, setLinkCardTargetUsername] = useState<string | null>(null);
  const [showProductDrawer, setShowProductDrawer] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>('');
  const [giftSearch, setGiftSearch] = useState<string>('');
  const [newGiftAmount, setNewGiftAmount] = useState<string>('15');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(AudioFX.isEnabled);

  useEffect(() => {
    if (activeTab !== 'kassa_tools') return;
    setNowTickMs(Date.now());
    const id = setInterval(() => setNowTickMs(Date.now()), 30000);
    return () => clearInterval(id);
  }, [activeTab]);

  const parsedCurrent = useMemo(() => {
    const clean = currentInput.replace(',', '.');
    const n = parseFloat(clean);
    return Number.isFinite(n) ? n : 0;
  }, [currentInput]);

  const quickCartTotal = useMemo(() => {
    return Math.round(quickCart.reduce((sum, it) => sum + it.price * it.qty, 0) * 100) / 100;
  }, [quickCart]);

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

  useEffect(() => {
    const syncTerm = () => {
      if (!picoWaitingRef.current && !refundPicoWaitingRef.current) {
        setSelectedTerminalId(getActiveHardwareTerminalId());
      }
    };
    window.addEventListener(HARDWARE_TERMINAL_EVENT, syncTerm);
    return () => window.removeEventListener(HARDWARE_TERMINAL_EVENT, syncTerm);
  }, []);

  // Keep global Firebase subscription active in Tools, Pay Sheet, Refund Sheet, or while waiting on Pico
  useEffect(() => {
    if (activeTab !== 'tools' && !picoWaiting && !showPaySheet && !showRefundSheet && !refundPicoWaiting) return;
    const unsub = subscribeHardwareTerminal(
      (st) => {
        setPicoLiveState(st);
        if (st?.status === 'CHECK_RESULT') {
          setLastCheckResult({
            holder: st.username || 'WerkPay Pas',
            balance: Number(st.amount || 0),
            coins: Number(st.orderNo || 0),
            tier: (st.reason || '').replace(/^OK\|/, '') || 'Brons',
            uid: st.scannedUid || '',
            at: new Date().toLocaleTimeString('nl-NL')
          });
        }
      },
      () => {},
      selectedTerminalId
    );
    return () => unsub();
  }, [activeTab, picoWaiting, showPaySheet, showRefundSheet, refundPicoWaiting, selectedTerminalId]);

  // Execute payment helper
  const executeCharge = async (
    method: 'workpay' | 'cash',
    meta: any,
    fromPicoCloud = false
  ) => {
    setIsProcessing(true);
    setPayError('');
    try {
      const manualExtra = Math.round((baseAmount - quickCartTotal) * 100) / 100;
      const structuredItems = quickCart.map(it => ({
        name: it.name,
        qty: it.qty,
        price: it.price
      }));
      if (structuredItems.length > 0 && manualExtra > 0.01) {
        structuredItems.push({
          name: description.trim() || 'Extra bedrag',
          qty: 1,
          price: manualExtra
        });
      }

      const res = await processSumUpPayment({
        amount: baseAmount,
        tipAmount,
        description: description.trim() || 'WerkPin Betaling',
        method,
        paymentMeta: meta,
        sendToKitchen,
        orderType: mobileOrderType,
        identifier: mobileIdentifier.trim() || description.trim() || (mobileOrderType === 'dine_in' ? 'Tafel -' : 'Mobiele Bestelling'),
        items: structuredItems.length > 0 ? structuredItems : undefined,
        notes: mobileOrderNote.trim() || undefined
      });

      const currentTerm = selectedTerminalIdRef.current;
      if (res.success && res.order) {
        if (fromPicoCloud) {
          await setHardwareTerminalResult('APPROVED', 'Bedankt!', currentTerm).catch(() => {});
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
        setQuickCart([]);
        setSendToKitchen(false);
        setMobileIdentifier('');
        setMobileOrderNote('');
        setDescription('');
        setTipPercent(0);
        setCardUid('');
        setCardPin('');
        setWpPass('');
        setCashReceived('');
        setCashApprovalPin('');
        showToast(res.message, 'success');
      } else {
        const shortReason = toPicoShortReason(res.message);
        if (fromPicoCloud) {
          await setHardwareTerminalResult('DECLINED', shortReason, currentTerm).catch(() => {});
        }
        if (terminalManager.getIsConnected()) {
          await terminalManager.notifyDeclined(shortReason).catch(() => {});
        }
        setPayError(res.message);
      }
    } catch (e: any) {
      const currentTerm = selectedTerminalIdRef.current;
      if (fromPicoCloud) {
        await setHardwareTerminalResult('DECLINED', 'Systeemfout', currentTerm).catch(() => {});
      }
      if (terminalManager.getIsConnected()) {
        await terminalManager.notifyDeclined('Systeemfout').catch(() => {});
      }
      setPayError(e?.message || 'Betaling mislukt.');
    } finally {
      setIsProcessing(false);
    }
  };

  const executeChargeRef = useRef(executeCharge);
  executeChargeRef.current = executeCharge;

  // Execute direct refund helper (Geld Terugboeken)
  const executeDirectRefund = async (
    target: { accountUsername?: string; cardUid?: string },
    fromPicoCloud = false
  ) => {
    setRefundProcessing(true);
    setRefundError('');
    try {
      const refundAmt = baseAmount > 0 ? baseAmount : finalTotal;
      const res = await refundToWerkPayAccount({
        amount: refundAmt,
        accountUsername: target.accountUsername,
        cardUid: target.cardUid,
        description: description.trim() || 'WerkPin Terugboeking'
      });

      const currentTerm = selectedTerminalIdRef.current;
      if (res.success && res.account) {
        if (fromPicoCloud) {
          await setHardwareTerminalLinked('Teruggeboekt', target.cardUid || '', currentTerm).catch(() => {});
        }
        setRefundPicoWaiting(false);
        setShowRefundSheet(false);
        setCompletedRefund({
          amount: refundAmt,
          accountHolder: res.account.account_holder,
          username: res.account.username,
          newBalance: res.newBalance,
          at: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        });
        setCompletedOrder(null);
        setCurrentInput('0');
        setAccumulatedTotal(0);
        setEntryCount(0);
        setQuickCart([]);
        setSendToKitchen(false);
        setDescription('');
        setTipPercent(0);
        setRefundUidInput('');
        setRefundAccountSearch('');
        showToast(res.message, 'success');
      } else {
        const shortReason = toPicoShortReason(res.message);
        if (fromPicoCloud) {
          await setHardwareTerminalResult('DECLINED', shortReason, currentTerm).catch(() => {});
        }
        setRefundError(res.message);
      }
    } catch (e: any) {
      const currentTerm = selectedTerminalIdRef.current;
      if (fromPicoCloud) {
        await setHardwareTerminalResult('DECLINED', 'Systeemfout', currentTerm).catch(() => {});
      }
      setRefundError(e?.message || 'Terugboeken mislukt.');
    } finally {
      setRefundProcessing(false);
    }
  };

  const executeDirectRefundRef = useRef(executeDirectRefund);
  executeDirectRefundRef.current = executeDirectRefund;

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

  // Listen to Firebase Cloud submits when waiting on Pico W (Betaling)
  useEffect(() => {
    if (!picoWaiting) return;
    let sawOwnSession = false;
    const expectedToken = activeClaimTokenRef.current;
    const unsub = subscribeHardwareTerminal(
      async (st) => {
        if (!st) return;
        setPicoLiveState(st);
        const lockOwner = extractTerminalLockOwner(st.reason);
        const belongsToSession = !expectedToken || !lockOwner || lockOwner === expectedToken;

        if (
          st.status !== 'IDLE' &&
          (lockOwner === expectedToken ||
            (belongsToSession && (st.status === 'SUBMITTED' || st.status === 'CARD_SCANNED')))
        ) {
          sawOwnSession = true;
        }

        if (st.status === 'SUBMITTED' && st.scannedUid && st.enteredPin && belongsToSession) {
          const sig = `${st.scannedUid}:${st.enteredPin}:${st.updatedAt}`;
          if (handledCloudSigRef.current === sig) return;
          handledCloudSigRef.current = sig;
          setPicoWaiting(false);
          activeClaimTokenRef.current = '';
          await executeChargeRef.current(
            'workpay',
            { mode: 'terminal', cardUid: st.scannedUid, pin: st.enteredPin },
            true
          );
        } else if (st.status === 'IDLE' && sawOwnSession) {
          activeClaimTokenRef.current = '';
          setPicoWaiting(false);
          setPayError(st.reason && st.reason !== 'Klaar' ? st.reason : 'Geannuleerd op het pinapparaat.');
        } else if (st.status === 'DECLINED' && sawOwnSession) {
          activeClaimTokenRef.current = '';
          setPicoWaiting(false);
          setPayError(st.reason || 'Betaling geweigerd op het pinapparaat.');
        }
      },
      () => {
        activeClaimTokenRef.current = '';
        setPicoWaiting(false);
        setPayError('Verbinding met Firebase terminal onderbroken.');
      },
      selectedTerminalId
    );
    return () => unsub();
  }, [picoWaiting, selectedTerminalId]);

  // Listen to Firebase Cloud card scans when waiting on Pico W (Terugboeken)
  useEffect(() => {
    if (!refundPicoWaiting) return;
    let sawOwnSession = false;
    const expectedToken = refundClaimTokenRef.current;
    const unsub = subscribeHardwareTerminal(
      async (st) => {
        if (!st) return;
        setPicoLiveState(st);
        const lockOwner = extractTerminalLockOwner(st.reason);
        const belongsToSession = !expectedToken || !lockOwner || lockOwner === expectedToken;

        if (
          st.status !== 'IDLE' &&
          (lockOwner === expectedToken || (belongsToSession && st.status === 'CARD_SCANNED'))
        ) {
          sawOwnSession = true;
        }

        if (st.status === 'CARD_SCANNED' && st.scannedUid && belongsToSession) {
          const sig = `refund:${st.scannedUid}:${st.updatedAt}`;
          if (handledRefundSigRef.current === sig) return;
          handledRefundSigRef.current = sig;
          setRefundPicoWaiting(false);
          refundClaimTokenRef.current = '';
          await executeDirectRefundRef.current({ cardUid: st.scannedUid }, true);
        } else if (st.status === 'IDLE' && sawOwnSession) {
          refundClaimTokenRef.current = '';
          setRefundPicoWaiting(false);
          setRefundError(st.reason && st.reason !== 'Klaar' ? st.reason : 'Terugboeken geannuleerd op het pinapparaat.');
        } else if (st.status === 'DECLINED' && sawOwnSession) {
          refundClaimTokenRef.current = '';
          setRefundPicoWaiting(false);
          setRefundError(st.reason || 'Terugboeken geweigerd op het pinapparaat.');
        }
      },
      () => {
        refundClaimTokenRef.current = '';
        setRefundPicoWaiting(false);
        setRefundError('Verbinding met Firebase terminal onderbroken.');
      },
      selectedTerminalId
    );
    return () => unsub();
  }, [refundPicoWaiting, selectedTerminalId]);

  // Release OWN lock cleanly if component unmounts while waiting
  useEffect(() => {
    return () => {
      if (picoWaitingRef.current && activeClaimTokenRef.current) {
        releaseHardwareTerminalIfOwned(activeClaimTokenRef.current, selectedTerminalIdRef.current).catch(() => {});
        activeClaimTokenRef.current = '';
      }
      if (refundPicoWaitingRef.current && refundClaimTokenRef.current) {
        releaseHardwareTerminalIfOwned(refundClaimTokenRef.current, selectedTerminalIdRef.current).catch(() => {});
        refundClaimTokenRef.current = '';
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
    setQuickCart([]);
    setSendToKitchen(false);
  };

  const handleAddPlus = () => {
    if (parsedCurrent <= 0) return;
    setAccumulatedTotal(prev => Math.round((prev + parsedCurrent) * 100) / 100);
    setEntryCount(prev => prev + 1);
    setCurrentInput('0');
  };

  const handleQuickAmount = (amt: number) => {
    setAccumulatedTotal(quickCartTotal);
    setEntryCount(quickCart.reduce((s, it) => s + it.qty, 0));
    setCurrentInput(amt.toFixed(2));
  };

  const openPaymentSheet = () => {
    if (finalTotal <= 0) {
      showToast('Toets eerst een bedrag in.', 'error');
      return;
    }
    if (sendToKitchen && !mobileIdentifier.trim() && !description.trim()) {
      showToast('Vul een tafelnummer of klantnaam in voor de keukenbestelling.', 'error');
      return;
    }
    setPayError('');
    setCashApprovalPin('');
    setPayMethod('pico');
    setShowPaySheet(true);
    setCashReceived(finalTotal.toFixed(2));
  };

  const openRefundSheet = () => {
    const refundAmt = baseAmount > 0 ? baseAmount : finalTotal;
    if (refundAmt <= 0) {
      showToast('Toets eerst het terug te boeken bedrag in (of kies een order in Historie).', 'info');
      return;
    }
    setRefundError('');
    setRefundMethod('pico');
    setShowRefundSheet(true);
  };

  const picoBusyCheck =
    !picoWaiting && !isProcessing && !refundPicoWaiting && !refundProcessing
      ? isHardwareTerminalBusy(
          picoLiveState,
          activeClaimTokenRef.current || refundClaimTokenRef.current || undefined
        )
      : { busy: false };

  const handleStartPicoCloud = async () => {
    setPayError('');
    handledCloudSigRef.current = '';
    const claimToken = `${getTerminalTabSessionId()}_werkpin_${Date.now()}`;
    activeClaimTokenRef.current = claimToken;
    try {
      const claimRes = await claimHardwareTerminalPayMode(
        finalTotal,
        orderNo,
        claimToken,
        undefined,
        selectedTerminalIdRef.current
      );
      if (!claimRes.acquired) {
        activeClaimTokenRef.current = '';
        setPayError(claimRes.busyMessage || 'Pinapparaat is al bezig met een andere betaling.');
        return;
      }
      setPicoWaiting(true);
      if (terminalManager.getIsConnected()) {
        await terminalManager.startPayment(finalTotal, orderNo).catch(() => {});
      }
    } catch (e: any) {
      activeClaimTokenRef.current = '';
      setPayError(e?.message || 'Kon Pico W terminal niet activeren.');
    }
  };

  const handleCancelPicoCloud = async () => {
    const token = activeClaimTokenRef.current;
    activeClaimTokenRef.current = '';
    setPicoWaiting(false);
    if (terminalManager.getIsConnected()) {
      await terminalManager.cancel().catch(() => {});
    }
    if (token) {
      await releaseHardwareTerminalIfOwned(token, selectedTerminalIdRef.current).catch(() => {});
    }
  };

  const handleStartRefundPicoCloud = async () => {
    setRefundError('');
    handledRefundSigRef.current = '';
    const claimToken = `${getTerminalTabSessionId()}_refund_${Date.now()}`;
    refundClaimTokenRef.current = claimToken;
    try {
      const claimRes = await claimHardwareTerminalLinkMode(
        'Terugboeken',
        claimToken,
        selectedTerminalIdRef.current
      );
      if (!claimRes.acquired) {
        refundClaimTokenRef.current = '';
        setRefundError(claimRes.busyMessage || 'Pinapparaat is al bezig met een andere sessie.');
        return;
      }
      setRefundPicoWaiting(true);
    } catch (e: any) {
      refundClaimTokenRef.current = '';
      setRefundError(e?.message || 'Kon Pico W terminal niet activeren.');
    }
  };

  const handleCancelRefundPicoCloud = async () => {
    const token = refundClaimTokenRef.current;
    refundClaimTokenRef.current = '';
    setRefundPicoWaiting(false);
    if (token) {
      await releaseHardwareTerminalIfOwned(token, selectedTerminalIdRef.current).catch(() => {});
    }
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
    const rec = parseFloat(cashReceived.replace(',', '.'));
    if (!Number.isFinite(rec) || rec < finalTotal - 0.01) {
      setPayError(`Ontvangen bedrag is ongeldig of lager dan ${euro(finalTotal)}.`);
      return;
    }
    if (!hasCashAuth && !cashApprovalPin.trim()) {
      setPayError('Voer eerst een geldige medewerker PIN (cash_pay) in om contant geld aan te nemen.');
      return;
    }
    const change = Math.max(0, Math.round((rec - finalTotal) * 100) / 100);
    await executeCharge(
      'cash',
      {
        received: Math.round(rec * 100) / 100,
        change,
        cashier: currentPosUser?.name || 'WerkPin',
        approvalPin: !hasCashAuth ? cashApprovalPin.trim() : undefined
      },
      false
    );
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
    const q = historySearch.trim().toLowerCase().replace(/^#/, '');
    return orders
      .filter(o => {
        if (historyFilter === 'sumup' && !o.paymentMeta?.isSumUp) return false;
        if (historyFilter === 'workpay' && o.paymentMethod !== 'workpay') return false;
        if (historyFilter === 'cash' && o.paymentMethod !== 'cash') return false;
        if (!q) return true;
        if (String(o.no).includes(q)) return true;
        if ((o.identifier || '').toLowerCase().includes(q)) return true;
        if ((o.paymentMeta?.account || '').toLowerCase().includes(q)) return true;
        if ((o.paymentMeta?.sumupDescription || '').toLowerCase().includes(q)) return true;
        if ((o.cashier || '').toLowerCase().includes(q)) return true;
        return false;
      })
      .slice(0, 60);
  }, [orders, historyFilter, historySearch]);

  const matchingRefundAccounts = useMemo(() => {
    const q = refundAccountSearch.trim().toLowerCase();
    if (!q) return bankAccounts.slice(0, 12);
    const normQ = normalizeCardUid(refundAccountSearch);
    return bankAccounts.filter(a =>
      a.username.toLowerCase().includes(q) ||
      a.account_holder.toLowerCase().includes(q) ||
      (normQ.length >= 2 && accountMatchesUid(a, normQ))
    ).slice(0, 12);
  }, [bankAccounts, refundAccountSearch]);

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
      type: 'WERKPAY_PIN',
      merchant: customBranding?.useCustomBranding ? customBranding.storeName : brandConfig.name,
      amount: finalTotal,
      ref: description.trim() || 'WerkPin Betaling',
      orderNo
    });
  }, [finalTotal, description, orderNo, customBranding, brandConfig.name]);

  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrDataPayload)}`;

  const displayBrandName = (customBranding && customBranding.useCustomBranding)
    ? customBranding.storeName
    : brandConfig.name;

  const openKitchenPickupOrders = useMemo(() => {
    return orders.filter(o => isOrderInProgress(o.status) || isOrderReady(o.status));
  }, [orders]);

  const mobileOrderCounts = useMemo(() => {
    let open = 0;
    let wachten = 0;
    let bereiden = 0;
    let inpakken = 0;
    let klaar = 0;
    let afgerond = 0;

    for (const o of orders) {
      if (o.status === 'new' || o.status === 'wachten') {
        wachten++;
        open++;
      } else if (o.status === 'bereiden' || o.status === 'oven_grill' || o.status === 'frituren') {
        bereiden++;
        open++;
      } else if (o.status === 'inpakken') {
        inpakken++;
        open++;
      } else if (o.status === 'klaar' || o.status === 'done') {
        klaar++;
        open++;
      } else {
        afgerond++;
      }
    }
    return { open, wachten, bereiden, inpakken, klaar, afgerond };
  }, [orders]);

  const filteredMobileOrders = useMemo(() => {
    const q = mobileOrderSearch.trim().toLowerCase().replace(/^#/, '');
    const list = orders.filter(o => {
      if (mobileOrderFilter === 'open') {
        if (!isOrderInProgress(o.status) && !isOrderReady(o.status)) return false;
      } else if (mobileOrderFilter === 'wachten') {
        if (o.status !== 'new' && o.status !== 'wachten') return false;
      } else if (mobileOrderFilter === 'bereiden') {
        if (o.status !== 'bereiden' && o.status !== 'oven_grill' && o.status !== 'frituren') return false;
      } else if (mobileOrderFilter === 'inpakken') {
        if (o.status !== 'inpakken') return false;
      } else if (mobileOrderFilter === 'klaar') {
        if (o.status !== 'klaar' && o.status !== 'done') return false;
      } else if (mobileOrderFilter === 'afgerond') {
        if (isOrderInProgress(o.status) || isOrderReady(o.status)) return false;
      }

      if (!q) return true;
      if (String(o.no).includes(q)) return true;
      if ((o.identifier || '').toLowerCase().includes(q)) return true;
      if ((o.notes || '').toLowerCase().includes(q)) return true;
      return o.items.some(it => it.name.toLowerCase().includes(q) || (it.itemNote || '').toLowerCase().includes(q));
    });

    const sorted = [...list].sort((a, b) => {
      if (mobileOrderFilter !== 'afgerond') {
        if (a.isPrio && !b.isPrio) return -1;
        if (!a.isPrio && b.isPrio) return 1;
      }
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    return mobileOrderFilter === 'afgerond' ? sorted.slice(0, 30) : sorted;
  }, [orders, mobileOrderFilter, mobileOrderSearch]);

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

  const handleQuickAddProduct = (prodName: string, price: number, emoji?: string) => {
    setAccumulatedTotal(prev => Math.round((prev + price) * 100) / 100);
    setEntryCount(prev => prev + 1);
    setQuickCart(prev => {
      const idx = prev.findIndex(x => x.name === prodName && x.price === price);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { name: prodName, price, qty: 1, emoji }];
    });
    setSendToKitchen(true);
    setDescription(prev => {
      if (!prev.trim()) return prodName;
      if (prev.includes(prodName)) return prev;
      return `${prev}, ${prodName}`.slice(0, 60);
    });
    try { AudioFX.beep(); } catch {}
    showToast(`${prodName} (+${euro(price)}) toegevoegd`, 'success');
  };

  const handleAdjustQuickCartItem = (name: string, price: number, delta: number) => {
    const target = quickCart.find(x => x.name === name && x.price === price);
    if (!target) return;
    const nextQty = target.qty + delta;
    setAccumulatedTotal(prev => Math.max(0, Math.round((prev + delta * price) * 100) / 100));
    setEntryCount(prev => Math.max(0, prev + delta));
    setQuickCart(prev => {
      if (nextQty <= 0) {
        return prev.filter(x => !(x.name === name && x.price === price));
      }
      return prev.map(x => (x.name === name && x.price === price ? { ...x, qty: nextQty } : x));
    });
  };

  const handleShareRequest = async () => {
    if (finalTotal <= 0) {
      showToast('Voer eerst een bedrag in om te delen.', 'error');
      return;
    }
    const text = `Betaalverzoek ${displayBrandName}: ${euro(finalTotal)} — ${description.trim() || 'WerkPin Betaling'} (Bon #${orderNo})`;
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
      {/* Compact WerkPin Mobile App Header (only shown when auto-opened in small screen shell without full POS headers) */}
      {isCompactMobileShell && (
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-sm text-white truncate">WerkPay WerkPin</span>
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

      {/* Sub-navigation Bar (4 WerkPin App Tabs) */}
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
          {/* TAB 1: WERKPIN AFREKENEN (NUMPAD) */}
          {/* ============================================================== */}
          {activeTab === 'charge' && (
            <div className="space-y-3.5">
              {/* Refund Confirmation Banner right after direct refund */}
              {completedRefund && (
                <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-200">
                        Terugboeking Geslaagd · {euro(completedRefund.amount)}
                      </p>
                      <p className="text-xs text-slate-300">
                        Bijgeschreven bij {completedRefund.accountHolder} (@{completedRefund.username})
                        {completedRefund.newBalance !== undefined ? ` · Nieuw saldo: ${euro(completedRefund.newBalance)}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompletedRefund(null)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold self-end sm:self-center"
                  >
                    Sluit
                  </button>
                </div>
              )}

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
                    <span>WerkPin Betaalverzoek</span>
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
                            onClick={() => handleQuickAddProduct(prod.name, unitPrice, prod.emoji)}
                            className="p-2.5 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between gap-1.5 transition active:scale-95"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-base shrink-0">{prod.emoji}</span>
                              <span className="text-[11px] font-bold text-slate-200 truncate">{prod.name}</span>
                            </div>
                            <span className="text-[11px] font-mono font-black tabular-nums text-cyan-300 shrink-0">
                              {euro(unitPrice)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {quickCart.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-300">Gekozen items ({quickCart.reduce((s, i) => s + i.qty, 0)})</span>
                          <button
                            type="button"
                            onClick={handleClear}
                            className="text-rose-400 hover:text-rose-300 font-bold"
                          >
                            Alles wissen
                          </button>
                        </div>
                        <div className="space-y-1">
                          {quickCart.map(item => (
                            <div
                              key={`${item.name}-${item.price}`}
                              className="flex items-center justify-between gap-2 bg-slate-900 rounded-lg px-2.5 py-1.5 text-xs border border-slate-800"
                            >
                              <span className="text-slate-100 font-bold truncate">
                                {item.emoji ? `${item.emoji} ` : ''}{item.name}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleAdjustQuickCartItem(item.name, item.price, -1)}
                                  className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
                                  aria-label="Minder"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="font-mono font-black tabular-nums w-5 text-center text-cyan-300">{item.qty}</span>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustQuickCartItem(item.name, item.price, 1)}
                                  className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center"
                                  aria-label="Meer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-center py-2">
                  <div className="text-4xl sm:text-5xl font-black tracking-tight text-white font-mono tabular-nums">
                    {euro(finalTotal)}
                  </div>
                  {tipAmount > 0 && (
                    <div className="text-xs text-emerald-400 font-bold mt-1 tabular-nums">
                      Subtotaal {euro(baseAmount)} + {tipPercent}% fooi ({euro(tipAmount)})
                    </div>
                  )}
                </div>

                {/* Optional Send-to-Kitchen / Order Details Toggle */}
                <div className="rounded-2xl bg-slate-950 border border-slate-800 p-2.5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setSendToKitchen(prev => !prev)}
                    className="w-full flex items-center justify-between gap-2 text-left text-xs"
                  >
                    <span className="flex items-center gap-2 font-bold text-slate-200">
                      <ChefHat className={`w-4 h-4 ${sendToKitchen ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span>Doorsturen naar Keuken &amp; Afhaalscherm</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${
                      sendToKitchen
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}>
                      {sendToKitchen ? 'AAN' : 'UIT'}
                    </span>
                  </button>

                  {sendToKitchen && (
                    <div className="space-y-2 pt-2 border-t border-slate-800/80">
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { id: 'dine_in', label: '🍽️ Opeten' },
                          { id: 'takeaway', label: '🥡 Afhaal' },
                          { id: 'delivery', label: '🛵 Bezorgen' }
                        ] as const).map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setMobileOrderType(t.id)}
                            className={`min-h-[40px] rounded-xl text-[11px] font-black border transition ${
                              mobileOrderType === t.id
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={mobileIdentifier}
                          onChange={e => setMobileIdentifier(e.target.value)}
                          placeholder={mobileOrderType === 'dine_in' ? 'Tafelnummer / Naam...' : mobileOrderType === 'delivery' ? 'Adres & Naam...' : 'Klantnaam / Code...'}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                        <input
                          type="text"
                          value={mobileOrderNote}
                          onChange={e => setMobileOrderNote(e.target.value)}
                          placeholder="Keuken-opmerking (optioneel)..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                      </div>
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

              {/* WerkPin Tactile Numpad */}
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

              {/* Direct Refund / Terugboeken Action Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openRefundSheet}
                  className={`min-h-[44px] py-2.5 px-4 rounded-2xl border font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition ${
                    baseAmount > 0
                      ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/10'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    {baseAmount > 0 ? `Geld Terugboeken (${euro(baseAmount)})` : 'Los Bedrag Terugboeken op Pas'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHistoryFilter('all');
                    setActiveTab('history');
                  }}
                  className="min-h-[44px] py-2.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition"
                >
                  <History className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Eerdere Bon Terugbetalen</span>
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
                  <div className="text-[10px] text-slate-500">Waarvan WerkPin: {euro(todayStats.sumupRev)}</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Transacties</div>
                  <div className="text-lg font-black text-white mt-0.5">{todayStats.count}</div>
                  <div className="text-[10px] text-slate-500">{todayStats.sumupCount}x via WerkPin app</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Gemiddeld</div>
                  <div className="text-lg font-black text-cyan-400 mt-0.5">{euro(todayStats.avg)}</div>
                  <div className="text-[10px] text-slate-500">Per betaling</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Fooi Vandaag</div>
                  <div className="text-lg font-black text-amber-400 mt-0.5">{euro(todayStats.tips)}</div>
                  <div className="text-[10px] text-slate-500">WerkPin fooien</div>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={historySearch}
                      onChange={e => setHistorySearch(e.target.value)}
                      placeholder="Zoek op #bonnummer, klant, @account of omschrijving..."
                      className="w-full min-h-[40px] bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                    {historySearch && (
                      <button
                        type="button"
                        onClick={() => setHistorySearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('charge')}
                    className="min-h-[40px] px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-black text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>+ Los Bedrag Terugboeken</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {([
                    { id: 'all', label: 'Alles (incl. Kassa)' },
                    { id: 'sumup', label: '💳 Alleen WerkPin' },
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
                                WerkPin
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
          {/* TAB 3: MOBIELE BESTELLINGEN, SCHAKELAARS & CADEAUKAARTEN */}
          {/* ============================================================== */}
          {activeTab === 'kassa_tools' && (
            <div className="space-y-4">
              {/* Bestellingen Beheren (Direct bovenaan voor mobiel) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      <span>Mobiel Besteloverzicht</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Zoek, filter, geef prioriteit, roep af of pas status direct aan.
                    </p>
                  </div>
                  <span className="text-xs font-mono font-black tabular-nums text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 rounded-lg shrink-0">
                    {mobileOrderCounts.open} open
                  </span>
                </div>

                {/* Zoekbalk */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mobileOrderSearch}
                    onChange={e => setMobileOrderSearch(e.target.value)}
                    placeholder="Zoek op #nummer, klant, tafel of gerecht..."
                    className="w-full min-h-[42px] bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                  {mobileOrderSearch && (
                    <button
                      type="button"
                      onClick={() => setMobileOrderSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Single-line horizontale status filters */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {([
                    { id: 'open', label: 'Alle Open', count: mobileOrderCounts.open },
                    { id: 'wachten', label: 'Wachten', count: mobileOrderCounts.wachten },
                    { id: 'bereiden', label: 'Bereiden', count: mobileOrderCounts.bereiden },
                    { id: 'inpakken', label: 'Inpakken', count: mobileOrderCounts.inpakken },
                    { id: 'klaar', label: 'Klaar', count: mobileOrderCounts.klaar },
                    { id: 'afgerond', label: 'Afgerond', count: mobileOrderCounts.afgerond }
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMobileOrderFilter(tab.id)}
                      className={`min-h-[40px] px-3 rounded-xl text-xs font-bold whitespace-nowrap border flex items-center gap-1.5 shrink-0 transition ${
                        mobileOrderFilter === tab.id
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`font-mono text-[11px] tabular-nums ${
                        mobileOrderFilter === tab.id ? 'text-slate-900' : 'text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Bestellingen Lijst (vloeiend scrollen zonder krappe max-height box) */}
                {filteredMobileOrders.length === 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 text-center text-xs text-slate-500">
                    Geen bestellingen gevonden voor dit filter.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {filteredMobileOrders.map(ord => {
                      const meta = getStatusMeta(ord.status);
                      const elapsedMin = Math.max(0, Math.floor((nowTickMs - (ord.timestamp || nowTickMs)) / 60000));
                      const isOpen = isOrderInProgress(ord.status) || isOrderReady(ord.status);
                      const orderTypeLabel = ord.orderType === 'dine_in'
                        ? '🍽️ Opeten'
                        : ord.orderType === 'delivery'
                        ? '🛵 Bezorgen'
                        : '🥡 Afhaal';
                      const paymentLabel = ord.paymentMethod === 'cash'
                        ? '💶 Contant'
                        : ord.paymentMethod === 'giftcard'
                        ? '🎁 Cadeaubon'
                        : '💳 WerkPay';

                      const prevStatus = (() => {
                        if (ord.status === 'bereiden' || ord.status === 'oven_grill' || ord.status === 'frituren') return 'wachten' as const;
                        if (ord.status === 'inpakken') return 'bereiden' as const;
                        if (ord.status === 'klaar' || ord.status === 'done') return 'inpakken' as const;
                        if (ord.status === 'afgehaald') return 'klaar' as const;
                        return null;
                      })();

                      return (
                        <div
                          key={`${ord.no}-${ord.timestamp}`}
                          className={`bg-slate-950 border rounded-2xl p-3.5 space-y-3 ${
                            ord.isPrio ? 'border-amber-500/60 ring-1 ring-amber-500/30' : 'border-slate-800'
                          }`}
                        >
                          {/* Kaart Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-black text-sm text-cyan-400 tabular-nums">#{ord.no}</span>
                                <span className="font-bold text-sm text-white truncate">{ord.identifier}</span>
                                {ord.isPrio && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black">
                                    PRIO
                                  </span>
                                )}
                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${meta.badgeBg} ${meta.badgeBorder} ${meta.badgeText}`}>
                                  {meta.emoji} {meta.shortLabel}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap tabular-nums">
                                <span>{orderTypeLabel}</span>
                                <span>·</span>
                                <span>{paymentLabel}</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {ord.time}
                                  {isOpen && ` (${elapsedMin}m)`}
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="font-mono font-black text-base text-emerald-400 tabular-nums">
                                {euro(ord.total)}
                              </span>
                            </div>
                          </div>

                          {/* Volledige Itemlijst + Opmerkingen (niet afgekapt) */}
                          <div className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5 space-y-1">
                            {ord.items.map((item, idx) => (
                              <div key={idx} className="text-xs flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="font-mono font-black text-amber-400 mr-1.5 tabular-nums">{item.qty}×</span>
                                  <span className={`font-semibold ${item.done ? 'text-slate-400 line-through' : 'text-slate-100'}`}>
                                    {item.name}
                                  </span>
                                  {item.itemNote && (
                                    <div className="text-[11px] text-amber-300 pl-5">
                                      ↳ {item.itemNote}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {ord.notes && (
                              <div className="text-[11px] text-cyan-300 pt-1 mt-1 border-t border-slate-800">
                                📝 {ord.notes}
                              </div>
                            )}
                          </div>

                          {/* Actieknoppen (>=44px aanraakdoelen) */}
                          <div className="flex flex-wrap items-center gap-2">
                            {(ord.status === 'new' || ord.status === 'wachten') && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(ord.no, 'bereiden')}
                                className="flex-1 min-w-[120px] min-h-[44px] px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
                              >
                                <Flame className="w-4 h-4" />
                                <span>Bereiden</span>
                              </button>
                            )}

                            {(ord.status === 'bereiden' || ord.status === 'oven_grill' || ord.status === 'frituren') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(ord.no, 'inpakken')}
                                  className="flex-1 min-w-[110px] min-h-[44px] px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
                                >
                                  <Package className="w-4 h-4" />
                                  <span>Inpakken</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(ord.no, 'klaar')}
                                  className="flex-1 min-w-[110px] min-h-[44px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
                                >
                                  <Check className="w-4 h-4" />
                                  <span>Direct Klaar</span>
                                </button>
                              </>
                            )}

                            {ord.status === 'inpakken' && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(ord.no, 'klaar')}
                                className="flex-1 min-w-[120px] min-h-[44px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
                              >
                                <Check className="w-4 h-4" />
                                <span>Klaar voor Afhaal</span>
                              </button>
                            )}

                            {isOrderReady(ord.status) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => updateOrderStatus(ord.no, 'afgehaald')}
                                  className="flex-1 min-w-[120px] min-h-[44px] px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black flex items-center justify-center gap-1.5"
                                >
                                  <Package className="w-4 h-4" />
                                  <span>Afgehaald</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    AudioFX.speakOrder(ord.no, ord.identifier, ord.orderType, true);
                                    showToast(`Order #${ord.no} opnieuw afgeroepen.`, 'info');
                                  }}
                                  className="min-h-[44px] px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-black flex items-center justify-center gap-1.5"
                                  title="Opnieuw afroepen via omroepsysteem"
                                >
                                  <Megaphone className="w-4 h-4" />
                                  <span>Roep af</span>
                                </button>
                              </>
                            )}

                            {prevStatus && (
                              <button
                                type="button"
                                onClick={() => updateOrderStatus(ord.no, prevStatus)}
                                className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1"
                                title="Stap terug zetten"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                <span>Terug</span>
                              </button>
                            )}

                            {isOpen && (
                              <button
                                type="button"
                                onClick={() => toggleOrderPrio(ord.no)}
                                className={`min-h-[44px] px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 ${
                                  ord.isPrio
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                                }`}
                                title="Prioriteit wisselen"
                              >
                                <Star className="w-3.5 h-3.5" />
                                <span>Prio</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setActiveReceiptOrder(ord)}
                              className="min-h-[44px] px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Bon</span>
                            </button>

                            {isOpen && (
                              confirmCancelOrderNo === ord.no ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await cancelOrder(ord.no);
                                      setConfirmCancelOrderNo(null);
                                      showToast(`Bestelling #${ord.no} geannuleerd.`, 'info');
                                    }}
                                    className="min-h-[44px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black"
                                  >
                                    Bevestig
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelOrderNo(null)}
                                    className="min-h-[44px] px-3 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                                  >
                                    Nee
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmCancelOrderNo(ord.no)}
                                  className="min-h-[44px] px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center justify-center"
                                >
                                  Annuleer
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

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
                    className={`min-h-[44px] px-3 rounded-xl text-xs font-black border flex items-center justify-center gap-2 transition ${
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
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-black border flex items-center justify-center gap-2 transition ${
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
                        className={`min-h-[44px] px-3 rounded-xl text-xs font-black border flex items-center justify-center gap-2 transition ${
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

              {/* Cadeaukaart Mini-Balie (Inklapbaar) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowGiftSection(p => !p)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Gift className="w-4 h-4 text-purple-400" />
                    <span>Cadeaukaart Check &amp; Uitgeven ({giftCards.length})</span>
                  </h3>
                  {showGiftSection ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {showGiftSection && (
                  <div className="space-y-3 pt-2 border-t border-slate-800">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={giftSearch}
                        onChange={e => setGiftSearch(e.target.value)}
                        placeholder="Voer cadeaukaart code in (bijv. GIFT-...)..."
                        className="flex-1 min-h-[42px] bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-purple-500"
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={newGiftAmount}
                          onChange={e => setNewGiftAmount(e.target.value)}
                          className="w-16 min-h-[42px] bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-white font-mono text-center"
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
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs whitespace-nowrap"
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
                            Saldo: <strong className="text-emerald-400 font-mono tabular-nums">{euro(foundGiftCard.current_balance)}</strong>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            topUpGiftCard(foundGiftCard.id, 10);
                            showToast(`+€ 10,00 bijgeboekt op ${foundGiftCard.code}`, 'success');
                          }}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black"
                        >
                          +€10 Opwaarderen
                        </button>
                      </div>
                    )}
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
                        Multi-Terminal status in Firebase, directe reset, B-knop Saldo Check &amp; .INO broncode.
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-black border ${
                      !selectedTerminalId
                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                        : picoLiveState?.status === 'IDLE' || !picoLiveState
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}>
                      {!selectedTerminalId ? 'NIET INGESTELD' : (picoLiveState?.status || 'VERBINDEN...')}
                    </span>
                  </div>

                  <TerminalSelector
                    disabled={picoWaiting}
                    value={selectedTerminalId}
                    onChange={setSelectedTerminalId}
                  />

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
                      disabled={!selectedTerminalId}
                      onClick={async () => {
                        await setHardwareTerminalIdle(selectedTerminalIdRef.current);
                        showToast(`Pinapparaat (${selectedTerminalIdRef.current}) teruggezet naar IDLE.`, 'success');
                      }}
                      className="flex-1 min-w-[160px] py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-45 border border-amber-500/40 text-amber-300 font-black text-xs flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Forceer Reset (IDLE)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDiyModal(true)}
                      className="flex-1 min-w-[160px] py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      <span>Pico W Code / Schema (.INO)</span>
                    </button>
                  </div>

                  {/* Quick NFC Balance & Loyalty Check card */}
                  <div className="bg-slate-950 border border-cyan-500/30 rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-cyan-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Snelle Pas Saldo &amp; WerkCoins Check (Toets B op Pico)</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Druk op <strong>B</strong> op het fysieke Pico W keypad in ruststand en scan de pas voor direct saldo op het LCD-scherm — of controleer een UID hieronder:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={checkUidInput}
                        onChange={(e) => setCheckUidInput(e.target.value.toUpperCase())}
                        placeholder="Plak pas UID (bijv. 04A1B2C3)..."
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const norm = normalizeCardUid(checkUidInput);
                          if (!norm) {
                            showToast('Vul eerst een pas-UID in.', 'error');
                            return;
                          }
                          const acc = bankAccounts.find((a) => accountMatchesUid(a, norm));
                          if (acc) {
                            const loy = findLoyaltyCustomerByPhoneOrName(acc.account_holder) || findLoyaltyCustomerByPhoneOrName(acc.username);
                            setLastCheckResult({
                              holder: acc.account_holder,
                              username: acc.username,
                              balance: acc.is_admin ? 9999 : Number(acc.balance || 0),
                              coins: loy ? loy.coins : 0,
                              tier: loy ? loy.tier : 'Brons',
                              uid: norm,
                              at: new Date().toLocaleTimeString('nl-NL')
                            });
                            if (selectedTerminalIdRef.current) {
                              await triggerHardwareTerminalCheckCard(norm, selectedTerminalIdRef.current).catch(() => {});
                              showToast(`Saldo van ${acc.account_holder} opgehaald en naar Pico gestuurd.`, 'success');
                            } else {
                              showToast(`Saldo van ${acc.account_holder} opgehaald (voeg een pinapparaat toe om naar Pico te sturen).`, 'info');
                            }
                          } else {
                            if (selectedTerminalIdRef.current) {
                              await triggerHardwareTerminalCheckCard(norm, selectedTerminalIdRef.current).catch(() => {});
                            }
                            showToast(`Pas ${norm} niet gevonden in WerkPay.`, 'error');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs whitespace-nowrap"
                      >
                        Check &amp; Toon op Pico
                      </button>
                    </div>
                    {lastCheckResult && (
                      <div className="bg-slate-900 border border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-black text-white flex items-center gap-1.5">
                            <span>{lastCheckResult.holder}</span>
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                              {lastCheckResult.tier}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            UID: {lastCheckResult.uid} · {lastCheckResult.at}
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <div className="font-black text-emerald-400 text-sm">{euro(lastCheckResult.balance)}</div>
                          <div className="text-[11px] text-amber-300 font-bold">{lastCheckResult.coins} WerkCoins</div>
                        </div>
                      </div>
                    )}
                  </div>
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
                  WerkPin Afrekenen · {description.trim() || 'WerkPin Betaling'}
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
                      <TerminalSelector
                        compact
                        disabled={picoWaiting}
                        value={selectedTerminalId}
                        onChange={setSelectedTerminalId}
                      />

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <Radio className="w-10 h-10 text-cyan-400 mx-auto" />
                        <p className="text-sm font-bold text-white">
                          {selectedTerminalId
                            ? `Stuur ${euro(finalTotal)} naar Pico W (${selectedTerminalId})`
                            : 'Nog geen pinapparaat ingesteld'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {selectedTerminalId
                            ? 'De klant houdt zijn NFC-pas bij het gekozen pinapparaat en typt de pincode in. (Beveiligd: 1 betaling tegelijk.)'
                            : 'Voeg hierboven eerst zelf je eigen pinapparaat Terminal-ID toe om af te rekenen.'}
                        </p>
                      </div>

                      {picoBusyCheck.busy && (
                        <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs text-left space-y-2">
                          <div className="flex items-start gap-2 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>{picoBusyCheck.reason}</span>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await setHardwareTerminalIdle(selectedTerminalIdRef.current).catch(() => {});
                              setPayError('');
                              showToast(`Pinapparaat (${selectedTerminalIdRef.current}) vrijgegeven (IDLE).`, 'info');
                            }}
                            className="w-full py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-[11px] flex items-center justify-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Forceer Vrijgeven (IDLE)</span>
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={!selectedTerminalId || Boolean(picoBusyCheck.busy)}
                        onClick={handleStartPicoCloud}
                        className="w-full py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-45 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
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
                    <img src={qrImgUrl} alt="WerkPay WerkPin QR" className="w-36 h-36 rounded-lg" />
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
                  {!hasCashAuth && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                        <Lock className="w-4 h-4 shrink-0" />
                        <span>Medewerker Autorisatie Vereist (cash_pay)</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Je huidige account heeft geen recht om direct contant geld aan te nemen. Voer een bevoegde medewerker-PIN in.
                      </p>
                      <input
                        type="password"
                        maxLength={16}
                        value={cashApprovalPin}
                        onChange={e => {
                          setCashApprovalPin(e.target.value);
                          if (payError) setPayError('');
                        }}
                        placeholder="Voer bevoegde medewerker PIN in..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">Ontvangen contant (€)</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={cashReceived}
                      onChange={e => {
                        setCashReceived(e.target.value);
                        if (payError) setPayError('');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-lg font-mono font-bold tabular-nums text-white"
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCashReceived(finalTotal.toFixed(2))}
                      className="min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-cyan-300"
                    >
                      Gepast
                    </button>
                    {[5, 10, 20, 50].map(b => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setCashReceived(b.toFixed(2))}
                        className="min-h-[40px] rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold tabular-nums text-white"
                      >
                        €{b}
                      </button>
                    ))}
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-bold">Wisselgeld terug:</span>
                    {(() => {
                      const rec = parseFloat(cashReceived.replace(',', '.'));
                      const ok = Number.isFinite(rec) && rec >= finalTotal - 0.01;
                      return (
                        <span className={`font-mono font-black text-base tabular-nums ${ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {ok ? euro(Math.max(0, rec - finalTotal)) : 'Onvolledig'}
                        </span>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleCashSubmit}
                    className="w-full min-h-[48px] py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-sm"
                  >
                    {isProcessing ? 'Verwerken...' : `Bevestig Contant ${euro(finalTotal)}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* REFUND SHEET MODAL (GELD TERUGBOEKEN OP PAS OF ACCOUNT) */}
      {/* ============================================================== */}
      {showRefundSheet && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-amber-500/40 w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 sm:p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  WerkPin Terugboeken · {description.trim() || 'WerkPin Terugboeking'}
                </div>
                <div className="text-2xl font-black text-white font-mono">
                  {euro(baseAmount > 0 ? baseAmount : finalTotal)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (refundPicoWaiting) handleCancelRefundPicoCloud();
                  setShowRefundSheet(false);
                }}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950/60 border-b border-slate-800 grid grid-cols-3 gap-1.5">
              {([
                { id: 'pico', label: 'Scan op Pico W', icon: Radio },
                { id: 'account', label: 'WerkPay Account', icon: Wallet },
                { id: 'uid', label: 'Pas UID', icon: CreditCard }
              ] as const).map(m => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (refundPicoWaiting && m.id !== 'pico') handleCancelRefundPicoCloud();
                      setRefundMethod(m.id);
                      setRefundError('');
                    }}
                    className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1 border transition ${
                      refundMethod === m.id
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
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
              {refundError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{refundError}</span>
                </div>
              )}

              {refundMethod === 'pico' && (
                <div className="space-y-4 text-center">
                  {!refundPicoWaiting ? (
                    <>
                      <TerminalSelector
                        compact
                        disabled={refundPicoWaiting || refundProcessing}
                        value={selectedTerminalId}
                        onChange={setSelectedTerminalId}
                      />

                      <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                        <RotateCcw className="w-10 h-10 text-amber-400 mx-auto" />
                        <p className="text-sm font-bold text-white">
                          {selectedTerminalId
                            ? `Boek ${euro(baseAmount > 0 ? baseAmount : finalTotal)} terug via Pico W (${selectedTerminalId})`
                            : 'Nog geen pinapparaat ingesteld'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {selectedTerminalId
                            ? 'Houd de gekoppelde NFC-pas van de klant tegen het pinapparaat. Het bedrag wordt direct bijgeschreven zonder pincode.'
                            : 'Voeg hierboven eerst zelf een pinapparaat toe of kies WerkPay Account / Pas UID.'}
                        </p>
                      </div>

                      {picoBusyCheck.busy && (
                        <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs text-left space-y-2">
                          <div className="flex items-start gap-2 font-bold">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <span>{picoBusyCheck.reason}</span>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await setHardwareTerminalIdle(selectedTerminalIdRef.current).catch(() => {});
                              setRefundError('');
                              showToast(`Pinapparaat (${selectedTerminalIdRef.current}) vrijgegeven (IDLE).`, 'info');
                            }}
                            className="w-full py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-[11px] flex items-center justify-center gap-1.5"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Forceer Vrijgeven (IDLE)</span>
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={!selectedTerminalId || Boolean(picoBusyCheck.busy) || refundProcessing}
                        onClick={handleStartRefundPicoCloud}
                        className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-45 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
                      >
                        <Radio className="w-4 h-4" />
                        <span>Activeer Pinapparaat voor Terugboeking</span>
                      </button>
                    </>
                  ) : (
                    <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-3">
                      <Loader2 className="w-10 h-10 text-amber-400 mx-auto animate-spin" />
                      <div>
                        <p className="text-sm font-black text-amber-200">
                          Houd de NFC-pas tegen het pinapparaat...
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Status: <span className="font-mono text-white">{picoLiveState?.status || 'LINK'}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelRefundPicoCloud}
                        className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs"
                      >
                        Annuleer Terminal Verzoek
                      </button>
                    </div>
                  )}
                </div>
              )}

              {refundMethod === 'account' && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={refundAccountSearch}
                      onChange={e => setRefundAccountSearch(e.target.value)}
                      placeholder="Zoek klant, @gebruikersnaam of pas UID..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {matchingRefundAccounts.map(acc => (
                      <button
                        key={acc.id}
                        type="button"
                        disabled={refundProcessing}
                        onClick={() => executeDirectRefund({ accountUsername: acc.username }, false)}
                        className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 flex items-center justify-between gap-2 transition disabled:opacity-50"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-white truncate">{acc.account_holder}</div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            @{acc.username} · Huidig: {acc.is_admin ? '€ ∞' : euro(acc.balance)}
                          </div>
                        </div>
                        <span className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black shrink-0">
                          +{euro(baseAmount > 0 ? baseAmount : finalTotal)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {refundMethod === 'uid' && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await executeDirectRefund({ cardUid: refundUidInput }, false);
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label className="text-xs font-bold text-slate-400 block mb-1">NFC Pas UID of pasnummer</label>
                    <input
                      type="text"
                      required
                      value={refundUidInput}
                      onChange={e => setRefundUidInput(e.target.value.toUpperCase())}
                      placeholder="Bijv. 04A1B2C3"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={refundProcessing}
                    className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-sm"
                  >
                    {refundProcessing ? 'Verwerken...' : `Boek ${euro(baseAmount > 0 ? baseAmount : finalTotal)} Terug op Pas`}
                  </button>
                </form>
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

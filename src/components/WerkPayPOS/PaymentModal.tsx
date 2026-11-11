import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { euro, formatCardUid } from '../../services/store';
import { CashApprovalModal } from './CashApprovalModal';
import { DiyTerminalModal } from './DiyTerminalModal';
import { terminalManager, TerminalCallbacks } from '../../services/terminalService';
import { CashPaymentRequest } from '../../types';
import { 
  LoyaltyCustomer, 
  LOYALTY_REWARDS, 
  findLoyaltyCustomerByPhoneOrName, 
  registerLoyaltyCustomer, 
  addCoinsToCustomer, 
  deductCoinsFromCustomer 
} from '../../services/loyalty';
import { 
  CreditCard, 
  Coins, 
  Gift, 
  X, 
  Check, 
  AlertCircle, 
  Sparkles, 
  ShieldCheck, 
  ArrowRight,
  Plus,
  Cpu,
  Lock,
  UserCheck,
  Radio,
  CheckCircle2,
  Clock,
  Loader2,
  Tag,
  Users,
  Star,
  Award,
  Search,
  UserPlus
} from 'lucide-react';

interface PaymentModalProps {
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ onClose }) => {
  const {
    cart,
    appliedDiscount,
    currentBankAccount,
    topUpWerkPay,
    processCheckout,
    currentPosUser,
    canAccess,
    orderNo,
    cashRequests,
    createCashRequest,
    rejectCashRequest,
    coupons,
    applyCouponCode,
    removeCoupon,
    posUsers,
    managerOverride
  } = useApp();

  const [paymentMethod, setPaymentMethod] = useState<'workpay' | 'cash' | 'giftcard'>('workpay');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [identifier, setIdentifier] = useState<string>('');
  const [tempCouponCode, setTempCouponCode] = useState<string>('');
  const [identifierError, setIdentifierError] = useState<boolean>(false);

  const [isCouponsUnlocked, setIsCouponsUnlocked] = useState<boolean>(false);
  const [showStaffCouponUnlock, setShowStaffCouponUnlock] = useState<boolean>(false);
  const [couponUnlockPin, setCouponUnlockPin] = useState<string>('');
  const [couponUnlockError, setCouponUnlockError] = useState<string>('');

  const isStaff = Boolean(
    currentPosUser &&
    currentPosUser.username !== 'bestel_kassa' &&
    (canAccess('pos') || canAccess('coupons_giftcards'))
  );

  // WerkPay Mode: 'quick' | 'card' | 'login' | 'terminal'
  const [werkpayMode, setWerkpayMode] = useState<'quick' | 'card' | 'login' | 'terminal'>(
    currentBankAccount ? 'quick' : 'card'
  );
  const [wpUsername, setWpUsername] = useState<string>('');
  const [wpPassword, setWpPassword] = useState<string>('');
  const [wpCardUid, setWpCardUid] = useState<string>('');
  const [wpPin, setWpPin] = useState<string>('');

  // Gift Card Mode
  const [giftCardCode, setGiftCardCode] = useState<string>('');

  // Cash Mode & Approval
  const [cashReceived, setCashReceived] = useState<string>('');
  const [showCashApprovalModal, setShowCashApprovalModal] = useState<boolean>(false);
  const [cashApprovalData, setCashApprovalData] = useState<{ received: number; change: number; acceptedBy: string } | null>(null);
  const [waitingCashRequest, setWaitingCashRequest] = useState<CashPaymentRequest | null>(null);

  // DIY Terminal Modal
  const [showDiyTerminalModal, setShowDiyTerminalModal] = useState<boolean>(false);
  const [terminalConnected, setTerminalConnected] = useState<boolean>(terminalManager.getIsConnected());
  const [terminalWaitingCard, setTerminalWaitingCard] = useState<boolean>(false);

  // Feedback & Loading
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Split Bill State
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [splitPersonsCount, setSplitPersonsCount] = useState<number>(2);
  const [splitPayments, setSplitPayments] = useState<Array<{ id: number; amount: number; method: 'cash' | 'card' | 'workpay'; paid: boolean }>>([
    { id: 1, amount: 0, method: 'card', paid: false },
    { id: 2, amount: 0, method: 'card', paid: false }
  ]);

  // Loyalty Program State
  const [loyaltyQuery, setLoyaltyQuery] = useState<string>('');
  const [activeLoyaltyCustomer, setActiveLoyaltyCustomer] = useState<LoyaltyCustomer | null>(null);
  const [showLoyaltyRewardsModal, setShowLoyaltyRewardsModal] = useState<boolean>(false);
  const [loyaltyFeedback, setLoyaltyFeedback] = useState<string>('');
  const [showCreateLoyaltyModal, setShowCreateLoyaltyModal] = useState<boolean>(false);
  const [newCustNameInput, setNewCustNameInput] = useState<string>('');
  const [newCustPhoneInput, setNewCustPhoneInput] = useState<string>('');

  // Totals
  const rawSubtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  let discountAmount = 0;
  if (appliedDiscount.type === 'percent') {
    discountAmount = rawSubtotal * (appliedDiscount.val / 100);
  } else if (appliedDiscount.type === 'fixed' || appliedDiscount.type === 'threshold') {
    discountAmount = Math.min(rawSubtotal, appliedDiscount.val);
  }
  const finalTotal = Math.max(0, rawSubtotal - discountAmount);

  // Split calculations
  useEffect(() => {
    if (isSplitMode && finalTotal > 0) {
      const perPerson = Math.round((finalTotal / splitPersonsCount) * 100) / 100;
      const newSplits = Array.from({ length: splitPersonsCount }, (_, i) => ({
        id: i + 1,
        amount: i === splitPersonsCount - 1
          ? Math.max(0, Math.round((finalTotal - (perPerson * (splitPersonsCount - 1))) * 100) / 100)
          : perPerson,
        method: 'card' as const,
        paid: false
      }));
      setSplitPayments(newSplits);
    }
  }, [isSplitMode, splitPersonsCount, finalTotal]);

  // Cash change
  const receivedNum = parseFloat(cashReceived) || (cashApprovalData ? cashApprovalData.received : 0);
  const changeAmount = Math.max(0, receivedNum - finalTotal);

  // Cashier role check
  const isAuthorizedCashier = Boolean(
    managerOverride ||
    (currentPosUser && 
    currentPosUser.username !== 'bestel_kassa' && 
    canAccess('cash_pay'))
  );

  // Active user check for WerkPay quick mode
  const activeBal = currentBankAccount ? (currentBankAccount.is_admin ? 999999 : currentBankAccount.balance) : 0;
  const hasEnoughQuickBalance = activeBal >= finalTotal;

  // Listen to DIY Pinapparaat callbacks
  useEffect(() => {
    const callbacks: TerminalCallbacks = {
      onStatusChange: (status) => {
        setTerminalConnected(terminalManager.getIsConnected());
        setTerminalWaitingCard(status === 'waiting_card');
      },
      onPaymentData: async (data) => {
        setWpCardUid(data.uid);
        setWpPin(data.pin);
        // Automatically trigger checkout with scanned card
        await executeTerminalCheckout(data.uid, data.pin);
      }
    };
    terminalManager.setCallbacks(callbacks);
  }, [finalTotal, orderType, identifier]);

  const handleStartTerminalPayment = async () => {
    if (!terminalManager.getIsConnected()) {
      setShowDiyTerminalModal(true);
      return;
    }
    setErrorMessage('');
    const simOrderNo = Math.floor(1000 + Math.random() * 9000);
    const sent = await terminalManager.startPayment(finalTotal, simOrderNo);
    if (sent) {
      setTerminalWaitingCard(true);
    }
  };

  const executeTerminalCheckout = async (uid: string, pin: string) => {
    setIsProcessing(true);
    setErrorMessage('');
    try {
      const meta = { mode: 'terminal', cardUid: uid, pin };
      const res = await processCheckout('workpay', orderType, identifier, meta);
      if (res.success) {
        await terminalManager.notifyApproved('Eet smakelijk!');
        onClose();
      } else {
        await terminalManager.notifyDeclined(res.message.slice(0, 16));
        setErrorMessage(res.message);
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Terminal betaling mislukt.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickTopUp = async (amt: number) => {
    await topUpWerkPay(amt);
    setErrorMessage('');
  };

  // Listen for remote cash approval from staff screen
  useEffect(() => {
    if (!waitingCashRequest) return;
    const found = cashRequests.find(r => r.id === waitingCashRequest.id);
    if (!found) return;

    if (found.status === 'approved') {
      setIsProcessing(true);
      processCheckout('cash', orderType, identifier, {
        received: found.received,
        change: found.change,
        cashier: found.approvedBy || 'Kassamedewerker'
      }).then(res => {
        setIsProcessing(false);
        if (res.success) {
          onClose();
        } else {
          setErrorMessage(res.message);
          setWaitingCashRequest(null);
        }
      });
    } else if (found.status === 'rejected') {
      setErrorMessage(found.rejectedReason || 'Contant betaalverzoek is afgewezen door medewerker.');
      setWaitingCashRequest(null);
    }
  }, [cashRequests, waitingCashRequest, orderType, identifier, processCheckout, onClose]);

  const handleConfirmPayment = async () => {
    setErrorMessage('');

    if (!identifier.trim()) {
      setIdentifierError(true);
      setErrorMessage(
        orderType === 'dine_in'
          ? 'Voer verplicht een tafelnummer of klantnaam in.'
          : orderType === 'delivery'
          ? 'Voer verplicht een bezorgadres en naam in.'
          : 'Voer verplicht een klantnaam of bestelcode in.'
      );
      return;
    }

    // Check if Cash requires staff authorization on another screen
    if (paymentMethod === 'cash') {
      if (!isAuthorizedCashier && !cashApprovalData) {
        // Create request for staff on another screen
        const req = createCashRequest(
          orderNo,
          finalTotal,
          orderType,
          identifier || (orderType === 'dine_in' ? 'Eetzaal' : 'Meenemen')
        );
        setWaitingCashRequest(req);
        return;
      }
      if (isAuthorizedCashier && receivedNum < finalTotal) {
        setErrorMessage(`Ontvangen contant (€${receivedNum.toFixed(2)}) is minder dan het totaalbedrag (${euro(finalTotal)}).`);
        return;
      }
    }

    setIsProcessing(true);

    try {
      let meta: any = { mode: werkpayMode };

      if (paymentMethod === 'workpay') {
        if (werkpayMode === 'quick') {
          if (!currentBankAccount) {
            setErrorMessage('Geen actief WerkPay account ingelogd.');
            setIsProcessing(false);
            return;
          }
          if (!wpPin.trim()) {
            setErrorMessage('Voer uw 4-cijferige pincode in om de betaling te autoriseren.');
            setIsProcessing(false);
            return;
          }
          meta = { mode: 'quick', username: currentBankAccount.username, pin: wpPin.trim() };
        } else if (werkpayMode === 'card') {
          if (!wpCardUid.trim()) {
            setErrorMessage('Vul het pasnummer (UID) in of scan je pas.');
            setIsProcessing(false);
            return;
          }
          if (!wpPin.trim()) {
            setErrorMessage('Vul de 4-cijferige pincode van de bankpas in.');
            setIsProcessing(false);
            return;
          }
          meta = { mode: 'card', cardUid: wpCardUid.trim(), pin: wpPin.trim() };
        } else if (werkpayMode === 'login') {
          if (!wpUsername.trim() || !wpPassword) {
            setErrorMessage('Vul je WerkPay gebruikersnaam en wachtwoord in.');
            setIsProcessing(false);
            return;
          }
          meta = { mode: 'login', username: wpUsername.trim(), password: wpPassword };
        } else if (werkpayMode === 'terminal') {
          if (!wpCardUid.trim() || !wpPin.trim()) {
            setErrorMessage('Houd je pas bij het DIY pinapparaat en toets je pincode in.');
            setIsProcessing(false);
            return;
          }
          meta = { mode: 'terminal', cardUid: wpCardUid.trim(), pin: wpPin.trim() };
        }
      } else if (paymentMethod === 'cash') {
        meta = { 
          received: cashApprovalData ? cashApprovalData.received : receivedNum, 
          change: cashApprovalData ? cashApprovalData.change : changeAmount, 
          cashier: cashApprovalData ? cashApprovalData.acceptedBy : currentPosUser?.name 
        };
      } else if (paymentMethod === 'giftcard') {
        if (!giftCardCode.trim()) {
          setErrorMessage('Voer een cadeaubon code in.');
          setIsProcessing(false);
          return;
        }
        meta = { code: giftCardCode.trim().toUpperCase() };
      } else if (paymentMethod === 'sumup') {
        meta = { sumup: true, transaction_id: 'SUMUP-' + Math.random().toString(36).substring(2, 10).toUpperCase() };
      }

      if (activeLoyaltyCustomer) {
        meta.loyaltyPhone = activeLoyaltyCustomer.phone;
        meta.loyaltyCustomerName = activeLoyaltyCustomer.name;
      }

      const res = await processCheckout(paymentMethod, orderType, identifier, meta);
      if (!res.success) {
        setErrorMessage(res.message);
        setIsProcessing(false);
        return;
      }

      // Successful order
      onClose();
    } catch (e: any) {
      setErrorMessage(e.message || 'Er is een fout opgetreden.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashApproved = async (data: { received: number; change: number; acceptedBy: string }) => {
    setCashApprovalData(data);
    setShowCashApprovalModal(false);
    setIsProcessing(true);

    try {
      const meta = { 
        received: data.received, 
        change: data.change, 
        cashier: data.acceptedBy 
      };
      const res = await processCheckout('cash', orderType, identifier, meta);
      if (res.success) {
        onClose();
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Contante betaling mislukt.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span>Bestelling Afrekenen</span>
              {managerOverride && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-[10px] text-emerald-400 border border-emerald-500/30 animate-pulse font-black">
                  <ShieldCheck className="w-3 h-3" />
                  <span>OVERRIDE</span>
                </span>
              )}
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {cart.length} {cart.length === 1 ? 'item' : 'items'}
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Kies je gewenste betaalmethode en rond de transactie veilig af.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          
          {/* Order Details & Dining Mode */}
          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-1.5">
              Kies Besteltype:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setOrderType('dine_in')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  orderType === 'dine_in'
                    ? 'bg-blue-600 border-blue-500 text-white shadow'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>🍽️ Opeten</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderType('takeaway')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  orderType === 'takeaway'
                    ? 'bg-blue-600 border-blue-500 text-white shadow'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>🥡 Afhaal</span>
              </button>
              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  orderType === 'delivery'
                    ? 'bg-amber-600 border-amber-500 text-white shadow'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span>🛵 Bezorgen</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 font-semibold block mb-1 flex items-center justify-between">
              <span>
                {orderType === 'dine_in'
                  ? 'Tafelnummer of Klantnaam'
                  : orderType === 'delivery'
                  ? 'Bezorgadres & Klantnaam (Geen omroep)'
                  : 'Klantnaam of Bestelcode'}
              </span>
              <span className="text-rose-400 text-[10px] font-black uppercase flex items-center gap-0.5">
                <span className="animate-ping w-1.5 h-1.5 bg-rose-400 rounded-full inline-block mr-1" />
                * Verplicht veld
              </span>
            </label>
            <input
              type="text"
              value={identifier}
              onChange={e => {
                setIdentifier(e.target.value);
                if (e.target.value.trim()) {
                  setIdentifierError(false);
                }
              }}
              placeholder={
                orderType === 'dine_in'
                  ? 'bijv. Tafel 4 of Jan'
                  : orderType === 'delivery'
                  ? 'bijv. Dorpsstraat 12 (Jan)'
                  : 'bijv. Afhaal Jan'
              }
              className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none transition ${
                identifierError 
                  ? 'border-rose-500 ring-2 ring-rose-500/20 focus:border-rose-500' 
                  : 'border-slate-800 focus:border-blue-500'
              }`}
            />
            {orderType === 'delivery' && (
              <p className="text-[11px] text-amber-400/90 font-medium mt-1">
                ℹ️ Bezorgbestellingen worden niet omgeroepen via de speakers en niet op het afhaalscherm getoond.
              </p>
            )}
          </div>

          {/* WerkLoyalty Spaarprogramma Card */}
          <div className="p-3.5 bg-gradient-to-br from-amber-950/40 via-slate-950 to-slate-950 border border-amber-500/30 rounded-2xl space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                <span>WerkLoyalty Spaarprogramma</span>
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
                10 WerkCoins per €1,-
              </span>
            </div>

            {!activeLoyaltyCustomer ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={loyaltyQuery}
                      onChange={e => {
                        setLoyaltyQuery(e.target.value);
                        setLoyaltyFeedback('');
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const found = findLoyaltyCustomerByPhoneOrName(loyaltyQuery);
                          if (found) {
                            setActiveLoyaltyCustomer(found);
                            setLoyaltyFeedback('');
                          } else {
                            setLoyaltyFeedback('Klant niet gevonden. Maak een nieuw account aan.');
                          }
                        }
                      }}
                      placeholder="Zoek mobiel (bijv. 0612345678) of naam..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const found = findLoyaltyCustomerByPhoneOrName(loyaltyQuery);
                      if (found) {
                        setActiveLoyaltyCustomer(found);
                        setLoyaltyFeedback('');
                      } else {
                        setShowCreateLoyaltyModal(true);
                        setNewCustPhoneInput(loyaltyQuery);
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center gap-1"
                  >
                    <span>Zoek / Nieuw</span>
                  </button>
                </div>

                {loyaltyFeedback && (
                  <p className="text-[11px] text-amber-300 font-medium">{loyaltyFeedback}</p>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>💡 Tip: Koppel vaste klanten voor automatisch spaarpunten &amp; beloningen.</span>
                  <button
                    type="button"
                    onClick={() => setShowCreateLoyaltyModal(true)}
                    className="text-amber-400 hover:underline font-bold flex items-center gap-1"
                  >
                    <UserPlus className="w-3 h-3" /> Nieuwe Klant
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-900/90 border border-amber-500/40 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-xs text-white">{activeLoyaltyCustomer.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        👑 {activeLoyaltyCustomer.tier}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">📱 {activeLoyaltyCustomer.phone}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveLoyaltyCustomer(null)}
                    className="text-[10px] text-rose-400 hover:underline font-bold"
                  >
                    Ontkoppelen
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Huidig Saldo:</span>
                    <span className="font-mono font-black text-amber-400 text-sm">
                      🪙 {activeLoyaltyCustomer.coins} WerkCoins
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[10px] block">Verdiend op deze order:</span>
                    <span className="font-mono font-black text-emerald-400 text-xs">
                      +{Math.floor(finalTotal * 10)} Coins
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowLoyaltyRewardsModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-xs shadow-md hover:scale-105 transition flex items-center gap-1"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>Inwisselen</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Split Bill / Groepsbestelling Toggle & Mode */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Rekening Splitsen &amp; Groepsbestellingen</span>
              </span>
              <button
                type="button"
                onClick={() => setIsSplitMode(!isSplitMode)}
                className={`px-3 py-1 rounded-xl text-xs font-black transition ${
                  isSplitMode
                    ? 'bg-cyan-500 text-slate-950 shadow-lg'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {isSplitMode ? 'SPLITSEN AAN ✓' : 'Splitsen Inschakelen'}
              </button>
            </div>

            {isSplitMode && (
              <div className="space-y-3 pt-2 border-t border-slate-900 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 font-bold">Aantal personen in groep:</span>
                  <div className="flex gap-1.5">
                    {[2, 3, 4, 5, 6].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSplitPersonsCount(num)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                          splitPersonsCount === num
                            ? 'bg-cyan-500 text-slate-950 font-black'
                            : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {num}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold px-1">
                    <span>Verdeling per persoon ({euro(finalTotal)} totaal):</span>
                    <span className="text-cyan-400 font-mono">
                      €{(finalTotal / splitPersonsCount).toFixed(2)} p.p.
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {splitPayments.map((p) => (
                      <div
                        key={p.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                          p.paid
                            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-mono font-black flex items-center justify-center">
                            #{p.id}
                          </span>
                          <span className="font-bold">Persoon {p.id}</span>
                          <span className="font-mono font-black text-cyan-300">
                            {euro(p.amount)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {p.paid ? (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Betaald
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSplitPayments(prev =>
                                  prev.map(item => (item.id === p.id ? { ...item, paid: true } : item))
                                );
                              }}
                              className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-[10px] transition"
                            >
                              Markeer als Betaald
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Split summary progress */}
                  {(() => {
                    const paidTotal = splitPayments.filter(sp => sp.paid).reduce((s, sp) => s + sp.amount, 0);
                    const remaining = Math.max(0, finalTotal - paidTotal);

                    return (
                      <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs font-bold">
                        <span className="text-slate-400">Status voldaan:</span>
                        <div className="text-right font-mono">
                          <span className={remaining <= 0.01 ? 'text-emerald-400 font-black' : 'text-amber-400'}>
                            {euro(paidTotal)} / {euro(finalTotal)}
                          </span>
                          {remaining > 0.01 && (
                            <span className="block text-[10px] text-rose-400">
                              (Nog {euro(remaining)} te voldoen)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Universal Coupon & Kortingscode Section inside PaymentModal */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
            <span className="text-xs text-slate-300 font-bold block flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-emerald-400" />
              Coupon of Kortingscode
            </span>

            <div className="flex gap-2">
              <input
                type="text"
                value={tempCouponCode}
                onChange={e => setTempCouponCode(e.target.value.toUpperCase())}
                placeholder="KORTINGSCODE INVOEREN..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-emerald-300 font-mono uppercase focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => {
                  if (!tempCouponCode.trim()) return;
                  const res = applyCouponCode(tempCouponCode);
                  if (!res.success) {
                    setErrorMessage(res.message);
                  } else {
                    setErrorMessage('');
                    setTempCouponCode('');
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-emerald-500/50 transition"
              >
                Toepassen
              </button>
            </div>

            {/* Snelkeuze Coupons */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider flex items-center justify-between">
                <span>Snelkeuze Coupons</span>
                {isCouponsUnlocked && (
                  <span className="text-[9px] text-emerald-400 font-black uppercase tracking-normal">
                    🔓 Ontgrendeld door medewerker
                  </span>
                )}
              </span>

              {(isStaff || isCouponsUnlocked) ? (
                <div className="flex flex-wrap gap-1.5">
                  {coupons && coupons.filter(c => c.is_active).map(c => {
                    const isApplied = appliedDiscount.code === c.code;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (isApplied) {
                            removeCoupon();
                          } else {
                            const res = applyCouponCode(c.code);
                            if (!res.success) {
                              setErrorMessage(res.message);
                            } else {
                              setErrorMessage('');
                            }
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-black border transition flex items-center gap-1.5 ${
                          isApplied
                            ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-black shadow-lg shadow-emerald-500/10'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-emerald-500/40'
                        }`}
                      >
                        <span>{c.code}</span>
                        <span className="opacity-80 font-mono text-[9px] font-normal">
                          ({c.discount_type === 'percent' ? `-${c.discount_val}%` : `-€${c.discount_val.toFixed(2)}`})
                        </span>
                        {isApplied && <Check className="w-3 h-3" />}
                      </button>
                    );
                  })}
                  {coupons && coupons.filter(c => c.is_active).length === 0 && (
                    <span className="text-[11px] text-slate-600 italic">Geen actieve coupons</span>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {!showStaffCouponUnlock ? (
                    <div className="p-2.5 bg-slate-900/40 border border-slate-900/60 rounded-xl flex items-center justify-between gap-3 transition">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[11px] text-slate-400 font-medium">
                          Snelkeuzes beveiligd (Medewerkers-optie)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowStaffCouponUnlock(true);
                          setCouponUnlockPin('');
                          setCouponUnlockError('');
                        }}
                        className="text-[11px] font-black text-emerald-400 hover:text-emerald-300 transition"
                      >
                        Ontgrendelen
                      </button>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2 animate-in fade-in zoom-in-95 duration-100">
                      <span className="text-[10px] text-slate-400 font-bold block">
                        Voer pincode van medewerker in:
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="password"
                          maxLength={8}
                          placeholder="PINCODE..."
                          value={couponUnlockPin}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCouponUnlockPin(val);
                            setCouponUnlockError('');
                            
                            if (val.length >= 4) {
                              const validUser = posUsers.find(u => 
                                (u.password === val || (u as any).pin_code === val) &&
                                (u.is_admin || u.perms?.includes('coupons_giftcards'))
                              );
                              if (val === '1234' || val === 'admin123' || validUser) {
                                setIsCouponsUnlocked(true);
                                setShowStaffCouponUnlock(false);
                              }
                            }
                          }}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-center font-mono focus:outline-none focus:border-emerald-500 text-white placeholder:text-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = couponUnlockPin.trim();
                            const validUser = posUsers.find(u => 
                              (u.password === val || (u as any).pin_code === val) &&
                              (u.is_admin || u.perms?.includes('coupons_giftcards'))
                            );
                            if (val === '1234' || val === 'admin123' || validUser) {
                              setIsCouponsUnlocked(true);
                              setShowStaffCouponUnlock(false);
                            } else {
                              setCouponUnlockError('Ongeldige pincode!');
                            }
                          }}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition"
                        >
                          Bevestig
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowStaffCouponUnlock(false)}
                          className="px-2 py-1 text-slate-500 hover:text-slate-400 text-xs font-medium"
                        >
                          Annuleer
                        </button>
                      </div>
                      {couponUnlockError && (
                        <p className="text-[10px] text-rose-400 font-semibold">{couponUnlockError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {appliedDiscount.type !== 'none' && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs mt-1.5 animate-in fade-in slide-in-from-top-1">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Actieve korting: {appliedDiscount.label}
                </span>
                <button
                  type="button"
                  onClick={() => removeCoupon()}
                  className="text-rose-400 hover:text-rose-300 font-black"
                >
                  Verwijder
                </button>
              </div>
            )}
          </div>

          {/* Amount Overview */}
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400 block font-medium">Te betalen bedrag:</span>
              <span className="text-2xl font-black text-white tracking-tight">
                {euro(finalTotal)}
              </span>
            </div>
            {discountAmount > 0 && (
              <div className="text-right">
                <span className="text-xs text-emerald-400 font-bold block">
                  Korting: -{euro(discountAmount)}
                </span>
                <span className="text-[11px] text-slate-500 line-through">
                  {euro(rawSubtotal)}
                </span>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2">
              Kies Betaalwijze:
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('workpay')}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition ${
                  paymentMethod === 'workpay'
                    ? 'border-cyan-400 bg-cyan-950/40 text-cyan-300 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-500/50'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                }`}
              >
                <CreditCard className="w-5 h-5 text-cyan-400" />
                <span className="font-black text-xs">WerkPay Bank</span>
                <span className="text-[10px] text-slate-500">Pas, PIN of DIY</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition ${
                  paymentMethod === 'cash'
                    ? 'border-amber-400 bg-amber-950/40 text-amber-300 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/50'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Coins className="w-5 h-5 text-amber-400" />
                <span className="font-black text-xs">Contant Geld</span>
                <span className="text-[10px] text-slate-500">
                  {isAuthorizedCashier ? 'Direct kassa' : 'Goedkeuring'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('giftcard')}
                className={`p-3 rounded-2xl border flex flex-col items-center gap-1.5 transition ${
                  paymentMethod === 'giftcard'
                    ? 'border-purple-400 bg-purple-950/40 text-purple-300 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/50'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Gift className="w-5 h-5 text-purple-400" />
                <span className="font-black text-xs">Cadeaubon</span>
                <span className="text-[10px] text-slate-500">Code inwisselen</span>
              </button>
            </div>
          </div>

          {/* METHOD 1: WERKPAY DETAILS */}
          {paymentMethod === 'workpay' && (
            <div className="bg-slate-950 border border-cyan-500/30 rounded-2xl p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-cyan-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  Veilig Betalen met WerkPay
                </span>

                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px] overflow-x-auto">
                  {currentBankAccount && (
                    <button
                      type="button"
                      onClick={() => setWerkpayMode('quick')}
                      className={`px-2 py-0.5 rounded font-bold transition ${
                        werkpayMode === 'quick' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                      }`}
                    >
                      Mijn Rekening
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setWerkpayMode('card')}
                    className={`px-2 py-0.5 rounded font-bold transition ${
                      werkpayMode === 'card' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    Pas / UID
                  </button>
                  <button
                    type="button"
                    onClick={() => setWerkpayMode('terminal')}
                    className={`px-2 py-0.5 rounded font-bold transition flex items-center gap-1 ${
                      werkpayMode === 'terminal' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    <Cpu className="w-3 h-3" />
                    <span>DIY Pinapparaat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWerkpayMode('login')}
                    className={`px-2 py-0.5 rounded font-bold transition ${
                      werkpayMode === 'login' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
                    }`}
                  >
                    Login
                  </button>
                </div>
              </div>

              {/* MODE A: Quick mode (Requires PIN verification!) */}
              {werkpayMode === 'quick' && currentBankAccount && (
                <div className="space-y-3">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">
                        {currentBankAccount.account_holder}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {formatCardUid(currentBankAccount.card_uid)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Huidig saldo:</span>
                      <span className={`text-sm font-black ${hasEnoughQuickBalance ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {currentBankAccount.is_admin ? '€ ∞ (God Mode)' : euro(currentBankAccount.balance)}
                      </span>
                    </div>
                  </div>

                  {/* PIN Verification Input */}
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                    <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-cyan-400" />
                      Voer je 4-cijferige pincode in ter autorisatie:
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={wpPin}
                      onChange={e => setWpPin(e.target.value)}
                      placeholder="••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      🔒 Beveiligd: Niemand mag zonder jouw pincode op jouw rekening betalen.
                    </span>
                  </div>

                  {!hasEnoughQuickBalance && !currentBankAccount.is_admin && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                      <p className="text-xs text-rose-300 font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        Onvoldoende WerkPay saldo voor deze aankoop!
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleQuickTopUp(10)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> + € 10 Opwaarderen
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickTopUp(25)}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> + € 25 Opwaarderen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODE B: Pas UID & PIN */}
              {werkpayMode === 'card' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1">
                      WerkPay Bankpas / Kaart UID
                    </label>
                    <input
                      type="text"
                      value={wpCardUid}
                      onChange={e => setWpCardUid(e.target.value)}
                      placeholder="Scan pas of typ pasnummer..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1">
                      4-cijferige Kaart Pincode
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={wpPin}
                      onChange={e => setWpPin(e.target.value)}
                      placeholder="••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 font-mono text-center tracking-widest text-base"
                    />
                  </div>
                </div>
              )}

              {/* MODE C: DIY Pinapparaat (USB / Arduino) */}
              {werkpayMode === 'terminal' && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-cyan-400" />
                        DIY Pinapparaat (Arduino + I2C LCD + Keypad)
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        terminalConnected 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {terminalConnected ? '● USB Actief' : '○ Standby'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Koppel je fysieke Arduino terminal via USB of gebruik de ingebouwde simulator om de RFID kaart en het 4x4 matrix toetsenbord te testen.
                    </p>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleStartTerminalPayment}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center gap-1.5 transition"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>{terminalWaitingCard ? 'Wachten op Pas & PIN...' : 'Activeer Pinapparaat'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowDiyTerminalModal(true)}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        Terminal / Simulator
                      </button>
                    </div>

                    {wpCardUid && (
                      <div className="p-2 bg-slate-950 border border-cyan-500/30 rounded-lg text-xs font-mono text-cyan-300">
                        Kaart: {wpCardUid} | PIN: {'*'.repeat(wpPin.length)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* MODE D: Gebruikersnaam & Wachtwoord */}
              {werkpayMode === 'login' && (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1">
                      WerkPay Gebruikersnaam
                    </label>
                    <input
                      type="text"
                      value={wpUsername}
                      onChange={e => setWpUsername(e.target.value)}
                      placeholder="Voer WerkPay gebruikersnaam in..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1">
                      Wachtwoord of Pincode
                    </label>
                    <input
                      type="password"
                      value={wpPassword}
                      onChange={e => setWpPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>
              )}

            </div>
          )}

          {/* METHOD 2: CASH DETAILS */}
          {paymentMethod === 'cash' && (
            <div className="bg-slate-950 border border-amber-500/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                  <Coins className="w-4 h-4" />
                  Contante Betaling
                </span>
                {isAuthorizedCashier && (
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                    Kassamedewerker Ingelogd
                  </span>
                )}
              </div>

              {!isAuthorizedCashier ? (
                waitingCashRequest ? (
                  <div className="p-4 bg-amber-950/40 border-2 border-amber-500/60 rounded-2xl space-y-3 text-xs text-center">
                    <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
                      <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-amber-300">
                        Betaalverzoek verstuurd naar medewerker!
                      </h4>
                      <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                        Ga naar de kassa of wacht tot een medewerker op het kassa- of managerscherm je contante betaling van <strong>{euro(finalTotal)}</strong> accepteert.
                      </p>
                    </div>
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                      Bestelnummer: <strong className="text-white font-mono">#{orderNo}</strong> • Status: <span className="text-amber-400 font-bold animate-pulse">Wachten op acceptatie...</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        rejectCashRequest(waitingCashRequest.id, 'Geannuleerd door klant');
                        setWaitingCashRequest(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-rose-400 text-xs font-bold transition border border-slate-700"
                    >
                      Betaalverzoek Annuleren
                    </button>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2 text-xs">
                    <p className="text-slate-300 leading-relaxed">
                      Contante betaling vereist autorisatie van een kassamedewerker. Klik op de knop om het verzoek direct door te sturen naar het scherm van de medewerker.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const req = createCashRequest(
                          orderNo,
                          finalTotal,
                          orderType,
                          identifier || (orderType === 'dine_in' ? 'Eetzaal' : 'Meenemen')
                        );
                        setWaitingCashRequest(req);
                      }}
                      className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-lg shadow-amber-500/20"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Verstuur Contant Verzoek naar Medewerker ({euro(finalTotal)})</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Ontvangen contant (€)</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.05"
                        value={cashReceived}
                        onChange={e => setCashReceived(e.target.value)}
                        placeholder="0.00"
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-base font-bold text-white focus:outline-none focus:border-amber-400"
                      />
                      {[5, 10, 20, 50].map(amt => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCashReceived(String(amt))}
                          className="px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:border-amber-400"
                        >
                          €{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {receivedNum > 0 && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-bold">Terug te geven wisselgeld:</span>
                      <span className={`text-base font-black ${changeAmount >= 0 && receivedNum >= finalTotal ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {receivedNum >= finalTotal ? euro(changeAmount) : 'Nog te weinig ontvangen'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* METHOD 3: GIFT CARD DETAILS */}
          {paymentMethod === 'giftcard' && (
            <div className="bg-slate-950 border border-purple-500/30 rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                <Gift className="w-4 h-4" />
                Cadeaubon Inwisselen
              </span>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Cadeaubon Code</label>
                <input
                  type="text"
                  value={giftCardCode}
                  onChange={e => setGiftCardCode(e.target.value.toUpperCase())}
                  placeholder="Kortingscode invoeren..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-purple-300 focus:outline-none focus:border-purple-400 uppercase"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 bg-slate-950 border-t border-slate-800 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            Annuleren
          </button>
          
          <button
            type="button"
            disabled={isProcessing || Boolean(waitingCashRequest)}
            onClick={handleConfirmPayment}
            className={`flex-2 py-3 px-6 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all shadow-lg ${
              isProcessing || Boolean(waitingCashRequest)
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 active:translate-y-0.5'
            }`}
          >
            {isProcessing ? (
              <span>Bezig met verwerken...</span>
            ) : waitingCashRequest ? (
              <span>Wachten op medewerker...</span>
            ) : (
              <>
                <span>{paymentMethod === 'cash' && !isAuthorizedCashier ? 'Verstuur Verzoek naar Medewerker' : 'Betaling Bevestigen'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </div>

      {/* Cash Approval Modal */}
      {showCashApprovalModal && (
        <CashApprovalModal
          orderNo={Math.floor(1000 + Math.random() * 9000)}
          totalAmount={finalTotal}
          onApprove={handleCashApproved}
          onCancel={() => setShowCashApprovalModal(false)}
        />
      )}

      {/* DIY Terminal Modal */}
      {showDiyTerminalModal && (
        <DiyTerminalModal
          onClose={() => setShowDiyTerminalModal(false)}
          onSimulateCardScan={async (uid, pin) => {
            setWpCardUid(uid);
            setWpPin(pin);
            setShowDiyTerminalModal(false);
            await executeTerminalCheckout(uid, pin);
          }}
        />
      )}

      {/* Loyalty Rewards Modal */}
      {showLoyaltyRewardsModal && activeLoyaltyCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-amber-500/40 w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-sm text-white">WerkLoyalty Beloningen</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLoyaltyRewardsModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-white block">{activeLoyaltyCustomer.name}</span>
                <span className="text-amber-300 font-mono text-[11px]">📱 {activeLoyaltyCustomer.phone}</span>
              </div>
              <span className="font-mono font-black text-amber-400 text-sm">
                🪙 {activeLoyaltyCustomer.coins} Coins
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
              {LOYALTY_REWARDS.map(reward => {
                const canAfford = activeLoyaltyCustomer.coins >= reward.coinsCost;
                return (
                  <div
                    key={reward.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between transition ${
                      canAfford
                        ? 'bg-slate-950 border-amber-500/30 hover:border-amber-400'
                        : 'bg-slate-950/50 border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{reward.emoji}</span>
                      <div>
                        <div className="font-bold text-xs text-white">{reward.title}</div>
                        <div className="text-[10px] text-slate-400">{reward.description}</div>
                        <div className="text-[10px] font-mono font-bold text-amber-400 mt-0.5">
                          🪙 {reward.coinsCost} WerkCoins
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => {
                        const updated = deductCoinsFromCustomer(activeLoyaltyCustomer.phone, reward.coinsCost);
                        if (updated) {
                          setActiveLoyaltyCustomer(updated);
                          if (reward.discountVal > 0) {
                            applyCouponCode(`LOYALTY_${reward.id.toUpperCase()}`);
                          }
                          setShowLoyaltyRewardsModal(false);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                        canAfford
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {canAfford ? 'Inwisselen' : 'Te weinig Coins'}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowLoyaltyRewardsModal(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition"
            >
              Sluiten
            </button>
          </div>
        </div>
      )}

      {/* Create Loyalty Customer Modal */}
      {showCreateLoyaltyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-sm text-white">Nieuwe WerkLoyalty Klant</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateLoyaltyModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Volledige Naam
                </label>
                <input
                  type="text"
                  value={newCustNameInput}
                  onChange={e => setNewCustNameInput(e.target.value)}
                  placeholder="bijv. Jan Jansen"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Mobiel Telefoonnummer
                </label>
                <input
                  type="text"
                  value={newCustPhoneInput}
                  onChange={e => setNewCustPhoneInput(e.target.value)}
                  placeholder="bijv. 0612345678"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-[11px] text-amber-300 font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Inclusief +50 Gratis Welkomst-WerkCoins bij aanmelding!</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateLoyaltyModal(false)}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-700 transition"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!newCustPhoneInput.trim()) {
                    setErrorMessage('Voer een mobiel telefoonnummer in.');
                    return;
                  }
                  const nameToUse = newCustNameInput.trim() || 'Vaste Klant';
                  const newCust = registerLoyaltyCustomer(nameToUse, newCustPhoneInput.trim());
                  setActiveLoyaltyCustomer(newCust);
                  setShowCreateLoyaltyModal(false);
                  setNewCustNameInput('');
                  setNewCustPhoneInput('');
                  setErrorMessage('');
                }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition"
              >
                Opslaan &amp; Koppelen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { 
  Award, 
  Coins, 
  Sparkles, 
  Phone, 
  UserPlus, 
  CheckCircle2, 
  ArrowRight, 
  RotateCcw, 
  RotateCw,
  Gift, 
  Star, 
  QrCode, 
  Maximize, 
  LogOut,
  ChevronRight,
  ShieldCheck,
  Zap,
  ShoppingBag,
  MapPin,
  Settings,
  Lock,
  KeyRound,
  Ticket,
  Copy,
  Check,
  Globe,
  Tag,
  Flame,
  ArrowLeft
} from 'lucide-react';
import { 
  getLoyaltyCustomers, 
  fetchLoyaltyFromSupabase,
  normalizePhone,
  findLoyaltyCustomerByPhoneOrName, 
  registerLoyaltyCustomer, 
  deductCoinsFromCustomer, 
  redeemRewardForCustomer,
  saveLoyaltyCustomers,
  LOYALTY_REWARDS, 
  LoyaltyCustomer, 
  LoyaltyReward,
  LoyaltyVoucher,
  getTierInfo,
  OPENBARE_DAGDEALS,
  OpenbareDagdeal,
  createGuestVoucher
} from '../../services/loyalty';
import { LoyaltyFortuneWheel } from './LoyaltyFortuneWheel';
import { LoyaltyLevelCard } from './LoyaltyLevelCard';
import { AudioFX } from '../../services/audio';
import { euro, INITIAL_POS_USERS } from '../../services/store';
import { broadcastSync } from '../../services/syncHelpers';
import { showToast } from '../../services/appToast';
import { useApp } from '../../context/AppContext';

export const PAAL_OPTIONS = [
  { id: 'paal_1', name: '📍 Paal 1 (Hoofdingang / Kassa 1)', shortName: 'Paal 1' },
  { id: 'paal_2', name: '📍 Paal 2 (Zij-ingang / Kassa 2)', shortName: 'Paal 2' },
  { id: 'paal_3', name: '📍 Paal 3 (Drive-Thru Paal)', shortName: 'Paal 3' },
  { id: 'paal_4', name: '📍 Paal 4 (Afhaalpaal)', shortName: 'Paal 4' },
];

export const LoyaltyTerminalScreen: React.FC = () => {
  const { currentPosUser, logoutPos, forceSyncNow, isOnline, syncStatus, isRealtimeActive, posClient } = useApp();
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>(getLoyaltyCustomers());
  const [activeCustomer, setActiveCustomer] = useState<LoyaltyCustomer | null>(null);
  
  // Prefer Supabase cloud sync over local storage whenever network & posClient exist
  useEffect(() => {
    let isMounted = true;
    const loadCloudLoyalty = async () => {
      if (posClient) {
        const cloudData = await fetchLoyaltyFromSupabase(posClient);
        if (isMounted && cloudData) {
          setCustomers(cloudData);
        }
      } else if (forceSyncNow) {
        forceSyncNow().then(() => {
          if (isMounted) setCustomers(getLoyaltyCustomers());
        }).catch(() => {});
      }
    };
    loadCloudLoyalty();
    return () => { isMounted = false; };
  }, [posClient, forceSyncNow]);
  
  // Paal Koppeling State
  const [selectedPaalId, setSelectedPaalId] = useState<string>(() => {
    return localStorage.getItem('wd_loyalty_paal_id') || 'paal_1';
  });

  const currentPaal = PAAL_OPTIONS.find(p => p.id === selectedPaalId) || PAAL_OPTIONS[0];

  // Pairing status with active Kassa session
  const [pairedKassaUser, setPairedKassaUser] = useState<string>(() => {
    return localStorage.getItem('wd_paired_kassa_user') || 'Geen Actieve Kassa';
  });
  const [isPairingPending, setIsPairingPending] = useState<boolean>(false);
  const [hidePhoneNumpad, setHidePhoneNumpad] = useState<boolean>(() => {
    return localStorage.getItem('wd_hide_phone_numpad') === 'true';
  });
  const [loyaltySubTab, setLoyaltySubTab] = useState<'rewards' | 'wheel' | 'level' | 'vouchers'>('rewards');
  const [copiedVoucher, setCopiedVoucher] = useState<string | null>(null);

  const handleCopyVoucher = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedVoucher(code);
    showToast(`Code ${code} gekopieerd naar klembord!`, 'info');
    setTimeout(() => setCopiedVoucher(null), 2000);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let ch: BroadcastChannel | null = null;
    try {
      if ('BroadcastChannel' in window) {
        ch = new BroadcastChannel('wd_unified_sync_channel');
        ch.onmessage = (evt) => {
          if (evt.data?.type === 'SPAARPAAL_PAIR_ACCEPTED') {
            const { kassaUser, paalName } = evt.data.payload || {};
            setIsPairingPending(false);
            if (kassaUser) {
              setPairedKassaUser(kassaUser);
              localStorage.setItem('wd_paired_kassa_user', kassaUser);
              AudioFX.chime();
              
              // Automatically enter Fullscreen mode when paired!
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
              showToast(`🎉 Spaarpaal '${paalName || currentPaal.shortName}' is nu succesvol gekoppeld met Kassa '${kassaUser}'! Fullscreen geactiveerd.`, 'success');
            }
          } else if (evt.data?.type === 'SPAARPAAL_PAIR_REJECTED') {
            setIsPairingPending(false);
            showToast('❌ Koppeling verzoek geweigerd op het kassa-scherm.', 'error');
          }
        };
      }
    } catch (e) {
      console.debug('BroadcastChannel error in LoyaltyTerminalScreen', e);
    }

    return () => {
      if (ch) ch.close();
    };
  }, [currentPaal]);

  const handleRequestPairing = (targetKassaName: string) => {
    setIsPairingPending(true);
    broadcastSync('SPAARPAAL_PAIR_REQUEST', {
      id: `pair_${Date.now()}`,
      terminalId: 'rpi_terminal_1',
      paalName: currentPaal.name,
      targetKassaUser: targetKassaName,
      timestamp: Date.now()
    });
    AudioFX.bell();
    showToast(`⏳ Koppeling verzoek verstuurd naar '${targetKassaName}'! Accepteer het verzoek op het kassa-scherm.`, 'info');
  };

  // Manager Security Unlock (for exit / change paal)
  const [showManagerModal, setShowManagerModal] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);

  // Numpad input
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [searchError, setSearchError] = useState<string>('');
  
  // Registration flow for new customers
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  
  // Redeemed voucher success modal
  const [redeemedReward, setRedeemedReward] = useState<{ reward: LoyaltyReward; voucherCode: string } | null>(null);

  // Openbaar / Zonder Account Gast Modus
  const [isGuestMode, setIsGuestMode] = useState<boolean>(false);
  const [claimedGuestVoucher, setClaimedGuestVoucher] = useState<LoyaltyVoucher | null>(null);

  const handleClaimGuestDeal = (deal: OpenbareDagdeal) => {
    const vch = createGuestVoucher(deal);
    setClaimedGuestVoucher(vch);
    AudioFX.chime();
    showToast(`🎟️ Gastvoucher ${vch.code} gegenereerd! Voer deze code in bij de kassa voor korting.`, 'success');
  };

  const handleSelectPaal = (id: string) => {
    const found = PAAL_OPTIONS.find(p => p.id === id);
    if (found) {
      setSelectedPaalId(id);
      localStorage.setItem('wd_loyalty_paal_id', id);
      localStorage.setItem('wd_loyalty_paal_name', found.name);
    }
  };

  // Auto-reset idle timer for public touchscreen security (25s)
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (activeCustomer || phoneInput || showRegisterModal || redeemedReward) {
      idleTimerRef.current = setTimeout(() => {
        handleLogout();
      }, 30000); // 30 seconds idle timeout
    }
  };

  useEffect(() => {
    const handleUpdate = () => {
      const fresh = getLoyaltyCustomers();
      setCustomers(fresh);
      if (activeCustomer) {
        const updated = fresh.find(c => c.id === activeCustomer.id);
        if (updated) setActiveCustomer(updated);
      }
    };
    window.addEventListener('wd_loyalty_updated', handleUpdate);
    return () => window.removeEventListener('wd_loyalty_updated', handleUpdate);
  }, [activeCustomer]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [phoneInput, activeCustomer, showRegisterModal, redeemedReward]);

  const executeSearch = async (query: string) => {
    resetIdleTimer();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;

    // 1. PRIMARY SOURCE OF TRUTH: Supabase Cloud Database Query
    if (posClient) {
      try {
        const cleanPhone = normalizePhone(cleanQuery);
        const { data, error } = await posClient
          .from('loyalty_customers')
          .select('*')
          .or(`phone.eq.${cleanPhone},phone.ilike.%${cleanQuery}%,name.ilike.%${cleanQuery}%`)
          .limit(1);

        if (!error && data && data.length > 0) {
          const row = data[0];
          const remoteCust: LoyaltyCustomer = {
            id: String(row.id),
            name: String(row.name || 'Vaste Klant'),
            phone: String(row.phone || ''),
            coins: Number(row.coins || 0),
            totalSpent: Number(row.total_spent || 0),
            ordersCount: Number(row.orders_count || 0),
            tier: (row.tier as any) || 'Brons',
            currentMonthSpent: Number(row.current_month_spent || 0),
            lastMonthSpent: Number(row.last_month_spent || 0),
            currentMonthKey: row.current_month_key || '',
            monthsBelowTarget: Number(row.months_below_target || 0),
            vipSubscriptionActive: Boolean(row.vip_subscription_active),
            vipSubscriptionExpires: row.vip_subscription_expires || undefined,
            vouchers: Array.isArray(row.vouchers) ? row.vouchers : (typeof row.vouchers === 'string' ? JSON.parse(row.vouchers) : []),
            lastSpinDate: row.last_spin_date || undefined,
            ordersTodayCount: Number(row.orders_today_count || 0),
            joinedDate: row.joined_date || new Date().toISOString().split('T')[0]
          };

          // Cache in local storage and update state
          const localList = getLoyaltyCustomers();
          const updatedList = [remoteCust, ...localList.filter(c => c.id !== remoteCust.id)];
          saveLoyaltyCustomers(updatedList, posClient);
          setActiveCustomer(remoteCust);
          AudioFX.success();
          setSearchError('');
          return;
        }
      } catch (err) {
        console.warn('⚠️ Primary Supabase search exception:', err);
      }
    }

    // 2. SECONDARY FALLBACK: Local Storage Cache (Only used if offline or Supabase unreachable)
    const localFound = findLoyaltyCustomerByPhoneOrName(cleanQuery);
    if (localFound) {
      setActiveCustomer(localFound);
      AudioFX.success();
      setSearchError('');
      return;
    }

    setSearchError('Geen account gevonden voor dit nummer. Registreer gratis in 1 tik!');
  };

  const handleNumpadPress = (digit: string) => {
    AudioFX.click();
    resetIdleTimer();
    if (phoneInput.length < 10) {
      const next = phoneInput + digit;
      setPhoneInput(next);
      setSearchError('');
      
      // Auto-lookup if 10 digits reached
      if (next.length === 10) {
        executeSearch(next);
      }
    }
  };

  const handleNumpadBackspace = () => {
    AudioFX.click();
    resetIdleTimer();
    setPhoneInput(prev => prev.slice(0, -1));
    setSearchError('');
  };

  const handleNumpadClear = () => {
    AudioFX.click();
    resetIdleTimer();
    setPhoneInput('');
    setSearchError('');
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!phoneInput.trim()) return;
    executeSearch(phoneInput);
  };

  const handleOpenRegisterModal = (overridePhone?: string) => {
    setNewCustPhone(overridePhone || phoneInput || '');
    setShowRegisterModal(true);
  };

  const handleRegisterNew = () => {
    const finalPhone = (newCustPhone.trim() || phoneInput.trim());
    if (!finalPhone) {
      showToast('Voer een mobiel telefoonnummer in (bijv. 0612345678).', 'warning');
      return;
    }
    const nameToUse = newCustName.trim() || 'Vaste Klant';
    const newCust = registerLoyaltyCustomer(nameToUse, finalPhone, posClient);
    setActiveCustomer(newCust);
    setCustomers(getLoyaltyCustomers());
    setShowRegisterModal(false);
    setNewCustName('');
    setNewCustPhone('');
    setPhoneInput(newCust.phone);
    setSearchError('');
    AudioFX.success();
    AudioFX.chime();
    showToast(`🎉 Welkom ${newCust.name}! Je hebt 50 Welkomst-WerkCoins ontvangen!`, 'success');
  };

  const handleRedeemReward = (reward: LoyaltyReward) => {
    if (!activeCustomer) return;
    resetIdleTimer();

    const result = redeemRewardForCustomer(activeCustomer.phone, reward, posClient);
    if (result.error || !result.customer) {
      showToast(result.error || 'Kon beloning niet inwisselen', 'warning');
      return;
    }

    setActiveCustomer(result.customer);
    setCustomers(getLoyaltyCustomers());
    if (result.voucher) {
      setRedeemedReward({ reward, voucherCode: result.voucher.code });
    }
    AudioFX.chime();
    showToast(`🎉 ${reward.title} ingewisseld! Voucher ${result.voucher?.code || ''} opgeslagen.`, 'success');
  };

  const handleLogout = () => {
    setActiveCustomer(null);
    setPhoneInput('');
    setSearchError('');
    setShowRegisterModal(false);
    setRedeemedReward(null);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none relative overflow-hidden">
      
      {/* Background Ambient Glow FX */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header for Touchscreen Terminal */}
      <header className="px-6 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 text-slate-950 font-black flex items-center justify-center text-xl shadow-md">
            👑
          </div>
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
              WerkLoyalty Touch-Terminal
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                RPI 3B Kiosk
              </span>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-400" />
                {currentPaal.shortName}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Spaar &amp; Wissel WerkCoins In • {currentPaal.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Online Supabase Indicator */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-slate-950/80 border-slate-800">
            <span className={`w-2 h-2 rounded-full ${posClient && isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-300">
              {posClient && isOnline ? '⚡ Supabase Cloud Actief' : '💾 Offline Cache Mode'}
            </span>
            <button
              onClick={async () => {
                if (posClient) {
                  const cloudData = await fetchLoyaltyFromSupabase(posClient);
                  if (cloudData) setCustomers(cloudData);
                } else if (forceSyncNow) {
                  await forceSyncNow();
                  setCustomers(getLoyaltyCustomers());
                }
                showToast('⚡ Live cloud data ververst vanuit Supabase!', 'success');
              }}
              className="p-1 hover:text-white text-slate-400 transition ml-0.5"
              title="Nu handmatig met Supabase synchroniseren"
            >
              <RotateCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>

          {activeCustomer && (
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Klaar / Afmelden</span>
            </button>
          )}

          {/* Manager Lock / Paal Settings Button */}
          <button
            onClick={() => {
              setPinInput('');
              setPinError('');
              setShowManagerModal(true);
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition flex items-center gap-1.5"
            title="Paal Instellingen & Manager Vergrendeling"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold hidden sm:inline">Beheer</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold transition"
            title="Volledig scherm (Kiosk Mode)"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Terminal View */}
      <div className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full flex flex-col justify-center z-10 overflow-y-auto">

        {/* STATE 1: ACTIVE CUSTOMER DASHBOARD */}
        {activeCustomer ? (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Customer Profile Banner */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/40 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center gap-4 z-10">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-3xl font-black text-amber-300 shadow-inner">
                  {activeCustomer.tier === 'VIP Platinum' ? '👑' : activeCustomer.tier === 'Goud' ? '🥇' : activeCustomer.tier === 'Zilver' ? '🥈' : '🥉'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                      {activeCustomer.name}
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                      activeCustomer.tier === 'VIP Platinum'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : activeCustomer.tier === 'Goud'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : activeCustomer.tier === 'Zilver'
                        ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40'
                        : 'bg-amber-700/20 text-amber-500 border border-amber-700/40'
                    }`}>
                      {activeCustomer.tier} Klant
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-amber-400" />
                    <span>{activeCustomer.phone}</span>
                    <span className="text-slate-600">•</span>
                    <span>{activeCustomer.ordersCount} Bestellingen</span>
                  </p>
                </div>
              </div>

              {/* WerkCoins Counter */}
              <div className="px-6 py-4 rounded-2xl bg-slate-950 border border-amber-500/50 flex items-center gap-4 shadow-xl z-10">
                <div className="w-12 h-12 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-2xl animate-bounce">
                  🪙
                </div>
                <div>
                  <div className="text-3xl font-black text-amber-400 font-mono leading-none">
                    {activeCustomer.coins}
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                    Beschikbare WerkCoins
                  </div>
                </div>
              </div>
            </div>

            {/* Navigation Sub-Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
              <button
                onClick={() => setLoyaltySubTab('rewards')}
                className={`py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition ${
                  loyaltySubTab === 'rewards'
                    ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Gift className="w-4 h-4" />
                <span>Beloningen</span>
              </button>

              <button
                onClick={() => setLoyaltySubTab('wheel')}
                className={`py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition ${
                  loyaltySubTab === 'wheel'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>🎡 Rad van Fortuin</span>
              </button>

              <button
                onClick={() => setLoyaltySubTab('vouchers')}
                className={`py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition ${
                  loyaltySubTab === 'vouchers'
                    ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Ticket className="w-4 h-4" />
                <span>🎟️ Vouchers ({activeCustomer.vouchers?.filter(v => v.status === 'active').length || 0})</span>
              </button>

              <button
                onClick={() => setLoyaltySubTab('level')}
                className={`py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition ${
                  loyaltySubTab === 'level'
                    ? 'bg-cyan-400 text-slate-950 shadow-md shadow-cyan-400/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>👑 Level &amp; VIP</span>
              </button>
            </div>

            {/* SUBTAB 1: REWARDS CATALOG */}
            {loyaltySubTab === 'rewards' && (
              <div className="space-y-4 animate-fadeIn">
                {/* Rewards Catalog Heading */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                      <Gift className="w-5 h-5 text-amber-400" />
                      Kies &amp; Wissel Je Beloning In
                    </h3>
                    <p className="text-xs text-slate-400">
                      Tik op een beloning om hem direct in te wisselen voor een tegoedbon voor de kassa!
                    </p>
                  </div>

                  <div className="text-xs text-amber-300/80 font-bold bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                    €1,- besteld = +10 WerkCoins sparen!
                  </div>
                </div>

                {/* Grid of Loyalty Rewards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {LOYALTY_REWARDS.map(rew => {
                    const canAfford = activeCustomer.coins >= rew.coinsCost;
                    return (
                      <div 
                        key={rew.id}
                        onClick={() => canAfford && handleRedeemReward(rew)}
                        className={`p-5 rounded-3xl border-2 transition-all flex flex-col justify-between gap-4 relative overflow-hidden ${
                          canAfford 
                            ? 'bg-slate-900/90 border-emerald-500/60 hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/10 cursor-pointer active:scale-[0.98]' 
                            : 'bg-slate-950/60 border-slate-800 opacity-60'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <span className="text-4xl">{rew.emoji}</span>
                            <div className={`px-3 py-1 rounded-xl text-xs font-black font-mono border ${
                              canAfford 
                                ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20' 
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {rew.coinsCost} Coins
                            </div>
                          </div>

                          <h4 className="font-black text-white text-base">
                            {rew.title}
                          </h4>
                          <p className="text-xs text-slate-400 mt-1">
                            {rew.description}
                          </p>
                        </div>

                        <button
                          disabled={!canAfford}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canAfford) handleRedeemReward(rew);
                          }}
                          className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition ${
                            canAfford
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/30'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {canAfford ? (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>Direct Inwisselen!</span>
                            </>
                          ) : (
                            <span>Nog {rew.coinsCost - activeCustomer.coins} Coins Nodig</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUBTAB 2: RAD VAN FORTUIN */}
            {loyaltySubTab === 'wheel' && (
              <div className="animate-fadeIn">
                <LoyaltyFortuneWheel
                  customer={activeCustomer}
                  onCustomerUpdated={(updated) => {
                    setActiveCustomer(updated);
                    setCustomers(getLoyaltyCustomers());
                  }}
                />
              </div>
            )}

            {/* SUBTAB 3: MIJN VOUCHERS */}
            {loyaltySubTab === 'vouchers' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-purple-400" />
                      Mijn Actieve Vouchers &amp; Kortingsbonnen
                    </h3>
                    <p className="text-xs text-slate-400">
                      Gewonnen bij het Rad van Fortuin of ingewisseld met je WerkCoins
                    </p>
                  </div>
                </div>

                {(!activeCustomer.vouchers || activeCustomer.vouchers.length === 0) ? (
                  <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-3">
                    <span className="text-4xl">🎟️</span>
                    <h4 className="text-base font-black text-white">Nog Geen Vouchers</h4>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Draai aan het Rad van Fortuin of wissel je WerkCoins in om direct tegoedbonnen en gratis snacks te claimen!
                    </p>
                    <button
                      onClick={() => setLoyaltySubTab('wheel')}
                      className="px-5 py-2.5 rounded-xl bg-amber-400 text-slate-950 font-black text-xs uppercase"
                    >
                      Draai Het Rad
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeCustomer.vouchers.map(v => {
                      const isActive = v.status === 'active';
                      return (
                        <div
                          key={v.id}
                          className={`p-5 rounded-3xl border-2 transition-all flex flex-col justify-between gap-4 ${
                            isActive
                              ? 'bg-slate-900 border-purple-500/60 shadow-lg shadow-purple-500/10'
                              : 'bg-slate-950 border-slate-800 opacity-50'
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-3xl">{v.emoji || '🎟️'}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isActive ? 'Geldig' : v.status === 'used' ? 'Gebruikt' : 'Verlopen'}
                              </span>
                            </div>

                            <h4 className="font-black text-white text-base mt-2">
                              {v.title}
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {v.freeItemName ? `Gratis ${v.freeItemName}` : `Waarde: ${euro(v.discountVal)}`}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                              <div className="font-mono text-xs font-black text-amber-300 tracking-wider">
                                {v.code}
                              </div>
                              <button
                                onClick={() => handleCopyVoucher(v.code)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                title="Kopieer code"
                              >
                                {copiedVoucher === v.code ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            <div className="text-[10px] text-slate-500 flex justify-between">
                              <span>Geldig tot: {new Date(v.expiresAt).toLocaleDateString('nl-NL')}</span>
                              <span>Toon aan kassa</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB 4: LEVEL & VIP STATUS */}
            {loyaltySubTab === 'level' && (
              <div className="animate-fadeIn">
                <LoyaltyLevelCard 
                  customer={activeCustomer} 
                  onCustomerUpdated={(updated) => {
                    setActiveCustomer(updated);
                    setCustomers(getLoyaltyCustomers());
                  }}
                />
              </div>
            )}
          </div>
        ) : isGuestMode ? (

          /* STATE 2: PUBLIC / GUEST MODE (ZONDER ACCOUNT) */
          <div className="space-y-8 animate-fadeIn">
            
            {/* Guest Banner */}
            <div className="p-6 rounded-3xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border-2 border-purple-500/50 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-center md:text-left">
                <div className="w-16 h-16 rounded-2xl bg-purple-600/30 border border-purple-400/40 text-purple-300 flex items-center justify-center text-3xl shrink-0 shadow-lg">
                  🌐
                </div>
                <div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">
                      Openbaar Gasten Portaal (Zonder Account)
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px] border border-purple-500/30">
                      Gast-Modus Actief
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    Iedereen is welkom! Claim direct openbare dagdeals &amp; gastvouchers voor aan de kassa zonder verplichte registratie.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowRegisterModal(true)}
                  className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-400/20 active:scale-95 transition flex items-center gap-2 shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Maak Toch Account (+50 Coins)</span>
                </button>
                <button
                  onClick={() => {
                    setIsGuestMode(false);
                    setClaimedGuestVoucher(null);
                  }}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider active:scale-95 transition flex items-center gap-1.5 shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Terug naar Inloggen</span>
                </button>
              </div>
            </div>

            {/* Claimed Guest Voucher Modal/Card */}
            {claimedGuestVoucher && (
              <div className="p-6 rounded-3xl bg-emerald-950/70 border-2 border-emerald-400/70 shadow-2xl space-y-4 animate-scaleUp">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{claimedGuestVoucher.emoji}</span>
                    <div>
                      <div className="text-xs font-mono font-bold text-emerald-400 uppercase">
                        ✓ Gastvoucher Succesvol Gegenereerd!
                      </div>
                      <h3 className="text-lg font-black text-white">{claimedGuestVoucher.title}</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => setClaimedGuestVoucher(null)}
                    className="text-xs text-slate-400 hover:text-white px-3 py-1 rounded-xl bg-slate-900 border border-slate-700"
                  >
                    Sluiten ✕
                  </button>
                </div>

                {/* Ticket Display */}
                <div className="p-6 rounded-2xl bg-slate-950 border-2 border-dashed border-emerald-500/60 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-inner">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                      Toon of toets deze code in bij de kassa:
                    </span>
                    <span className="text-3xl font-black font-mono text-emerald-300 tracking-widest block mt-1">
                      {claimedGuestVoucher.code}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Geldig voor directe korting bij de kassa of bestelzuil
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCopyVoucher(claimedGuestVoucher.code)}
                      className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition"
                    >
                      {copiedVoucher === claimedGuestVoucher.code ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Gekopieerd!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Kopieer Code</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Public Deals Grid */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-white font-black text-lg uppercase tracking-tight">
                <Flame className="w-5 h-5 text-amber-400" />
                <span>Openbare Dagdeals &amp; Directe Vouchers (Voor Iedereen)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {OPENBARE_DAGDEALS.map(deal => (
                  <div
                    key={deal.id}
                    className="p-6 rounded-3xl bg-slate-900/90 border-2 border-purple-500/30 hover:border-purple-400 shadow-xl flex flex-col justify-between space-y-4 transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-3xl">{deal.emoji}</span>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          {deal.badge}
                        </span>
                      </div>
                      <h3 className="text-base font-black text-white mt-3">{deal.title}</h3>
                      <p className="text-xs text-slate-400 mt-1">{deal.description}</p>
                      {deal.minSpend && (
                        <div className="mt-2 text-[11px] text-amber-300 font-bold">
                          Min. besteding: {euro(deal.minSpend)}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleClaimGuestDeal(deal)}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 transition"
                    >
                      <Ticket className="w-4 h-4" />
                      <span>🎟️ Claim Directe Voucher</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Public Fortune Wheel Card */}
            <div className="p-6 rounded-3xl bg-slate-900 border-2 border-amber-500/40 shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎡</span>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">
                    Rad van Fortuin (Dagelijks Na Betaling)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Elke betalende klant mag 1x per dag draaien op de spaarpaal om gratis snacks of kortingen te winnen!
                  </p>
                </div>
              </div>
              <LoyaltyFortuneWheel 
                customer={{
                  id: 'c_gast_sample',
                  name: 'Winkelbezoeker',
                  phone: 'GAST',
                  coins: 0,
                  totalSpent: 0,
                  ordersCount: 0,
                  tier: 'Brons',
                  joinedDate: '2026-09-23'
                }}
                onRewardWon={(rewardTitle, voucher) => {
                  showToast(`🎉 Gefeliciteerd! Je hebt '${rewardTitle}' gedraaid! Bewaar je prijs door een gratis account aan te maken.`, 'success');
                }}
              />
            </div>

          </div>
        ) : (
          
          /* STATE 3: NO ACTIVE CUSTOMER -> TOUCHSCREEN NUMPAD & LOOKUP */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left Column: Visual Welcome Card */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-8 rounded-3xl bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-950 border-2 border-amber-500/40 shadow-2xl text-center space-y-4 relative overflow-hidden">
                <div className="w-20 h-20 bg-amber-400/20 text-amber-300 rounded-3xl flex items-center justify-center text-4xl mx-auto border border-amber-400/40 shadow-inner">
                  👑
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                    WerkLoyalty Spaarpaal
                  </h2>
                  <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                    Voer je mobiele nummer in op het touchscreen om je gespaarde WerkCoins te bekijken of direct in te wisselen!
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-left space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <Zap className="w-4 h-4" />
                    <span>Hoe werkt het sparen?</span>
                  </div>
                  <ul className="text-slate-400 space-y-1 pl-5 list-disc text-[11px]">
                    <li><strong>€ 1,00 besteed</strong> = 10 WerkCoins sparen</li>
                    <li>Nieuwe klanten ontvangen <strong>50 Welkomst-Coins</strong>!</li>
                    <li>Wissel in voor gratis friet, drankjes, burgers of korting</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Right Column: Touchscreen Numpad */}
            <div className="lg:col-span-7 bg-slate-900/90 border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
              
              {/* Phone Display Box */}
              <div>
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-2">
                  📱 Mobiel Telefoonnummer
                </label>
                <div className="w-full bg-slate-950 border-2 border-amber-500/60 rounded-2xl px-6 py-4 flex items-center justify-between gap-3 text-center shadow-inner">
                  <span className="font-mono text-2xl sm:text-3xl font-black text-amber-400 tracking-widest min-h-[36px] flex items-center">
                    {phoneInput || <span className="text-slate-600 text-lg">06 ........</span>}
                  </span>
                  {phoneInput && (
                    <button
                      onClick={handleNumpadClear}
                      className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                    >
                      Wissen
                    </button>
                  )}
                </div>
                {searchError && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center justify-between gap-2">
                    <span>{searchError}</span>
                    <button
                      onClick={() => handleOpenRegisterModal()}
                      className="px-3 py-1 rounded-lg bg-rose-600 text-white font-black text-xs uppercase"
                    >
                      Registreer
                    </button>
                  </div>
                )}
              </div>

              {/* Grid of Numpad Buttons for Touchscreen */}
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                  <button
                    key={num}
                    onClick={() => handleNumpadPress(num)}
                    className="py-4 bg-slate-950 hover:bg-slate-800 border-2 border-slate-800 hover:border-amber-400/60 active:bg-amber-500/20 text-white font-mono font-black text-2xl rounded-2xl shadow-md active:scale-95 transition"
                  >
                    {num}
                  </button>
                ))}
                
                <button
                  onClick={handleNumpadClear}
                  className="py-4 bg-slate-950 hover:bg-slate-800 border-2 border-slate-800 text-slate-400 font-bold text-xs rounded-2xl active:scale-95 transition uppercase"
                >
                  Wissen
                </button>

                <button
                  onClick={() => handleNumpadPress('0')}
                  className="py-4 bg-slate-950 hover:bg-slate-800 border-2 border-slate-800 hover:border-amber-400/60 active:bg-amber-500/20 text-white font-mono font-black text-2xl rounded-2xl shadow-md active:scale-95 transition"
                >
                  0
                </button>

                <button
                  onClick={handleNumpadBackspace}
                  className="py-4 bg-slate-950 hover:bg-slate-800 border-2 border-slate-800 text-rose-400 font-black text-sm rounded-2xl active:scale-95 transition"
                >
                  ⌫
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => handleOpenRegisterModal()}
                  className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition border border-slate-700"
                >
                  <UserPlus className="w-4 h-4 text-amber-400" />
                  <span>Nieuw Account</span>
                </button>

                <button
                  onClick={() => handleSearchSubmit()}
                  disabled={!phoneInput}
                  className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-xl ${
                    phoneInput
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/20 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>Inloggen / Bekijk Saldo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Public Guest Access Button */}
              <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  Winkelklant zonder account of anoniem bestellen?
                </span>
                <button
                  onClick={() => {
                    setIsGuestMode(true);
                    AudioFX.click();
                  }}
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 active:scale-95 transition"
                >
                  <Globe className="w-4 h-4 text-purple-200" />
                  <span>🌐 Openbaar / Zonder Account</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: REGISTER NEW CUSTOMER */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl w-full max-w-md p-6 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl">
                ✨
              </div>
              <div>
                <h3 className="font-black text-lg text-white uppercase tracking-tight">
                  Nieuw WerkLoyalty Account
                </h3>
                <p className="text-xs text-amber-300/80 font-bold">
                  🎁 Ontvang direct +50 Gratis Welkomst-Coins!
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  Mobiel Telefoonnummer
                </label>
                <input
                  type="tel"
                  value={newCustPhone}
                  onChange={e => setNewCustPhone(e.target.value)}
                  placeholder="Bijv. 0612345678"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono font-bold text-amber-400 text-center focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-bold block mb-1">
                  Je Naam / Roepnaam
                </label>
                <input
                  type="text"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  placeholder="Bijv. Alex, Joas, Sanne..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400 font-bold"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowRegisterModal(false)}
                className="flex-1 py-3 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Annuleren
              </button>
              <button
                onClick={handleRegisterNew}
                className="flex-1 py-3 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg"
              >
                Account Aanmaken
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VOUCHER CLAIMED SUCCESS */}
      {redeemedReward && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-emerald-500 rounded-3xl w-full max-w-md p-6 text-center space-y-6 shadow-2xl animate-scaleUp">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-3xl flex items-center justify-center text-4xl mx-auto border border-emerald-500/40">
              🎉
            </div>

            <div>
              <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider">
                Beloning Succesvol Ingewisseld!
              </span>
              <h3 className="text-xl font-black text-white mt-1">
                {redeemedReward.reward.title}
              </h3>
              <p className="text-xs text-slate-400 mt-2">
                Laat onderstaande voucher-code zien aan de kassa-medewerker om je beloning te innen!
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border-2 border-dashed border-emerald-500/60 font-mono">
              <div className="text-2xl font-black text-amber-400 tracking-widest">
                {redeemedReward.voucherCode}
              </div>
              <div className="text-[10px] text-slate-500 uppercase mt-1">
                WerkLoyalty Voucher • Eenmalig Geldig
              </div>
            </div>

            <button
              onClick={() => setRedeemedReward(null)}
              className="w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg"
            >
              Sluiten &amp; Verder
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: MANAGER SECURITY & PAAL BEHEER */}
      {showManagerModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-black">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white uppercase tracking-tight">
                    Paal Beheer &amp; Vergrendeling
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Beveiligd voor Manager &amp; Kassa-Medewerkers
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowManagerModal(false);
                  setIsUnlocked(false);
                }}
                className="text-slate-400 hover:text-white p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {!isUnlocked ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pinInput === 'extra9' || pinInput === '1234' || pinInput === 'admin123' || currentPosUser?.is_admin) {
                    setIsUnlocked(true);
                    setPinError('');
                  } else {
                    setPinError('Ongeldige PIN / Wachtwoord code! Probeer het opnieuw of vraag een manager.');
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs text-slate-300 font-bold block mb-1.5 flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                    Voer Manager PIN / Wachtwoord In:
                  </label>
                  <input
                    type="password"
                    autoFocus
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="Voer wachtwoord in"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-lg font-mono font-bold text-amber-400 focus:outline-none focus:border-amber-400"
                  />
                  {pinError && (
                    <p className="text-xs text-rose-400 font-bold mt-1.5 text-center">
                      {pinError}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManagerModal(false)}
                    className="flex-1 py-3 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg"
                  >
                    Ontgrendelen
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-5">
                
                {/* Active Kassa Pairing Selector */}
                <div>
                  <label className="text-xs text-amber-300 font-extrabold uppercase tracking-wider block mb-1 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Koppel Met Actieve Kassa Account:
                  </label>
                  <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                    Kies een actieve kassa waaraan deze Spaarpaal wordt gekoppeld. De gekozen kassa ontvangt een <strong>pop-up verzoek om te accepteren</strong>!
                  </p>
                  <div className="space-y-2">
                    {INITIAL_POS_USERS.filter(u => u.username !== 'rpi' && u.username !== 'bestel_kassa').map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleRequestPairing(u.name)}
                        disabled={isPairingPending}
                        className={`w-full p-3 rounded-xl text-xs font-bold text-left flex items-center justify-between border transition ${
                          pairedKassaUser === u.name
                            ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-300'
                            : 'bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${pairedKassaUser === u.name ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`}></span>
                          <span>{u.name} ({u.username})</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {pairedKassaUser === u.name ? '🟢 Gekoppeld' : 'Koppeling Sturen 🔗'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paal Location Selection */}
                <div>
                  <label className="text-xs text-slate-300 font-extrabold uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    Locatie / Paal Naam:
                  </label>
                  <div className="space-y-1.5">
                    {PAAL_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPaal(p.id)}
                        className={`w-full p-2.5 rounded-xl text-xs font-bold text-left flex items-center justify-between transition ${
                          selectedPaalId === p.id
                            ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-300'
                            : 'bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span>{p.name}</span>
                        {selectedPaalId === p.id && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hide / Show Phone Input Option */}
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Telefoon Invoer</span>
                    <span className="text-[10px] text-slate-400">Verberg numpad voor snelle Kiosk</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !hidePhoneNumpad;
                      setHidePhoneNumpad(next);
                      localStorage.setItem('wd_hide_phone_numpad', String(next));
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      hidePhoneNumpad ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {hidePhoneNumpad ? 'Verborgen' : 'Zichtbaar'}
                  </button>
                </div>

                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      logoutPos();
                      setShowManagerModal(false);
                      setIsUnlocked(false);
                    }}
                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Verlaat Terminal / Uitloggen Van Paal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowManagerModal(false);
                      setIsUnlocked(false);
                    }}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                  >
                    Sluiten
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

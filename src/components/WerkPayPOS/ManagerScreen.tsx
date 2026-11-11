import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { euro } from '../../services/store';
import { Product, Coupon, GiftCard, PosUser } from '../../types';
import { DiyTerminalModal } from './DiyTerminalModal';
import { LinkCardModal } from './LinkCardModal';
import { VipWerkPaySubscriptionModal } from './VipWerkPaySubscriptionModal';
import { TwoFactorSetupModal } from '../TwoFactorSetupModal';
import { TwoFactorChallengeModal } from '../TwoFactorChallengeModal';
import { generateTotpCode, verifyTotpCode } from '../../services/totp';
import { showToast } from '../../services/appToast';
import { ZERO_CHANGES_FREEZE_SQL, ZERO_CHANGES_UNFREEZE_SQL, SHADOWBAN_SECURITY_PATCH_SQL } from '../../services/sqlScripts';
import { 
  getLoyaltyCustomers, 
  saveLoyaltyCustomers, 
  registerLoyaltyCustomer, 
  subscribeVipClub, 
  issueVoucherForCustomer, 
  LoyaltyCustomer 
} from '../../services/loyalty';
import { 
  getNewsConfig, 
  saveNewsConfig, 
  NewsTickerConfig 
} from '../../services/newsService';
import { 
  BarChart3, 
  FileText, 
  Download, 
  Power, 
  Plus, 
  Edit3, 
  Trash2, 
  Flame, 
  ShieldCheck, 
  Key, 
  Tag, 
  Gift, 
  RotateCcw,
  X,
  Printer,
  Lock,
  Check,
  Radio,
  Sliders,
  AlertCircle,
  Database,
  Cpu,
  Crown,
  UserCheck,
  Coins,
  Link2,
  Sparkles,
  ShieldAlert,
  Laptop,
  Smartphone,
  Unlock,
  Zap,
  Tv
} from 'lucide-react';

const COMMON_POS_EMOJIS = ['🍔', '🍟', '🥤', '🍦', '🍩', '🧇', '🍕', '🌮', '🥩', '🍱', '☕', '🧁', '🍪', '🍎', '🥗', '🥘', '🥡', '🍴', '🍳', '🛑', '⚠️', '🚨', '🚫', '⛔', '🔧', '⚙️', '💻', '📢', '🔥', '✨', '💎', '👑', '✅', '❌'];

const QuickEmojiSelector: React.FC<{ onSelect: (emoji: string) => void; current?: string }> = ({ onSelect, current }) => {
  return (
    <div className="flex flex-wrap gap-1 p-2 bg-slate-900/50 border border-slate-800 rounded-xl max-h-32 overflow-y-auto custom-scrollbar">
      {COMMON_POS_EMOJIS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 transition-colors text-lg ${current === emoji ? 'bg-blue-600/30 border border-blue-500/50 ring-1 ring-blue-500/30' : 'border border-transparent'}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

export const ManagerScreen: React.FC = () => {
  const {
    currentPosUser,
    orders,
    products,
    totalExpenses,
    orderStopActive,
    orderStopText,
    orderStopConfig,
    customBranding,
    updateCustomBranding,
    managerOverride,
    activateManagerOverride,
    deactivateManagerOverride,
    setOrderStopActiveWithText,
    toggleOrderStop,
    pickupClosed,
    togglePickupClosed,
    giftCards,
    createGiftCard,
    topUpGiftCard,
    deleteGiftCard,
    coupons,
    createCoupon,
    toggleCouponActive,
    createProduct,
    updateProduct,
    deleteProduct,
    toggleProductSale,
    resetProductsToDefault,
    syncProducts,
    posUsers,
    createPosUser,
    updatePosUser,
    deletePosUser,
    canAccess,
    blockedDevices,
    blockDeviceOrIp,
    unblockDeviceOrIp,
    blockAllOtherDevices,
    activeSessions,
    clientIp,
    deviceId,
    masterPin,
    verifyMasterPin,
    updateMasterPin,
    banAndSuspendUser,
    unbanUser,
    toggleShadowbanUser,
    disable2FAForUser,
    tablesFrozen,
    toggleTablesFrozen,
    saveDisasterRecoverySnapshot,
    restoreDisasterRecoverySnapshot,
    auditLogs,
    logAuditAction
  } = useApp();

  // Master PIN Security Modal State & 2FA Setup State
  const [setup2FAUser, setSetup2FAUser] = useState<string | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState<boolean>(false);
  const [pinModalTitle, setPinModalTitle] = useState<string>('');
  const [pinModalInput, setPinModalInput] = useState<string>('');
  const [pinModalAction, setPinModalAction] = useState<(() => void) | null>(null);
  const [showEditMasterPinModal, setShowEditMasterPinModal] = useState<boolean>(false);
  const [newMasterPinVal, setNewMasterPinVal] = useState<string>('');

  // Bestelstop Customization & Live Preview States
  const [showBestelstopModal, setShowBestelstopModal] = useState<boolean>(false);
  const [selectedBestelstopTemplate, setSelectedBestelstopTemplate] = useState<string>('drukte');
  const [customBestelstopText, setCustomBestelstopText] = useState<string>(orderStopText || '');
  
  // New Layout States
  const [stopTitle, setStopTitle] = useState<string>(orderStopConfig?.title || 'Tijdelijk geen bestellingen');
  const [stopTheme, setStopTheme] = useState<string>(orderStopConfig?.theme || 'rose');
  const [stopShowClock, setStopShowClock] = useState<boolean>(orderStopConfig?.showClock ?? true);
  const [stopShowNews, setStopShowNews] = useState<boolean>(orderStopConfig?.showNews ?? true);
  const [stopBlockPickup, setStopBlockPickup] = useState<boolean>(orderStopConfig?.blockPickup ?? true);
  const [stopIcon, setStopIcon] = useState<string>(orderStopConfig?.icon || '🛑');

  // Branding Customization States
  const [brandName, setBrandName] = useState<string>(customBranding?.storeName || 'Werkdonalds');
  const [brandTagline, setBrandTagline] = useState<string>(customBranding?.tagline || 'Vers Bereid • Snelle Kassa & Keuken');
  const [brandEmoji, setBrandEmoji] = useState<string>(customBranding?.logoEmoji || '🍔');
  const [brandColor, setBrandColor] = useState<string>(customBranding?.primaryColor || '#2563eb');
  const [brandGradient, setBrandGradient] = useState<string>(customBranding?.headerGradient || 'from-blue-600 via-blue-500 to-cyan-400');
  const [useCustomBranding, setUseCustomBranding] = useState<boolean>(customBranding?.useCustomBranding ?? false);
  const [tvAutoStart, setTvAutoStart] = useState<boolean>(customBranding?.tvAutoStart ?? false);
  const [tvStartTime, setTvStartTime] = useState<string>(customBranding?.tvStartTime || '08:00');
  const [newsConfig, setNewsConfig] = useState<NewsTickerConfig>(getNewsConfig());
  const [tvLayout, setTvLayout] = useState<'split_50' | 'menu_focus' | 'pickup_focus'>(customBranding?.tvLayout || 'split_50');
  const [tvWidgets, setTvWidgets] = useState(customBranding?.tvWidgets || {
    prep: true, ready: true, menu: true, ticker: true, deal: true, waitTime: true, stats: true
  });
  const [nosCategory, setNosCategory] = useState<'general' | 'sport' | 'tech' | 'binnenland'>(customBranding?.nosCategory || 'general');

  // Sync local states if global orderStopConfig changes
  useEffect(() => {
    if (orderStopConfig) {
      setStopTitle(orderStopConfig.title);
      setStopTheme(orderStopConfig.theme);
      setStopShowClock(orderStopConfig.showClock);
      setStopShowNews(orderStopConfig.showNews);
      setStopBlockPickup(orderStopConfig.blockPickup);
      setStopIcon(orderStopConfig.icon);
    }
  }, [orderStopConfig]);

  // Sync local states if global branding changes
  useEffect(() => {
    if (customBranding) {
      setBrandName(customBranding.storeName);
      setBrandTagline(customBranding.tagline);
      setBrandEmoji(customBranding.logoEmoji);
      setBrandColor(customBranding.primaryColor);
      setBrandGradient(customBranding.headerGradient);
      setUseCustomBranding(customBranding.useCustomBranding);
      setTvAutoStart(customBranding.tvAutoStart);
      setTvStartTime(customBranding.tvStartTime);
    }
  }, [customBranding]);

  // Manager Menu 2FA Security Gate State
  const [managerUnlocked, setManagerUnlocked] = useState<boolean>(() => {
    if (!currentPosUser) return false;
    const sessionKey = `wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`;
    return sessionStorage.getItem(sessionKey) === 'true';
  });
  const [manager2FAInput, setManager2FAInput] = useState<string>('');
  const [manager2FAError, setManager2FAError] = useState<string | null>(null);
  const [verifyingManager2FA, setVerifyingManager2FA] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>(''); // Zoekfunctie

  const filteredProducts = products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.id.toString().includes(searchQuery)
  );

  const markManagerUnlocked = (method: string) => {
    setManagerUnlocked(true);
    if (currentPosUser) {
      sessionStorage.setItem(`wd_manager_unlocked_${currentPosUser.username.toLowerCase()}`, 'true');
    }
  };

  const handleUnlockManagerWith2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manager2FAInput.trim();
    if (!clean) {
      setManager2FAError('Voer je 2FA code, wachtwoord of Master PIN in.');
      return;
    }
    setVerifyingManager2FA(true);
    setManager2FAError(null);

    try {
      const userHas2FA = Boolean(currentPosUser?.is_2fa_enabled);

      // 1. Check 2FA TOTP code or Backup code if user has 2FA enabled
      if (userHas2FA && currentPosUser && currentPosUser.totp_secret) {
        const isValid2FA = await verifyTotpCode(currentPosUser.totp_secret, clean, currentPosUser.backup_codes);
        if (isValid2FA) {
          markManagerUnlocked('2FA');
          showToast('🔐 2FA Geverifieerd! Welkom in het Manager Menu.', 'success');
          logAuditAction('MANAGER_2FA_UNLOCK', `Manager menu ontgrendeld met 2FA door @${currentPosUser.username}`);
          return;
        }
      }

      // 2. Only allow user's own account password fallback IF the user does NOT have 2FA enabled!
      if (!userHas2FA && currentPosUser && currentPosUser.password && (clean === currentPosUser.password || clean.toLowerCase() === currentPosUser.password.toLowerCase())) {
        markManagerUnlocked('PASSWORD');
        showToast('🔓 Account Wachtwoord Geverifieerd! Manager Menu Ontgrendeld.', 'success');
        logAuditAction('MANAGER_PASS_UNLOCK', `Manager menu ontgrendeld met wachtwoord door @${currentPosUser.username}`);
        return;
      }

      // 3. Check Master Security PIN (always allowed as emergency admin bypass)
      if (verifyMasterPin(clean)) {
        markManagerUnlocked('MASTER_PIN');
        showToast('🔑 Master PIN Geverifieerd! Manager Menu Ontgrendeld.', 'success');
        logAuditAction('MANAGER_PIN_UNLOCK', `Manager menu ontgrendeld met Master PIN door @${currentPosUser?.username || 'manager'}`);
        return;
      }

      if (userHas2FA) {
        setManager2FAError('❌ Ongeldige 2FA code of Master Security PIN. (Omdat 2FA actief is op dit account, is je normale wachtwoord hier geweigerd!)');
      } else {
        setManager2FAError('Ongeldige code, wachtwoord of Master PIN. Probeer opnieuw.');
      }
      logAuditAction('MANAGER_2FA_FOUT', `Foutieve ontgrendelpoging bij Manager Menu voor @${currentPosUser?.username}`);
    } catch (err: any) {
      setManager2FAError(err?.message || 'Fout bij verifiëren van code.');
    } finally {
      setVerifyingManager2FA(false);
    }
  };

  const handleLaptopAutoFillManager = async () => {
    if (currentPosUser && currentPosUser.totp_secret) {
      const code = await generateTotpCode(currentPosUser.totp_secret);
      setManager2FAInput(code);
      showToast(`💻 Laptop 2FA Code '${code}' automatisch ingevuld!`, 'success');
    }
  };

  const executeWithMasterPin = (title: string, action: () => void) => {
    setPinModalTitle(title);
    setPinModalAction(() => action);
    setPinModalInput('');
    setPinModalOpen(true);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyMasterPin(pinModalInput)) {
      setPinModalOpen(false);
      showToast('🔑 Master Security PIN Bevestigd!', 'success');
      if (pinModalAction) pinModalAction();
    } else {
      showToast('❌ Onjuiste Master Security PIN! Actie geblokkeerd.', 'error');
      logAuditAction('MASTER_PIN_FOUT', `Foutieve PIN poging ingevoerd bij ${pinModalTitle}`);
    }
  };

  // NFC Pairing State
  const [showPairingModal, setShowPairingModal] = useState<boolean>(false);
  const [pairingUser, setPairingUser] = useState<PosUser | null>(null);

  // Device & IP Block Form State
  const [blockType, setBlockType] = useState<'ip' | 'device'>('ip');
  const [blockValue, setBlockValue] = useState<string>('');
  const [blockReasonInput, setBlockReasonInput] = useState<string>('');

  // Keuzemenu voor zelfgemaakte dingen
  const [showSelfMadeMenu, setShowSelfMadeMenu] = useState<boolean>(false);
  const selfMadeItems = ['Hardware Diagnose', 'Server Logs', 'Database Beheer', 'Systeem Update'];
  
  // ... (inside the ManagerScreen component return)
  
  <div className="mt-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
    <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-white">Medewerkers NFC Koppelen</h3>
        <input 
            type="text" 
            placeholder="Zoek product op ID of naam..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs bg-slate-950 p-2 rounded-lg text-white"
        />
        <button
            onClick={() => setShowSelfMadeMenu(!showSelfMadeMenu)}
            className="text-xs bg-cyan-600 px-3 py-1.5 rounded-lg text-white"
        >
            Zelfgemaakte Dingen
        </button>
    </div>
    
    {showSelfMadeMenu && (
        <div className="mb-4 p-3 bg-slate-800 rounded-xl space-y-1">
            {selfMadeItems.map(item => (
                <button key={item} className="w-full text-left text-xs text-white p-2 hover:bg-slate-700 rounded-lg">
                    {item}
                </button>
            ))}
        </div>
    )}

    <div className="space-y-2">
      {posUsers.map(user => (
        <div key={user.username} className="flex items-center justify-between bg-slate-950 p-3 rounded-xl">
          <span className="text-white text-sm">{user.name}</span>
          <button 
            onClick={() => { setPairingUser(user); setShowPairingModal(true); }}
            className="text-xs bg-purple-600 px-3 py-1.5 rounded-lg text-white"
          >
            Koppel NFC Tag
          </button>
        </div>
      ))}
    </div>
  </div>

  {showPairingModal && pairingUser && (
    <LinkCardModal 
      onClose={() => setShowPairingModal(false)}
      username={pairingUser.username}
    />
  )}

  // Active Manager Tab: 'dashboard' (General/Finance/Products/Coupons) | 'ops' (Manager Operations & Controls) | 'branding' (Customization)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ops' | 'branding'>('dashboard');

  // Z-Report Modal
  const [showZReport, setShowZReport] = useState<boolean>(false);

  // DIY Pinapparaat Modal State
  const [showDiyTerminalModal, setShowDiyTerminalModal] = useState<boolean>(false);

  // New Product State
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<string>('');
  const [newProdSalePrice, setNewProdSalePrice] = useState<string>('');
  const [newProdCat, setNewProdCat] = useState<string>('Burgers & Wraps');
  const [newProdEmoji, setNewProdEmoji] = useState<string>('🍔');

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // New Gift Card State
  const [newGiftCode, setNewGiftCode] = useState<string>('');
  const [newGiftAmount, setNewGiftAmount] = useState<string>('');
  const [newGiftRecipient, setNewGiftRecipient] = useState<string>('');
  const [newGiftRecipientPhone, setNewGiftRecipientPhone] = useState<string>('');
  const [newGiftIsPrivate, setNewGiftIsPrivate] = useState<boolean>(false);
  const [giftCardSearch, setGiftCardSearch] = useState<string>('');
  const [giftCardFilter, setGiftCardFilter] = useState<'all' | 'private' | 'active'>('all');

  // WerkLoyalty Accounts Manager State
  const [loyaltyCustomers, setLoyaltyCustomers] = useState<LoyaltyCustomer[]>([]);
  const [loyaltySearch, setLoyaltySearch] = useState<string>('');
  const [newLoyaltyName, setNewLoyaltyName] = useState<string>('');
  const [newLoyaltyPhone, setNewLoyaltyPhone] = useState<string>('');
  const [vipModalCustomer, setVipModalCustomer] = useState<{ phone: string; name: string } | null>(null);

  const handleOpenBestelstop = () => {
    setStopTitle(orderStopConfig?.title || 'Tijdelijk geen bestellingen');
    setStopTheme(orderStopConfig?.theme || 'rose');
    setStopShowClock(orderStopConfig?.showClock ?? true);
    setStopShowNews(orderStopConfig?.showNews ?? true);
    setStopBlockPickup(orderStopConfig?.blockPickup ?? true);
    setStopIcon(orderStopConfig?.icon || '🛑');
    setCustomBestelstopText(orderStopText || 'Beste gast, wegens extreme drukte in onze keuken hebben we tijdelijk een bestelstop ingelast. We bereiden momenteel de lopende bestellingen voor. Excuses voor de vertraging!');
    setShowBestelstopModal(true);
  };

  const handleUpdateBestelstop = async () => {
    // Call only the specialized function that handles state AND database correctly, 
    // without calling toggleOrderStop which causes a race condition/conflict.
    await setOrderStopActiveWithText(true, customBestelstopText, {
      title: stopTitle,
      theme: stopTheme as any,
      showClock: stopShowClock,
      showNews: stopShowNews,
      blockPickup: stopBlockPickup,
      icon: stopIcon
    });
    setShowBestelstopModal(false);
    showToast('⚠️ Bestelstop actief: ' + customBestelstopText, 'warning');
  };

  useEffect(() => {
    const refreshLoyalty = () => {
      setLoyaltyCustomers(getLoyaltyCustomers());
    };
    refreshLoyalty();
    window.addEventListener('wd_loyalty_updated', refreshLoyalty);
    return () => window.removeEventListener('wd_loyalty_updated', refreshLoyalty);
  }, []);

  // New Coupon State
  const [newCouponCode, setNewCouponCode] = useState<string>('');
  const [newCouponType, setNewCouponType] = useState<'percent' | 'fixed'>('percent');
  const [newCouponVal, setNewCouponVal] = useState<string>('');

  // New Employee State
  const [newUserName, setNewUserName] = useState<string>('');
  const [newUserUsername, setNewUserUsername] = useState<string>('');
  const [newUserPass, setNewUserPass] = useState<string>('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState<boolean>(false);
  const [newUserPerms, setNewUserPerms] = useState<string[]>(['pos', 'kitchen', 'pickup', 'cash_pay']);

  // Edit Employee State
  const [editingUser, setEditingUser] = useState<PosUser | null>(null);
  const [editUserPass, setEditUserPass] = useState<string>('');

  // Clock-In Shift Timer State for Staff
  const [clockedInStaff, setClockedInStaff] = useState<{ username: string; clockInTime: number }[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wd_clocked_in_staff');
        return saved ? JSON.parse(saved) : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [nowTime, setNowTime] = useState<number>(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const toggleClockIn = (username: string) => {
    let updated;
    const existing = clockedInStaff.find(c => c.username.toLowerCase() === username.toLowerCase());
    if (existing) {
      updated = clockedInStaff.filter(c => c.username.toLowerCase() !== username.toLowerCase());
    } else {
      updated = [...clockedInStaff, { username, clockInTime: Date.now() }];
    }
    setClockedInStaff(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wd_clocked_in_staff', JSON.stringify(updated));
    }
  };

  const PERMISSION_OPTIONS = [
    { id: 'pos', label: 'Kassa & Bestellen', desc: 'Bestelscherm & kassa bedienen' },
    { id: 'kitchen', label: 'Keukenscherm (KDS)', desc: 'Keukendisplay inzien en bestellingen afronden' },
    { id: 'pickup', label: 'Afhaalscherm TV', desc: 'Gereed bestellingen bekijken' },
    { id: 'voorraad', label: 'Voorraad & Inkoop', desc: 'Voorraad inzien en inkoop beheren' },
    { id: 'manager', label: 'Manager Dashboard', desc: 'Omzet, instellingen en kassa beheer' },
    { id: 'medewerkers', label: 'Medewerkers Aanpassen', desc: 'Gebruikers toevoegen, rechten en accounts beheren' },
    { id: 'producten', label: 'Producten Aanpassen', desc: 'Menu items, prijzen en acties aanpassen' },
    { id: 'coupons_giftcards', label: 'Coupons & Cadeaubonnen', desc: 'Kortingscodes en cadeaubonnen toekennen' },
    { id: 'cash_pay', label: 'Contant Geld Autoriseren', desc: 'Contante bestellingen goedkeuren' },
    { id: 'manager_override', label: 'Manager Override', desc: 'Globale override om restricties en PIN-verzoeken te omzeilen' },
  ];

  // Stats
  const validOrders = orders.filter(o => o.status !== 'cancelled');
  const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);
  const totalItems = validOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.qty, 0), 0);
  const totalDiscounts = validOrders.reduce((sum, o) => sum + o.discount, 0);
  const netProfit = Math.max(0, totalRevenue - totalExpenses);

  const workPayRevenue = validOrders.filter(o => o.paymentMethod === 'workpay').reduce((sum, o) => sum + o.total, 0);
  const cashRevenue = validOrders.filter(o => o.paymentMethod === 'cash').reduce((sum, o) => sum + o.total, 0);
  const pinRevenue = validOrders.filter(o => o.paymentMethod === 'pin' || o.paymentMethod === 'card').reduce((sum, o) => sum + o.total, 0);
  const giftCardRevenue = validOrders.filter(o => o.paymentMethod === 'giftcard').reduce((sum, o) => sum + o.total, 0);
  const idealRevenue = validOrders.filter(o => o.paymentMethod === 'ideal' || o.paymentMethod === 'online').reduce((sum, o) => sum + o.total, 0);

  // Top 5 Selling Products Calculation
  const productSalesMap: Record<string, { name: string; emoji: string; qty: number; totalRev: number }> = {};
  validOrders.forEach(o => {
    o.items.forEach(it => {
      if (!productSalesMap[it.name]) {
        productSalesMap[it.name] = { name: it.name, emoji: '🍔', qty: 0, totalRev: 0 };
      }
      productSalesMap[it.name].qty += it.qty;
      productSalesMap[it.name].totalRev += (it.price || 0) * it.qty;
    });
  });
  const topProducts = Object.values(productSalesMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const maxQty = topProducts.length > 0 ? topProducts[0].qty : 1;

  // Export CSV
  const handleExportCSV = () => {
    if (orders.length === 0) {
      showToast('Geen bestellingen om te exporteren.', 'warning');
      return;
    }
    let csv = 'OrderNr;Tijd;Totaal;Korting;Type;Klant_Tafel;Betaalmethode;Kassier;Status\n';
    orders.forEach(o => {
      csv += `${o.no};${o.time};${o.total.toFixed(2)};${o.discount.toFixed(2)};${o.orderType};${o.identifier};${o.paymentMethod};${o.cashier};${o.status}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `werkdonalds_orders_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const pr = parseFloat(newProdPrice);
    if (!newProdName.trim() || isNaN(pr) || pr <= 0) {
      showToast('Vul geldige productgegevens in.', 'warning');
      return;
    }
    const sale = parseFloat(newProdSalePrice) || 0;
    createProduct({
      name: newProdName.trim(),
      price: pr,
      salePrice: sale,
      onSale: sale > 0,
      cat: newProdCat,
      emoji: newProdEmoji || '🍔',
      inStock: true
    });
    setNewProdName('');
    setNewProdPrice('');
    setNewProdSalePrice('');
    showToast(`Product ${newProdName} toegevoegd!`, 'success');
  };

  const handleSaveEditProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    updateProduct(editingProduct);
    setEditingProduct(null);
  };

  const handleCreateGiftCard = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newGiftAmount);
    if (!newGiftCode.trim() || isNaN(amt) || amt <= 0) {
      showToast('Vul een geldige code en bedrag in.', 'warning');
      return;
    }
    createGiftCard(
      newGiftCode.trim().toUpperCase(),
      amt,
      currentPosUser?.name || 'Manager Ops',
      newGiftRecipient.trim() || undefined,
      newGiftRecipientPhone.trim() || undefined,
      newGiftIsPrivate ? '🔒 Privé Card / Personeelsvrijkaart' : undefined
    );
    setNewGiftCode('');
    setNewGiftAmount('');
    setNewGiftRecipient('');
    setNewGiftRecipientPhone('');
    setNewGiftIsPrivate(false);
    showToast(`Cadeaubon ${newGiftCode.toUpperCase()} (${euro(amt)}) aangemaakt!`, 'success');
  };

  const handleCreateLoyaltyCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLoyaltyName.trim() || !newLoyaltyPhone.trim()) {
      showToast('Vul een naam en telefoonnummer in.', 'warning');
      return;
    }
    const created = registerLoyaltyCustomer(newLoyaltyName.trim(), newLoyaltyPhone.trim());
    setNewLoyaltyName('');
    setNewLoyaltyPhone('');
    setLoyaltyCustomers(getLoyaltyCustomers());
    showToast(`WerkLoyalty account '${created.name}' (${created.phone}) aangemaakt!`, 'success');
  };

  const handleCreateCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newCouponVal);
    if (!newCouponCode.trim() || isNaN(val) || val <= 0) {
      showToast('Vul een code en waarde in.', 'warning');
      return;
    }
    createCoupon({
      code: newCouponCode.trim().toUpperCase(),
      discount_type: newCouponType,
      discount_val: val,
      is_active: true
    });
    setNewCouponCode('');
    setNewCouponVal('');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserUsername.trim() || !newUserPass.trim()) {
      showToast('Vul alle velden in.', 'warning');
      return;
    }
    const effectivePerms = newUserIsAdmin 
      ? ['pos', 'kitchen', 'pickup', 'voorraad', 'manager', 'medewerkers', 'producten', 'coupons_giftcards', 'cash_pay']
      : newUserPerms;

    const res = await createPosUser({
      name: newUserName.trim(),
      username: newUserUsername.trim().toLowerCase(),
      password: newUserPass.trim(),
      perms: effectivePerms,
      is_admin: newUserIsAdmin
    });
    setNewUserName('');
    setNewUserUsername('');
    setNewUserPass('');
    setNewUserIsAdmin(false);
    setNewUserPerms(['pos', 'kitchen', 'pickup', 'cash_pay']);
    showToast(res.message, res.success ? 'success' : 'error');
  };

  const handleStartEditUser = (u: PosUser) => {
    // Joas can only be edited by Joas
    if (u.username.toLowerCase() === 'joas' && currentPosUser?.username.toLowerCase() !== 'joas') {
      showToast('Joas kan je alleen aanpassen als je zelf als Joas bent ingelogd.', 'warning');
      return;
    }
    setEditingUser({ ...u, perms: [...(u.perms || [])] });
    setEditUserPass('');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (editingUser.username.toLowerCase() === 'joas' && currentPosUser?.username.toLowerCase() !== 'joas') {
      showToast('Joas kan je alleen aanpassen als je zelf als Joas bent ingelogd.', 'warning');
      return;
    }

    const effectivePerms = editingUser.is_admin
      ? ['pos', 'kitchen', 'pickup', 'voorraad', 'manager', 'medewerkers', 'producten', 'coupons_giftcards', 'cash_pay']
      : (editingUser.perms || []);

    const res = await updatePosUser({
      ...editingUser,
      perms: effectivePerms,
      password: editUserPass.trim() || undefined
    });

    showToast(res.message, res.success ? 'success' : 'error');
    if (res.success) {
      setEditingUser(null);
    }
  };

  const handleDeleteUser = async (u: PosUser) => {
    if (u.username.toLowerCase() === 'joas') {
      showToast('De hoofdbeheerder Joas kan niet worden verwijderd!', 'error');
      return;
    }
    if (u.username === 'bestel_kassa') {
      showToast('Het standaard bestelaccount kan niet worden verwijderd.', 'error');
      return;
    }
    if (confirm(`Weet je zeker dat je medewerker "${u.name}" wilt verwijderen?`)) {
      const res = await deletePosUser(u.id);
      showToast(res.message, res.success ? 'success' : 'error');
    }
  };

  if (!managerUnlocked) {
    const userHas2FA = Boolean(currentPosUser?.is_2fa_enabled);

    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 p-4 sm:p-6">
        <div className="bg-slate-900 border border-purple-500/40 rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl space-y-6 text-white text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto shadow-lg shadow-purple-950/50">
            <ShieldCheck className="w-8 h-8 animate-pulse text-purple-300" />
          </div>

          {!userHas2FA ? (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <h2 className="text-xl font-black text-purple-400 flex items-center justify-center gap-2">
                  <span>🔒 2FA Setup Verplicht</span>
                </h2>
                <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                  Om toegang te krijgen tot de managerinstellingen is tweestapsverificatie (2FA) verplicht gesteld door de beheerder. Stel nu 2FA in om door te gaan.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSetup2FAUser(currentPosUser?.username || 'manager')}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2"
              >
                <span>🔑 Start 2FA Inschakelen</span>
              </button>
              
              <button
                type="button"
                onClick={markManagerUnlocked}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-slate-800 hover:bg-slate-700 text-white transition shadow-lg shadow-slate-600/25 flex items-center justify-center gap-2"
              >
                <span>🚀 Overslaan (2FA optioneel)</span>
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <h2 className="text-xl font-black text-white flex items-center justify-center gap-2">
                  <span>🔐 Manager Menu Beveiligd</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                    2FA Active
                  </span>
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Het Manager Menu bevat gevoelige gegevens (omzet, prijzen, personeel &amp; instellingen). Voer je 2FA code of Master Security PIN in om het menu te openen.
                </p>
              </div>

              <form onSubmit={handleUnlockManagerWith2FA} className="space-y-4 text-left">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-purple-400" />
                      <span>2FA Code of Master PIN</span>
                    </label>
                  </div>

                  <div className="relative">
                    <input
                      type="password"
                      value={manager2FAInput}
                      onChange={e => setManager2FAInput(e.target.value)}
                      placeholder="Voer 2FA code of Master PIN in..."
                      maxLength={16}
                      autoFocus
                      className="w-full bg-slate-950 border border-purple-500/40 rounded-2xl px-4 py-3 text-center text-xl font-mono tracking-widest text-purple-300 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/30"
                    />
                  </div>
                </div>

                {manager2FAError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{manager2FAError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={verifyingManager2FA || !manager2FAInput.trim()}
                  className="w-full py-3.5 rounded-2xl font-black text-sm bg-purple-600 hover:bg-purple-500 text-white transition shadow-lg shadow-purple-600/25 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" />
                  <span>{verifyingManager2FA ? 'Verifiëren...' : 'Verifieer & Open Manager Menu'}</span>
                </button>
              </form>
            </>
          )}

          {/* 🔑 2FA Setup Modal inside gate */}
          {setup2FAUser && (
            <TwoFactorSetupModal
              username={setup2FAUser}
              onClose={() => setSetup2FAUser(null)}
              onSuccess={() => {
                setSetup2FAUser(null);
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-108px)] overflow-y-auto bg-slate-950 p-4 sm:p-6 space-y-6">
      
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-amber-400" />
            <span>Manager Dashboard &amp; Instellingen</span>
          </h1>
          <p className="text-xs text-slate-400">
            Beheer omzet, kassa instellingen, menuprijzen, cadeaubonnen, kortingen en personeel.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Subtabs within Manager: Algemeen vs Ops */}
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                activeTab === 'dashboard'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Algemeen Overzicht</span>
            </button>

            {(currentPosUser?.username.toLowerCase() === 'joas') && (
              <button
                onClick={() => setActiveTab('ops')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                  activeTab === 'ops'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-purple-300" />
                <span>Ops Beheer</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-950 border border-purple-500/40 text-purple-300 font-mono">
                  Joas Exclusief
                </span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('branding')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition ${
                activeTab === 'branding'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              <span>Branding</span>
            </button>
          </div>

          <button
            onClick={() => {
              executeWithMasterPin(
                tablesFrozen ? 'Tabellen Ontgrendelen' : '0-Veranderingen Tabel-Slot Activeren',
                async () => {
                  const res = await toggleTablesFrozen();
                  showToast(res.message, !tablesFrozen ? 'warning' : 'success');
                }
              );
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black border transition shadow ${
              tablesFrozen
                ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 animate-pulse'
                : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>{tablesFrozen ? '🔒 TABELLEN BEVROREN (0 Veranderingen Actief)' : '🛡️ Bevries Tabellen (0 Veranderingen)'}</span>
          </button>

          <button
            onClick={() => setShowZReport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Z-Rapport / Dagafsluiting</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Exporteer CSV</span>
          </button>
        </div>
      </div>

      {activeTab === 'ops' ? (
        /* Ops Tab - Dedicated Operations & Store Controls for Manager */
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Sliders className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <span>Operations &amp; Store Master Control (Ops)</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                      Exclusief voor Manager
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Live operationele schakelaars, noodknoppen, kassa-veiligheid en restaurant status.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Operational Toggles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Power className="w-4 h-4 text-rose-400" />
                    <span>Noodstop Kassa (Bestelstop)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Blokkeer direct alle nieuwe bestellingen en afrekeningen bij extreme drukte of incidenten.
                  </p>
                </div>
                <button
                  onClick={toggleOrderStop}
                  className={`px-4 py-2 rounded-xl font-black text-xs transition ${
                    orderStopActive 
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 animate-pulse' 
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {orderStopActive ? '⛔ BESTELSTOP ACTIEF' : '🟢 Kassa Open'}
                </button>
              </div>
              <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Huidige status: {orderStopActive ? 'Klanten kunnen geen bestelling afronden.' : 'Bestellingen worden direct doorgestuurd naar de keuken.'}</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-400" />
                    <span>Afhaalbalie TV Scherm</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Schakel het publieke afhaalscherm om naar 'Balie Gesloten' of 'Bestellingen Afhalen'.
                  </p>
                </div>
                <button
                  onClick={togglePickupClosed}
                  className={`px-4 py-2 rounded-xl font-black text-xs transition ${
                    pickupClosed 
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30' 
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  }`}
                >
                  {pickupClosed ? '🔴 BALIE GESLOTEN' : '🟢 Balie Geopend'}
                </button>
              </div>
              <div className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-blue-400" />
                <span>Huidige status: {pickupClosed ? 'TV toont gesloten mededeling.' : 'TV toont nummers "In Bereiding" en "Gereed".'}</span>
              </div>
            </div>

            {/* TV & Nieuws Beheer */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Tv className="w-4 h-4 text-cyan-400" />
                <span>TV & Nieuws Beheer</span>
              </h3>
              <p className="text-xs text-slate-400">
                Beheer live de TV-indeling, actieve widgets en nieuwscategorie voor het afhaalscherm.
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-400">Indeling</label>
                   <select 
                     value={newsConfig.layout || 'split_50'}
                     onChange={e => setNewsConfig(prev => ({ ...prev, layout: e.target.value as any }))}
                     className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-white text-[11px]"
                   >
                     <option value="split_50">Split 50/50</option>
                     <option value="menu_focus">Menu Focus</option>
                     <option value="pickup_focus">Pickup Focus</option>
                   </select>
                 </div>
                 <div className="space-y-1">
                   <label className="text-xs font-bold text-slate-400">Nieuwscategorie</label>
                   <select 
                     value={newsConfig.category}
                     onChange={e => setNewsConfig(prev => ({ ...prev, category: e.target.value as any }))}
                     className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-white text-[11px]"
                   >
                     <option value="general">Algemeen</option>
                     <option value="sport">Sport</option>
                     <option value="tech">Tech</option>
                     <option value="binnenland">Binnenland</option>
                   </select>
                 </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-xs font-bold text-slate-400">Actieve Widgets</label>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(newsConfig.widgets).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between bg-slate-950 px-2 py-1 rounded-lg">
                      <span className="text-[9px] text-slate-500 uppercase">{key}</span>
                      <input 
                        type="checkbox" 
                        className="toggle toggle-xs" 
                        checked={value as boolean} 
                        onChange={e => setNewsConfig(prev => ({ ...prev, widgets: { ...prev.widgets, [key]: e.target.checked } }))} 
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              <button
                onClick={() => {
                  saveNewsConfig(newsConfig);
                  showToast('TV & Nieuws instellingen live bijgewerkt!', 'success');
                }}
                className="w-full mt-2 py-2 rounded-lg font-bold bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
              >
                Live Instellingen Toepassen
              </button>
            </div>
          </div>

          {/* Hardware & Pinapparaat Terminal Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <span>DIY Pinapparaat &amp; Betaalterminal Hardware</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                      Arduino / NFC / LCD
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Virtueel of fysiek pinapparaat testen, NFC-kaarten scannen en pinterminal instellingen beheren.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDiyTerminalModal(true)}
                className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs transition shadow-lg shadow-cyan-500/20 flex items-center gap-2"
              >
                <Cpu className="w-4 h-4" />
                <span>Open Pinapparaat Terminal</span>
              </button>
            </div>
          </div>

          {/* 🛡️ Tamper-Proof Veiligheid, Audit Trail & Noodherstel Card */}
          <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <span>🛡️ Tamper-Proof Beveiliging, Audit Trail &amp; Noodherstel</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                      Master Shield
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Beveilig je kassa tegen sabotages, wisacties en uitgeschakelde accounts.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    executeWithMasterPin('Noodherstel Uitvoeren', async () => {
                      const res = await restoreDisasterRecoverySnapshot();
                      showToast(res.message, res.success ? 'success' : 'error');
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>🚨 Noodherstel (Herstel Back-up Snapshot)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <strong className="text-amber-300 block font-bold flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-400" />
                  Master Security PIN
                </strong>
                <p className="text-slate-400 text-[11px]">
                  Master Security PIN beveiligt alle gevoelige acties (gebruikers verwijderen, menu wissen, back-up herstellen).
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400 font-mono">Opslag: <strong className="text-emerald-400">Beveiligd in pos_settings (Supabase)</strong></span>
                  <button
                    type="button"
                    onClick={() => {
                      executeWithMasterPin('Master PIN Wijzigen', () => {
                        const newPin = prompt('Voer de NIEUWE 4-cijferige Master Security PIN in:');
                        if (newPin && newPin.trim().length >= 4) {
                          updateMasterPin(newPin.trim());
                          showToast('Master Security PIN succesvol bijgewerkt!', 'success');
                        }
                      });
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold"
                  >
                    PIN Wijzigen
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <strong className="text-emerald-300 block font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  1-Klik 0-Veranderingen Tabel-Slot &amp; Automatische Nep-Rechten
                </strong>
                <p className="text-slate-400 text-[11px]">
                  <strong>Nep-Rechten (👻 Shadowban)</strong> en <strong>Blokkades</strong> werken nu 100% automatisch online via de al bestaande <code className="text-purple-300 font-mono">perms</code> kolom (<strong>je hoeft zelf 0 SQL aan te passen!</strong>). Met de knop hieronder bevries je direct alle tabellen zodat er 0 wijzigingen plaatsvinden:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      executeWithMasterPin(
                        tablesFrozen ? 'Tabellen Ontgrendelen' : '0-Veranderingen Tabel-Slot Activeren',
                        async () => {
                          const res = await toggleTablesFrozen();
                          showToast(res.message, !tablesFrozen ? 'warning' : 'success');
                        }
                      );
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition ${
                      tablesFrozen
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-rose-600 hover:bg-rose-500 text-white'
                    }`}
                  >
                    {tablesFrozen ? '🔓 Ontgrendel Tabellen Nu' : '🔒 Bevries Tabellen Nu (0 Veranderingen)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(ZERO_CHANGES_FREEZE_SQL);
                      showToast('🔒 1-Regel Server Lock SQL gekopieerd! Plak in Supabase om op server-niveau élke wijziging te blokkeren.', 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 text-[10px] font-bold"
                  >
                    📋 Kopieer 1-Regel SQL Slot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(ZERO_CHANGES_UNFREEZE_SQL);
                      showToast('🔓 SQL Ontgrendeling gekopieerd!', 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold"
                  >
                    📋 Kopieer SQL Unlock
                  </button>
                </div>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <h4 className="font-bold text-white text-xs flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>🕵️ Veiligheids &amp; Audit Logboek (Laatste {auditLogs.length} acties)</span>
              </h4>
              <div className="max-h-40 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1 font-mono text-[11px]">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log, idx) => (
                    <div key={log.id || idx} className="p-1.5 rounded bg-slate-900/60 flex items-center justify-between gap-2 border border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold">[{log.timestamp}]</span>
                        <span className="text-emerald-300 font-bold">{log.action}:</span>
                        <span className="text-slate-300">{log.details}</span>
                      </div>
                      <span className="text-slate-500 text-[10px]">{log.user_name}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic p-2 text-center text-[11px]">
                    Nog geen veiligheidsacties geregistreerd.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live Ingelogde Apparaten List (Realtime Presence) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="font-extrabold text-white text-base flex items-center gap-2">
                  <Laptop className="w-5 h-5 text-cyan-400" />
                  <span>📱 Live Ingelogde Apparaten ({activeSessions.length} Actief Online)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Realtime overzicht van alle actieve schermen, telefoons &amp; kiosks. Klik op <strong>Blokkeer</strong> om een apparaat of IP direct live uit te sluiten (geen herlaad nodig).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm('Weet je zeker dat je ALLE overige ingelogde apparaten direct wilt blokkeren?')) {
                      const res = await blockAllOtherDevices();
                      showToast(res.message, res.success ? 'success' : 'warning');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition shadow flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>🚨 Noodknop: Blokkeer Alle Overige Apparaten</span>
                </button>
              </div>
            </div>

            {/* Active Connected Sessions Table */}
            <div className="space-y-2.5">
              {activeSessions.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500 space-y-1">
                  <p className="font-bold text-slate-400">Verbinding maken met actieve apparaten...</p>
                  <p className="text-[11px]">Huidige apparaat ID: <code className="text-cyan-300">{deviceId}</code> ({clientIp || 'Lokaal'})</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {activeSessions.map((s) => {
                    const isCurrentDevice = s.device_id === deviceId;
                    const isBlockedDevice = blockedDevices.some(b => b.value.toLowerCase() === s.device_id.toLowerCase() || (b.type === 'ip' && b.value === s.ip_address));

                    return (
                      <div
                        key={s.device_id}
                        className={`p-3.5 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs ${
                          isCurrentDevice
                            ? 'bg-slate-950 border-cyan-500/40 shadow-sm shadow-cyan-950/30'
                            : isBlockedDevice
                            ? 'bg-rose-950/20 border-rose-500/40'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                            isCurrentDevice ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}>
                            {s.user_agent.toLowerCase().includes('mobiel') ? (
                              <Smartphone className="w-5 h-5 text-cyan-400" />
                            ) : (
                              <Laptop className="w-5 h-5 text-cyan-400" />
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-white text-sm">{s.user_name}</span>
                              {isCurrentDevice && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  ⚡ Dit Is Jouw Huidige Apparaat
                                </span>
                              )}
                              {isBlockedDevice && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  🚫 Live Geblokkeerd
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                                {s.user_agent}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono flex-wrap">
                              <span>IP: <strong className="text-amber-300">{s.ip_address}</strong></span>
                              <span>•</span>
                              <span>ID: <strong className="text-cyan-300">{s.device_id}</strong></span>
                              <span>•</span>
                              <span>Scherm: <span className="text-purple-300 uppercase font-bold">{s.app_mode} / {s.pos_screen}</span></span>
                              <span>•</span>
                              <span className="text-emerald-400 font-bold flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                                🟢 Live Nu
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {!isCurrentDevice && (
                          <div className="flex items-center gap-2 flex-wrap pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await blockDeviceOrIp('device', s.device_id, `Blokkade via Ops Menu op ${s.user_name}`);
                                showToast(res.message, res.success ? 'success' : 'error');
                              }}
                              className="px-3 py-1.5 rounded-xl font-bold bg-rose-600 hover:bg-rose-500 text-white text-[11px] shadow transition flex items-center gap-1"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Blokkeer Apparaat</span>
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                const res = await blockDeviceOrIp('ip', s.ip_address, `IP Blokkade via Ops Menu op ${s.user_name}`);
                                showToast(res.message, res.success ? 'success' : 'error');
                              }}
                              className="px-3 py-1.5 rounded-xl font-bold bg-amber-600 hover:bg-amber-500 text-white text-[11px] shadow transition flex items-center gap-1"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Blokkeer IP ({s.ip_address})</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Blacklist Control Form & List */}
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-extrabold text-rose-400 text-xs flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-rose-500" />
                    <span>🛡️ Zwarte Lijst Beheer ({blockedDevices.length} Actieve Blokkades)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Handmatige IP-adressen of apparaten toevoegen of bestaande blokkades weer deblokkeren.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!blockValue) return;
                    const res = await blockDeviceOrIp(blockType, blockValue, blockReasonInput);
                    showToast(res.message, res.success ? 'success' : 'error');
                    if (res.success) {
                      setBlockValue('');
                      setBlockReasonInput('');
                    }
                  }}
                  className="lg:col-span-5 bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5"
                >
                  <div className="font-bold text-slate-300 text-[11px]">
                    + Handmatige Blokkade Toevoegen
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={blockType}
                      onChange={e => setBlockType(e.target.value as 'ip' | 'device')}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white outline-none font-bold"
                    >
                      <option value="ip">IP-adres</option>
                      <option value="device">Apparaat ID</option>
                    </select>
                    <input
                      type="text"
                      required
                      value={blockValue}
                      onChange={e => setBlockValue(e.target.value)}
                      placeholder={blockType === 'ip' ? 'Bijv. 123.45.67.89' : 'Bijv. dev_x7a9k2'}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono placeholder-slate-600 outline-none focus:border-rose-500"
                    />
                  </div>

                  <input
                    type="text"
                    value={blockReasonInput}
                    onChange={e => setBlockReasonInput(e.target.value)}
                    placeholder="Reden (bijv. Misbruik / Verdacht gedrag)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white placeholder-slate-600 outline-none"
                  />

                  <div className="flex gap-2 pt-1">
                    {clientIp && (
                      <button
                        type="button"
                        onClick={() => {
                          setBlockType('ip');
                          setBlockValue(clientIp);
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
                      >
                        Mijn IP
                      </button>
                    )}
                    {deviceId && (
                      <button
                        type="button"
                        onClick={() => {
                          setBlockType('device');
                          setBlockValue(deviceId);
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold"
                      >
                        Mijn Apparaat ID
                      </button>
                    )}
                    <button
                      type="submit"
                      className="flex-1 py-1.5 rounded-lg font-bold bg-rose-600 hover:bg-rose-500 text-white shadow"
                    >
                      Blokkeer Live
                    </button>
                  </div>
                </form>

                <div className="lg:col-span-7 bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 max-h-56 overflow-y-auto">
                  <div className="font-bold text-slate-400 text-[11px] flex justify-between">
                    <span>Actieve Zwarte Lijst ({blockedDevices.length})</span>
                    <span className="text-[10px] text-emerald-400">🟢 Realtime Sync</span>
                  </div>

                  {blockedDevices.length === 0 ? (
                    <p className="text-[11px] text-slate-500 py-4 text-center">Er zijn momenteel geen apparaten of IP's geblokkeerd.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {blockedDevices.map(b => (
                        <div key={b.id || b.value} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px]">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${b.type === 'ip' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'}`}>
                                {b.type.toUpperCase()}
                              </span>
                              <span className="font-mono font-bold text-white">{b.value}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 italic mt-0.5">
                              {b.reason || 'Geen reden opgegeven'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={async () => {
                              const res = await unblockDeviceOrIp(b.value);
                              showToast(res.message, res.success ? 'success' : 'error');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 font-bold text-[10px] transition"
                          >
                            🔓 Deblokkeer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Operations Telemetry */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                Actieve Bestellingen
              </span>
              <div className="text-2xl font-black text-amber-400 mt-1">
                {orders.filter(o => o.status === 'prep').length} in de keuken
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {orders.filter(o => o.status === 'ready').length} wachten op afhaal
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                Geannuleerde Bestellingen
              </span>
              <div className="text-2xl font-black text-rose-400 mt-1">
                {orders.filter(o => o.status === 'cancelled').length} orders
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Uitval &amp; retouren</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block">
                Ingelogd Manager Profiel
              </span>
              <div className="text-lg font-black text-purple-300 mt-1 truncate">
                {currentPosUser?.name || 'Onbekend'}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block font-mono">
                @{currentPosUser?.username || 'gast'} (Admin)
              </span>
            </div>
          </div>

          {/* Store Ops Quick Actions */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              <span>Systeemacties, Database &amp; Menureset</span>
            </h3>

            {/* SQL Export & Schema Downloads */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div>
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Supabase PostgreSQL Database Scripts (3 Opties)</span>
                </div>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  Kies een van de SQL scripts voor de Supabase SQL Editor. Gebruik de <strong>Schema Only</strong> versie als je jouw aangepaste producten en prijzen wilt BEWAREN.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <a
                  href="./database-schema-only.sql"
                  download="database-schema-only.sql"
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 hover:border-emerald-400 hover:bg-slate-850 transition flex items-center justify-between group shadow-sm"
                >
                  <div>
                    <div className="font-bold text-emerald-400 flex items-center gap-1">
                      <span>🛡️ Schema Only</span>
                    </div>
                    <div className="text-[10px] text-slate-300 font-medium">Behoudt jouw eigen producten &amp; prijzen (Geen reset)</div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 transition" />
                </a>

                <a
                  href="./database-basis.sql"
                  download="database-basis.sql"
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-850 transition flex items-center justify-between group"
                >
                  <div>
                    <div className="font-bold text-cyan-400 flex items-center gap-1">
                      <span>📄 Basis Tabellen</span>
                    </div>
                    <div className="text-[10px] text-slate-400">⚡ Alleen 5 kern-tabellen</div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition" />
                </a>

                <a
                  href="./database.sql"
                  download="database.sql"
                  target="_blank"
                  rel="noreferrer"
                  className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850 transition flex items-center justify-between group"
                >
                  <div>
                    <div className="font-bold text-indigo-400 flex items-center gap-1">
                      <span>📦 Volledig + Seed</span>
                    </div>
                    <div className="text-[10px] text-slate-400">🔥 Alle tabellen + Standaard data</div>
                  </div>
                  <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-400 transition" />
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div>
                <div className="font-bold text-slate-200">Herstel Standaard Menukaart</div>
                <p className="text-slate-400 text-[11px]">
                  Zet alle 50+ gerechten en actieprijzen terug naar fabrieksinstellingen.
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Weet je zeker dat je alle producten wilt resetten naar de standaardlijst?')) {
                    resetProductsToDefault();
                    showToast('Menu succesvol gereset!', 'success');
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                Menu Resetten
              </button>
            </div>
          </div>
        </div>
      ) : activeTab === 'branding' ? (
        /* Branding & Layout Customization Tab */
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-3">
                    <span>Branding & Layout Customization</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold border border-slate-700">
                      Live Preview
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Pas de naam, kleuren en het uiterlijk van je kassa en afhaalschermen aan.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  await updateCustomBranding({
                    storeName: brandName,
                    tagline: brandTagline,
                    logoEmoji: brandEmoji,
                    primaryColor: brandColor,
                    headerGradient: brandGradient,
                    useCustomBranding: useCustomBranding,
                    tvAutoStart: tvAutoStart,
                    tvStartTime: tvStartTime,
                    tvLayout: tvLayout,
                    tvWidgets: tvWidgets,
                    nosCategory: nosCategory
                  });
                }}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm transition shadow-lg shadow-blue-600/25 flex items-center gap-2"
              >
                <Database className="w-4 h-4" />
                <span>Instellingen Opslaan naar Cloud</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Inputs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Edit3 className="w-4 h-4 text-blue-400" />
                  <span>Winkelgegevens & Branding</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">Winkel Naam</label>
                    <input 
                      value={brandName}
                      onChange={e => setBrandName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-blue-500 outline-none transition"
                      placeholder="Bijv. Werkdonalds"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">Logo Icoontje (Emoji)</label>
                    <div className="flex gap-2">
                      <input 
                        value={brandEmoji}
                        onChange={e => setBrandEmoji(e.target.value)}
                        className="w-20 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-blue-500 outline-none transition text-center text-xl"
                        placeholder="Bijv. 🍔"
                      />
                      <div className="flex-1">
                        <QuickEmojiSelector onSelect={setBrandEmoji} current={brandEmoji} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400">Tagline / Ondertiteling</label>
                  <input 
                    value={brandTagline}
                    onChange={e => setBrandTagline(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:border-blue-500 outline-none transition"
                    placeholder="Bijv. Vers Bereid • Snelle Kassa"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">Themakleur (Hex)</label>
                    <div className="flex gap-2">
                      <input 
                        type="color"
                        value={brandColor}
                        onChange={e => setBrandColor(e.target.value)}
                        className="h-10 w-12 bg-slate-950 border border-slate-800 rounded-xl p-1 cursor-pointer"
                      />
                      <input 
                        value={brandColor}
                        onChange={e => setBrandColor(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white font-mono text-sm focus:border-blue-500 outline-none transition"
                        placeholder="#2563eb"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400">Header Gradiënt (Tailwind Classes)</label>
                    <input 
                      value={brandGradient}
                      onChange={e => setBrandGradient(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white font-mono text-xs focus:border-blue-500 outline-none transition"
                      placeholder="from-blue-600 via-blue-500 to-cyan-400"
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <label className="text-sm font-black text-white">TV Instellingen</label>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400">TV Auto-start bij opstart</span>
                    <input 
                      type="checkbox" 
                      className="toggle toggle-sm" 
                      checked={tvAutoStart} 
                      onChange={e => setTvAutoStart(e.target.checked)} 
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-400">Starttijd (24u)</span>
                    <input 
                      type="time" 
                      className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-white text-xs"
                      value={tvStartTime} 
                      onChange={e => setTvStartTime(e.target.value)} 
                    />
                  </div>
                  
                  <div className="pt-2">
                     <label className="text-xs font-bold text-slate-400">Nieuwscategorie</label>
                     <select 
                       value={nosCategory}
                       onChange={e => setNosCategory(e.target.value as any)}
                       className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs mt-1"
                     >
                       <option value="general">Algemeen</option>
                       <option value="sport">Sport</option>
                       <option value="tech">Tech</option>
                       <option value="binnenland">Binnenland</option>
                     </select>
                  </div>
                  
                  <div className="pt-2">
                     <label className="text-xs font-bold text-slate-400">Indeling</label>
                     <select 
                       value={tvLayout}
                       onChange={e => setTvLayout(e.target.value as any)}
                       className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs mt-1"
                     >
                       <option value="split_50">Split 50/50</option>
                       <option value="menu_focus">Menu Focus</option>
                       <option value="pickup_focus">Pickup Focus</option>
                     </select>
                  </div>

                  <div className="pt-2 space-y-1">
                    <label className="text-xs font-bold text-slate-400">Actieve Widgets</label>
                    {Object.entries(tvWidgets).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 uppercase">{key}</span>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-xs" 
                          checked={value} 
                          onChange={e => setTvWidgets(prev => ({ ...prev, [key]: e.target.checked }))} 
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 cursor-pointer group hover:bg-blue-500/10 transition">
                    <div className={`w-10 h-6 rounded-full transition-colors relative ${useCustomBranding ? 'bg-blue-600' : 'bg-slate-700'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${useCustomBranding ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                    <input 
                      type="checkbox"
                      checked={useCustomBranding}
                      onChange={e => setUseCustomBranding(e.target.checked)}
                      className="hidden"
                    />
                    <div>
                      <span className="text-sm font-black text-white block">Activeer Aangepaste Branding</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Overschrijft de standaard merk-instellingen op alle schermen</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
                <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  <span>Voorbeeld & Voorvertoning</span>
                </h3>
                
                <div className="space-y-4">
                  <p className="text-[11px] text-slate-400 italic">Dit is hoe je kassa-header eruit komt te zien met de huidige instellingen:</p>
                  
                  {/* Fake Preview Header */}
                  <div className={`h-16 rounded-2xl bg-gradient-to-r ${brandGradient} p-4 flex items-center justify-between shadow-lg`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-2xl shadow-inner">
                        {brandEmoji}
                      </div>
                      <div>
                        <h4 className="font-black text-white text-sm uppercase tracking-tighter">{brandName}</h4>
                        <p className="text-[10px] text-white/80 font-bold">{brandTagline}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Information */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-400 mb-2">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-white leading-tight">Hoe werkt branding?</h3>
                <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
                  <p>
                    Wanneer je <strong>"Activeer Aangepaste Branding"</strong> inschakelt, zal de applicatie niet langer kijken naar het geselecteerde merk (Werkdonalds of Koekploeg) voor het uiterlijk.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                      <span><strong>Kassa Header:</strong> De naam en tagline worden overal bovenaan getoond.</span>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                      <span><strong>Afhaalscherm TV:</strong> De TV-interface past zich direct aan aan jouw kleuren en logo.</span>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                      <span><strong>Themakleuren:</strong> Knoppen en accenten gebruiken je primaire themakleur.</span>
                    </li>
                  </ul>
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
                    💡 Tip: Gebruik <a href="https://tailwindcss.com/docs/gradient-color-stops" target="_blank" rel="noreferrer" className="text-blue-400 underline">Tailwind Gradients</a> voor de header.
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
                 <h4 className="font-bold text-slate-200 text-xs uppercase tracking-widest">Sneltoetsen</h4>
                 <div className="grid grid-cols-1 gap-2">
                    <button 
                      onClick={() => {
                        setBrandName('Werkdonalds');
                        setBrandTagline('Vers Bereid • Snelle Kassa & Keuken');
                        setBrandEmoji('🍔');
                        setBrandColor('#2563eb');
                        setBrandGradient('from-blue-600 via-blue-500 to-cyan-400');
                      }}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-left hover:border-blue-500 transition flex items-center justify-between"
                    >
                      <span className="text-[11px] font-bold text-slate-300">Zet terug naar Werkdonalds Blauw</span>
                      <span className="text-xs">🍔</span>
                    </button>
                    <button 
                      onClick={() => {
                        setBrandName('De Koekploeg');
                        setBrandTagline('Ambachtelijke Stroopwafels & Verse Bakkerij');
                        setBrandEmoji('🧇');
                        setBrandColor('#f59e0b');
                        setBrandGradient('from-amber-500 via-yellow-400 to-amber-600');
                      }}
                      className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-left hover:border-amber-500 transition flex items-center justify-between"
                    >
                      <span className="text-[11px] font-bold text-slate-300">Zet terug naar Koekploeg Goud</span>
                      <span className="text-xs">🧇</span>
                    </button>
                 </div>
              </div>

              {/* Order Stop Defaults Section */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
                <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span>Bestelstop Standaard Layout</span>
                </h3>
                
                <p className="text-[11px] text-slate-400">
                  Stel hier in hoe het scherm er standaard uit moet zien wanneer je een bestelstop activeert op dit apparaat.
                </p>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Standaard Titel</label>
                      <input 
                        value={stopTitle}
                        onChange={e => setStopTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-rose-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Standaard Icoon</label>
                      <input 
                        value={stopIcon}
                        onChange={e => setStopIcon(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs text-center outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                  
                  <QuickEmojiSelector onSelect={setStopIcon} current={stopIcon} />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Thema Kleur</label>
                      <select
                        value={stopTheme}
                        onChange={e => setStopTheme(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none focus:border-rose-500"
                      >
                        <option value="rose">Rose (Alert)</option>
                        <option value="amber">Amber (Warning)</option>
                        <option value="emerald">Emerald (Success)</option>
                        <option value="blue">Blue (System)</option>
                        <option value="slate">Slate (Neutral)</option>
                      </select>
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-900 transition">
                        <input 
                          type="checkbox"
                          checked={stopBlockPickup}
                          onChange={e => setStopBlockPickup(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-950 text-rose-500"
                        />
                        <span className="font-bold text-slate-300 text-[10px]">Blokkeer Afhaalscherm</span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      await setOrderStopActiveWithText(orderStopActive, orderStopText, {
                        title: stopTitle,
                        theme: stopTheme as any,
                        showClock: stopShowClock,
                        showNews: stopShowNews,
                        blockPickup: stopBlockPickup,
                        icon: stopIcon
                      });
                      showToast('Bestelstop configuratie opgeslagen!', 'success');
                    }}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-[11px] border border-slate-700 transition shadow-lg"
                  >
                    Opslaan als Standaard Layout
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
                <h3 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Manager Systeem-Override</span>
                </h3>
                
                <div className="space-y-4">
                  <p className="text-[11px] text-slate-400">
                    Activeer een globale override om restricties (zoals PIN-verzoeken bij contant geld of bestelstops) tijdelijk te omzeilen op dit apparaat.
                  </p>
                  
                  <button
                    onClick={() => {
                      if (managerOverride && !canAccess('manager_override')) {
                        deactivateManagerOverride();
                      } else if (!managerOverride) {
                        const pin = prompt('Voer de Master Security PIN in om globale override te activeren:');
                        if (pin) {
                          const res = activateManagerOverride(pin);
                          if (!res.success) alert(res.message);
                        }
                      } else if (canAccess('manager_override')) {
                        showToast('Manager Override is al actief via jouw gebruikersrechten.', 'info');
                      }
                    }}
                    className={`w-full py-3 px-4 rounded-xl font-black text-xs transition flex items-center justify-center gap-2 shadow-lg ${
                      managerOverride 
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20' 
                        : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>{managerOverride ? 'OVERRIDE ACTIEF (Klik om te deactiveren)' : 'ACTIVEER MANAGER OVERRIDE'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Algemeen Dashboard Tab */
        <>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow">
          <span className="text-[11px] font-bold uppercase text-slate-400">Totale Omzet</span>
          <div className="text-xl font-black text-emerald-400 mt-1">{euro(totalRevenue)}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow">
          <span className="text-[11px] font-bold uppercase text-slate-400">Inkoopkosten</span>
          <div className="text-xl font-black text-rose-400 mt-1">{euro(totalExpenses)}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow">
          <span className="text-[11px] font-bold uppercase text-slate-400">Nettowinst</span>
          <div className="text-xl font-black text-blue-400 mt-1">{euro(netProfit)}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow">
          <span className="text-[11px] font-bold uppercase text-slate-400">Bestellingen</span>
          <div className="text-xl font-black text-white mt-1">{validOrders.length}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow">
          <span className="text-[11px] font-bold uppercase text-slate-400">Items Verkocht</span>
          <div className="text-xl font-black text-amber-400 mt-1">{totalItems}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow">
          <span className="text-[11px] font-bold uppercase text-slate-400">Gem. Bestelwaarde</span>
          <div className="text-xl font-black text-cyan-400 mt-1">
            {euro(validOrders.length > 0 ? totalRevenue / validOrders.length : 0)}
          </div>
        </div>
      </div>

      {/* Manager 1 & 2: Live Payment Method Monitor & Top 5 Product Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Manager 1: Live Payment Breakdown */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-sm text-white flex items-center gap-2">
                <span>💳 Manager 1: Omzet &amp; Betaalmethoden Breakdown</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Live verdeling van inkomsten per kanaal vandaag</p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
              Totaal: {euro(totalRevenue)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                💳 Pin / Kaart
              </span>
              <div className="text-sm font-black text-blue-400">{euro(pinRevenue)}</div>
              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-500 h-full rounded-full" 
                  style={{ width: `${totalRevenue > 0 ? (pinRevenue / totalRevenue) * 100 : 0}%` }} 
                />
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                💵 Contant Geld
              </span>
              <div className="text-sm font-black text-emerald-400">{euro(cashRevenue)}</div>
              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full" 
                  style={{ width: `${totalRevenue > 0 ? (cashRevenue / totalRevenue) * 100 : 0}%` }} 
                />
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                📱 WerkPay App
              </span>
              <div className="text-sm font-black text-purple-400">{euro(workPayRevenue)}</div>
              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full" 
                  style={{ width: `${totalRevenue > 0 ? (workPayRevenue / totalRevenue) * 100 : 0}%` }} 
                />
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                🎁 Cadeaubonnen
              </span>
              <div className="text-sm font-black text-amber-400">{euro(giftCardRevenue)}</div>
              <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-400 h-full rounded-full" 
                  style={{ width: `${totalRevenue > 0 ? (giftCardRevenue / totalRevenue) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Manager 2: Populairste Producten Top 5 */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-sm text-white flex items-center gap-2">
              <span>🔥 Manager 2: Top 5 Best-Selling Producten</span>
            </h2>
            <span className="text-[10px] uppercase font-mono font-bold text-slate-500">Aantal verkocht</span>
          </div>

          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Nog geen verkopen geregistreerd vandaag.</p>
          ) : (
            <div className="space-y-2.5">
              {topProducts.map((tp, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                const pct = Math.round((tp.qty / maxQty) * 100);

                return (
                  <div key={tp.name} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-white">
                        <span className="font-mono text-amber-400 text-sm">{medal}</span>
                        <span className="truncate max-w-[180px]">{tp.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-amber-400">{tp.qty}x</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({euro(tp.totalRev)})</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                      <div 
                        className="bg-gradient-to-r from-amber-500 to-amber-300 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Systeemregie & Controle Paneel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow space-y-4">
        <h2 className="font-black text-sm text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Systeemregie &amp; Controle (Live)</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Bestelstop Regie */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">⛔ Bestelstop</span>
              <button
                onClick={() => {
                  if (orderStopActive) {
                    toggleOrderStop();
                    showToast('🎉 Bestelstop opgeheven.', 'success');
                  } else {
                    handleOpenBestelstop();
                  }
                }}
                className={`px-3 py-1 rounded-lg font-bold transition ${orderStopActive ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                {orderStopActive ? 'Stop Opheffen' : 'Activeren...'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Status: {orderStopActive ? 'Actief' : 'Inactief'}</p>
          </div>

          {/* Keuken Blokkeren */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">👨‍🍳 Keuken (Intern)</span>
              <button className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 font-bold">
                Blokkeren
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Blokkeer keuken-interface (KDS).</p>
          </div>

          {/* TV-Afhaalbalie Regie */}
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">🔴 Afhaalbalie</span>
              <button
                onClick={togglePickupClosed}
                className={`px-3 py-1 rounded-lg font-bold transition ${pickupClosed ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'}`}
              >
                {pickupClosed ? 'Balie Openen' : 'Balie Sluiten'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Schermt de TV af voor gasten.</p>
          </div>
        </div>
      </div>

      {/* Bestelstop Config Modal */}
      {showBestelstopModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="font-bold text-white">Bestelstop Instellen</h3>
            
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Status bericht:</label>
              <textarea 
                value={customBestelstopText} 
                onChange={e => setCustomBestelstopText(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-800 p-2 text-white rounded-lg text-sm h-20"
                placeholder="Bijv: 🛑 Tijdelijke bestelstop..."
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400">Snelle templates:</label>
              <div className="flex flex-wrap gap-2">
                {[
                  '🛑 Drukte: Wegens extreme drukte tijdelijk gesloten.', 
                  '🛠️ Onderhoud: Systeem onderhoud, even geduld.', 
                  '🔌 Storing: Tijdelijke technische storing.', 
                  '🍔 Voorraad: Voorraad op, helaas.',
                  '📢 Vakantie: Even eruit, tot snel!'
                ].map(template => (
                  <button 
                    key={template}
                    onClick={() => setCustomBestelstopText(template)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300 text-left"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-800">
              <h4 className="font-bold text-slate-200 text-sm">Layout Customization</h4>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400">Titel</label>
                  <input 
                    value={stopTitle}
                    onChange={e => setStopTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 text-white rounded-lg text-xs"
                    placeholder="Titel bovenin"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400">Thema Kleur</label>
                  <select 
                    value={stopTheme}
                    onChange={e => setStopTheme(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 p-2 text-white rounded-lg text-xs"
                  >
                    <option value="rose">Rood (Standaard)</option>
                    <option value="amber">Oranje/Amber</option>
                    <option value="emerald">Groen</option>
                    <option value="blue">Blauw</option>
                    <option value="slate">Donker Grijs</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400">Icoontje (Emoji)</label>
                  <div className="space-y-2">
                    <input 
                      value={stopIcon}
                      onChange={e => setStopIcon(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 p-2 text-white rounded-lg text-xs"
                      placeholder="Bijv: 🛑 of 🛠️"
                    />
                    <QuickEmojiSelector onSelect={setStopIcon} current={stopIcon} />
                  </div>
                </div>
                <div className="flex flex-col justify-end">
                   <div className="flex items-center justify-between text-[11px] text-slate-300 mb-2">
                    <span>Blokkeer Afhaal</span>
                    <input 
                      type="checkbox" 
                      className="toggle toggle-xs" 
                      checked={stopBlockPickup} 
                      onChange={e => setStopBlockPickup(e.target.checked)} 
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Toon Klok</span>
                <input 
                  type="checkbox" 
                  className="toggle toggle-sm" 
                  checked={stopShowClock} 
                  onChange={e => setStopShowClock(e.target.checked)} 
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Toon Nieuwsbalk</span>
                <input 
                  type="checkbox" 
                  className="toggle toggle-sm" 
                  checked={stopShowNews} 
                  onChange={e => setStopShowNews(e.target.checked)} 
                />
              </div>
            </div>

            <button onClick={handleUpdateBestelstop} className="w-full bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-xl font-bold text-sm transition">
              Bestelstop Activeren
            </button>
            <button 
              onClick={() => setShowBestelstopModal(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl font-bold text-sm transition"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Cadeaubonnen & Privé Cards Beheer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <Gift className="w-4 h-4 text-purple-400" />
              <span>💳 Alle Cadeaukaarten &amp; Privé Cards ({giftCards.length})</span>
            </h2>
            <p className="text-xs text-slate-400">Bekijk alle huidige cadeaukaarten, ook privé/personeelskaarten en vouchers</p>
          </div>

          {/* Filter Toggles */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setGiftCardFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${giftCardFilter === 'all' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Alle ({giftCards.length})
            </button>
            <button
              type="button"
              onClick={() => setGiftCardFilter('private')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${giftCardFilter === 'private' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              🔒 Privé
            </button>
            <button
              type="button"
              onClick={() => setGiftCardFilter('active')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${giftCardFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              🟢 Actief Saldo
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* List / Search View */}
          <div className="lg:col-span-7 space-y-2.5">
            <input
              type="text"
              value={giftCardSearch}
              onChange={e => setGiftCardSearch(e.target.value)}
              placeholder="🔍 Zoek code, ontvanger, afzender of opmerking..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-500 outline-none"
            />

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {giftCards
                .filter(card => {
                  if (giftCardFilter === 'private' && !card.is_private && !card.notes?.includes('Privé') && !card.code.includes('PRV')) return false;
                  if (giftCardFilter === 'active' && card.current_balance <= 0) return false;
                  if (giftCardSearch) {
                    const q = giftCardSearch.toLowerCase();
                    return card.code.toLowerCase().includes(q) ||
                           (card.recipient_name && card.recipient_name.toLowerCase().includes(q)) ||
                           (card.sender_name && card.sender_name.toLowerCase().includes(q)) ||
                           (card.notes && card.notes.toLowerCase().includes(q));
                  }
                  return true;
                })
                .map(card => {
                  const isPrivate = card.is_private || card.notes?.includes('Privé') || card.code.startsWith('PRV');
                  return (
                    <div key={card.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold font-mono text-purple-300 text-sm">{card.code}</span>
                          {isPrivate && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              🔒 Privé Card
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                navigator.clipboard.writeText(card.code);
                                showToast(`Code ${card.code} gekopieerd!`, 'success');
                              } catch {
                                showToast(`Code: ${card.code}`, 'info');
                              }
                            }}
                            className="text-[10px] text-slate-400 hover:text-white underline font-mono"
                            title="Kopieer Code"
                          >
                            [Kopieer]
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Saldo: <strong className="text-emerald-400 font-bold">{euro(card.current_balance)}</strong> / Start: {euro(card.initial_balance)}
                        </div>
                        {(card.recipient_name || card.sender_name) && (
                          <div className="text-[10px] text-slate-500 italic">
                            Voor: {card.recipient_name || 'Anoniem'} {card.sender_name ? `(Van: ${card.sender_name})` : ''}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => topUpGiftCard(card.id, 5)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px]"
                          title="Saldo ophogen met €5"
                        >
                          +€5
                        </button>
                        <button
                          type="button"
                          onClick={() => topUpGiftCard(card.id, 10)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px]"
                          title="Saldo ophogen met €10"
                        >
                          +€10
                        </button>
                        <button
                          type="button"
                          onClick={() => topUpGiftCard(card.id, 25)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px]"
                          title="Saldo ophogen met €25"
                        >
                          +€25
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteGiftCard(card.id)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                          title="Cadeaukaart Verwijderen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Create Form */}
          <form onSubmit={handleCreateGiftCard} className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-200">+ Nieuwe Cadeaukaart / Vrijkaart</h3>
              <button
                type="button"
                onClick={() => {
                  const rand = 'WD' + Math.floor(100000 + Math.random() * 900000);
                  setNewGiftCode(rand);
                }}
                className="text-[10px] text-purple-400 hover:underline font-bold"
              >
                Genereer Code
              </button>
            </div>

            <input
              type="text"
              required
              value={newGiftCode}
              onChange={e => setNewGiftCode(e.target.value.toUpperCase())}
              placeholder="Cadeauboncode (bijv. CADEAU50 of PRV99)"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white uppercase font-mono"
            />

            <input
              type="number"
              required
              step="1"
              value={newGiftAmount}
              onChange={e => setNewGiftAmount(e.target.value)}
              placeholder="Startsaldo in euro (€)"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white"
            />

            {/* Koppel aan Bestaand WerkLoyalty Account */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                <span>Koppel aan WerkLoyalty Account:</span>
              </label>
              <select
                value={newGiftRecipientPhone}
                onChange={e => {
                  const selectedPhone = e.target.value;
                  setNewGiftRecipientPhone(selectedPhone);
                  const found = loyaltyCustomers.find(c => c.phone === selectedPhone);
                  if (found) {
                    setNewGiftRecipient(found.name);
                  }
                }}
                className="w-full bg-slate-900 border border-amber-500/30 rounded-lg px-3 py-2 text-white focus:border-amber-400 outline-none"
              >
                <option value="">-- Geen Koppeling (Losse Card) --</option>
                {loyaltyCustomers.map(cust => (
                  <option key={cust.id} value={cust.phone}>
                    {cust.name} ({cust.phone}) • {cust.tier} {cust.vipSubscriptionActive ? '👑 VIP' : ''}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              value={newGiftRecipient}
              onChange={e => setNewGiftRecipient(e.target.value)}
              placeholder="Ontvanger naam (bijv. Jan de Vries)"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white"
            />

            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={newGiftIsPrivate}
                onChange={e => setNewGiftIsPrivate(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-purple-500"
              />
              <span className="font-bold">🔒 Markeer als Privé Card (Exclusief)</span>
            </label>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg font-extrabold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20"
            >
              + Cadeaukaart Opslaan
            </button>
          </form>
        </div>
      </div>

      {/* 👑 WerkLoyalty Klantaccounts & VIP Leden Beheer */}
      <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h2 className="font-black text-base text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              <span>👑 WerkLoyalty Klantaccounts &amp; VIP Leden ({loyaltyCustomers.length})</span>
            </h2>
            <p className="text-xs text-slate-400">
              Beheer alle klantedatabase accounts, geef WerkCoins, activeer VIP abonnementen en bekijk gekoppelde cadeaukaarten.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-bold font-mono">
              ⚡ Live Supabase Sync
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Account List / Search */}
          <div className="lg:col-span-8 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={loyaltySearch}
                onChange={e => setLoyaltySearch(e.target.value)}
                placeholder="🔍 Zoek klant op naam, telefoonnummer of tier..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-400 outline-none"
              />
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {loyaltyCustomers
                .filter(cust => {
                  if (!loyaltySearch) return true;
                  const q = loyaltySearch.toLowerCase();
                  return cust.name.toLowerCase().includes(q) ||
                         cust.phone.toLowerCase().includes(q) ||
                         cust.tier.toLowerCase().includes(q);
                })
                .map(cust => {
                  const isVip = cust.vipSubscriptionActive || cust.tier.includes('VIP');
                  return (
                    <div key={cust.id} className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 hover:border-slate-700 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{isVip ? '💎' : cust.tier === 'Goud' ? '🥇' : cust.tier === 'Zilver' ? '🥈' : '🥉'}</span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-white text-sm">{cust.name}</span>
                              <span className="font-mono text-xs text-slate-400">({cust.phone})</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Lid sinds: {cust.joinedDate || '2026'} • Total spent: <strong className="text-emerald-400">{euro(cust.totalSpent)}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Tier & VIP Badge */}
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                            isVip ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40' :
                            cust.tier === 'Goud' ? 'bg-amber-950 text-amber-300 border-amber-500/40' :
                            cust.tier === 'Zilver' ? 'bg-slate-800 text-slate-300 border-slate-600' :
                            'bg-amber-950/40 text-amber-600 border-amber-800/40'
                          }`}>
                            {cust.tier}
                          </span>

                          {isVip && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> VIP Club
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stats & Quick Actions Bar */}
                      <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-900 gap-2 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-amber-400 flex items-center gap-1">
                            🪙 {cust.coins} Coins
                          </span>
                          <span className="text-slate-400 text-[11px]">
                            🎟️ {cust.vouchers?.length || 0} Vouchers
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = loyaltyCustomers.map(c => c.id === cust.id ? { ...c, coins: c.coins + 50 } : c);
                              saveLoyaltyCustomers(updated);
                              setLoyaltyCustomers(getLoyaltyCustomers());
                              showToast(`+50 Coins gegeven aan ${cust.name}!`, 'success');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold border border-amber-500/20 text-[11px]"
                          >
                            +50 Coins
                          </button>

                          {!isVip ? (
                            <button
                              type="button"
                              onClick={() => {
                                setVipModalCustomer({ phone: cust.phone, name: cust.name });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] shadow flex items-center gap-1"
                            >
                              <Crown className="w-3 h-3" />
                              <span>👑 VIP Activeren (WerkPay)</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> VIP Actief
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setNewGiftRecipientPhone(cust.phone);
                              setNewGiftRecipient(cust.name);
                              setNewGiftIsPrivate(true);
                              showToast(`Geselecteerd: Koppel cadeaukaart aan ${cust.name}`, 'info');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1"
                          >
                            <Link2 className="w-3 h-3" />
                            <span>Koppel Card</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Create Account Form */}
          <form onSubmit={handleCreateLoyaltyCustomer} className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
            <h3 className="font-extrabold text-white text-sm flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>+ Nieuw WerkLoyalty Account</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Meld een nieuwe vaste klant handmatig aan vanuit het kassasysteem. Ontvangt direct 50 Welkomstmunten!
            </p>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 font-bold block">Klantnaam:</label>
              <input
                type="text"
                required
                value={newLoyaltyName}
                onChange={e => setNewLoyaltyName(e.target.value)}
                placeholder="Bijv. Mark de Jong"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 font-bold block">Telefoonnummer:</label>
              <input
                type="tel"
                required
                value={newLoyaltyPhone}
                onChange={e => setNewLoyaltyPhone(e.target.value)}
                placeholder="0612345678"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl font-black bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg shadow-amber-400/20"
            >
              + Klant Account Aanmaken &amp; Syncen
            </button>
          </form>
        </div>
      </div>

      {/* Menu & Product Management (50+ Items) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <span>🍔 Menulijst, Actieprijzen &amp; Items ({products.length} gerechten)</span>
            </h2>
            <p className="text-xs text-slate-400">Prijzen aanpassen of actieprijzen tijdelijk activeren.</p>
          </div>
          <button
            onClick={() => {
              if (confirm('Menulijst herstellen naar standaard 67 Werkdonalds gerechten?')) {
                resetProductsToDefault();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Herstel Standaardlijst</span>
          </button>
          <button
            onClick={async () => {
              await syncProducts();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Producten van online laden</span>
          </button>
        </div>

        {/* Add Product Form */}
        <form onSubmit={handleCreateProduct} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
          <input
            type="text"
            required
            value={newProdName}
            onChange={e => setNewProdName(e.target.value)}
            placeholder="Naam gerecht"
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
          />
          <input
            type="number"
            required
            step="0.05"
            value={newProdPrice}
            onChange={e => setNewProdPrice(e.target.value)}
            placeholder="Prijs (€ 5.95)"
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
          />
          <input
            type="number"
            step="0.05"
            value={newProdSalePrice}
            onChange={e => setNewProdSalePrice(e.target.value)}
            placeholder="Actie (€ 3.95)"
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
          />
          <select
            value={newProdCat}
            onChange={e => setNewProdCat(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
          >
            <option value="Burgers & Wraps">Burgers & Wraps</option>
            <option value="Chicken & Snacks">Chicken & Snacks</option>
            <option value="Friet & Sides">Friet & Sides</option>
            <option value="Dranken & McCafé">Dranken & McCafé</option>
            <option value="Desserts & IJs">Desserts & IJs</option>
            <option value="Happy Meal">Happy Meal</option>
            <option value="Sauzen & Dips">Sauzen & Dips</option>
          </select>
          <button
            type="submit"
            className="py-1.5 rounded-lg font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Toevoegen
          </button>
        </form>

        {/* Product Table */}
        <div className="overflow-x-auto max-h-72 border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] sticky top-0 border-b border-slate-800">
              <tr>
                <th className="p-2.5">Emoji</th>
                <th className="p-2.5">Product</th>
                <th className="p-2.5">Categorie</th>
                <th className="p-2.5">Regulier</th>
                <th className="p-2.5">Actieprijs</th>
                <th className="p-2.5">Actie Status</th>
                <th className="p-2.5 text-right">Beheer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/30">
                  <td className="p-2.5 text-base">{p.emoji}</td>
                  <td className="p-2.5 font-bold text-white">{p.name}</td>
                  <td className="p-2.5 text-slate-400">{p.cat}</td>
                  <td className="p-2.5 font-mono">{euro(p.price)}</td>
                  <td className="p-2.5 font-mono">{p.salePrice > 0 ? euro(p.salePrice) : '—'}</td>
                  <td className="p-2.5">
                    <button
                      onClick={() => toggleProductSale(p.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.onSale ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p.onSale ? '🔥 Actie Aan' : 'Uit'}
                    </button>
                  </td>
                  <td className="p-2.5 text-right flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditingProduct({ ...p })}
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Bewerken"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-blue-400" />
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm(`Weet je zeker dat je "${p.name}" wilt verwijderen?`)) {
                          await deleteProduct(p.id);
                        }
                      }}
                      className="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                      title="Verwijderen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Kortingscoupons Beheer */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
        <h2 className="font-bold text-sm text-white flex items-center gap-2">
          <Tag className="w-4 h-4 text-emerald-400" />
          <span>🏷️ Kortingscoupons Beheren</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 overflow-y-auto max-h-48 pr-1">
            {coupons.map(c => (
              <div key={c.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold font-mono text-emerald-300">{c.code}</span>
                  <div className="text-[11px] text-slate-400">
                    Korting: {c.discount_type === 'percent' ? `${c.discount_val}%` : euro(c.discount_val)}
                  </div>
                </div>
                <button
                  onClick={() => toggleCouponActive(c.id)}
                  className={`px-2.5 py-1 rounded text-xs font-bold ${
                    c.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {c.is_active ? '🟢 Actief' : '🔴 Uit'}
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleCreateCoupon} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs">
            <h3 className="font-bold text-slate-300">+ Nieuwe Coupon Aanmaken</h3>
            <input
              type="text"
              required
              value={newCouponCode}
              onChange={e => setNewCouponCode(e.target.value.toUpperCase())}
              placeholder="Couponcode"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white uppercase font-mono"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newCouponType}
                onChange={e => setNewCouponType(e.target.value as any)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
              >
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Vast Bedrag (€)</option>
              </select>
              <input
                type="number"
                required
                step="0.05"
                value={newCouponVal}
                onChange={e => setNewCouponVal(e.target.value)}
                placeholder="Kortingswaarde"
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              + Coupon Opslaan
            </button>
          </form>
        </div>
      </div>

      {/* Werknemers & Rechten */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>👥 Werknemers, Rollen &amp; Toegangsrechten ({posUsers.length})</span>
            </h2>
            <p className="text-xs text-slate-400">
              Beheer bestaande gebruikers, pas schermen en rechten aan. Let op: Joas kan alleen door Joas worden aangepast.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* User List */}
          <div className="lg:col-span-7 space-y-2.5">
            {posUsers.map(u => {
              const isJoas = u.username.toLowerCase() === 'joas';
              const canEditThisUser = !isJoas || currentPosUser?.username.toLowerCase() === 'joas';

              return (
                <div key={u.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2.5 text-xs transition hover:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-white text-sm flex items-center gap-2 flex-wrap">
                        <span>{u.name}</span>
                        {isJoas && (
                          <span className="text-[10px] px-2 py-0.2 rounded-full font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            Eigenaar
                          </span>
                        )}
                        {u.is_banned && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            ⛔ Account Geblokkeerd (Rechten Zichtbaar)
                          </span>
                        )}
                        {u.is_shadowbanned && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            👻 Nep-Rechten (Shadowban Sandbox)
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">@{u.username}</div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        u.is_admin 
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' 
                          : u.username === 'bestel_kassa' || u.username === 'klant'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {u.is_admin ? 'Manager' : u.username === 'bestel_kassa' || u.username === 'klant' ? 'Klant' : 'Medewerker'}
                      </span>

                      {(u.is_admin || u.username === 'joas' || (u.perms && u.perms.includes('manager'))) && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSetup2FAUser(u.username)}
                            className={`px-2 py-1 rounded-lg font-extrabold text-[11px] border flex items-center gap-1 transition ${
                              u.is_2fa_enabled
                                ? 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-500/40 shadow-sm'
                                : 'bg-purple-950/50 hover:bg-purple-900/70 text-purple-300 border-purple-500/40'
                            }`}
                            title="Stel 2FA Tweestapsverificatie in (QR Code & Authenticator)"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{u.is_2fa_enabled ? '🔐 2FA Actief' : '🔐 2FA Instellen'}</span>
                          </button>

                          {u.is_2fa_enabled && (
                            <button
                              type="button"
                              onClick={() => {
                                executeWithMasterPin(`2FA Tweestapsverificatie Verwijderen voor @${u.username}`, async () => {
                                  const res = await disable2FAForUser(u.username);
                                  showToast(res.message, res.success ? 'success' : 'error');
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-extrabold text-[11px] border border-rose-500/40 flex items-center gap-1 transition"
                              title={`Verwijder 2FA voor @${u.username} (vereist Master Security PIN)`}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                              <span>2FA Verwijderen</span>
                            </button>
                          )}
                        </div>
                      )}

                      {canEditThisUser ? (
                        <button
                          type="button"
                          onClick={() => handleStartEditUser(u)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 flex items-center gap-1 transition"
                        >
                          <Edit3 className="w-3 h-3 text-blue-400" />
                          <span>Bewerken</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => showToast('Joas kan je alleen aanpassen als je zelf als Joas bent ingelogd.', 'warning')}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-400 font-medium text-xs border border-slate-800 flex items-center gap-1 cursor-not-allowed"
                          title="Alleen Joas kan het account van Joas bewerken"
                        >
                          <Lock className="w-3 h-3 text-amber-400" />
                          <span>Alleen Joas</span>
                        </button>
                      )}

                      {!isJoas && u.username !== 'bestel_kassa' && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              executeWithMasterPin(
                                u.is_shadowbanned
                                  ? `Nep-Rechten (Shadowban) Uitzetten voor @${u.username}`
                                  : `👻 Nep-Rechten (Shadowban) Aanzetten voor @${u.username}`,
                                async () => {
                                  const res = await toggleShadowbanUser(u.username);
                                  showToast(res.message, 'success');
                                }
                              );
                            }}
                            className={`px-2 py-1 rounded-lg font-extrabold text-[11px] border flex items-center gap-1 transition ${
                              u.is_shadowbanned
                                ? 'bg-purple-600 text-white border-purple-400 shadow-sm'
                                : 'bg-purple-950/50 hover:bg-purple-900/70 text-purple-300 border-purple-500/40'
                            }`}
                            title="Geef hem zichtbaar alle rechten waar hij om vraagt, maar negeer op de achtergrond alles wat hij probeert te wissen of slopen!"
                          >
                            <span>{u.is_shadowbanned ? '👻 Nep-Rechten AAN' : '👻 Nep-Rechten'}</span>
                          </button>

                          {u.is_banned ? (
                            <button
                              type="button"
                              onClick={() => {
                                executeWithMasterPin(`Account @${u.username} Deblokkeren`, async () => {
                                  const res = await unbanUser(u.username);
                                  showToast(res.message, 'success');
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 font-extrabold text-[11px] border border-emerald-500/40 flex items-center gap-1 transition"
                              title="Hef blokkade voor dit account op"
                            >
                              <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                              <span>🔓 Deblokkeer</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                executeWithMasterPin(`Account @${u.username} Schorsen & Blokkeren (Toestemmingen blijven zichtbaar staan)`, async () => {
                                  const res = await banAndSuspendUser(u.username, 'Account geblokkeerd met behoud van zichtbare rechten');
                                  showToast(res.message, res.success ? 'success' : 'error');
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-extrabold text-[11px] border border-rose-500/40 flex items-center gap-1 transition"
                              title="Blokkeer account direct terwijl zijn aangevinkte toestemmingen gewoon zichtbaar blijven staan"
                            >
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                              <span>🚷 Schors &amp; Blokkeer</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              executeWithMasterPin(`Medewerker ${u.name} Verwijderen`, () => {
                                handleDeleteUser(u);
                              });
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                            title="Medewerker verwijderen"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Permissions pills & Manager 3 Dienst-Timer Inkloksysteem */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-900">
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[10px] text-slate-500 font-bold self-center mr-1">Toegang:</span>
                      {u.perms && u.perms.length > 0 ? (
                        u.perms.map(p => {
                          const opt = PERMISSION_OPTIONS.find(o => o.id === p);
                          return (
                            <span
                              key={p}
                              className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-300"
                            >
                              {opt ? opt.label.split(' ')[0] : p}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">Geen extra rechten</span>
                      )}
                    </div>

                    {/* Manager 3: Live Inklok & Dienst-Timer Button */}
                    {u.username !== 'bestel_kassa' && u.username !== 'klant' && (() => {
                      const clockRecord = clockedInStaff.find(c => c.username.toLowerCase() === u.username.toLowerCase());
                      const isClockedIn = !!clockRecord;
                      const elapsedSec = clockRecord ? Math.floor((nowTime - clockRecord.clockInTime) / 1000) : 0;
                      const hrs = Math.floor(elapsedSec / 3600);
                      const mins = Math.floor((elapsedSec % 3600) / 60);
                      const secs = elapsedSec % 60;
                      const durationStr = `${hrs > 0 ? `${hrs}u ` : ''}${mins}m ${secs}s`;

                      return (
                        <div className="flex items-center gap-2">
                          {isClockedIn && (
                            <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md animate-pulse">
                              ⏱️ {durationStr}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleClockIn(u.username)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition ${
                              isClockedIn 
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30' 
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                            }`}
                            title={isClockedIn ? 'Meld medewerker af (Uitklokken)' : 'Meld medewerker aan voor dienst (Inklokken)'}
                          >
                            <span>{isClockedIn ? '🔴 Uitklokken' : '🟢 Inklokken'}</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* New Employee Form with Granular Permissions */}
          <div className="lg:col-span-5">
            <form onSubmit={handleCreateUser} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
              <h3 className="font-extrabold text-sm text-slate-200 flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>Nieuwe Medewerker Aanmaken</span>
              </h3>

              <div>
                <label className="text-slate-400 block mb-1">Volledige Naam</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="Volledige Naam"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Gebruikersnaam</label>
                <input
                  type="text"
                  required
                  value={newUserUsername}
                  onChange={e => setNewUserUsername(e.target.value)}
                  placeholder="Gebruikersnaam"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Wachtwoord of Pincode</label>
                <input
                  type="password"
                  required
                  value={newUserPass}
                  onChange={e => setNewUserPass(e.target.value)}
                  placeholder="Wachtwoord"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={e => setNewUserIsAdmin(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-500"
                />
                <span className="font-bold text-slate-200">👑 Is Manager / Beheerder (alle rechten)</span>
              </label>

              {/* Granular Permissions Checkboxes */}
              <div className="space-y-1.5 pt-1">
                <span className="font-bold text-slate-300 block">Kies Schermen &amp; Bevoegdheden:</span>
                <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
                  {PERMISSION_OPTIONS.map(opt => {
                    const isChecked = newUserIsAdmin || newUserPerms.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked 
                            ? 'bg-blue-500/10 border-blue-500/30 text-white' 
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={newUserIsAdmin}
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setNewUserPerms(prev => [...prev, opt.id]);
                            } else {
                              setNewUserPerms(prev => prev.filter(p => p !== opt.id));
                            }
                          }}
                          className="rounded border-slate-700 bg-slate-950 text-blue-500"
                        />
                        <div className="flex-1">
                          <span className="font-bold block text-slate-200">{opt.label}</span>
                          <span className="text-[10px] text-slate-400 block">{opt.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl font-black bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 transition"
              >
                + Medewerker Opslaan
              </button>
            </form>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">Medewerker Aanpassen</h3>
                  <p className="text-xs text-slate-400">Wijzig gegevens, rollen en toegangsrechten voor {editingUser.name}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingUser(null)} 
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">Volledige Naam</label>
                <input
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Gebruikersnaam</label>
                <input
                  type="text"
                  required
                  disabled={editingUser.username.toLowerCase() === 'joas'}
                  value={editingUser.username}
                  onChange={e => setEditingUser({ ...editingUser, username: e.target.value.toLowerCase() })}
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-blue-500 ${
                    editingUser.username.toLowerCase() === 'joas' ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />
                {editingUser.username.toLowerCase() === 'joas' && (
                  <p className="text-[11px] text-amber-400 mt-1">Gebruikersnaam 'joas' is beschermd en kan niet worden gewijzigd.</p>
                )}
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Wachtwoord Wijzigen (optioneel)</label>
                <input
                  type="password"
                  value={editUserPass}
                  onChange={e => setEditUserPass(e.target.value)}
                  placeholder="Laat leeg om het huidige wachtwoord te behouden"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingUser.is_admin)}
                  onChange={e => setEditingUser({ ...editingUser, is_admin: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-blue-500"
                />
                <span className="font-bold text-slate-200">👑 Manager / Beheerder Status (geeft volledige admin rechten)</span>
              </label>

              {/* Granular Permissions Selection */}
              <div className="space-y-2">
                <span className="font-bold text-slate-200 block">Kies Toegangsrechten &amp; Schermen:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map(opt => {
                    const isChecked = Boolean(editingUser.is_admin || editingUser.perms?.includes(opt.id));
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          isChecked
                            ? 'bg-blue-500/10 border-blue-500/30 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={Boolean(editingUser.is_admin)}
                          checked={isChecked}
                          onChange={e => {
                            const current = editingUser.perms || [];
                            if (e.target.checked) {
                              setEditingUser({ ...editingUser, perms: [...current, opt.id] });
                            } else {
                              setEditingUser({ ...editingUser, perms: current.filter(p => p !== opt.id) });
                            }
                          }}
                          className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-500"
                        />
                        <div>
                          <span className="font-bold text-slate-200 block text-xs">{opt.label}</span>
                          <span className="text-[10px] text-slate-400 block leading-tight">{opt.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold text-slate-300 transition text-sm"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-black text-white transition shadow-lg shadow-blue-600/25 text-sm"
                >
                  Wijzigingen Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-white text-sm">✏️ Product Bewerken</h3>
              <button onClick={() => setEditingProduct(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditProduct} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Productnaam</label>
                <input
                  type="text"
                  required
                  value={editingProduct.name}
                  onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Regulier (€)</label>
                  <input
                    type="number"
                    step="0.05"
                    required
                    value={editingProduct.price}
                    onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Actieprijs (€)</label>
                  <input
                    type="number"
                    step="0.05"
                    value={editingProduct.salePrice || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, salePrice: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.onSale}
                  onChange={e => setEditingProduct({ ...editingProduct, onSale: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-amber-400"
                />
                <span className="font-bold text-slate-300">🔥 Actieprijs Activeren</span>
              </label>

              {/* Recept & Ingrediënten Aanpassen */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <label className="text-amber-400 font-extrabold block text-xs flex items-center gap-1">
                  <span>👨‍🍳 Recept &amp; Benodigde Ingrediënten</span>
                </label>
                <textarea
                  rows={2}
                  value={editingProduct.recipeDescription || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, recipeDescription: e.target.value })}
                  placeholder="Bijv. 1x Sesam Bunge, 2x Rundvlees Patty, 1x Cheddar Kaas, Augurk & Speciaalsaus"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white placeholder-slate-600 focus:border-amber-400 outline-none"
                />
                <p className="text-[10px] text-slate-500 italic">
                  Hiermee weet de keuken precies welke ingrediënten en hoeveelheden nodig zijn voor dit product.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="flex-1 py-2 rounded-lg bg-slate-800 font-bold text-slate-300"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-amber-400 font-bold text-slate-950"
                >
                  Opslaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Z-Report Modal */}
      {showZReport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="font-black text-sm text-white">📊 Dagafsluiting Z-Rapport</span>
              <button onClick={() => setShowZReport(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 bg-white text-slate-950 font-mono text-xs space-y-2 select-text">
              <div className="text-center pb-2 border-b-2 border-dashed border-slate-300">
                <h3 className="font-black text-base">WERKDONALDS POS</h3>
                <p className="text-[10px] text-slate-500">Z-RAPPORT / FINANCIËLE DAGAFSLUITING</p>
                <p className="text-[10px] text-slate-500">{new Date().toLocaleString('nl-NL')}</p>
              </div>

              <div className="space-y-1 py-2 border-b-2 border-dashed border-slate-300">
                <div className="flex justify-between">
                  <span>Aantal bestellingen:</span>
                  <strong>{validOrders.length}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Verkochte items:</span>
                  <strong>{totalItems}</strong>
                </div>
              </div>

              <div className="space-y-1 py-2 border-b-2 border-dashed border-slate-300">
                <div className="flex justify-between">
                  <span>Omzet WerkPay:</span>
                  <strong>{euro(workPayRevenue)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Omzet Contant:</span>
                  <strong>{euro(cashRevenue)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Omzet Cadeaubon:</span>
                  <strong>{euro(giftCardRevenue)}</strong>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Gegeven kortingen:</span>
                  <strong>- {euro(totalDiscounts)}</strong>
                </div>
              </div>

              <div className="pt-2 font-bold text-sm space-y-1">
                <div className="flex justify-between text-slate-950">
                  <span>BRUTO OMZET:</span>
                  <span>{euro(totalRevenue)}</span>
                </div>
                <div className="flex justify-between text-rose-600 text-xs">
                  <span>Inkoopkosten:</span>
                  <span>- {euro(totalExpenses)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-black pt-1 border-t border-slate-300">
                  <span>NETTOWINST:</span>
                  <span>{euro(netProfit)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Print Z-Rapport</span>
              </button>
              <button
                onClick={() => setShowZReport(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-black bg-amber-400 hover:bg-amber-300 text-slate-950"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {showDiyTerminalModal && (
        <DiyTerminalModal onClose={() => setShowDiyTerminalModal(false)} />
      )}

      {vipModalCustomer && (
        <VipWerkPaySubscriptionModal
          customerPhone={vipModalCustomer.phone}
          customerName={vipModalCustomer.name}
          onClose={() => setVipModalCustomer(null)}
          onSuccess={() => {
            setLoyaltyCustomers(getLoyaltyCustomers());
            setVipModalCustomer(null);
          }}
        />
      )}

      {/* 🔑 Master PIN Security Gate Modal */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handlePinSubmit} className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">🔑 Master Security PIN</h3>
                <p className="text-xs text-slate-400">{pinModalTitle || 'Geautoriseerde actie'}</p>
              </div>
            </div>

            <div className="p-3 bg-amber-950/30 border border-amber-500/20 rounded-xl text-xs text-amber-200">
              Voer de 4-cijferige Master Security PIN in om deze actie uit te voeren.
            </div>

            <input
              type="password"
              maxLength={8}
              autoFocus
              required
              value={pinModalInput}
              onChange={e => setPinModalInput(e.target.value)}
              placeholder="****"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 text-center text-2xl tracking-[0.5em] font-mono text-amber-400 focus:border-amber-400 outline-none"
            />

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs"
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl font-black bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs shadow-lg shadow-amber-400/20"
              >
                Bevestigen &amp; Uitvoeren
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 🔑 2FA Setup Modal */}
      {setup2FAUser && (
        <TwoFactorSetupModal
          username={setup2FAUser}
          onClose={() => setSetup2FAUser(null)}
        />
      )}

      {/* ⛔ Bestelstop Customization & Live Preview Modal */}
      {showBestelstopModal && (
        <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border-2 border-rose-500/50 rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl space-y-6 text-white text-left animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold text-lg shrink-0">
                  ⛔
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-base">⛔ Bestelstop Instellen &amp; Regisseren</h3>
                  <p className="text-xs text-slate-400">Kies een reden en bekijk direct de live TV preview</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBestelstopModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Selection */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-rose-400">
                1. Selecteer Reden / Sjabloon
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBestelstopTemplate('drukte');
                    setCustomBestelstopText('Beste gast, wegens extreme drukte in onze keuken hebben we tijdelijk een bestelstop ingelast. We bereiden momenteel de lopende bestellingen voor. Excuses voor de vertraging!');
                  }}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                    selectedBestelstopTemplate === 'drukte' ? 'bg-rose-950/60 border-rose-500 text-white' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-lg">🍳</span>
                  <span className="text-[10px] font-bold">Extreme Drukte</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedBestelstopTemplate('storing');
                    setCustomBestelstopText('Beste gast, wegens een tijdelijke storing in ons kassasysteem kunnen er momenteel geen nieuwe bestellingen worden geplaatst. Onze excuses voor het ongemak!');
                  }}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                    selectedBestelstopTemplate === 'storing' ? 'bg-rose-950/60 border-rose-500 text-white' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-lg">💻</span>
                  <span className="text-[10px] font-bold">Systeem Storing</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedBestelstopTemplate('custom');
                  }}
                  className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                    selectedBestelstopTemplate === 'custom' ? 'bg-rose-950/60 border-rose-500 text-white' : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-lg">✍️</span>
                  <span className="text-[10px] font-bold">Eigen Tekst</span>
                </button>
              </div>
            </div>

            {/* Custom Text Area */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-rose-400 flex justify-between items-center">
                <span>2. Bewerk Aankondiging Tekst</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {customBestelstopText.length} tekens
                </span>
              </label>
              <textarea
                value={customBestelstopText}
                onChange={(e) => {
                  setCustomBestelstopText(e.target.value);
                  setSelectedBestelstopTemplate('custom');
                }}
                rows={3}
                placeholder="Typ hier de tekst die op het scherm getoond moet worden..."
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-rose-500 font-medium"
              />
            </div>

            {/* Custom Layout Settings */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 space-y-4">
              <label className="text-xs font-black uppercase tracking-wider text-rose-400 block border-b border-slate-800 pb-2 mb-3">
                3. Layout & Scherm Instellingen
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-bold">Koptekst (Titel)</label>
                  <input 
                    value={stopTitle}
                    onChange={e => setStopTitle(e.target.value)}
                    placeholder="Bijv. Tijdelijk geen bestellingen"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white focus:border-rose-500 outline-none transition"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-bold">Icoontje (Emoji)</label>
                  <div className="flex flex-col gap-2">
                    <input 
                      value={stopIcon}
                      onChange={e => setStopIcon(e.target.value)}
                      placeholder="Bijv. ⚠️"
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-center text-lg focus:border-rose-500 outline-none transition"
                    />
                    <QuickEmojiSelector onSelect={setStopIcon} current={stopIcon} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-slate-400 font-bold">Thema Kleur</label>
                  <select
                    value={stopTheme}
                    onChange={e => setStopTheme(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold focus:border-rose-500 outline-none transition"
                  >
                    <option value="rose">🔴 Rose (Alert)</option>
                    <option value="amber">🟠 Amber (Warning)</option>
                    <option value="emerald">🟢 Emerald (Success/Info)</option>
                    <option value="blue">🔵 Blue (System)</option>
                    <option value="slate">⚪ Slate (Neutral)</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-850 transition">
                    <input 
                      type="checkbox"
                      checked={stopBlockPickup}
                      onChange={e => setStopBlockPickup(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-rose-500"
                    />
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-[10px]">Blokkeer Afhaalscherm</span>
                      <span className="text-[9px] text-slate-500">Toon stop-melding over de hele TV</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-850 transition">
                  <input 
                    type="checkbox"
                    checked={stopShowClock}
                    onChange={e => setStopShowClock(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-rose-500"
                  />
                  <span className="font-bold text-white text-[10px]">Toon Klok</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-850 transition">
                  <input 
                    type="checkbox"
                    checked={stopShowNews}
                    onChange={e => setStopShowNews(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-rose-500"
                  />
                  <span className="font-bold text-white text-[10px]">Toon Nieuwsbar</span>
                </label>
              </div>
            </div>

            {/* Live TV Screen Mockup Preview */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <span>4. Live TV Scherm Preview</span>
                <span className="text-[9px] bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40 px-1.5 py-0.2 rounded animate-pulse">
                  PREVIEW
                </span>
              </label>
              
              {/* Giant TV Screen Frame Mockup */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner space-y-4 relative overflow-hidden">
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest font-black">Live feed</span>
                </div>
                
                <div className="text-center space-y-3 py-2">
                  <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center text-sm shadow animate-pulse ${
                    stopTheme === 'amber' ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-400' :
                    stopTheme === 'emerald' ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400' :
                    stopTheme === 'blue' ? 'bg-blue-500/20 border-2 border-blue-500 text-blue-400' :
                    stopTheme === 'slate' ? 'bg-slate-500/20 border-2 border-slate-500 text-slate-400' :
                    'bg-rose-500/20 border-2 border-rose-500 text-rose-400'
                  }`}>
                    {stopIcon}
                  </div>
                  
                  <div className="space-y-1">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                      stopTheme === 'amber' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                      stopTheme === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                      stopTheme === 'blue' ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                      stopTheme === 'slate' ? 'bg-slate-500/20 text-slate-300 border-slate-500/40' :
                      'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}>
                      {stopIcon} {stopTitle}
                    </span>
                    <h4 className="text-sm font-black text-white uppercase tracking-tight">
                      {stopTitle}
                    </h4>
                    <p className="text-[10px] text-slate-400 leading-normal max-w-sm mx-auto font-medium italic">
                      "{customBestelstopText || '...'}"
                    </p>
                  </div>
                  
                  {stopShowClock && (
                    <div className="text-[9px] font-mono text-slate-600 font-bold pt-1">
                      {new Date().toLocaleTimeString('nl-NL', {hour:'2-digit', minute:'2-digit'})}
                    </div>
                  )}
                </div>

                {/* News bar ticker mockup inside the preview */}
                {stopShowNews && (
                  <div className="border-t border-slate-900 pt-2.5 flex items-center justify-between text-[8px] font-bold text-slate-500 shrink-0">
                    <div className="flex items-center gap-1 shrink-0 bg-[#E3000F] text-white px-1.5 py-0.5 rounded font-black font-sans tracking-widest">
                      NOS
                    </div>
                    <div className="flex-1 overflow-hidden mx-2 relative h-3 flex items-center text-slate-400 text-[8px] font-medium font-mono">
                      <span className="animate-marquee whitespace-nowrap">
                        ● [NOS Binnenland] Kabinet presenteert verduurzamingssubsidies voor de Nederlandse horeca ● [NOS Weer] Zonnig & droog in NL (18°C)
                      </span>
                    </div>
                    <div className="shrink-0 font-mono text-[8px] text-amber-400">
                      NOS LIVE
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowBestelstopModal(false)}
                className="flex-1 py-3 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleUpdateBestelstop}
                className={`flex-1 py-3 rounded-xl font-black text-white text-xs shadow-lg transition flex items-center justify-center gap-1.5 ${
                  stopTheme === 'amber' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/35' :
                  stopTheme === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/35' :
                  stopTheme === 'blue' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/35' :
                  stopTheme === 'slate' ? 'bg-slate-700 hover:bg-slate-600 shadow-slate-700/35' :
                  'bg-rose-600 hover:bg-rose-500 shadow-rose-600/35'
                }`}
              >
                <span>⛔ Activeer Bestelstop</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

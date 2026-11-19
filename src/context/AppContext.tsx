import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import type {
  AppMode,
  PosScreenType,
  WerkPayScreenType,
  Product,
  CartItem,
  Order,
  OrderItem,
  OrderStatus,
  OrderItemStage,
  InventoryItem,
  Coupon,
  GiftCard,
  PosUser,
  BankAccount,
  BankTransaction,
  CashPaymentRequest,
  BrandType,
  BrandConfig,
  OrderStopConfig,
  CustomBrandingConfig,
  LinkedNfcTag,
  ReceiptPrinterConfig
} from '../types';
import { showToast } from '../services/appToast';
import {
  INITIAL_BANK_ACCOUNTS,
  INITIAL_INVENTORY,
  INITIAL_COUPONS,
  INITIAL_GIFT_CARDS,
  INITIAL_POS_USERS,
  ORDER_KIOSK_USER,
  RPI_KIOSK_USER,
  BRAND_CONFIGS,
  normalizeCardUid,
  parseLinkedUids,
  accountMatchesUid,
  generateVirtualCardUid,
  isVirtualCardNumber
} from '../services/store';
import { ALL_DEFAULT_PRODUCTS } from '../services/defaultProducts';
import { AudioFX } from '../services/audio';
import {
  formatDbOrder,
  mergeOrders,
  broadcastSync,
  recordLocalOrderMutation,
  recordDeletedOrder,
  pendingOrderMutations,
  mergeBankAccountsList,
  mergePosUsersList,
  mergeByIdWithCloud,
  PendingBankWrite
} from '../services/syncHelpers';
import { calculateDiscount } from '../services/discountService';
import { redeemVoucherAnyCustomer, addCoinsToCustomer, isVipSubscriberPhone, issueVoucherForCustomer, findLoyaltyCustomerByPhoneOrName } from '../services/loyalty';
import { verifyTotpCode } from '../services/totp';
import {
  DEFAULT_RECEIPT_PRINTER_CONFIG,
  normalizeReceiptPrinterConfig,
  setSavedReceiptSize,
  receiptPrinter
} from '../services/receiptPrinter';
import {
  enqueueOfflineMutation,
  flushOfflineQueue,
  getOfflineQueue,
  OFFLINE_QUEUE_EVENT,
  OfflineMutationItem
} from '../services/offlineQueue';
import {
  fsGetCollection,
  fsSubscribeCollection,
  fsSubscribeDoc,
  getActiveHardwareTerminalId,
  getConfiguredHardwareTerminals,
  HARDWARE_TERMINAL_EVENT,
  setHardwareTerminalCheckResult,
  subscribeHardwareTerminal,
  testFirestoreConnection
} from '../services/firebase';
import {
  fromFirestoreProduct,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveProductsBatchToFirestore,
  saveOrderToFirestore,
  deleteOrderFromFirestore,
  fromFirestoreBankAccount,
  saveBankAccountToFirestore,
  deleteBankAccountFromFirestore,
  saveBankTransactionToFirestore,
  adjustBankBalanceTransaction,
  savePosUserToFirestore,
  deletePosUserFromFirestore,
  saveInventoryItemToFirestore,
  saveInventoryBatchToFirestore,
  saveCouponToFirestore,
  saveGiftCardToFirestore,
  deleteGiftCardFromFirestore,
  saveCashRequestToFirestore,
  savePosSettingsToFirestore,
  emitAudioBroadcastEvent,
  saveAuditLogToFirestore,
  savePosSessionToFirestore,
  getAllBankAccountsFromFirestore,
  getPosSettingsFromFirestore
} from '../services/firestoreSync';

const getMajorityStatus = (items: any[]): OrderStatus => {
  if (!items || items.length === 0) return 'wachten';
  const counts = { wachten: 0, bereiden: 0, inpakken: 0, klaar: 0 };
  items.forEach(it => {
    const stage = it.stage || (it.done ? 'klaar' : 'wachten');
    if (stage in counts) {
      counts[stage as keyof typeof counts] += (it.qty || 1);
    }
  });

  const totalQty = items.reduce((sum, it) => sum + (it.qty || 1), 0);
  if (counts.klaar === totalQty) {
    return 'klaar';
  }

  let bestStage: OrderStatus = 'wachten';
  let maxVal = -1;
  const stagesOrdered: OrderStatus[] = ['klaar', 'wachten', 'inpakken', 'bereiden'];
  for (const st of stagesOrdered) {
    const val = counts[st as keyof typeof counts] || 0;
    if (val > maxVal) {
      maxVal = val;
      bestStage = st;
    }
  }
  return bestStage;
};

export interface PosSession {
  device_id: string;
  ip_address: string;
  user_name: string;
  app_mode: string;
  pos_screen: string;
  user_agent: string;
  last_seen: string;
}

interface AppContextType {
  // Navigation & Brand
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  posScreen: PosScreenType;
  setPosScreen: (screen: PosScreenType) => void;
  werkpayScreen: WerkPayScreenType;
  setWerkpayScreen: (screen: WerkPayScreenType) => void;
  activeBrand: BrandType;
  setActiveBrand: (brand: BrandType) => void;
  brandConfig: BrandConfig;
  brandProducts: Product[];

  // Connection & Firebase Cloud Sync
  isOnline: boolean;
  connectionText: string;
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  isRealtimeActive: boolean;
  lastSyncTime: Date | null;
  forceSyncNow: () => Promise<void>;
  testConnection: () => Promise<{ success: boolean; message: string }>;
  offlineQueueCount: number;
  offlineQueueItems: OfflineMutationItem[];
  isFlushingOfflineQueue: boolean;
  flushOfflineQueueNow: () => Promise<{ flushed: number; remaining: number; lastError?: string }>;

  // POS State
  products: Product[];
  cart: CartItem[];
  orders: Order[];
  orderNo: number;
  inventory: InventoryItem[];
  coupons: Coupon[];
  giftCards: GiftCard[];
  totalExpenses: number;
  orderStopActive: boolean;
  orderStopText: string;
  orderStopConfig: OrderStopConfig;
  customBranding: CustomBrandingConfig;
  updateCustomBranding: (config: Partial<CustomBrandingConfig>) => Promise<void>;
  managerOverride: boolean;
  activateManagerOverride: (pin: string) => { success: boolean; message: string };
  deactivateManagerOverride: () => void;
  pickupClosed: boolean;
  isSystemLocked: boolean;
  setIsSystemLocked: (locked: boolean) => void;
  autoLockMinutes: number;
  setAutoLockMinutes: (mins: number) => void;
  unlockSystemWithCard: (
    cardUid: string,
    pin?: string,
    requirePin?: boolean,
    twoFactorCode?: string
  ) => Promise<{ success: boolean; message: string; requires2FA?: boolean }>;
  setOrderStopActiveWithText: (active: boolean, text: string, config?: Partial<OrderStopConfig>) => Promise<void>;
  currentPosUser: PosUser | null;
  setCurrentPosUser: (user: PosUser | null) => void;
  appliedDiscount: { type: string; val: number; code?: string; label: string };

  // Cart & POS Actions
  addToCart: (item: Omit<CartItem, 'id'>) => void;
  updateCartQty: (index: number, delta: number) => void;
  setCartItemQty: (index: number, qty: number) => void;
  removeFromCart: (index: number) => void;
  emptyCart: () => void;
  applyCouponCode: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  toggleOrderStop: () => void;
  togglePickupClosed: () => void;
  updateOrderStatus: (orderNo: number, newStatus: OrderStatus) => Promise<void>;
  toggleOrderItemDone: (orderNo: number, itemIndex: number) => void;
  updateOrderItemStage: (orderNo: number, itemIndex: number, stage: OrderItemStage) => void;
  toggleOrderPrio: (orderNo: number) => void;
  setAllOrderItemsDone: (orderNo: number, done: boolean) => void;
  cancelOrder: (orderNo: number) => Promise<void>;
  deleteOrder: (orderNo: number) => Promise<void>;
  trackedOrderNo: number | null;
  setTrackedOrderNo: (orderNo: number | null) => void;
  processCheckout: (
    method: 'workpay' | 'cash' | 'giftcard',
    orderType: 'dine_in' | 'takeaway' | 'delivery',
    identifier: string,
    paymentMeta: any
  ) => Promise<{ success: boolean; message: string; order?: Order }>;
  processSumUpPayment: (params: {
    amount: number;
    tipAmount?: number;
    description?: string;
    method: 'workpay' | 'cash';
    paymentMeta?: any;
    sendToKitchen?: boolean;
    orderType?: 'dine_in' | 'takeaway' | 'delivery';
    identifier?: string;
    items?: OrderItem[];
    notes?: string;
  }) => Promise<{ success: boolean; message: string; order?: Order }>;
  refundSumUpTransaction: (orderNo: number) => Promise<{ success: boolean; message: string }>;

  // Cash Payment Requests (Cross-terminal / Staff authorization)
  cashRequests: CashPaymentRequest[];
  createCashRequest: (orderNo: number, total: number, orderType: 'dine_in' | 'takeaway' | 'delivery', identifier: string) => CashPaymentRequest;
  approveCashRequest: (requestId: string, approvedBy: string, received: number, change: number) => { success: boolean; message: string };
  rejectCashRequest: (requestId: string, reason?: string) => void;
  authorizeCashStaffUser: (user: PosUser | null) => boolean;
  verifyCashApprovalPin: (pin: string) => { valid: boolean; user?: PosUser; approverName?: string };

  // Product & Inventory Actions
  createProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: number) => Promise<void>;
  toggleProductSale: (id: number) => Promise<void>;
  resetProductsToDefault: () => Promise<void> | void;
  syncProducts: () => Promise<void>;
  buyInventory: (id: number, amount: number) => void;
  addInventoryItem: (item: Omit<InventoryItem, 'id'>) => void;

  // Coupons & Gift Cards
  createGiftCard: (code: string, amount: number) => void;
  topUpGiftCard: (id: number, amount: number) => void;
  deleteGiftCard: (id: number) => void;
  createCoupon: (coupon: Omit<Coupon, 'id'>) => void;
  toggleCouponActive: (id: number) => void;

  // POS Auth
  canAccess: (perm: string) => boolean;
  loginPos: (username: string, pass: string) => Promise<{ success: boolean; message: string }>;
  loginPosWithCard: (cardUid: string, pin?: string, requirePin?: boolean) => Promise<{ success: boolean; message: string }>;
  logoutPos: () => void;
  updatePosUser: (user: PosUser) => Promise<{ success: boolean; message: string }>;
  createPosUser: (user: Omit<PosUser, 'id'>) => Promise<{ success: boolean; message: string }>;
  deletePosUser: (userId: number) => Promise<{ success: boolean; message: string }>;
  posUsers: PosUser[];

  // WerkPay State
  currentBankAccount: BankAccount | null;
  bankAccounts: BankAccount[];
  setBankAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
  bankTransactions: BankTransaction[];
  setBankTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  loginWerkPay: (username: string, secret: string, mode: 'password' | 'pin') => Promise<{ success: boolean; message: string }>;
  loginWerkPayWithCard: (cardUid: string, pin?: string, requirePin?: boolean) => Promise<{ success: boolean; message: string }>;
  logoutWerkPay: () => void;
  topUpWerkPay: (amount: number) => Promise<{ success: boolean; message: string }>;
  transferWerkPay: (to: string, amount: number, note?: string) => Promise<{ success: boolean; message: string }>;
  changeWerkPayPin: (newPin: string) => Promise<{ success: boolean; message: string }>;
  saveBankAccount: (acc: Partial<BankAccount> & { id?: number | string }) => Promise<{ success: boolean; message?: string }>;
  deleteBankAccount: (id: number | string) => Promise<void>;
  quickMoneyAccount: (id: number | string, delta: number) => Promise<void>;

  // Receipt Modal & Global Receipt Printer Config
  activeReceiptOrder: Order | null;
  setActiveReceiptOrder: (order: Order | null) => void;
  receiptPrinterConfig: ReceiptPrinterConfig;
  updateReceiptPrinterConfig: (next: ReceiptPrinterConfig) => Promise<{ success: boolean; message: string }>;

  // Order Tracking & User Orders
  myOrderNumbers: number[];
  addMyOrderNumber: (orderNo: number) => void;
  isUserOrder: (order: Order) => boolean;
  getUserOrders: () => Order[];
  activeUserOrders: Order[];

  // GTA Arcade Reward
  claimGtaReward: (score: number) => Promise<{ success: boolean; message: string; reward: number }>;

  // Device & IP Blocking (Security & Blacklist & Active Sessions)
  blockedDevices: Array<{ id: string; type: 'ip' | 'device'; value: string; reason?: string; addedAt: string }>;
  blockDeviceOrIp: (type: 'ip' | 'device', value: string, reason?: string) => Promise<{ success: boolean; message: string }>;
  unblockDeviceOrIp: (value: string) => Promise<{ success: boolean; message: string }>;
  blockAllOtherDevices: () => Promise<{ success: boolean; message: string }>;
  activeSessions: PosSession[];
  isBlocked: boolean;
  blockedReason: string;
  clientIp: string;
  deviceId: string;

  // Master Security Shield & Tamper-Proof Safeguards
  masterPin: string;
  verifyMasterPin: (pin: string) => boolean;
  updateMasterPin: (newPin: string) => void;
  banAndSuspendUser: (username: string, reason?: string) => Promise<{ success: boolean; message: string }>;
  unbanUser: (username: string) => Promise<{ success: boolean; message: string }>;
  toggleShadowbanUser: (username: string) => Promise<{ success: boolean; message: string }>;
  enable2FAForUser: (username: string, secret: string, code: string, backupCodes: string[]) => Promise<{ success: boolean; message: string }>;
  disable2FAForUser: (username: string) => Promise<{ success: boolean; message: string }>;
  verify2FACodeForUser: (username: string, code: string) => Promise<boolean>;
  verify2FACardForUser: (username: string, cardUid: string, pin: string) => Promise<{ success: boolean; message: string }>;
  pending2FALogin: { user: PosUser | BankAccount; loginType: 'pos' | 'werkpay' } | null;
  setPending2FALogin: (val: { user: PosUser | BankAccount; loginType: 'pos' | 'werkpay' } | null) => void;
  confirm2FALogin: (code: string) => Promise<{ success: boolean; message: string }>;
  confirm2FALoginWithCard: (cardUid: string, pin: string) => Promise<{ success: boolean; message: string }>;
  tablesFrozen: boolean;
  toggleTablesFrozen: (freeze?: boolean) => Promise<{ success: boolean; message: string }>;
  saveDisasterRecoverySnapshot: () => void;
  restoreDisasterRecoverySnapshot: () => Promise<{ success: boolean; message: string }>;
  auditLogs: Array<{ id: string | number; action: string; user_name: string; details: string; timestamp: string }>;
  logAuditAction: (action: string, details: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Navigation State
  const [appMode, setAppMode] = useState<AppMode>('pos');
  const [posScreen, setPosScreen] = useState<PosScreenType>('kassa');
  const [werkpayScreen, setWerkpayScreen] = useState<WerkPayScreenType>('wallet');

  // Master Security Shield & Tamper-Proof Safeguards State
  const [masterPin, setMasterPinState] = useState<string>(() => {
    return localStorage.getItem('wd_master_pin') || '1234';
  });

  const [tablesFrozen, setTablesFrozenState] = useState<boolean>(() => {
    return localStorage.getItem('wd_tables_frozen') === 'true';
  });

  const [pending2FALogin, setPending2FALogin] = useState<{ user: PosUser | BankAccount; loginType: 'pos' | 'werkpay' } | null>(null);

  const [auditLogs, setAuditLogs] = useState<Array<{ id: string | number; action: string; user_name: string; details: string; timestamp: string }>>(() => {
    try {
      const saved = localStorage.getItem('wd_audit_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const verifyMasterPin = (pin: string): boolean => {
    const clean = pin.trim();
    return clean === masterPin;
  };

  const updateMasterPin = async (newPin: string) => {
    const clean = newPin.trim();
    setMasterPinState(clean);
    localStorage.setItem('wd_master_pin', clean);
    try {
      await savePosSettingsToFirestore({ master_security_pin: clean });
    } catch (e) {
      console.warn('Fout bij opslaan master_security_pin in pos_settings:', e);
    }
  };

  const logAuditAction = (action: string, details: string) => {
    const newLog = {
      id: `audit_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      action,
      user_name: 'Systeem/Manager',
      details,
      timestamp: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setAuditLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 100);
      localStorage.setItem('wd_audit_logs', JSON.stringify(updated));
      return updated;
    });
    saveAuditLogToFirestore({
      action,
      user_name: newLog.user_name,
      details,
      timestamp: new Date().toISOString()
    }).catch(() => {});
  };

  // Helper: Encode security & theme flags inside perms array for Firebase Firestore pos_users sync.
  const buildDbPermsForUser = (u: PosUser, overrideFreeze?: boolean): string[] => {
    const cleanPerms = (u.perms || ['pos', 'pickup']).filter(p => !p.startsWith('__'));
    const out = [...cleanPerms];
    if (u.is_shadowbanned) out.push('__shadowban__');
    if (u.is_banned || u.is_suspended) out.push('__banned__');
    if (u.theme && u.theme.trim()) {
      out.push(`__theme:${u.theme.trim()}__`);
    }
    if (u.is_2fa_enabled && u.totp_secret) {
      out.push(`__2fa_enabled:${u.totp_secret}__`);
      if (u.backup_codes && u.backup_codes.length > 0) {
        out.push(`__backup_codes:${u.backup_codes.join(',')}__`);
      }
    }
    const isFreezeActive = overrideFreeze !== undefined ? overrideFreeze : tablesFrozen;
    if (isFreezeActive && (u.username.toLowerCase() === 'joas' || u.username.toLowerCase() === 'admin')) {
      out.push('__tables_frozen__');
    }
    return Array.from(new Set(out));
  };

  const parsePosUserFromDb = (u: any): PosUser => {
    const rawPerms: string[] = Array.isArray(u.perms)
      ? u.perms
      : typeof u.perms === 'string'
      ? (() => { try { return JSON.parse(u.perms); } catch { return ['pos', 'pickup']; } })()
      : ['pos', 'pickup'];

    const hasShadowMarker = rawPerms.includes('__shadowban__') || u.session_token === 'SHADOWBANNED';
    const hasBanMarker = rawPerms.includes('__banned__') || u.session_token === 'BANNED';

    const themeMarker = rawPerms.find(p => p.startsWith('__theme:'));
    const themeFromMarker = themeMarker ? themeMarker.replace('__theme:', '').replace(/__/g, '') : undefined;

    const has2faMarker = rawPerms.find(p => p.startsWith('__2fa_enabled:'));
    const secretFromMarker = has2faMarker ? has2faMarker.replace('__2fa_enabled:', '').replace(/__/g, '') : '';
    const backupMarker = rawPerms.find(p => p.startsWith('__backup_codes:'));
    const backupsFromMarker = backupMarker ? backupMarker.replace('__backup_codes:', '').replace(/__/g, '').split(',') : [];

    const is2faActive = Boolean(u.is_2fa_enabled) || Boolean(secretFromMarker);
    const totpSecret = u.totp_secret || secretFromMarker;
    const backupCodes = (Array.isArray(u.backup_codes) && u.backup_codes.length > 0) ? u.backup_codes : backupsFromMarker;

    const cleanPerms = rawPerms.filter(p => !p.startsWith('__'));

    return {
      id: u.id,
      name: u.name,
      username: u.username,
      password: u.password,
      perms: cleanPerms,
      is_admin: Boolean(u.is_admin),
      is_banned: Boolean(u.is_banned) || hasBanMarker,
      is_suspended: Boolean(u.is_suspended) || hasBanMarker,
      is_shadowbanned: Boolean(u.is_shadowbanned) || hasShadowMarker,
      is_2fa_enabled: is2faActive,
      totp_secret: totpSecret,
      backup_codes: backupCodes,
      theme: u.theme || themeFromMarker
    };
  };

  const syncUserSecurityToFirestore = async (targetUser: PosUser, overrideFreeze?: boolean) => {
    const cleanU = targetUser.username.trim().toLowerCase();
    const dbPerms = buildDbPermsForUser(targetUser, overrideFreeze);
    try {
      await savePosUserToFirestore(
        { ...targetUser, perms: targetUser.perms || ['pos', 'pickup'] },
        dbPerms
      );

      // Sync security flags on matching bank_account if present
      const allAccs = await getAllBankAccountsFromFirestore().catch(() => []);
      const matchingBank =
        allAccs.find(a => a.username.toLowerCase() === cleanU) ||
        bankAccountsRef.current.find(a => a.username.toLowerCase() === cleanU);
      if (matchingBank) {
        await saveBankAccountToFirestore({
          ...matchingBank,
          is_shadowbanned: Boolean(targetUser.is_shadowbanned),
          is_banned: Boolean(targetUser.is_banned),
          is_suspended: Boolean(targetUser.is_suspended),
          is_2fa_enabled: Boolean(targetUser.is_2fa_enabled),
          totp_secret: targetUser.totp_secret || '',
          backup_codes: targetUser.backup_codes || []
        });
      }

      // Broadcast live via Firestore audio_events
      await emitAudioBroadcastEvent('wd_security_state_sync', {
        username: cleanU,
        is_shadowbanned: Boolean(targetUser.is_shadowbanned),
        is_banned: Boolean(targetUser.is_banned),
        is_suspended: Boolean(targetUser.is_suspended),
        tables_frozen: overrideFreeze !== undefined ? overrideFreeze : tablesFrozen
      });
    } catch (e) {
      console.warn('Security sync warning:', e);
    }
  };

  const shouldBlockTableWrite = (actionLabel: string): boolean => {
    if (currentPosUser?.is_shadowbanned) {
      logAuditAction('SHADOWBAN_TRAP', `👻 Nep-Rechten vangnet: @${currentPosUser.username} deed "${actionLabel}" (alleen nep op zijn scherm, 0 veranderingen in database!)`);
      return true;
    }
    if (tablesFrozen) {
      logAuditAction('TABLE_FREEZE_BLOCKED', `🔒 0-Veranderingen Tabel-Slot blokkeerde database-wijziging: "${actionLabel}"`);
      return true;
    }
    return false;
  };

  const toggleTablesFrozen = async (freeze?: boolean): Promise<{ success: boolean; message: string }> => {
    const nextFreeze = freeze !== undefined ? freeze : !tablesFrozen;
    setTablesFrozenState(nextFreeze);
    localStorage.setItem('wd_tables_frozen', String(nextFreeze));

    try {
      const adminTarget = posUsers.find(u => u.username.toLowerCase() === 'joas') || posUsers[0];
      if (adminTarget) {
        await syncUserSecurityToFirestore(adminTarget, nextFreeze);
      }
      const currentNewsCfgRaw = localStorage.getItem('wd_pickup_news_config_v2');
      let newsCfg: any = {};
      try { if (currentNewsCfgRaw) newsCfg = JSON.parse(currentNewsCfgRaw); } catch {}
      newsCfg.tables_frozen = nextFreeze;
      newsCfg.lastUpdated = Date.now();
      localStorage.setItem('wd_pickup_news_config_v2', JSON.stringify(newsCfg));
      await savePosSettingsToFirestore({
        order_stop_active: orderStopActive,
        pickup_closed: pickupClosed,
        tables_frozen: nextFreeze,
        news_config: newsCfg
      });
    } catch {}

    logAuditAction(
      nextFreeze ? 'TABELLEN_BEVROREN' : 'TABELLEN_ONTGRENDELD',
      nextFreeze
        ? '🔒 0-Veranderingen Tabel-Slot AANGEZET: Er kunnen 0 wijzigingen aan de tabellen worden aangebracht!'
        : '🔓 0-Veranderingen Tabel-Slot OPGEHEVEN: Tabellen kunnen weer normaal worden bewerkt.'
    );

    return {
      success: true,
      message: nextFreeze
        ? '🔒 0-Veranderingen Tabel-Slot AAN! Er worden vanaf nu 0 wijzigingen of verwijderingen doorgelaten naar je tabellen.'
        : '🔓 Tabel-Slot UIT! Je kunt producten, accounts en medewerkers weer normaal aanpassen.'
    };
  };

  const saveDisasterRecoverySnapshot = () => {
    try {
      const snapshot = {
        timestamp: new Date().toISOString(),
        products,
        posUsers,
        orders: orders.slice(0, 50),
        bankAccounts,
        giftCards
      };
      localStorage.setItem('wd_disaster_recovery_snapshot', JSON.stringify(snapshot));
    } catch {}
  };

  const restoreDisasterRecoverySnapshot = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const saved = localStorage.getItem('wd_disaster_recovery_snapshot');
      if (!saved) {
        return { success: false, message: 'Geen automatische back-up snapshot gevonden!' };
      }
      const data = JSON.parse(saved);
      if (data.products && Array.isArray(data.products)) setProducts(data.products);
      if (data.posUsers && Array.isArray(data.posUsers)) setPosUsers(data.posUsers);
      if (data.orders && Array.isArray(data.orders)) setOrders(data.orders);
      if (data.bankAccounts && Array.isArray(data.bankAccounts)) setBankAccounts(data.bankAccounts);
      if (data.giftCards && Array.isArray(data.giftCards)) setGiftCards(data.giftCards);

      logAuditAction('DISASTER_RECOVERY_RESTORE', 'Noodherstel uitgevoerd! Alle gegevens hersteld uit automatische snapshot.');
      return { success: true, message: '⚡ Alle gegevens succesvol hersteld uit de automatische back-up snapshot!' };
    } catch (err: any) {
      return { success: false, message: `Fout bij herstellen: ${err?.message || 'Onbekende fout'}` };
    }
  };

  const banAndSuspendUser = async (username: string, reason?: string): Promise<{ success: boolean; message: string }> => {
    const cleanU = username.trim().toLowerCase();
    if (cleanU === 'joas') {
      return { success: false, message: 'De hoofdbeheerder Joas kan niet worden geschorst!' };
    }

    let targetObj: PosUser | null = null;
    setPosUsers(prev => {
      const updated = prev.map(u => {
        if (u.username.toLowerCase() === cleanU) {
          targetObj = { ...u, is_banned: true, is_suspended: true };
          return targetObj;
        }
        return u;
      });
      localStorage.setItem('wd_pos_users', JSON.stringify(updated));
      return updated;
    });
    setBankAccounts(prev => prev.map(a => a.username.toLowerCase() === cleanU ? { ...a, is_banned: true, is_suspended: true } : a));

    // Also add to device/IP blacklist for cross-terminal live ejection
    await blockDeviceOrIp('device', cleanU, reason || `Account @${cleanU} geschorst door beheerder (zichtbare rechten behouden, toegang geblokkeerd)`);

    if (currentPosUser && currentPosUser.username.toLowerCase() === cleanU) {
      logoutPos();
    }

    const fallbackUser: PosUser = targetObj || {
      id: Date.now(),
      name: cleanU,
      username: cleanU,
      password: '1234',
      perms: ['pos', 'pickup'],
      is_admin: false,
      is_banned: true,
      is_suspended: true
    };
    await syncUserSecurityToFirestore(fallbackUser);

    logAuditAction('ACCOUNT_GESCHORST', `Account @${cleanU} geschorst en geblokkeerd (zichtbare rechten behouden)! ${reason || ''}`);
    return { success: true, message: `Account @${cleanU} is direct online geblokkeerd via Firebase!` };
  };

  const unbanUser = async (username: string): Promise<{ success: boolean; message: string }> => {
    const cleanU = username.trim().toLowerCase();
    let targetObj: PosUser | null = null;
    setPosUsers(prev => {
      const updated = prev.map(u => {
        if (u.username.toLowerCase() === cleanU) {
          targetObj = { ...u, is_banned: false, is_suspended: false };
          return targetObj;
        }
        return u;
      });
      localStorage.setItem('wd_pos_users', JSON.stringify(updated));
      return updated;
    });
    setBankAccounts(prev => prev.map(a => a.username.toLowerCase() === cleanU ? { ...a, is_banned: false, is_suspended: false } : a));
    await unblockDeviceOrIp(cleanU);

    if (targetObj) {
      await syncUserSecurityToFirestore(targetObj);
    }

    logAuditAction('ACCOUNT_GEDEBLOKKEERD', `Blokkade voor @${cleanU} opgeheven.`);
    return { success: true, message: `Blokkade voor @${cleanU} is opgeheven!` };
  };

  const toggleShadowbanUser = async (username: string): Promise<{ success: boolean; message: string }> => {
    const cleanU = username.trim().toLowerCase();
    if (cleanU === 'joas') {
      return { success: false, message: 'De hoofdbeheerder Joas kan niet op shadowban / nep-rechten worden gezet!' };
    }
    let targetObj: PosUser | null = null;
    let nextState = false;

    setPosUsers(prev => {
      const updated = prev.map(u => {
        if (u.username.toLowerCase() === cleanU) {
          nextState = !u.is_shadowbanned;
          targetObj = { ...u, is_shadowbanned: nextState };
          return targetObj;
        }
        return u;
      });
      localStorage.setItem('wd_pos_users', JSON.stringify(updated));
      return updated;
    });

    setBankAccounts(prev => prev.map(a => a.username.toLowerCase() === cleanU ? { ...a, is_shadowbanned: nextState } : a));

    if (targetObj) {
      await syncUserSecurityToFirestore(targetObj);
    }

    logAuditAction(
      nextState ? 'SHADOWBAN_AANGEZET' : 'SHADOWBAN_UITGEZET',
      `Nep-rechten (Shadowban) ${nextState ? 'AANGEZET' : 'UITGEZET'} voor @${cleanU}`
    );

    return {
      success: true,
      message: nextState
        ? `👻 Nep-rechten (Shadowban) AANGEZET voor @${cleanU}! Hij ziet al zijn rechten, maar op de achtergrond worden 0 acties opgeslagen.`
        : `👻 Nep-rechten UITGEZET voor @${cleanU}. Account werkt weer normaal.`
    };
  };

  const enable2FAForUser = async (username: string, secret: string, code: string, backupCodes: string[]): Promise<{ success: boolean; message: string }> => {
    const cleanU = username.trim().toLowerCase();
    const isValid = await verifyTotpCode(secret, code, backupCodes);
    if (!isValid) {
      return { success: false, message: 'Ongeldige 2FA Authenticator code! Probeer opnieuw.' };
    }

    setPosUsers(prev => {
      const updated = prev.map(u => u.username.toLowerCase() === cleanU ? {
        ...u,
        is_2fa_enabled: true,
        totp_secret: secret,
        backup_codes: backupCodes
      } : u);
      localStorage.setItem('wd_pos_users', JSON.stringify(updated));
      return updated;
    });

    setBankAccounts(prev => prev.map(a => a.username.toLowerCase() === cleanU ? {
      ...a,
      is_2fa_enabled: true,
      totp_secret: secret,
      backup_codes: backupCodes
    } : a));

    if (currentPosUser && currentPosUser.username.toLowerCase() === cleanU) {
      setCurrentPosUser(prev => prev ? { ...prev, is_2fa_enabled: true, totp_secret: secret, backup_codes: backupCodes } : null);
    }

    const existingUser = posUsers.find(u => u.username.toLowerCase() === cleanU);
    const userToSync: PosUser = {
      ...(existingUser || {
        id: Date.now(),
        name: cleanU,
        username: cleanU,
        password: '1234',
        perms: ['pos', 'manager'],
        is_admin: true
      }),
      is_2fa_enabled: true,
      totp_secret: secret,
      backup_codes: backupCodes
    };
    await syncUserSecurityToFirestore(userToSync);

    logAuditAction('2FA_INGESCHAKELD', `🔐 2FA Tweestapsverificatie succesvol geactiveerd voor @${cleanU}`);
    return { success: true, message: `2FA Tweestapsverificatie succesvol geactiveerd voor @${cleanU}!` };
  };

  const disable2FAForUser = async (username: string): Promise<{ success: boolean; message: string }> => {
    const cleanU = username.trim().toLowerCase();
    setPosUsers(prev => {
      const updated = prev.map(u => u.username.toLowerCase() === cleanU ? {
        ...u,
        is_2fa_enabled: false,
        totp_secret: '',
        backup_codes: []
      } : u);
      localStorage.setItem('wd_pos_users', JSON.stringify(updated));
      return updated;
    });

    setBankAccounts(prev => prev.map(a => a.username.toLowerCase() === cleanU ? {
      ...a,
      is_2fa_enabled: false,
      totp_secret: '',
      backup_codes: []
    } : a));

    if (currentPosUser && currentPosUser.username.toLowerCase() === cleanU) {
      setCurrentPosUser(prev => prev ? { ...prev, is_2fa_enabled: false, totp_secret: '', backup_codes: [] } : null);
    }

    try {
      sessionStorage.removeItem(`wd_manager_unlocked_${cleanU}`);
    } catch {}

    const existingUser = posUsers.find(u => u.username.toLowerCase() === cleanU);
    const disabledUser: PosUser = {
      ...(existingUser || {
        id: Date.now(),
        name: cleanU,
        username: cleanU,
        password: '1234',
        perms: ['pos', 'manager'],
        is_admin: true
      }),
      is_2fa_enabled: false,
      totp_secret: '',
      backup_codes: []
    };
    await syncUserSecurityToFirestore(disabledUser);

    logAuditAction('2FA_UITGESCHAKELD', `2FA Tweestapsverificatie uitgeschakeld voor @${cleanU}`);
    return { success: true, message: `2FA uitgeschakeld voor @${cleanU}.` };
  };

  const resolveUser2FACredentials = async (username: string): Promise<{ is_2fa_enabled: boolean; totp_secret: string; backup_codes: string[] } | null> => {
    const cleanU = username.trim().toLowerCase();
    const pendingMatch = pending2FALogin?.user?.username?.toLowerCase() === cleanU ? pending2FALogin.user : null;
    const currentMatch = currentPosUser?.username?.toLowerCase() === cleanU ? currentPosUser : null;
    const posMatch = posUsers.find(u => u.username.toLowerCase() === cleanU);
    const bankMatch = bankAccounts.find(a => a.username.toLowerCase() === cleanU);

    const candidates = [pendingMatch, currentMatch, posMatch, bankMatch].filter(Boolean) as Array<PosUser | BankAccount>;
    const enabledWithSecret = candidates.find(c => Boolean(c.totp_secret) && (c.is_2fa_enabled !== false));
    if (enabledWithSecret?.totp_secret) {
      return {
        is_2fa_enabled: true,
        totp_secret: enabledWithSecret.totp_secret,
        backup_codes: enabledWithSecret.backup_codes || []
      };
    }

    // Fallback: check live Firestore in case 2FA was just toggled on another device or before initial sync finished
    try {
      const dbUsers = await fsGetCollection('pos_users');
      const dbU = dbUsers.find((u: any) => String(u.username || '').toLowerCase() === cleanU);
      if (dbU) {
        const parsed = parsePosUserFromDb(dbU);
        if (parsed.is_2fa_enabled && parsed.totp_secret) {
          return {
            is_2fa_enabled: true,
            totp_secret: parsed.totp_secret,
            backup_codes: parsed.backup_codes || []
          };
        }
      }
    } catch {}

    try {
      const allAccs = await getAllBankAccountsFromFirestore();
      const dbA = allAccs.find(a => a.username.toLowerCase() === cleanU);
      if (dbA && dbA.is_2fa_enabled && dbA.totp_secret) {
        return {
          is_2fa_enabled: true,
          totp_secret: dbA.totp_secret,
          backup_codes: Array.isArray(dbA.backup_codes) ? dbA.backup_codes : []
        };
      }
    } catch {}

    return null;
  };

  const verify2FACodeForUser = async (username: string, code: string): Promise<boolean> => {
    const cleanU = username.trim().toLowerCase();
    const pendingMatch = pending2FALogin?.user?.username?.toLowerCase() === cleanU ? pending2FALogin.user : null;
    const currentMatch = currentPosUser?.username?.toLowerCase() === cleanU ? currentPosUser : null;
    const posMatch = posUsers.find(u => u.username.toLowerCase() === cleanU);
    const bankMatch = bankAccounts.find(a => a.username.toLowerCase() === cleanU);

    const candidates = [pendingMatch, currentMatch, posMatch, bankMatch].filter(Boolean) as Array<PosUser | BankAccount>;
    let targetSecret = candidates.find(c => Boolean(c.totp_secret))?.totp_secret || '';
    let targetBackups = candidates.find(c => Array.isArray(c.backup_codes) && c.backup_codes.length > 0)?.backup_codes || [];

    if (!targetSecret) {
      const live2FA = await resolveUser2FACredentials(cleanU);
      if (live2FA) {
        targetSecret = live2FA.totp_secret;
        targetBackups = live2FA.backup_codes;
      }
    }

    if (!targetSecret) return false;
    return await verifyTotpCode(targetSecret, code, targetBackups);
  };

  const verify2FACardForUser = async (
    username: string,
    cardUid: string,
    pin: string
  ): Promise<{ success: boolean; message: string }> => {
    const cleanU = username.trim().replace(/^@+/, '').toLowerCase();
    const normUid = normalizeCardUid(cardUid);
    const cleanPin = (pin || '').trim();

    if (!normUid) {
      return { success: false, message: 'Ongeldige of lege pas-UID ontvangen.' };
    }
    if (!cleanPin) {
      return { success: false, message: 'Bij 2FA is je pincode verplicht!' };
    }

    let matchedAcc: BankAccount | undefined;
    try {
      const dbBanks = await getAllBankAccountsFromFirestore();
      matchedAcc = dbBanks.find(a => accountMatchesUid(a, normUid));
    } catch {}
    if (!matchedAcc) {
      matchedAcc = bankAccountsRef.current.find(a => accountMatchesUid(a, normUid));
    }
    if (!matchedAcc) {
      return { success: false, message: `Pas (${normUid}) is onbekend.` };
    }

    if (matchedAcc.username.trim().replace(/^@+/, '').toLowerCase() !== cleanU) {
      logAuditAction(
        '2FA_PAS_WEIGERING',
        `Pas van @${matchedAcc.username} gebruikt voor 2FA van @${cleanU}.`
      );
      return {
        success: false,
        message: `Deze pas hoort bij @${matchedAcc.username}, niet bij @${username}.`
      };
    }

    if (matchedAcc.is_banned || matchedAcc.is_suspended) {
      return { success: false, message: 'Dit account is geblokkeerd.' };
    }

    const storedPin = String(matchedAcc.pin_code ?? '').trim();
    const storedPass = String(matchedAcc.password ?? '').trim();
    if ((storedPin !== cleanPin) && (storedPass !== cleanPin)) {
      logAuditAction('2FA_PAS_FOUTE_PIN', `Foute pincode bij 2FA NFC pas voor @${cleanU}.`);
      return { success: false, message: 'Onjuiste pincode voor deze NFC pas!' };
    }

    logAuditAction('2FA_PAS_VERIFICATIE', `🔐 2FA geverifieerd via NFC pas + pincode voor @${cleanU} (${normUid}).`);
    return { success: true, message: `🔐 2FA geverifieerd met NFC pas voor @${username}!` };
  };

  const confirm2FALogin = async (code: string): Promise<{ success: boolean; message: string }> => {
    if (!pending2FALogin) return { success: false, message: 'Geen inlogverzoek in behandeling.' };

    const { user, loginType } = pending2FALogin;
    const cleanU = user.username.trim().toLowerCase();
    const isValid = await verify2FACodeForUser(cleanU, code);

    if (!isValid) {
      logAuditAction('2FA_LOGIN_MISLUKT', `Ongeldige 2FA poging voor @${user.username}`);
      return { success: false, message: 'Ongeldige 2FA Authenticator code of Noodcode.' };
    }

    try {
      sessionStorage.removeItem(`wd_manager_unlocked_${cleanU}`);
    } catch {}

    if (loginType === 'pos') {
      const posUser = user as PosUser;
      setCurrentPosUser(posUser);
      setPosUsers(prev => [posUser, ...prev.filter(u => u.username.toLowerCase() !== cleanU)]);
      setPosScreen(prev => (prev === 'pickup_control' ? 'pickup_control' : 'kassa'));
    } else {
      setCurrentBankAccount(user as BankAccount);
    }

    setPending2FALogin(null);
    logAuditAction('2FA_LOGIN_GESLAAGD', `🔐 Succesvol ingelogd met 2FA als @${user.username}`);
    return { success: true, message: `Welkom, ${'name' in user ? user.name : user.account_holder}!` };
  };

  const confirm2FALoginWithCard = async (
    cardUid: string,
    pin: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!pending2FALogin) return { success: false, message: 'Geen inlogverzoek in behandeling.' };

    const { user, loginType } = pending2FALogin;
    const cleanU = user.username.trim().toLowerCase();
    const verifyRes = await verify2FACardForUser(cleanU, cardUid, pin);

    if (!verifyRes.success) {
      logAuditAction('2FA_LOGIN_MISLUKT', `Mislukte 2FA pas-poging voor @${user.username}: ${verifyRes.message}`);
      return { success: false, message: verifyRes.message };
    }

    try {
      sessionStorage.removeItem(`wd_manager_unlocked_${cleanU}`);
    } catch {}

    if (loginType === 'pos') {
      const posUser = user as PosUser;
      setCurrentPosUser(posUser);
      setPosUsers(prev => [posUser, ...prev.filter(u => u.username.toLowerCase() !== cleanU)]);
      setPosScreen(prev => (prev === 'pickup_control' ? 'pickup_control' : 'kassa'));
    } else {
      setCurrentBankAccount(user as BankAccount);
    }

    setPending2FALogin(null);
    logAuditAction('2FA_LOGIN_GESLAAGD', `🔐 Succesvol ingelogd met 2FA (NFC Pas + Pincode) als @${user.username}`);
    return { success: true, message: `Welkom, ${'name' in user ? user.name : user.account_holder}!` };
  };

  // Device & IP Blocking State
  const [blockedDevices, setBlockedDevices] = useState<Array<{ id: string; type: 'ip' | 'device'; value: string; reason?: string; addedAt: string }>>(() => {
    try {
      const saved = localStorage.getItem('wd_blocked_devices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeSessions, setActiveSessions] = useState<PosSession[]>([]);

  const [clientIp, setClientIp] = useState<string>('');
  const [deviceId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'dev_server';
    let id = localStorage.getItem('wd_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 11);
      localStorage.setItem('wd_device_id', id);
    }
    return id;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => {
        if (data?.ip) setClientIp(data.ip);
      })
      .catch(() => {});
  }, []);

  const blockedMatch = blockedDevices.find(item => {
    if (item.type === 'ip' && clientIp && item.value.trim() === clientIp.trim()) return true;
    if (item.type === 'device' && deviceId && item.value.trim().toLowerCase() === deviceId.trim().toLowerCase()) return true;
    return false;
  });
  const isBlocked = Boolean(blockedMatch);
  const blockedReason = blockedMatch?.reason || 'Toegang ontzegd door de beheerder.';

  // Active Brand ('werkpay' | 'koekploeg') - Defaults to 'koekploeg'
  const [activeBrand, setActiveBrandState] = useState<BrandType>(() => {
    const saved = localStorage.getItem('wd_active_brand');
    if (saved === 'werkpay' || saved === 'koekploeg') {
      return saved as BrandType;
    }
    return 'koekploeg';
  });

  const setActiveBrand = (b: BrandType) => {
    setActiveBrandState(b);
    localStorage.setItem('wd_active_brand', b);
  };

  const brandConfig = BRAND_CONFIGS[activeBrand] || BRAND_CONFIGS.koekploeg;

  // Firebase Cloud Firestore Connection State
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [connectionText, setConnectionText] = useState<string>('Verbinden met Firebase Cloud...');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'offline'>('synced');
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());

  // POS State
  const [products, setProducts] = useState<Product[]>(() => {
    const version = localStorage.getItem('wd_products_version');
    const saved = localStorage.getItem('wd_products');
    if (saved && version === 'v8_koekploeg_and_werkpay') {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 10) {
          return parsed;
        }
      } catch {}
    }
    localStorage.setItem('wd_products', JSON.stringify(ALL_DEFAULT_PRODUCTS));
    localStorage.setItem('wd_products_version', 'v8_koekploeg_and_werkpay');
    return ALL_DEFAULT_PRODUCTS;
  });

  // Filtered products for active brand (respects explicit product.brand: 'werkpay' | 'koekploeg' | 'both')
  const brandProducts = useMemo(() => {
    return products.filter(p => {
      if (p.brand) {
        return p.brand === 'both' || p.brand === activeBrand;
      }
      if (activeBrand === 'koekploeg') {
        return p.id >= 200;
      }
      return p.id < 200;
    });
  }, [products, activeBrand]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('wd_orders');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  const [orderNo, setOrderNo] = useState<number>(() => {
    const saved = localStorage.getItem('wd_order_no');
    return saved ? parseInt(saved, 10) : 1001;
  });

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem('wd_inventory');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_INVENTORY;
  });

  const [coupons, setCoupons] = useState<Coupon[]>(() => {
    const saved = localStorage.getItem('wd_coupons');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_COUPONS;
  });

  const [giftCards, setGiftCards] = useState<GiftCard[]>(() => {
    const saved = localStorage.getItem('wd_gift_cards');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_GIFT_CARDS;
  });

  const [posUsers, setPosUsers] = useState<PosUser[]>(() => {
    const saved = localStorage.getItem('wd_pos_users');
    if (saved) {
      try { 
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.some(u => u.username === 'joas')) {
          return parsed;
        }
      } catch {}
    }
    return INITIAL_POS_USERS;
  });

  // User requirement: "je begint bij allebei op het inlog scherm zonder bijvoorbeeld!"
  const [currentPosUser, setCurrentPosUser] = useState<PosUser | null>(null);

  const [totalExpenses, setTotalExpenses] = useState<number>(() => {
    const saved = localStorage.getItem('wd_expenses');
    return saved ? parseFloat(saved) : 0;
  });

  const [orderStopActive, setOrderStopActive] = useState<boolean>(() => {
    return localStorage.getItem('wd_order_stop') === 'true';
  });

  const [orderStopText, setOrderStopTextState] = useState<string>(() => {
    return localStorage.getItem('wd_order_stop_text') || 'Beste gast, wegens extreme drukte in onze keuken hebben we tijdelijk een bestelstop ingelast. We bereiden momenteel de lopende bestellingen voor. Excuses voor de vertraging!';
  });

  const [orderStopConfig, setOrderStopConfig] = useState<OrderStopConfig>(() => {
    const saved = localStorage.getItem('wd_order_stop_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      showClock: true,
      showNews: true,
      theme: 'rose',
      blockPickup: true,
      icon: '🛑',
      title: 'Tijdelijk geen bestellingen'
    };
  });

  const [customBranding, setCustomBranding] = useState<CustomBrandingConfig>(() => {
    const saved = localStorage.getItem('wd_custom_branding');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return {
      storeName: 'Werkdonalds',
      tagline: 'Vers Bereid • Snelle Kassa & Keuken',
      logoEmoji: '🍔',
      primaryColor: '#2563eb', // blue-600
      headerGradient: 'from-blue-600 via-blue-500 to-cyan-400',
      useCustomBranding: false,
      tvAutoStart: false,
      tvStartTime: '08:00',
      tvWidgets: {
        prep: true, ready: true, menu: true, ticker: true, deal: true, waitTime: true, stats: true
      },
      tvLayout: 'split_50',
      nosCategory: 'general'
    };
  });

  const [managerOverride, setManagerOverride] = useState<boolean>(false);

  const activateManagerOverride = (pin: string) => {
    if (verifyMasterPin(pin)) {
      setManagerOverride(true);
      return { success: true, message: 'Manager Override Geactiveerd!' };
    }
    return { success: false, message: 'Onjuiste Master PIN!' };
  };

  const deactivateManagerOverride = () => {
    setManagerOverride(false);
  };

  const authorizeCashStaffUser = (user: PosUser | null): boolean => {
    if (!user) return false;
    if (user.is_banned || user.is_suspended || user.is_terminal_locked) return false;
    const uname = String(user.username || '').toLowerCase();
    if (!uname || uname === 'bestel_kassa' || uname === 'klant' || uname === 'rpi') return false;
    if (user.is_admin || uname === 'joas') return true;
    return Array.isArray(user.perms) && user.perms.includes('cash_pay');
  };

  const verifyCashApprovalPin = (pin: string): { valid: boolean; user?: PosUser; approverName?: string } => {
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) return { valid: false };

    const matchedUser = posUsers.find(u => {
      if (!authorizeCashStaffUser(u)) return false;
      const userPass = String(u.password || '').trim();
      const userPin = String((u as any).pin_code || '').trim();
      return (userPass.length > 0 && userPass === cleanPin) || (userPin.length > 0 && userPin === cleanPin);
    });

    if (matchedUser) {
      return { valid: true, user: matchedUser, approverName: matchedUser.name };
    }

    if (verifyMasterPin(cleanPin)) {
      return { valid: true, approverName: currentPosUser?.name || 'Manager (Master PIN)' };
    }

    return { valid: false };
  };

  const [isSystemLocked, setIsSystemLockedState] = useState<boolean>(() => {
    return localStorage.getItem('wd_system_locked') === 'true';
  });

  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(() => {
    const raw = localStorage.getItem('wd_auto_lock_minutes');
    const parsed = raw !== null ? parseInt(raw, 10) : 5;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
  });

  const setAutoLockMinutes = useCallback((mins: number) => {
    const clean = Math.max(0, Math.min(120, Math.floor(mins)));
    setAutoLockMinutesState(clean);
    try {
      localStorage.setItem('wd_auto_lock_minutes', String(clean));
    } catch {}
  }, []);

  const setIsSystemLocked = (locked: boolean) => {
    setIsSystemLockedState(locked);
    localStorage.setItem('wd_system_locked', String(locked));
    if (locked) {
      logAuditAction('SYSTEEM_VERGRENDELD', 'Systeem vergrendeld.');
    } else {
      logAuditAction('SYSTEEM_ONTGRENDELD', 'Systeem succesvol ontgrendeld.');
    }
  };

  // Global Receipt Printer Settings (shared for all users/terminals via Firestore pos_settings/default)
  const [receiptPrinterConfig, setReceiptPrinterConfigState] = useState<ReceiptPrinterConfig>(() => {
    try {
      const raw = localStorage.getItem('wd_receipt_printer_config');
      if (raw) {
        return normalizeReceiptPrinterConfig(JSON.parse(raw));
      }
    } catch {}
    return DEFAULT_RECEIPT_PRINTER_CONFIG;
  });

  const updateReceiptPrinterConfig = useCallback(async (next: ReceiptPrinterConfig): Promise<{ success: boolean; message: string }> => {
    const normalized: ReceiptPrinterConfig = {
      ...normalizeReceiptPrinterConfig(next),
      updatedAt: new Date().toISOString()
    };
    setReceiptPrinterConfigState(normalized);
    setSavedReceiptSize(normalized.receiptSize);
    try {
      localStorage.setItem('wd_receipt_printer_config', JSON.stringify(normalized));
    } catch {}

    if (shouldBlockTableWrite('Globale bonprinter instellingen bijwerken')) {
      return { success: false, message: 'Tabellen zijn vergrendeld (freeze modus).' };
    }

    try {
      await savePosSettingsToFirestore({ receipt_printer_config: normalized });
      logAuditAction(
        'BONPRINTER_INSTELLINGEN_GEWIJZIGD',
        `Globale bonprinter instellingen opgeslagen (${normalized.receiptSize}, modus: ${normalized.printMode}, auto-print: ${normalized.autoPrintOnOrder ? 'aan' : 'uit'}).`
      );
      return { success: true, message: 'Bonprinter instellingen opgeslagen in Firebase Cloud voor iedereen!' };
    } catch (err: any) {
      console.error('Firestore updateReceiptPrinterConfig error:', err);
      const errMsg = err?.message || 'Opslaan in Firebase mislukt.';
      return { success: false, message: `Lokaal opgeslagen, maar Firebase sync mislukte: ${errMsg}` };
    }
  }, []);

  // Offline Queue State & Handlers
  const [offlineQueueItems, setOfflineQueueItems] = useState<OfflineMutationItem[]>(() => getOfflineQueue());
  const [isFlushingOfflineQueue, setIsFlushingOfflineQueue] = useState<boolean>(false);
  const offlineQueueCount = offlineQueueItems.length;

  const flushOfflineQueueNow = useCallback(async () => {
    setIsFlushingOfflineQueue(true);
    try {
      const res = await flushOfflineQueue();
      setOfflineQueueItems(getOfflineQueue());
      if (res.flushed > 0) {
        showToast(
          `☁️ ${res.flushed} offline wachtrij-item(s) gesynchroniseerd met Firebase!`,
          'success'
        );
      }
      return res;
    } finally {
      setIsFlushingOfflineQueue(false);
    }
  }, []);

  useEffect(() => {
    const syncLocalQueue = () => setOfflineQueueItems(getOfflineQueue());
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueueNow().catch(() => {});
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };
    window.addEventListener(OFFLINE_QUEUE_EVENT, syncLocalQueue);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, syncLocalQueue);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushOfflineQueueNow]);

  const [pickupClosed, setPickupClosed] = useState<boolean>(() => {
    return localStorage.getItem('wd_pickup_closed') === 'true';
  });

  const [appliedDiscount, setAppliedDiscount] = useState<{ type: string; val: number; code?: string; label: string }>({
    type: 'none',
    val: 0,
    label: 'Geen'
  });

  // Cash Payment Requests State (Cross-terminal sync)
  const [cashRequests, setCashRequests] = useState<CashPaymentRequest[]>(() => {
    const saved = localStorage.getItem('wd_cash_requests');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [];
  });

  // WerkPay State (restores any missing seed accounts unless explicitly deleted)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    let localParsed: BankAccount[] = [];
    const saved = localStorage.getItem('wd_bank_accounts');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) localParsed = parsed;
      } catch {}
    }
    let deletedSet = new Set<string>();
    try {
      const delRaw = localStorage.getItem('wd_deleted_bank_usernames');
      if (delRaw) {
        const arr = JSON.parse(delRaw);
        if (Array.isArray(arr)) deletedSet = new Set(arr.map((x: any) => String(x || '').trim().toLowerCase()));
      }
    } catch {}
    if (localParsed.length === 0) return INITIAL_BANK_ACCOUNTS;
    const { merged } = mergeBankAccountsList({
      local: localParsed,
      remote: [],
      initial: INITIAL_BANK_ACCOUNTS,
      knownCloudKeys: new Set(),
      deletedKeys: deletedSet
    });
    return merged;
  });

  // User requirement: "je begint bij allebei op het inlog scherm zonder bijvoorbeeld!"
  const [currentBankAccount, setCurrentBankAccount] = useState<BankAccount | null>(null);

  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(() => {
    const saved = localStorage.getItem('wd_bank_txs');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      { id: 1, from_account: 'klant01', to_account: 'Werkdonalds Kassa', amount: 14.50, label: 'Werkdonalds Bestelling #1000', when: 'Vandaag 12:30', timestamp: Date.now() - 3600000 },
      { id: 2, from_account: 'joas', to_account: 'emma', amount: 25.00, label: 'Overboeking naar emma', when: 'Gisteren', timestamp: Date.now() - 86400000 }
    ];
  });

  const [activeReceiptOrder, setActiveReceiptOrder] = useState<Order | null>(null);
  const [trackedOrderNo, setTrackedOrderNoInternal] = useState<number | null>(null);

  const setTrackedOrderNo = useCallback((orderNo: number | null) => {
    setTrackedOrderNoInternal(orderNo);
    if (orderNo !== null) {
      setAppMode('pos');
      setPosScreen('volgscherm');
    }
  }, []);

  // Track order numbers placed in this session or browser
  const [myOrderNumbers, setMyOrderNumbers] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('wd_my_order_numbers');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addMyOrderNumber = useCallback((num: number) => {
    setMyOrderNumbers(prev => {
      if (prev.includes(num)) return prev;
      const updated = [num, ...prev];
      try {
        localStorage.setItem('wd_my_order_numbers', JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('wd_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('wd_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('wd_order_no', String(orderNo));
  }, [orderNo]);

  useEffect(() => {
    localStorage.setItem('wd_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('wd_coupons', JSON.stringify(coupons));
  }, [coupons]);

  useEffect(() => {
    localStorage.setItem('wd_gift_cards', JSON.stringify(giftCards));
  }, [giftCards]);

  useEffect(() => {
    localStorage.setItem('wd_pos_users', JSON.stringify(posUsers));
  }, [posUsers]);

  useEffect(() => {
    localStorage.setItem('wd_expenses', String(totalExpenses));
  }, [totalExpenses]);

  useEffect(() => {
    localStorage.setItem('wd_order_stop', String(orderStopActive));
  }, [orderStopActive]);

  useEffect(() => {
    localStorage.setItem('wd_order_stop_text', orderStopText);
  }, [orderStopText]);

  useEffect(() => {
    localStorage.setItem('wd_custom_branding', JSON.stringify(customBranding));
  }, [customBranding]);

  useEffect(() => {
    localStorage.setItem('wd_pickup_closed', String(pickupClosed));
  }, [pickupClosed]);

  useEffect(() => {
    localStorage.setItem('wd_bank_accounts', JSON.stringify(bankAccounts));
  }, [bankAccounts]);

  useEffect(() => {
    localStorage.setItem('wd_bank_txs', JSON.stringify(bankTransactions));
  }, [bankTransactions]);

  useEffect(() => {
    if (currentPosUser) {
      sessionStorage.setItem('wd_pos_user', JSON.stringify(currentPosUser));
    } else {
      sessionStorage.removeItem('wd_pos_user');
    }
  }, [currentPosUser]);

  useEffect(() => {
    if (currentBankAccount) {
      sessionStorage.setItem('wd_bank_current', JSON.stringify(currentBankAccount));
    } else {
      sessionStorage.removeItem('wd_bank_current');
    }
  }, [currentBankAccount]);

  // Initialize Firebase Cloud Firestore connection status
  useEffect(() => {
    let active = true;
    testFirestoreConnection()
      .then((res) => {
        if (!active) return;
        if (res.success) {
          setIsOnline(true);
          setIsRealtimeActive(true);
          setSyncStatus('synced');
          setConnectionText('🟢 Firebase Cloud Firestore Live');
        } else {
          setIsOnline(false);
          setSyncStatus('offline');
          setConnectionText('Offline / Lokale Cache');
        }
      })
      .catch(() => {
        if (!active) return;
        setIsOnline(false);
        setSyncStatus('offline');
        setConnectionText('Offline / Lokale Cache');
      });
    return () => {
      active = false;
    };
  }, []);

// Helper to convert DB cash_request row to CashPaymentRequest
const formatDbCashRequest = (row: any): CashPaymentRequest => {
  return {
    id: String(row.id || row.req_id || ''),
    orderNo: Number(row.orderNo ?? row.order_no ?? 0),
    orderType: (row.orderType || row.order_type || 'takeaway') as CashPaymentRequest['orderType'],
    identifier: String(row.identifier || row.cashier || ''),
    total: Number(row.total ?? row.amount ?? 0),
    status: (row.status || 'pending') as CashPaymentRequest['status'],
    requestedAt:
      typeof row.requestedAt === 'number'
        ? row.requestedAt
        : row.created_at
        ? new Date(row.created_at).getTime()
        : Date.now(),
    approvedBy: row.approvedBy || row.approved_by || undefined,
    approvedByUsername: row.approvedByUsername || undefined,
    approvedAt: typeof row.approvedAt === 'number' ? row.approvedAt : undefined,
    consumedAt: typeof row.consumedAt === 'number' ? row.consumedAt : undefined,
    received: row.received !== null && row.received !== undefined ? Number(row.received) : undefined,
    change: row.change !== null && row.change !== undefined ? Number(row.change) : undefined,
    rejectedReason: row.rejectedReason || row.rejected_reason || undefined
  };
};

  const currentPosUserRef = useRef(currentPosUser);
  currentPosUserRef.current = currentPosUser;
  const currentBankAccountRef = useRef(currentBankAccount);
  currentBankAccountRef.current = currentBankAccount;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const bankAccountsRef = useRef(bankAccounts);
  bankAccountsRef.current = bankAccounts;
  const posUsersRef = useRef(posUsers);
  posUsersRef.current = posUsers;
  const couponsRef = useRef(coupons);
  couponsRef.current = coupons;
  const giftCardsRef = useRef(giftCards);
  giftCardsRef.current = giftCards;
  const tablesFrozenRef = useRef(tablesFrozen);
  tablesFrozenRef.current = tablesFrozen;
  const lastHandledAudioTsRef = useRef<number>(Date.now());

  const loadStringSet = (storageKey: string): Set<string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean));
        }
      }
    } catch {}
    return new Set();
  };

  const cloudKnownBankKeysRef = useRef<Set<string>>(loadStringSet('wd_cloud_known_banks'));
  const deletedBankKeysRef = useRef<Set<string>>(loadStringSet('wd_deleted_bank_usernames'));
  const pendingBankWritesRef = useRef<Map<string, PendingBankWrite>>(new Map());
  const cloudKnownPosKeysRef = useRef<Set<string>>(loadStringSet('wd_cloud_known_pos_users'));
  const deletedPosKeysRef = useRef<Set<string>>(loadStringSet('wd_deleted_pos_usernames'));
  const cloudKnownCouponIdsRef = useRef<Set<number>>(new Set());
  const cloudKnownGiftCardIdsRef = useRef<Set<number>>(new Set());

  const cloudSnapshotsRef = useRef<{
    bank: string;
    users: string;
    products: string;
    coupons: string;
    giftCards: string;
    cashReqs: string;
    loyalty: string;
    sessions: string;
    blocked: string;
    news: string;
  }>({
    bank: '',
    users: '',
    products: '',
    coupons: '',
    giftCards: '',
    cashReqs: '',
    loyalty: '',
    sessions: '',
    blocked: '',
    news: ''
  });

  // Apply parsed settings snapshot helper (reused by fetchCloudData and pos_settings subscription)
  const applyRemoteSettings = useCallback((dbSettings: Record<string, any> | null) => {
    if (!dbSettings) return;
    const localOrderStop = localStorage.getItem('wd_order_stop') === 'true';
    setOrderStopActive(localOrderStop || Boolean(dbSettings.order_stop_active));
    setPickupClosed(Boolean(dbSettings.pickup_closed));

    if (dbSettings.order_stop_text) {
      setOrderStopTextState(dbSettings.order_stop_text);
      localStorage.setItem('wd_order_stop_text', dbSettings.order_stop_text);
    } else if (dbSettings.news_config && typeof dbSettings.news_config === 'object' && dbSettings.news_config.orderStopText) {
      setOrderStopTextState(dbSettings.news_config.orderStopText);
      localStorage.setItem('wd_order_stop_text', dbSettings.news_config.orderStopText);
    }

    if (dbSettings.order_stop_config && typeof dbSettings.order_stop_config === 'object') {
      setOrderStopConfig(dbSettings.order_stop_config);
      localStorage.setItem('wd_order_stop_config', JSON.stringify(dbSettings.order_stop_config));
    }

    const brandingObj = dbSettings.branding_config || dbSettings.custom_branding;
    if (brandingObj && typeof brandingObj === 'object') {
      setCustomBranding(brandingObj);
      localStorage.setItem('wd_custom_branding', JSON.stringify(brandingObj));
    }

    const pinValRaw = dbSettings.master_security_pin || dbSettings.master_pin;
    if (pinValRaw) {
      const pinVal = String(pinValRaw).trim();
      if (pinVal) {
        setMasterPinState(pinVal);
        localStorage.setItem('wd_master_pin', pinVal);
      }
    }

    if (dbSettings.tables_frozen !== undefined) {
      const isFrz = Boolean(dbSettings.tables_frozen);
      if (isFrz !== tablesFrozenRef.current) {
        setTablesFrozenState(isFrz);
        localStorage.setItem('wd_tables_frozen', String(isFrz));
      }
    } else if (dbSettings.news_config && typeof dbSettings.news_config === 'object' && dbSettings.news_config.tables_frozen !== undefined) {
      const isFrz = Boolean(dbSettings.news_config.tables_frozen);
      if (isFrz !== tablesFrozenRef.current) {
        setTablesFrozenState(isFrz);
        localStorage.setItem('wd_tables_frozen', String(isFrz));
      }
    }

    if (dbSettings.news_config && typeof dbSettings.news_config === 'object') {
      const remoteNewsCfg = dbSettings.news_config;
      const currentNewsCfgRaw = localStorage.getItem('wd_pickup_news_config_v2');
      let currentNewsCfg: any = null;
      try { if (currentNewsCfgRaw) currentNewsCfg = JSON.parse(currentNewsCfgRaw); } catch {}
      const remoteNewsStr = JSON.stringify(remoteNewsCfg);
      if (
        remoteNewsStr !== cloudSnapshotsRef.current.news &&
        (!currentNewsCfg || !currentNewsCfg.lastUpdated || (remoteNewsCfg.lastUpdated && remoteNewsCfg.lastUpdated >= currentNewsCfg.lastUpdated))
      ) {
        cloudSnapshotsRef.current.news = remoteNewsStr;
        localStorage.setItem('wd_pickup_news_config_v2', remoteNewsStr);
        window.dispatchEvent(new Event('wd_news_config_updated'));
      }
    }

    if (dbSettings.custom_news_items && Array.isArray(dbSettings.custom_news_items)) {
      const itemsStr = JSON.stringify(dbSettings.custom_news_items);
      if (localStorage.getItem('wd_pickup_custom_items_v2') !== itemsStr) {
        localStorage.setItem('wd_pickup_custom_items_v2', itemsStr);
        window.dispatchEvent(new Event('wd_news_config_updated'));
      }
    }

    if (dbSettings.blocked_devices && Array.isArray(dbSettings.blocked_devices)) {
      const blockedSnap = JSON.stringify(dbSettings.blocked_devices);
      if (blockedSnap !== cloudSnapshotsRef.current.blocked) {
        cloudSnapshotsRef.current.blocked = blockedSnap;
        setBlockedDevices(dbSettings.blocked_devices);
        localStorage.setItem('wd_blocked_devices', blockedSnap);
      }
    }

    if (dbSettings.receipt_printer_config && typeof dbSettings.receipt_printer_config === 'object') {
      const normalizedPrinterCfg = normalizeReceiptPrinterConfig(dbSettings.receipt_printer_config);
      setReceiptPrinterConfigState(normalizedPrinterCfg);
      setSavedReceiptSize(normalizedPrinterCfg.receiptSize);
      try {
        localStorage.setItem('wd_receipt_printer_config', JSON.stringify(normalizedPrinterCfg));
      } catch {}
    }
  }, []);

  // Unified Firebase Cloud Firestore fetch
  const fetchCloudData = useCallback(async (isBackground = false) => {
    if (isBackground && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    if (!isBackground) {
      setSyncStatus('syncing');
    }

    const activePosUser = currentPosUserRef.current;
    const activeBankAcc = currentBankAccountRef.current;
    const isShadowbanned = Boolean(activePosUser?.is_shadowbanned);

    try {
      const [
        dbOrders,
        dbAccounts,
        dbBankTxs,
        dbUsers,
        dbProducts,
        dbCoupons,
        dbGiftCards,
        dbSettings,
        dbCashReqs,
        dbLoyalty,
        dbSessions
      ] = await Promise.all([
        fsGetCollection('orders').catch(() => []),
        getAllBankAccountsFromFirestore().catch(() => []),
        fsGetCollection('bank_transactions').catch(() => []),
        fsGetCollection('pos_users').catch(() => []),
        fsGetCollection('products').catch(() => []),
        fsGetCollection('coupons').catch(() => []),
        fsGetCollection('gift_cards').catch(() => []),
        getPosSettingsFromFirestore().catch(() => null),
        fsGetCollection('cash_requests').catch(() => []),
        fsGetCollection('loyalty_customers').catch(() => []),
        fsGetCollection('pos_sessions').catch(() => [])
      ]);

      // 1. Orders
      if (Array.isArray(dbOrders) && dbOrders.length > 0 && !isShadowbanned) {
        const parsed: Order[] = dbOrders
          .map(formatDbOrder)
          .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
          .slice(0, 80);
        setOrders(prev => {
          const { merged, hasNewRemoteOrder } = mergeOrders(prev, parsed);
          if (hasNewRemoteOrder && isBackground) {
            AudioFX.bell();
          }
          return merged;
        });

        const highest = Math.max(0, ...parsed.map(x => x.no));
        if (highest >= 1000) {
          setOrderNo(prev => (prev >= highest + 1 ? prev : Math.max(prev, highest + 1)));
        }
      }

      // 2. Bank accounts (safe merge so partial Firestore collections never wipe local/seed accounts)
      let mergedDbAccounts: BankAccount[] | null = null;
      if (Array.isArray(dbAccounts) && dbAccounts.length > 0 && !isShadowbanned) {
        const { merged, nextKnownCloudKeys } = mergeBankAccountsList({
          local: bankAccountsRef.current,
          remote: dbAccounts,
          initial: INITIAL_BANK_ACCOUNTS,
          knownCloudKeys: cloudKnownBankKeysRef.current,
          deletedKeys: deletedBankKeysRef.current,
          pendingWrites: pendingBankWritesRef.current
        });
        cloudKnownBankKeysRef.current = nextKnownCloudKeys;
        try {
          localStorage.setItem('wd_cloud_known_banks', JSON.stringify(Array.from(nextKnownCloudKeys)));
        } catch {}

        mergedDbAccounts = merged;
        const bankSnap = JSON.stringify(mergedDbAccounts);
        if (bankSnap !== cloudSnapshotsRef.current.bank) {
          cloudSnapshotsRef.current.bank = bankSnap;
          setBankAccounts(mergedDbAccounts);
          localStorage.setItem('wd_bank_accounts', bankSnap);
        }
        if (activeBankAcc) {
          const activeUserLower = String(activeBankAcc.username || '').trim().toLowerCase();
          const found = mergedDbAccounts.find(
            a => a.id === activeBankAcc.id || String(a.username || '').trim().toLowerCase() === activeUserLower
          );
          if (
            found &&
            (found.balance !== activeBankAcc.balance ||
              found.is_2fa_enabled !== activeBankAcc.is_2fa_enabled ||
              found.card_uid !== activeBankAcc.card_uid ||
              found.pin_code !== activeBankAcc.pin_code ||
              JSON.stringify(found.linked_uids || []) !== JSON.stringify(activeBankAcc.linked_uids || []))
          ) {
            setCurrentBankAccount(found);
          }
        }
      }

      // 2b. Bank transactions
      if (Array.isArray(dbBankTxs) && dbBankTxs.length > 0 && !isShadowbanned) {
        const parsedTxs: BankTransaction[] = dbBankTxs
          .map((t: any) => ({
            id: t.id,
            from_account: String(t.from_account || ''),
            to_account: String(t.to_account || ''),
            amount: Number(t.amount || 0),
            label: String(t.label || 'Transactie'),
            note: t.note ? String(t.note) : undefined,
            order_no: typeof t.order_no === 'number' ? t.order_no : undefined,
            when: String(t.when || ''),
            timestamp: Number(t.timestamp || 0)
          }))
          .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
          .slice(0, 100);
        setBankTransactions(parsedTxs);
      }

      // 3. POS users (safe merge so partial Firestore collections never wipe local/seed POS users)
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        const remoteFreezeFromPerms = dbUsers.some((u: any) => {
          const rawP = Array.isArray(u.perms) ? u.perms : [];
          return rawP.includes('__tables_frozen__');
        });
        const remoteParsedUsers: PosUser[] = dbUsers.map(u => parsePosUserFromDb(u));
        const { merged: parsedUsers, nextKnownCloudKeys: nextPosKnown } = mergePosUsersList({
          local: posUsersRef.current,
          remote: remoteParsedUsers,
          initial: INITIAL_POS_USERS,
          knownCloudKeys: cloudKnownPosKeysRef.current,
          deletedKeys: deletedPosKeysRef.current
        });
        cloudKnownPosKeysRef.current = nextPosKnown;
        try {
          localStorage.setItem('wd_cloud_known_pos_users', JSON.stringify(Array.from(nextPosKnown)));
        } catch {}

        const usersSnap = JSON.stringify(parsedUsers);
        if (usersSnap !== cloudSnapshotsRef.current.users) {
          cloudSnapshotsRef.current.users = usersSnap;
          setPosUsers(parsedUsers);
          localStorage.setItem('wd_pos_users', usersSnap);
        }

        if (activePosUser) {
          const syncedMe = parsedUsers.find(pu => pu.username.toLowerCase() === activePosUser.username.toLowerCase());
          if (syncedMe) {
            if (syncedMe.is_banned || syncedMe.is_suspended) {
              logoutPos();
            } else {
              const cleanMe = syncedMe.username.toLowerCase();
              const syncedBankMe = mergedDbAccounts
                ? mergedDbAccounts.find(a => a.username.toLowerCase() === cleanMe)
                : undefined;
              const merged2faEnabled = Boolean(
                (syncedMe.is_2fa_enabled && syncedMe.totp_secret) ||
                (syncedBankMe?.is_2fa_enabled && syncedBankMe?.totp_secret)
              );
              const mergedSecret = syncedMe.totp_secret || syncedBankMe?.totp_secret || '';
              const mergedBackups =
                (syncedMe.backup_codes && syncedMe.backup_codes.length > 0 ? syncedMe.backup_codes : undefined) ||
                syncedBankMe?.backup_codes ||
                [];
              const enrichedSyncedMe: PosUser = {
                ...syncedMe,
                is_2fa_enabled: merged2faEnabled,
                totp_secret: mergedSecret || undefined,
                backup_codes: mergedBackups
              };
              if (
                enrichedSyncedMe.is_shadowbanned !== activePosUser.is_shadowbanned ||
                enrichedSyncedMe.is_2fa_enabled !== activePosUser.is_2fa_enabled ||
                enrichedSyncedMe.totp_secret !== activePosUser.totp_secret ||
                JSON.stringify(enrichedSyncedMe.perms) !== JSON.stringify(activePosUser.perms)
              ) {
                if (enrichedSyncedMe.is_2fa_enabled && !activePosUser.is_2fa_enabled) {
                  try { sessionStorage.removeItem(`wd_manager_unlocked_${cleanMe}`); } catch {}
                }
                setCurrentPosUser(enrichedSyncedMe);
              }
            }
          }
        }

        if (remoteFreezeFromPerms !== tablesFrozenRef.current) {
          setTablesFrozenState(remoteFreezeFromPerms);
          localStorage.setItem('wd_tables_frozen', String(remoteFreezeFromPerms));
        }
      }

      // 4. Products (full sync incl. keuzemenu's / options, brand, recipe)
      if (Array.isArray(dbProducts) && dbProducts.length > 0 && !isShadowbanned) {
        const parsedProducts = dbProducts
          .map(fromFirestoreProduct)
          .sort((a, b) => Number(a.id) - Number(b.id));
        const prodSnap = JSON.stringify(parsedProducts);
        if (prodSnap !== cloudSnapshotsRef.current.products) {
          cloudSnapshotsRef.current.products = prodSnap;
          setProducts(parsedProducts);
          localStorage.setItem('wd_products', prodSnap);
        }
      }

      // 5. Coupons
      if (Array.isArray(dbCoupons) && dbCoupons.length > 0 && !isShadowbanned) {
        const remoteCoupons: Coupon[] = dbCoupons.map((c: any) => ({
          id: Number(c.id),
          code: String(c.code || ''),
          discount_type: c.discount_type as any,
          discount_val: Number(c.discount_val || 0),
          min_subtotal: c.min_subtotal ? Number(c.min_subtotal) : undefined,
          target_product_name: c.target_product_name || undefined,
          target_category: c.target_category || undefined,
          description: c.description || undefined,
          is_active: Boolean(c.is_active)
        }));
        const { merged: parsedCoupons, nextKnownCloudIds } = mergeByIdWithCloud({
          local: couponsRef.current,
          remote: remoteCoupons,
          knownCloudIds: cloudKnownCouponIdsRef.current
        });
        cloudKnownCouponIdsRef.current = nextKnownCloudIds;
        const couponsSnap = JSON.stringify(parsedCoupons);
        if (couponsSnap !== cloudSnapshotsRef.current.coupons) {
          cloudSnapshotsRef.current.coupons = couponsSnap;
          setCoupons(parsedCoupons);
          localStorage.setItem('wd_coupons', couponsSnap);
        }
      }

      // 6. Gift cards
      if (Array.isArray(dbGiftCards) && dbGiftCards.length > 0 && !isShadowbanned) {
        const remoteGiftCards: GiftCard[] = dbGiftCards.map((g: any) => ({
          id: Number(g.id),
          code: String(g.code || ''),
          initial_balance: Number(g.initial_balance || 0),
          current_balance: Number(g.current_balance || 0),
          is_active: Boolean(g.is_active),
          sender_name: g.sender_name || undefined,
          recipient_name: g.recipient_name || undefined,
          recipient_phone: g.recipient_phone || undefined,
          message: g.message || undefined,
          is_private: Boolean(g.is_private),
          notes: g.notes || undefined,
          created_at: g.created_at || undefined
        }));
        const { merged: parsedGiftCards, nextKnownCloudIds } = mergeByIdWithCloud({
          local: giftCardsRef.current,
          remote: remoteGiftCards,
          knownCloudIds: cloudKnownGiftCardIdsRef.current
        });
        cloudKnownGiftCardIdsRef.current = nextKnownCloudIds;
        const gcSnap = JSON.stringify(parsedGiftCards);
        if (gcSnap !== cloudSnapshotsRef.current.giftCards) {
          cloudSnapshotsRef.current.giftCards = gcSnap;
          setGiftCards(parsedGiftCards);
          localStorage.setItem('wd_gift_cards', gcSnap);
        }
      }

      // 7. POS Settings
      if (dbSettings) {
        applyRemoteSettings(dbSettings);
      } else {
        await savePosSettingsToFirestore({ order_stop_active: false, pickup_closed: false }).catch(() => {});
      }

      // 8. Cash requests
      if (Array.isArray(dbCashReqs) && dbCashReqs.length > 0) {
        const parsedCashReqs = dbCashReqs
          .map(formatDbCashRequest)
          .sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0))
          .slice(0, 50);
        const cashSnap = JSON.stringify(parsedCashReqs);
        if (cashSnap !== cloudSnapshotsRef.current.cashReqs) {
          cloudSnapshotsRef.current.cashReqs = cashSnap;
          setCashRequests(parsedCashReqs);
          localStorage.setItem('wd_cash_requests', cashSnap);
        }
      }

      // 9. Loyalty customers
      if (Array.isArray(dbLoyalty) && dbLoyalty.length > 0) {
        const parsedLoyalty = dbLoyalty.map((c: any) => {
          const phone = String(c.phone || '');
          const activeVipRec = isVipSubscriberPhone(phone);
          const isVip = Boolean(c.vipSubscriptionActive || c.vip_subscription_active || activeVipRec);
          return {
            id: String(c.id),
            name: String(c.name || ''),
            phone,
            coins: Number(c.coins || 0),
            totalSpent: Number(c.totalSpent ?? c.total_spent ?? 0),
            ordersCount: Number(c.ordersCount ?? c.orders_count ?? 0),
            tier: isVip ? 'VIP Diamant' : ((c.tier as any) || 'Brons'),
            level: isVip ? 4 : c.level,
            currentMonthSpent: Number(c.currentMonthSpent ?? c.current_month_spent ?? 0),
            lastMonthSpent: Number(c.lastMonthSpent ?? c.last_month_spent ?? 0),
            currentMonthKey: c.currentMonthKey || c.current_month_key || '',
            monthsBelowTarget: Number(c.monthsBelowTarget ?? c.months_below_target ?? 0),
            vipSubscriptionActive: isVip,
            vipSubscriptionExpires: activeVipRec?.expiresAt || c.vipSubscriptionExpires || c.vip_subscription_expires || undefined,
            vipPlan: activeVipRec?.plan || c.vipPlan || c.vip_plan || undefined,
            vouchers: Array.isArray(c.vouchers) ? c.vouchers : [],
            lastSpinDate: c.lastSpinDate || c.last_spin_date || undefined,
            ordersTodayCount: Number(c.ordersTodayCount ?? c.orders_today_count ?? 0),
            joinedDate: c.joinedDate || c.joined_date || new Date().toISOString().split('T')[0]
          };
        });
        const loyaltySnap = JSON.stringify(parsedLoyalty);
        if (loyaltySnap !== cloudSnapshotsRef.current.loyalty) {
          cloudSnapshotsRef.current.loyalty = loyaltySnap;
          localStorage.setItem('wd_loyalty_customers_db', loyaltySnap);
          localStorage.setItem('wd_loyalty_ts', Date.now().toString());
          window.dispatchEvent(new Event('wd_loyalty_updated'));
        }
      }

      // 10. Active sessions
      if (Array.isArray(dbSessions)) {
        const now = Date.now();
        const recent = dbSessions
          .filter((s: any) => {
            const t = new Date(s.last_seen).getTime();
            return Number.isFinite(t) && (now - t) < 60000;
          })
          .map((s: any) => ({
            device_id: String(s.device_id),
            ip_address: String(s.ip_address || 'Onbekend'),
            user_name: String(s.user_name || 'Gast'),
            app_mode: String(s.app_mode || 'pos'),
            pos_screen: String(s.pos_screen || 'kassa'),
            user_agent: String(s.user_agent || 'Browser'),
            last_seen: String(s.last_seen)
          }));
        const sessSnap = JSON.stringify(recent.map(s => `${s.device_id}:${s.user_name}:${s.pos_screen}:${s.app_mode}`));
        if (sessSnap !== cloudSnapshotsRef.current.sessions) {
          cloudSnapshotsRef.current.sessions = sessSnap;
          setActiveSessions(recent);
        }
      }

      setSyncStatus('synced');
      setLastSyncTime(new Date());
      setIsOnline(true);
      setIsRealtimeActive(true);
      setConnectionText('🟢 Firebase Cloud Firestore Live');
    } catch (err: any) {
      console.error('Firebase sync failure details:', err);
      setIsOnline(false);
      if (!isBackground) {
        setSyncStatus('error');
      }
    }
  }, [applyRemoteSettings]);

  const forceSyncNow = async () => {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      await flushOfflineQueueNow().catch(() => {});
    }
    await fetchCloudData(false);
  };

  // Manager-only Auto-Lock Idle Timer (alleen actief wanneer je in het Manager scherm bent)
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      autoLockMinutes <= 0 ||
      isSystemLocked ||
      !currentPosUser ||
      posScreen !== 'manager' ||
      (appMode !== 'pos' && appMode !== 'split')
    ) {
      return;
    }
    const uname = String(currentPosUser.username || '').toLowerCase();
    const isStaffMember =
      uname !== 'bestel_kassa' &&
      uname !== 'klant' &&
      uname !== 'rpi' &&
      !currentPosUser.is_terminal_locked;
    if (!isStaffMember) return;

    const timeoutMs = autoLockMinutes * 60 * 1000;
    let timerId: number | null = null;
    let lastReset = 0;

    const armTimer = () => {
      const now = Date.now();
      if (now - lastReset < 1000 && timerId !== null) return;
      lastReset = now;
      if (timerId !== null) window.clearTimeout(timerId);
      timerId = window.setTimeout(() => {
        try {
          sessionStorage.removeItem(`wd_manager_unlocked_${uname}`);
        } catch {}
        setIsSystemLockedState(true);
        try {
          localStorage.setItem('wd_system_locked', 'true');
        } catch {}
        logAuditAction('SYSTEEM_AUTOLOCK', `Manager scherm automatisch vergrendeld na ${autoLockMinutes} min inactiviteit (@${uname}).`);
        showToast(`🔒 Manager scherm automatisch vergrendeld na ${autoLockMinutes} min inactiviteit.`, 'info');
      }, timeoutMs);
    };

    armTimer();
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'pointerdown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, armTimer, { passive: true }));

    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
      events.forEach((ev) => window.removeEventListener(ev, armTimer));
    };
  }, [autoLockMinutes, isSystemLocked, currentPosUser, appMode, posScreen]);

  // Multi-Terminal Live Responder for Pico W Quick Balance & Loyalty Check (KEY 'B')
  const handledCheckCardSigRef = useRef<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    let unsubs: Array<() => void> = [];

    const setupSubscriptions = () => {
      unsubs.forEach((u) => u());
      unsubs = [];

      const termIds = Array.from(
        new Set([
          getActiveHardwareTerminalId(),
          ...getConfiguredHardwareTerminals().map((t) => t.id)
        ])
      ).filter(Boolean);

      for (const tid of termIds) {
        const unsub = subscribeHardwareTerminal(
          async (st) => {
            if (!active || !st || st.status !== 'CHECK_CARD' || !st.scannedUid) return;
            const sig = `${tid}:${st.scannedUid}:${st.updatedAt}`;
            if (handledCheckCardSigRef.current[tid] === sig) return;
            handledCheckCardSigRef.current[tid] = sig;

            const normUid = normalizeCardUid(st.scannedUid);
            let matched = bankAccountsRef.current.find((a) => accountMatchesUid(a, normUid));
            if (!matched) {
              try {
                const dbAccs = await getAllBankAccountsFromFirestore();
                matched = dbAccs.find((a) => accountMatchesUid(a, normUid));
              } catch {}
            }

            if (!matched) {
              await setHardwareTerminalCheckResult(
                { found: false, scannedUid: normUid, reason: 'Pas onbekend!' },
                tid
              ).catch(() => {});
              return;
            }

            const loyalty =
              findLoyaltyCustomerByPhoneOrName(matched.account_holder) ||
              findLoyaltyCustomerByPhoneOrName(matched.username);
            await setHardwareTerminalCheckResult(
              {
                found: true,
                accountHolder: matched.account_holder,
                balance: matched.is_admin ? 99999 : Number(matched.balance || 0),
                coins: loyalty?.coins ?? 0,
                tier: loyalty?.tier ?? (matched.is_admin ? 'VIP' : 'Brons'),
                scannedUid: normUid
              },
              tid
            ).catch(() => {});
          },
          () => {},
          tid
        );
        unsubs.push(unsub);
      }
    };

    setupSubscriptions();
    const handleTermListChange = () => setupSubscriptions();
    window.addEventListener(HARDWARE_TERMINAL_EVENT, handleTermListChange);

    return () => {
      active = false;
      unsubs.forEach((u) => u());
      window.removeEventListener(HARDWARE_TERMINAL_EVENT, handleTermListChange);
    };
  }, []);

  // Initial Firebase seed check for products & bank accounts
  useEffect(() => {
    const initSeedData = async () => {
      try {
        const dbProds = await fsGetCollection('products').catch(() => []);
        if (Array.isArray(dbProds) && dbProds.length >= 1) {
          const parsed = dbProductsToSorted(dbProds);
          setProducts(parsed);
        } else {
          await saveProductsBatchToFirestore(ALL_DEFAULT_PRODUCTS);
          setProducts(ALL_DEFAULT_PRODUCTS);
        }
      } catch (err) {
        console.error('Product init error:', err);
      }
    };
    const dbProductsToSorted = (rows: any[]) =>
      rows.map(fromFirestoreProduct).sort((a, b) => Number(a.id) - Number(b.id));
    initSeedData();
  }, []);

  // Active Device Heartbeat to pos_sessions (lightweight 15s heartbeat, skips hidden tabs)
  useEffect(() => {
    if (!deviceId) return;

    const sendHeartbeat = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const userLabel = currentPosUser
          ? `${currentPosUser.name} (@${currentPosUser.username})`
          : (currentBankAccount ? `WerkPay: ${currentBankAccount.account_holder}` : 'Gast / Kiosk Paal');

        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        let deviceType = 'Desktop';
        if (/mobile/i.test(ua)) deviceType = 'Mobiel';
        if (/tablet|ipad/i.test(ua)) deviceType = 'Tablet';
        if (currentPosUser?.username === 'rpi') deviceType = 'Raspberry Pi Kiosk';

        await savePosSessionToFirestore({
          device_id: deviceId,
          ip_address: clientIp || 'Detecteren...',
          user_name: userLabel,
          app_mode: appMode,
          pos_screen: posScreen,
          user_agent: deviceType,
          last_seen: new Date().toISOString()
        });
      } catch {
        // silent
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, [deviceId, clientIp, currentPosUser, currentBankAccount, appMode, posScreen]);

  // Live Firebase Cloud Firestore Realtime Subscriptions
  useEffect(() => {
    let isMounted = true;
    const audioMountTs = Date.now();
    lastHandledAudioTsRef.current = audioMountTs;

    fetchCloudData(false);

    AudioFX.setBroadcastSender((event: string, pld: any) => {
      emitAudioBroadcastEvent(event, pld || {}).catch((e: any) => console.warn('Broadcast send error:', e));
    });

    const unsubs: Array<() => void> = [];

    // 1. Orders Realtime (incl. bell & speakOrder on kitchen stage changes)
    unsubs.push(
      fsSubscribeCollection('orders', (rawOrders) => {
        if (!isMounted || currentPosUserRef.current?.is_shadowbanned) return;
        if (!rawOrders || rawOrders.length === 0) return;

        const parsed: Order[] = rawOrders
          .map(formatDbOrder)
          .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
          .slice(0, 80);

        const prevOrders = ordersRef.current;
        const newlyDoneOrders: Order[] = [];
        for (const nextOrd of parsed) {
          const oldOrd = prevOrders.find(o => o.no === nextOrd.no);
          const wasDone = oldOrd && (oldOrd.status === 'done' || oldOrd.status === 'klaar');
          const isNowDone = nextOrd.status === 'done' || nextOrd.status === 'klaar';
          if (oldOrd && isNowDone && !wasDone) {
            newlyDoneOrders.push(nextOrd);
          }
        }

        setOrders(prev => {
          const { merged, hasNewRemoteOrder } = mergeOrders(prev, parsed);
          if (hasNewRemoteOrder) {
            AudioFX.bell();
          }
          return merged;
        });

        for (const doneOrd of newlyDoneOrders) {
          if (doneOrd.orderType !== 'delivery') {
            AudioFX.speakOrder(doneOrd.no, doneOrd.identifier, doneOrd.orderType);
          }
        }

        const highest = Math.max(0, ...parsed.map(x => x.no));
        if (highest >= 1000) {
          setOrderNo(prev => (prev >= highest + 1 ? prev : Math.max(prev, highest + 1)));
        }
        setLastSyncTime(new Date());
        setSyncStatus('synced');
        setIsOnline(true);
        setIsRealtimeActive(true);
        setConnectionText('🟢 Firebase Cloud Firestore Live');
      }, (err) => console.warn('Orders listener error:', err))
    );

    // 2. Bank Accounts Realtime (safe merge)
    unsubs.push(
      fsSubscribeCollection('bank_accounts', (rawAccs) => {
        if (!isMounted || currentPosUserRef.current?.is_shadowbanned) return;
        if (!rawAccs || rawAccs.length === 0) return;
        const remoteAccs = rawAccs.map(fromFirestoreBankAccount);
        const { merged: parsedAccs, nextKnownCloudKeys } = mergeBankAccountsList({
          local: bankAccountsRef.current,
          remote: remoteAccs,
          initial: INITIAL_BANK_ACCOUNTS,
          knownCloudKeys: cloudKnownBankKeysRef.current,
          deletedKeys: deletedBankKeysRef.current,
          pendingWrites: pendingBankWritesRef.current
        });
        cloudKnownBankKeysRef.current = nextKnownCloudKeys;
        try {
          localStorage.setItem('wd_cloud_known_banks', JSON.stringify(Array.from(nextKnownCloudKeys)));
        } catch {}

        const bankSnap = JSON.stringify(parsedAccs);
        if (bankSnap !== cloudSnapshotsRef.current.bank) {
          cloudSnapshotsRef.current.bank = bankSnap;
          setBankAccounts(parsedAccs);
          localStorage.setItem('wd_bank_accounts', bankSnap);
        }
        const curBank = currentBankAccountRef.current;
        if (curBank) {
          const curUserLower = String(curBank.username || '').trim().toLowerCase();
          const updatedMe = parsedAccs.find(
            a => a.id === curBank.id || String(a.username || '').trim().toLowerCase() === curUserLower
          );
          if (updatedMe) {
            setCurrentBankAccount(updatedMe);
          }
        }
        setLastSyncTime(new Date());
      }, (err) => console.warn('Bank accounts listener error:', err))
    );

    // 2b. Bank Transactions Realtime
    unsubs.push(
      fsSubscribeCollection('bank_transactions', (rawTxs) => {
        if (!isMounted || currentPosUserRef.current?.is_shadowbanned) return;
        if (!rawTxs || rawTxs.length === 0) return;
        const parsedTxs: BankTransaction[] = rawTxs
          .map((t: any) => ({
            id: t.id,
            from_account: String(t.from_account || ''),
            to_account: String(t.to_account || ''),
            amount: Number(t.amount || 0),
            label: String(t.label || 'Transactie'),
            note: t.note ? String(t.note) : undefined,
            order_no: typeof t.order_no === 'number' ? t.order_no : undefined,
            when: String(t.when || ''),
            timestamp: Number(t.timestamp || 0)
          }))
          .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
          .slice(0, 100);
        setBankTransactions(parsedTxs);
      }, (err) => console.warn('Bank transactions listener error:', err))
    );

    // 3. Products Realtime (FULL product & keuzemenu / options / brand / recipe sync!)
    unsubs.push(
      fsSubscribeCollection('products', (rawProds) => {
        if (!isMounted || currentPosUserRef.current?.is_shadowbanned) return;
        if (!rawProds || rawProds.length === 0) return;
        const parsed = rawProds
          .map(fromFirestoreProduct)
          .sort((a, b) => Number(a.id) - Number(b.id));
        const prodSnap = JSON.stringify(parsed);
        if (prodSnap !== cloudSnapshotsRef.current.products) {
          cloudSnapshotsRef.current.products = prodSnap;
          setProducts(parsed);
          localStorage.setItem('wd_products', prodSnap);
        }
        setLastSyncTime(new Date());
      }, (err) => console.warn('Products listener error:', err))
    );

    // 4. Coupons Realtime (safe merge)
    unsubs.push(
      fsSubscribeCollection('coupons', (rawCoupons) => {
        if (!isMounted || currentPosUserRef.current?.is_shadowbanned) return;
        if (!rawCoupons || rawCoupons.length === 0) return;
        const remoteCoupons: Coupon[] = rawCoupons.map((c: any) => ({
          id: Number(c.id),
          code: String(c.code || ''),
          discount_type: c.discount_type as any,
          discount_val: Number(c.discount_val || 0),
          min_subtotal: c.min_subtotal ? Number(c.min_subtotal) : undefined,
          target_product_name: c.target_product_name || undefined,
          target_category: c.target_category || undefined,
          description: c.description || undefined,
          is_active: Boolean(c.is_active)
        }));
        const { merged: parsed, nextKnownCloudIds } = mergeByIdWithCloud({
          local: couponsRef.current,
          remote: remoteCoupons,
          knownCloudIds: cloudKnownCouponIdsRef.current
        });
        cloudKnownCouponIdsRef.current = nextKnownCloudIds;
        const snap = JSON.stringify(parsed);
        if (snap !== cloudSnapshotsRef.current.coupons) {
          cloudSnapshotsRef.current.coupons = snap;
          setCoupons(parsed);
          localStorage.setItem('wd_coupons', snap);
        }
      }, (err) => console.warn('Coupons listener error:', err))
    );

    // 5. Gift Cards Realtime (safe merge)
    unsubs.push(
      fsSubscribeCollection('gift_cards', (rawGc) => {
        if (!isMounted || currentPosUserRef.current?.is_shadowbanned) return;
        if (!rawGc || rawGc.length === 0) return;
        const remoteGc: GiftCard[] = rawGc.map((g: any) => ({
          id: Number(g.id),
          code: String(g.code || ''),
          initial_balance: Number(g.initial_balance || 0),
          current_balance: Number(g.current_balance || 0),
          is_active: Boolean(g.is_active),
          sender_name: g.sender_name || undefined,
          recipient_name: g.recipient_name || undefined,
          recipient_phone: g.recipient_phone || undefined,
          message: g.message || undefined,
          is_private: Boolean(g.is_private),
          notes: g.notes || undefined,
          created_at: g.created_at || undefined
        }));
        const { merged: parsed, nextKnownCloudIds } = mergeByIdWithCloud({
          local: giftCardsRef.current,
          remote: remoteGc,
          knownCloudIds: cloudKnownGiftCardIdsRef.current
        });
        cloudKnownGiftCardIdsRef.current = nextKnownCloudIds;
        const snap = JSON.stringify(parsed);
        if (snap !== cloudSnapshotsRef.current.giftCards) {
          cloudSnapshotsRef.current.giftCards = snap;
          setGiftCards(parsed);
          localStorage.setItem('wd_gift_cards', snap);
        }
      }, (err) => console.warn('Gift cards listener error:', err))
    );

    // 6. Cash Requests Realtime
    unsubs.push(
      fsSubscribeCollection('cash_requests', (rawReqs) => {
        if (!isMounted) return;
        const parsed = rawReqs
          .map(formatDbCashRequest)
          .sort((a, b) => Number(b.requestedAt || 0) - Number(a.requestedAt || 0))
          .slice(0, 50);
        const snap = JSON.stringify(parsed);
        if (snap !== cloudSnapshotsRef.current.cashReqs) {
          const prevPendingIds = new Set(
            (() => {
              try {
                const prevArr: CashPaymentRequest[] = JSON.parse(cloudSnapshotsRef.current.cashReqs || '[]');
                return prevArr.map(r => r.id);
              } catch {
                return [];
              }
            })()
          );
          const hasNewPending = parsed.some(r => r.status === 'pending' && !prevPendingIds.has(r.id));
          cloudSnapshotsRef.current.cashReqs = snap;
          setCashRequests(parsed);
          localStorage.setItem('wd_cash_requests', snap);
          if (hasNewPending && prevPendingIds.size > 0) {
            try { AudioFX.bell(); } catch {}
          }
        }
      }, (err) => console.warn('Cash requests listener error:', err))
    );

    // 7. POS Users Realtime (safe merge)
    unsubs.push(
      fsSubscribeCollection('pos_users', (rawUsers) => {
        if (!isMounted || !rawUsers || rawUsers.length === 0) return;
        const remoteParsedUsers: PosUser[] = rawUsers.map(u => parsePosUserFromDb(u));
        const { merged: parsedUsers, nextKnownCloudKeys: nextPosKnown } = mergePosUsersList({
          local: posUsersRef.current,
          remote: remoteParsedUsers,
          initial: INITIAL_POS_USERS,
          knownCloudKeys: cloudKnownPosKeysRef.current,
          deletedKeys: deletedPosKeysRef.current
        });
        cloudKnownPosKeysRef.current = nextPosKnown;
        try {
          localStorage.setItem('wd_cloud_known_pos_users', JSON.stringify(Array.from(nextPosKnown)));
        } catch {}

        const usersSnap = JSON.stringify(parsedUsers);
        if (usersSnap !== cloudSnapshotsRef.current.users) {
          cloudSnapshotsRef.current.users = usersSnap;
          setPosUsers(parsedUsers);
          localStorage.setItem('wd_pos_users', usersSnap);
        }
      }, (err) => console.warn('POS users listener error:', err))
    );

    // 8. POS Settings Realtime
    unsubs.push(
      fsSubscribeDoc('pos_settings', 'default', (settings) => {
        if (!isMounted || !settings) return;
        applyRemoteSettings(settings);
        setLastSyncTime(new Date());
      }, (err) => console.warn('POS settings listener error:', err))
    );

    // 9. Loyalty Customers Realtime
    unsubs.push(
      fsSubscribeCollection('loyalty_customers', (rawLoyalty) => {
        if (!isMounted || !rawLoyalty || rawLoyalty.length === 0) return;
        const parsedLoyalty = rawLoyalty.map((c: any) => {
          const phone = String(c.phone || '');
          const activeVipRec = isVipSubscriberPhone(phone);
          const isVip = Boolean(c.vipSubscriptionActive || c.vip_subscription_active || activeVipRec);
          return {
            id: String(c.id),
            name: String(c.name || ''),
            phone,
            coins: Number(c.coins || 0),
            totalSpent: Number(c.totalSpent ?? 0),
            ordersCount: Number(c.ordersCount ?? 0),
            tier: isVip ? 'VIP Diamant' : ((c.tier as any) || 'Brons'),
            level: isVip ? 4 : c.level,
            currentMonthSpent: Number(c.currentMonthSpent ?? 0),
            lastMonthSpent: Number(c.lastMonthSpent ?? 0),
            currentMonthKey: c.currentMonthKey || '',
            monthsBelowTarget: Number(c.monthsBelowTarget ?? 0),
            vipSubscriptionActive: isVip,
            vipSubscriptionExpires: activeVipRec?.expiresAt || c.vipSubscriptionExpires || undefined,
            vipPlan: activeVipRec?.plan || c.vipPlan || undefined,
            vouchers: Array.isArray(c.vouchers) ? c.vouchers : [],
            lastSpinDate: c.lastSpinDate || undefined,
            ordersTodayCount: Number(c.ordersTodayCount ?? 0),
            joinedDate: c.joinedDate || new Date().toISOString().split('T')[0]
          };
        });
        const loyaltySnap = JSON.stringify(parsedLoyalty);
        if (loyaltySnap !== cloudSnapshotsRef.current.loyalty) {
          cloudSnapshotsRef.current.loyalty = loyaltySnap;
          localStorage.setItem('wd_loyalty_customers_db', loyaltySnap);
          localStorage.setItem('wd_loyalty_ts', Date.now().toString());
          window.dispatchEvent(new Event('wd_loyalty_updated'));
        }
      }, (err) => console.warn('Loyalty listener error:', err))
    );

    // 10. POS Sessions Realtime
    unsubs.push(
      fsSubscribeCollection('pos_sessions', (rawSessions) => {
        if (!isMounted || !rawSessions) return;
        const now = Date.now();
        const recent = rawSessions
          .filter((s: any) => {
            const t = new Date(s.last_seen).getTime();
            return Number.isFinite(t) && (now - t) < 60000;
          })
          .map((s: any) => ({
            device_id: String(s.device_id),
            ip_address: String(s.ip_address || 'Onbekend'),
            user_name: String(s.user_name || 'Gast'),
            app_mode: String(s.app_mode || 'pos'),
            pos_screen: String(s.pos_screen || 'kassa'),
            user_agent: String(s.user_agent || 'Browser'),
            last_seen: String(s.last_seen)
          }));
        setActiveSessions(recent);
      }, (err) => console.warn('Sessions listener error:', err))
    );

    // 11. Global Audio & Security Broadcast Events (deduplicated by timestamp)
    unsubs.push(
      fsSubscribeDoc<{ event: string; payload?: any; ts: number }>(
        'audio_events',
        'latest',
        (ev) => {
          if (!isMounted || !ev || typeof ev.ts !== 'number') return;
          if (ev.ts <= Math.max(audioMountTs - 2000, lastHandledAudioTsRef.current)) return;
          lastHandledAudioTsRef.current = ev.ts;

          const pld = ev.payload || {};
          if (ev.event === 'speak_order') {
            AudioFX.speakOrder(pld.orderNo, pld.identifier, pld.orderType, true, true);
          } else if (ev.event === 'speak_text') {
            AudioFX.playSpeech(pld.text, pld.orderNo, pld.target, true);
          } else if (ev.event === 'wd_device_blocked' && Array.isArray(pld.blocked_devices)) {
            setBlockedDevices(pld.blocked_devices);
            localStorage.setItem('wd_blocked_devices', JSON.stringify(pld.blocked_devices));
          } else if (ev.event === 'wd_security_state_sync') {
            const { username, is_shadowbanned, is_banned, is_suspended, tables_frozen } = pld;
            if (tables_frozen !== undefined) {
              setTablesFrozenState(Boolean(tables_frozen));
              localStorage.setItem('wd_tables_frozen', String(Boolean(tables_frozen)));
            }
            if (username) {
              const cleanU = String(username).toLowerCase();
              setPosUsers(prev => {
                const updated = prev.map(u => u.username.toLowerCase() === cleanU ? {
                  ...u,
                  is_shadowbanned: Boolean(is_shadowbanned),
                  is_banned: Boolean(is_banned),
                  is_suspended: Boolean(is_suspended)
                } : u);
                localStorage.setItem('wd_pos_users', JSON.stringify(updated));
                return updated;
              });
              setCurrentPosUser(prev => {
                if (!prev || prev.username.toLowerCase() !== cleanU) return prev;
                if (is_banned || is_suspended) {
                  sessionStorage.removeItem('wd_pos_user');
                  return null;
                }
                return { ...prev, is_shadowbanned: Boolean(is_shadowbanned) };
              });
            }
          }
        },
        (err) => console.warn('Audio events listener error:', err)
      )
    );

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchCloudData(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      isMounted = false;
      AudioFX.setBroadcastSender(() => {});
      unsubs.forEach(u => {
        try { u(); } catch {}
      });
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [fetchCloudData, applyRemoteSettings]);

  // Test Firebase Cloud Firestore Connection
  const testConnection = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await testFirestoreConnection();
      if (!res.success) {
        setIsOnline(false);
        setIsRealtimeActive(false);
        setSyncStatus('error');
        setConnectionText('Offline / Verbindingsfout');
        return { success: false, message: `Firebase verbinding mislukt: ${res.message}` };
      }

      setIsOnline(true);
      setIsRealtimeActive(true);
      setSyncStatus('synced');
      setLastSyncTime(new Date());
      setConnectionText('🟢 Firebase Cloud Firestore Live');
      return {
        success: true,
        message: `${res.message} — Alle collecties zijn direct live bereikbaar!`
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Onbekende fout bij verbinden met Firebase Firestore.'
      };
    }
  };

  // Cart operations
  const addToCart = (item: Omit<CartItem, 'id'>) => {
    AudioFX.beep();
    setCart(prev => {
      // Check if identical item (same name, price, notes) exists
      const existingIdx = prev.findIndex(x => x.name === item.name && x.price === item.price && (x.itemNote || '') === (item.itemNote || ''));
      if (existingIdx !== -1) {
        const updated = [...prev];
        updated[existingIdx].qty += item.qty;
        return updated;
      }
      return [...prev, { ...item, id: `${Date.now()}-${Math.random()}` }];
    });
  };

  const updateCartQty = (index: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      updated[index].qty += delta;
      if (updated[index].qty <= 0) {
        updated.splice(index, 1);
      }
      return updated;
    });
  };

  const setCartItemQty = (index: number, qty: number) => {
    setCart(prev => {
      if (qty <= 0) {
        return prev.filter((_, i) => i !== index);
      }
      const updated = [...prev];
      updated[index].qty = qty;
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const emptyCart = () => {
    setCart([]);
    setAppliedDiscount({ type: 'none', val: 0, label: 'Geen' });
  };

  const applyCouponCode = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, message: 'Voer een geldige kortingscode of vouchercode in.' };
    }

    const rawTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    const orderItems: OrderItem[] = cart.map(x => ({
      name: x.name,
      qty: x.qty,
      price: x.price,
      cat: x.cat
    }));

    // Check with advanced discount service (supports promo codes, category rules, & customer vouchers)
    const calc = calculateDiscount(cleanCode, orderItems, rawTotal);

    if (calc.valid) {
      setAppliedDiscount({
        type: 'fixed',
        val: calc.discountAmount,
        code: calc.code,
        label: calc.description
      });
      return { success: true, message: `${calc.description} succesvol toegepast! (-€${calc.discountAmount.toFixed(2)})` };
    }

    // Fallback to legacy coupon state if present
    const c = coupons.find(x => x.code === cleanCode && x.is_active);
    if (!c) {
      return { success: false, message: calc.error || 'Onbekende, ongeldige of verlopen kortingscode/voucher!' };
    }

    if (c.discount_type === 'threshold' && rawTotal < (c.min_subtotal || 0)) {
      return {
        success: false,
        message: `Minimale besteding van € ${c.min_subtotal?.toFixed(2)} vereist voor deze coupon.`
      };
    }

    setAppliedDiscount({
      type: c.discount_type,
      val: c.discount_val,
      code: c.code,
      label: `${c.code} (${c.discount_type === 'percent' ? `${c.discount_val}%` : `€${c.discount_val.toFixed(2)}`})`
    });
    return { success: true, message: `Coupon ${c.code} succesvol toegepast!` };
  };

  const removeCoupon = () => {
    setAppliedDiscount({ type: 'none', val: 0, label: 'Geen' });
  };

  const setOrderStopActiveWithText = async (active: boolean, text: string, config?: Partial<OrderStopConfig>) => {
    setOrderStopActive(active);
    setOrderStopTextState(text);
    localStorage.setItem('wd_order_stop', String(active));
    localStorage.setItem('wd_order_stop_text', text);

    const nextConfig = config ? { ...orderStopConfig, ...config } : orderStopConfig;
    if (config) {
      setOrderStopConfig(nextConfig);
      localStorage.setItem('wd_order_stop_config', JSON.stringify(nextConfig));
    }

    let newsCfg: any = {};
    try {
      const saved = localStorage.getItem('wd_pickup_news_config_v2');
      if (saved) newsCfg = JSON.parse(saved);
    } catch {}
    newsCfg.orderStopText = text;

    try {
      await savePosSettingsToFirestore({
        order_stop_active: active,
        pickup_closed: pickupClosed,
        news_config: newsCfg,
        order_stop_text: text,
        order_stop_config: nextConfig
      });
    } catch (e) {
      console.warn('Firestore order stop save error:', e);
    }
  };

  const updateCustomBranding = async (config: Partial<CustomBrandingConfig>) => {
    const nextBranding = { ...customBranding, ...config };
    setCustomBranding(nextBranding);
    localStorage.setItem('wd_custom_branding', JSON.stringify(nextBranding));

    try {
      await savePosSettingsToFirestore({
        branding_config: nextBranding,
        custom_branding: nextBranding
      });
      showToast('Branding instellingen succesvol opgeslagen!', 'success');
    } catch (e) {
      console.error('Fout bij opslaan branding_config:', e);
      showToast('Fout bij opslaan branding in database.', 'error');
    }
  };

  const toggleOrderStop = async () => {
    const nextVal = !orderStopActive;
    setOrderStopActive(nextVal);
    localStorage.setItem('wd_order_stop', String(nextVal));
    try {
      await savePosSettingsToFirestore({
        order_stop_active: nextVal,
        order_stop_text: orderStopText
      });
    } catch (e) {
      console.warn('Firestore toggleOrderStop error:', e);
    }
  };

  const togglePickupClosed = async () => {
    const nextVal = !pickupClosed;
    setPickupClosed(nextVal);
    try {
      await savePosSettingsToFirestore({
        pickup_closed: nextVal,
        order_stop_text: orderStopText
      });
    } catch (e) {
      console.warn('Firestore togglePickupClosed error:', e);
    }
  };

  // Inventory deductions
  const deductInventoryForItems = (orderItems: CartItem[]) => {
    const updated = inventory.map(i => ({ ...i }));
    const touchedIds = new Set<number>();

    orderItems.forEach(item => {
      const name = item.name.toLowerCase();
      const qty = item.qty;

      if (name.includes('burger') || name.includes('mac') || name.includes('quarter') || name.includes('tasty')) {
        const bun = updated.find(i => i.item_name.includes('Broodjes'));
        if (bun && bun.stock_qty >= qty) {
          bun.stock_qty -= qty;
          touchedIds.add(bun.id);
        }
        const beef = updated.find(i => i.item_name.includes('Rundvlees'));
        if (beef && beef.stock_qty >= qty) {
          beef.stock_qty -= (name.includes('double') ? qty * 2 : qty);
          touchedIds.add(beef.id);
        }
      }
      if (name.includes('chicken') || name.includes('kip') || name.includes('nugget')) {
        const chicken = updated.find(i => i.item_name.includes('Kip'));
        if (chicken && chicken.stock_qty >= qty) {
          chicken.stock_qty -= qty;
          touchedIds.add(chicken.id);
        }
      }
      if (name.includes('friet') || name.includes('menu')) {
        const fries = updated.find(i => i.item_name.includes('Friet'));
        if (fries && fries.stock_qty > 0) {
          fries.stock_qty = Math.max(0, fries.stock_qty - Math.ceil(qty * 0.1));
          touchedIds.add(fries.id);
        }
      }
    });

    setInventory(updated);
    if (touchedIds.size > 0 && !currentPosUser?.is_shadowbanned && !tablesFrozen) {
      const changedItems = updated.filter(i => touchedIds.has(i.id));
      saveInventoryBatchToFirestore(changedItems).catch(() => {
        enqueueOfflineMutation({ type: 'inventory_batch', payload: changedItems });
      });
    }
  };

  // Process Checkout (POS + WerkPay)
  const processCheckout = async (
    method: 'workpay' | 'cash' | 'giftcard',
    orderType: 'dine_in' | 'takeaway' | 'delivery',
    identifier: string,
    paymentMeta: any
  ): Promise<{ success: boolean; message: string; order?: Order }> => {
    if (orderStopActive && (!currentPosUser || !currentPosUser.is_admin)) {
      return { success: false, message: 'Bestellingen zijn momenteel gepauzeerd door de bestelstop.' };
    }

    if (cart.length === 0) {
      return { success: false, message: 'Winkelwagen is leeg.' };
    }

    const rawTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    let discountAmount = 0;
    if (appliedDiscount.type === 'percent') {
      discountAmount = rawTotal * (appliedDiscount.val / 100);
    } else if (appliedDiscount.type === 'fixed' || appliedDiscount.type === 'threshold') {
      discountAmount = Math.min(rawTotal, appliedDiscount.val);
    }
    const finalTotal = Math.max(0, rawTotal - discountAmount);

    // 1. If method is WerkPay: charge the bank account
    if (method === 'workpay') {
      const mode = paymentMeta?.mode || 'login';
      let chargedAccount: BankAccount | null = null;

      if (mode === 'quick') {
        if (!currentBankAccount) {
          return { success: false, message: 'Geen actief WerkPay account ingelogd!' };
        }
        // Strict Security: Require PIN verification even on quick pay!
        const pin = String(paymentMeta.pin || '').trim();
        if (!pin) {
          return { success: false, message: 'Voer uw 4-cijferige pincode in om de betaling te autoriseren.' };
        }
        const validPin = (String(currentBankAccount.pin_code ?? '').trim() === pin && pin.length > 0) ||
                         (String(currentBankAccount.password ?? '').trim() === pin && pin.length > 0);
        if (!validPin) {
          return { success: false, message: 'Onjuiste pincode! Betaling op deze rekening is geweigerd.' };
        }
        chargedAccount = currentBankAccount;
      } else if (mode === 'login') {
        const username = paymentMeta.username?.trim().replace(/^@+/, '').toLowerCase();
        const password = paymentMeta.password?.trim();
        if (!username || !password) {
          return { success: false, message: 'Voer zowel gebruikersnaam als wachtwoord/pin in!' };
        }

        const matchesBankLogin = (a: BankAccount) =>
          String(a.username || '').trim().replace(/^@+/, '').toLowerCase() === username &&
          (String(a.password ?? '').trim() === password || String(a.pin_code ?? '').trim() === password);

        chargedAccount = bankAccountsRef.current.find(matchesBankLogin) || null;

        // Try live Firestore if not found locally
        if (!chargedAccount) {
          try {
            const allDbAccs = await getAllBankAccountsFromFirestore();
            chargedAccount = allDbAccs.find(matchesBankLogin) || null;
          } catch {}
        }
      } else if (mode === 'card' || mode === 'terminal') {
        const cleanUid = normalizeCardUid(paymentMeta.cardUid);
        const pin = String(paymentMeta.pin || '').trim();
        if (!cleanUid) {
          return { success: false, message: 'Geen pasnummer of RFID/NFC kaart gescand!' };
        }
        if (!pin) {
          return { success: false, message: 'Voer de 4-cijferige pincode van de bankpas in.' };
        }

        const matchesCardPin = (a: BankAccount) => {
          const matchUid = accountMatchesUid(a, cleanUid);
          const matchPin = String(a.pin_code ?? '').trim() === pin || String(a.password ?? '').trim() === pin;
          return matchUid && matchPin;
        };

        chargedAccount = bankAccountsRef.current.find(matchesCardPin) || null;

        // Try live Firestore if not found locally (supports spaces, casing & linked_uids)
        if (!chargedAccount) {
          try {
            const allDbAccs = await getAllBankAccountsFromFirestore();
            chargedAccount = allDbAccs.find(matchesCardPin) || null;
          } catch {}
        }
      }

      if (!chargedAccount) {
        return { success: false, message: 'Ongeldige kaart, gebruikersnaam of pincode! Niemand mag zonder geldige autorisatie op een rekening betalen.' };
      }

      if (!chargedAccount.is_admin && chargedAccount.balance < finalTotal) {
        return {
          success: false,
          message: `Onvoldoende WerkPay saldo! Huidig saldo is € ${chargedAccount.balance.toFixed(2)}, totaal is € ${finalTotal.toFixed(2)}.`
        };
      }

      // Atomic Firestore debit (for non-admin accounts)
      let newBal = chargedAccount.is_admin
        ? chargedAccount.balance
        : Math.max(0, Math.round((chargedAccount.balance - finalTotal) * 100) / 100);

      if (!chargedAccount.is_admin && finalTotal > 0) {
        try {
          const txRes = await adjustBankBalanceTransaction(chargedAccount.username, -finalTotal, chargedAccount);
          if (!txRes.success) {
            return { success: false, message: txRes.error || 'Betaling op WerkPay rekening geweigerd.' };
          }
          newBal = txRes.newBalance;
        } catch (err) {
          console.warn('Firestore checkout balance transaction fallback (queued offline):', err);
          enqueueOfflineMutation({
            type: 'bank_delta',
            payload: {
              username: chargedAccount.username,
              delta: -finalTotal,
              fallbackAccount: chargedAccount
            }
          });
        }
      }

      setBankAccounts(prev => prev.map(a => a.id === chargedAccount!.id ? { ...a, balance: newBal } : a));
      if (currentBankAccount && currentBankAccount.id === chargedAccount.id) {
        setCurrentBankAccount(prev => prev ? { ...prev, balance: newBal } : null);
      }

      // Determine brand for proper transaction logging
      const currentBrandKey = activeBrand || 'koekploeg';
      const isKoekploegBrand = currentBrandKey === 'koekploeg';
      const brandName = isKoekploegBrand ? 'De Koekploeg' : 'Werkdonalds';
      const toMerchant = `${brandName} Kassa`;
      const txLabel = `${brandName} Bestelling #${orderNo}`;

      // Add bank transaction
      const tx: BankTransaction = {
        id: Date.now(),
        from_account: chargedAccount.username,
        to_account: toMerchant,
        amount: finalTotal,
        label: txLabel,
        note: `Betaling via ${mode === 'terminal' ? 'DIY Pinapparaat' : mode === 'card' ? 'WerkPay Kaart' : 'WerkPay Login'} (${brandName})`,
        order_no: orderNo,
        when: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      };
      setBankTransactions(prev => [tx, ...prev]);

      saveBankTransactionToFirestore(tx).catch((err) => {
        console.warn('Firestore save bank transaction queued offline:', err);
        enqueueOfflineMutation({ type: 'bank_tx', payload: tx });
      });

      paymentMeta.account = chargedAccount.username;
      paymentMeta.balance_after = newBal;
      paymentMeta.brand = currentBrandKey;
      paymentMeta.brandName = brandName;
    }

    // 1.5 Cash Payment Authorization & Amount Integrity
    let consumedCashRequestId: string | null = null;
    const sanitizedPaymentMeta: any = { ...(paymentMeta || {}) };
    delete sanitizedPaymentMeta.approvalPin;

    if (method === 'cash') {
      const hasActiveStaffAuth = managerOverride || canAccess('manager_override') || authorizeCashStaffUser(currentPosUser);
      const pinCheck = sanitizedPaymentMeta.rawApprovalPin || paymentMeta?.approvalPin
        ? verifyCashApprovalPin(paymentMeta?.approvalPin || sanitizedPaymentMeta.rawApprovalPin)
        : { valid: false };
      delete sanitizedPaymentMeta.rawApprovalPin;

      const reqId = typeof paymentMeta?.cashRequestId === 'string' ? paymentMeta.cashRequestId : '';
      const matchedReq = reqId
        ? cashRequests.find(r => r.id === reqId && r.status === 'approved')
        : undefined;
      const hasApprovedRequest = Boolean(
        matchedReq &&
        !matchedReq.consumedAt &&
        Math.abs(Number(matchedReq.total) - finalTotal) < 0.02
      );

      if (!hasActiveStaffAuth && !pinCheck.valid && !hasApprovedRequest) {
        logAuditAction(
          'CONTANT_BETALING_GEBLOKKEERD',
          `Onbevoegde contante betaling geblokkeerd voor #${orderNo} (€ ${finalTotal.toFixed(2)}) door ${currentPosUser?.username || 'niet-ingelogd'}.`
        );
        return {
          success: false,
          message: 'Contante betaling geweigerd: geldige kassamedewerker-bevoegdheid (cash_pay), goedkeurings-PIN of afstandsgoedkeuring vereist!'
        };
      }

      const receivedAmount = hasApprovedRequest && matchedReq?.received !== undefined
        ? Number(matchedReq.received)
        : Number(paymentMeta?.received);

      if (!Number.isFinite(receivedAmount) || receivedAmount < finalTotal - 0.01) {
        logAuditAction(
          'CONTANT_BEDRAG_ONGELDIG',
          `Ongeldig contant bedrag (€${Number.isFinite(receivedAmount) ? receivedAmount.toFixed(2) : 'NaN'}) voor order #${orderNo} (totaal €${finalTotal.toFixed(2)}).`
        );
        return {
          success: false,
          message: `Ontvangen contant bedrag is onvolledig (minimaal € ${finalTotal.toFixed(2)} vereist).`
        };
      }

      const verifiedChange = Math.max(0, Math.round((receivedAmount - finalTotal) * 100) / 100);
      const verifiedCashierName = hasApprovedRequest
        ? (matchedReq?.approvedBy || paymentMeta?.cashier || 'Kassamedewerker')
        : pinCheck.valid
        ? (pinCheck.approverName || 'Kassamedewerker')
        : (currentPosUser?.name || 'Kassamedewerker');

      sanitizedPaymentMeta.received = Math.round(receivedAmount * 100) / 100;
      sanitizedPaymentMeta.change = verifiedChange;
      sanitizedPaymentMeta.cashier = verifiedCashierName;
      sanitizedPaymentMeta.accepted_by = verifiedCashierName;
      if (hasApprovedRequest && matchedReq) {
        consumedCashRequestId = matchedReq.id;
      }

      logAuditAction(
        'CONTANT_BETALING_GOEDGEKEURD',
        `Contante betaling #${orderNo} (€ ${finalTotal.toFixed(2)}, ontvangen € ${receivedAmount.toFixed(2)}) geautoriseerd door ${verifiedCashierName}.`
      );
    }

    // 2. Gift card deduction
    if (method === 'giftcard') {
      const card = giftCards.find(g => g.code === paymentMeta.code && g.is_active);
      if (!card) return { success: false, message: 'Ongeldige cadeaubon!' };
      if (card.current_balance < finalTotal) {
        return { success: false, message: `Onvoldoende saldo op cadeaubon (${card.current_balance.toFixed(2)})` };
      }
      const nextBalance = Math.max(0, Math.round((card.current_balance - finalTotal) * 100) / 100);
      const updatedCard = { ...card, current_balance: nextBalance };
      setGiftCards(prev => prev.map(g => g.id === card.id ? updatedCard : g));
      try {
        await saveGiftCardToFirestore(updatedCard);
      } catch (err) {
        console.error('Gift card queued offline:', err);
        enqueueOfflineMutation({ type: 'gift_card', payload: updatedCard });
      }
    }

    // 2.5 Consume cash approval request immediately to prevent replay
    if (consumedCashRequestId) {
      const consumedAt = Date.now();
      let consumedReqObj: CashPaymentRequest | null = null;
      const nextReqs = cashRequests.map(r => {
        if (r.id === consumedCashRequestId) {
          consumedReqObj = { ...r, status: 'consumed' as const, consumedAt };
          return consumedReqObj;
        }
        return r;
      });
      syncCashRequests(nextReqs);
      if (consumedReqObj) {
        saveCashRequestToFirestore(consumedReqObj).catch((err) => {
          console.warn('Firestore consume cash request queued offline:', err);
          enqueueOfflineMutation({ type: 'cash_request', payload: consumedReqObj! });
        });
      }
    }

    // 3. Create the order
    const orderItems = cart.map(x => ({
      name: x.name,
      qty: x.qty,
      price: x.price,
      itemNote: x.itemNote
    }));

    const newOrder: Order = {
      id: Date.now(),
      no: orderNo,
      items: orderItems,
      total: finalTotal,
      discount: discountAmount,
      orderType,
      identifier: identifier || (orderType === 'dine_in' ? 'Tafel -' : 'Afhaal'),
      notes: sanitizedPaymentMeta?.note || '',
      paymentMethod: method,
      paymentMeta: sanitizedPaymentMeta,
      cashier: sanitizedPaymentMeta?.accepted_by || currentPosUser?.name || 'Kassa',
      status: 'new',
      time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };

    setOrders(prev => [newOrder, ...prev]);
    setOrderNo(prev => prev + 1);

    // 4. Deduct inventory & empty cart
    deductInventoryForItems(cart);

    // If a discount voucher was applied, mark it used in loyalty system
    if (appliedDiscount.code) {
      redeemVoucherAnyCustomer(appliedDiscount.code, newOrder.no);
    }

    // Award loyalty coins to customer if linked
    if (paymentMeta?.loyaltyPhone) {
      addCoinsToCustomer(paymentMeta.loyaltyPhone, finalTotal);
    }

    emptyCart();

    // 5. Audio chime & print receipt (volgt globale Manager bonprinter-instellingen)
    AudioFX.bell();
    if (receiptPrinterConfig.showReceiptPopup !== false) {
      setActiveReceiptOrder(newOrder);
    } else if (receiptPrinterConfig.autoPrintOnOrder && receiptPrinter.getConnectionInfo().connected) {
      receiptPrinter
        .printOrder(newOrder, receiptPrinterConfig.receiptSize, {
          openCashDrawer: receiptPrinterConfig.openCashDrawer,
          copies: receiptPrinterConfig.copies,
          headerSubtitle: receiptPrinterConfig.headerSubtitle,
          footerText: receiptPrinterConfig.footerText,
          showCustomerInfo: receiptPrinterConfig.showCustomerInfo,
          showPaymentDetails: receiptPrinterConfig.showPaymentDetails,
        })
        .catch(() => {});
    }
    setTrackedOrderNo(newOrder.no);
    addMyOrderNumber(newOrder.no);

    // 6. Push to Firebase Cloud Firestore (with Offline Queue fallback)
    try {
      await saveOrderToFirestore(newOrder);
    } catch (err) {
      console.warn('Firestore insert order queued offline:', err);
      enqueueOfflineMutation({ type: 'order', payload: newOrder });
    }

    // Instant cross-tab broadcast for other open windows
    broadcastSync('SYNC_ORDER_NEW', newOrder);

    return {
      success: true,
      message: `Bestelling #${newOrder.no} is succesvol geplaatst!`,
      order: newOrder
    };
  };

  // SumUp Standalone Terminal Payment (en optionele mobiele keukenbestelling)
  const processSumUpPayment = async (params: {
    amount: number;
    tipAmount?: number;
    description?: string;
    method: 'workpay' | 'cash';
    paymentMeta?: any;
    sendToKitchen?: boolean;
    orderType?: 'dine_in' | 'takeaway' | 'delivery';
    identifier?: string;
    items?: OrderItem[];
    notes?: string;
  }): Promise<{ success: boolean; message: string; order?: Order }> => {
    if (params.sendToKitchen && orderStopActive && (!currentPosUser || !currentPosUser.is_admin)) {
      return { success: false, message: 'Bestellingen zijn momenteel gepauzeerd door de bestelstop.' };
    }

    const baseAmount = Math.round((Number(params.amount) || 0) * 100) / 100;
    const tipAmount = Math.round((Number(params.tipAmount) || 0) * 100) / 100;
    const finalTotal = Math.round((baseAmount + tipAmount) * 100) / 100;

    if (finalTotal <= 0) {
      return { success: false, message: 'Voer een geldig bedrag hoger dan € 0,00 in.' };
    }

    const desc = (params.description || '').trim() || 'WerkPin Betaling';
    const currentBrandKey = activeBrand || 'koekploeg';
    const isKoekploegBrand = currentBrandKey === 'koekploeg';
    const brandName = isKoekploegBrand ? 'De Koekploeg' : 'Werkdonalds';
    const rawApprovalPin = params.paymentMeta?.approvalPin ? String(params.paymentMeta.approvalPin) : '';
    const meta: any = {
      ...(params.paymentMeta || {}),
      isSumUp: true,
      sumupDescription: desc,
      baseAmount,
      tipAmount,
      brand: currentBrandKey,
      brandName
    };
    delete meta.approvalPin;

    if (params.method === 'cash') {
      const hasCashStaffAuth = managerOverride || canAccess('manager_override') || authorizeCashStaffUser(currentPosUser);
      const pinCheck = rawApprovalPin ? verifyCashApprovalPin(rawApprovalPin) : { valid: false };

      if (!hasCashStaffAuth && !pinCheck.valid) {
        logAuditAction(
          'WERKPIN_CONTANT_GEBLOKKEERD',
          `Onbevoegde WerkPin contante betaling (€ ${finalTotal.toFixed(2)}) geblokkeerd voor ${currentPosUser?.username || 'gast'}.`
        );
        return {
          success: false,
          message: 'Geen contant-bevoegdheid (cash_pay). Voer eerst een bevoegde medewerker PIN in.'
        };
      }

      const receivedAmount = Number(meta.received);
      if (!Number.isFinite(receivedAmount) || receivedAmount < finalTotal - 0.01) {
        return {
          success: false,
          message: `Ontvangen contant bedrag is lager dan € ${finalTotal.toFixed(2)}.`
        };
      }

      const approver = pinCheck.valid
        ? (pinCheck.approverName || 'Medewerker')
        : (currentPosUser?.name || 'WerkPin Kassier');
      meta.received = Math.round(receivedAmount * 100) / 100;
      meta.change = Math.max(0, Math.round((receivedAmount - finalTotal) * 100) / 100);
      meta.accepted_by = approver;
      meta.cashier = approver;

      logAuditAction(
        'WERKPIN_CONTANT_GOEDGEKEURD',
        `WerkPin contante betaling #${orderNo} (€ ${finalTotal.toFixed(2)}) geaccepteerd door ${approver}.`
      );
    }

    if (params.method === 'workpay') {
      const mode = meta.mode || 'terminal';
      let chargedAccount: BankAccount | null = null;

      if (mode === 'quick') {
        if (!currentBankAccount) {
          return { success: false, message: 'Geen actief WerkPay account ingelogd!' };
        }
        const pin = String(meta.pin || '').trim();
        if (!pin) return { success: false, message: 'Voer de 4-cijferige pincode in.' };
        const validPin = (String(currentBankAccount.pin_code ?? '').trim() === pin && pin.length > 0) ||
                         (String(currentBankAccount.password ?? '').trim() === pin && pin.length > 0);
        if (!validPin) return { success: false, message: 'Onjuiste pincode!' };
        chargedAccount = currentBankAccount;
      } else if (mode === 'login') {
        const username = String(meta.username || '').trim().replace(/^@+/, '').toLowerCase();
        const password = String(meta.password || '').trim();
        if (!username || !password) {
          return { success: false, message: 'Vul gebruikersnaam en wachtwoord/PIN in.' };
        }
        const matchesLogin = (a: BankAccount) =>
          String(a.username || '').trim().replace(/^@+/, '').toLowerCase() === username &&
          (String(a.password ?? '').trim() === password || String(a.pin_code ?? '').trim() === password);
        chargedAccount = bankAccountsRef.current.find(matchesLogin) || null;
        if (!chargedAccount) {
          try {
            const allDbAccs = await getAllBankAccountsFromFirestore();
            chargedAccount = allDbAccs.find(matchesLogin) || null;
          } catch {}
        }
      } else {
        const cleanUid = normalizeCardUid(meta.cardUid);
        const pin = String(meta.pin || '').trim();
        if (!cleanUid) return { success: false, message: 'Geen pasnummer of NFC kaart gescand!' };
        if (!pin) return { success: false, message: 'Voer de 4-cijferige pincode in.' };

        const matchesCard = (a: BankAccount) =>
          accountMatchesUid(a, cleanUid) &&
          (String(a.pin_code ?? '').trim() === pin || String(a.password ?? '').trim() === pin);

        chargedAccount = bankAccountsRef.current.find(matchesCard) || null;

        if (!chargedAccount) {
          try {
            const allDbAccs = await getAllBankAccountsFromFirestore();
            chargedAccount = allDbAccs.find(matchesCard) || null;
          } catch {}
        }
      }

      if (!chargedAccount) {
        return { success: false, message: 'Ongeldige kaart, gebruiker of pincode!' };
      }

      if (!chargedAccount.is_admin && chargedAccount.balance < finalTotal) {
        return {
          success: false,
          message: `Onvoldoende saldo! Saldo is € ${chargedAccount.balance.toFixed(2)}, gevraagd is € ${finalTotal.toFixed(2)}.`
        };
      }

      let newBal = chargedAccount.is_admin
        ? chargedAccount.balance
        : Math.max(0, Math.round((chargedAccount.balance - finalTotal) * 100) / 100);

      if (!chargedAccount.is_admin && finalTotal > 0) {
        try {
          const txRes = await adjustBankBalanceTransaction(chargedAccount.username, -finalTotal, chargedAccount);
          if (!txRes.success) {
            return { success: false, message: txRes.error || 'WerkPin betaling op WerkPay rekening mislukt.' };
          }
          newBal = txRes.newBalance;
        } catch (err) {
          console.warn('Firestore WerkPin balance transaction queued offline:', err);
          enqueueOfflineMutation({
            type: 'bank_delta',
            payload: {
              username: chargedAccount.username,
              delta: -finalTotal,
              fallbackAccount: chargedAccount
            }
          });
        }
      }

      setBankAccounts(prev => prev.map(a => a.id === chargedAccount!.id ? { ...a, balance: newBal } : a));
      if (currentBankAccount && currentBankAccount.id === chargedAccount.id) {
        setCurrentBankAccount(prev => prev ? { ...prev, balance: newBal } : null);
      }

      const tx: BankTransaction = {
        id: Date.now(),
        from_account: chargedAccount.username,
        to_account: `${brandName} WerkPin`,
        amount: finalTotal,
        label: `WerkPin: ${desc} (#${orderNo})`,
        note: `WerkPin terminal via ${mode === 'terminal' ? 'Pico W Pinapparaat' : mode === 'card' ? 'NFC Pas' : 'WerkPay'} (${brandName})`,
        order_no: orderNo,
        when: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now()
      };
      setBankTransactions(prev => [tx, ...prev]);

      saveBankTransactionToFirestore(tx).catch((err) => {
        console.warn('Firestore SumUp tx queued offline:', err);
        enqueueOfflineMutation({ type: 'bank_tx', payload: tx });
      });

      meta.account = chargedAccount.username;
      meta.balance_after = newBal;
    }

    const sendToKitchen = Boolean(params.sendToKitchen);
    const sumupItems: OrderItem[] = (params.items && params.items.length > 0)
      ? params.items.map(it => ({
          ...it,
          done: sendToKitchen ? false : true,
          stage: sendToKitchen ? ('wachten' as OrderItemStage) : ('klaar' as OrderItemStage)
        }))
      : [
          {
            name: desc,
            qty: 1,
            price: baseAmount,
            done: sendToKitchen ? false : true,
            stage: sendToKitchen ? ('wachten' as OrderItemStage) : ('klaar' as OrderItemStage)
          }
        ];

    if (tipAmount > 0) {
      sumupItems.push({
        name: 'Fooi (WerkPin)',
        qty: 1,
        price: tipAmount,
        done: true,
        stage: 'klaar'
      });
    }

    const newOrder: Order = {
      id: Date.now(),
      no: orderNo,
      items: sumupItems,
      total: finalTotal,
      discount: 0,
      orderType: params.orderType || 'takeaway',
      identifier: (params.identifier || '').trim() || desc,
      notes: (params.notes || '').trim() || `WerkPin Terminal (${currentPosUser?.name || 'Medewerker'})`,
      paymentMethod: params.method,
      paymentMeta: meta,
      cashier: meta.accepted_by || currentPosUser?.name || 'WerkPin Terminal',
      status: sendToKitchen ? 'new' : 'afgehaald',
      time: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };

    setOrders(prev => [newOrder, ...prev]);
    setOrderNo(prev => prev + 1);
    if (sendToKitchen && params.items && params.items.length > 0) {
      deductInventoryForItems(
        params.items.map((it, idx) => ({
          id: `sumup_${Date.now()}_${idx}`,
          productId: 0,
          name: it.name,
          price: it.price,
          qty: it.qty,
          itemNote: it.itemNote
        }))
      );
    }
    AudioFX.bell();

    try {
      await saveOrderToFirestore(newOrder);
    } catch (err) {
      console.warn('Firestore SumUp order queued offline:', err);
      enqueueOfflineMutation({ type: 'order', payload: newOrder });
    }

    broadcastSync('SYNC_ORDER_NEW', newOrder);

    return {
      success: true,
      message: `WerkPin betaling #${newOrder.no} (€ ${finalTotal.toFixed(2)}) geslaagd!`,
      order: newOrder
    };
  };

  const refundSumUpTransaction = async (targetOrderNo: number): Promise<{ success: boolean; message: string }> => {
    const targetOrder = ordersRef.current.find(o => o.no === targetOrderNo);
    if (!targetOrder) {
      return { success: false, message: 'Transactie niet gevonden.' };
    }
    if (targetOrder.status === 'cancelled' || targetOrder.status === 'geannuleerd' || targetOrder.paymentMeta?.refunded) {
      return { success: false, message: 'Deze transactie is al terugbetaald/geannuleerd.' };
    }

    const refundedBy = currentPosUser?.name || 'Medewerker';
    const nextMeta = {
      ...(targetOrder.paymentMeta || {}),
      refunded: true,
      refundedAt: Date.now(),
      refundedBy
    };

    if (targetOrder.paymentMethod === 'workpay' && targetOrder.paymentMeta?.account) {
      const accUsername = targetOrder.paymentMeta.account.toLowerCase();
      let acc = bankAccountsRef.current.find(a => a.username.toLowerCase() === accUsername) || null;
      if (!acc) {
        try {
          const allDbAccs = await getAllBankAccountsFromFirestore();
          acc = allDbAccs.find(a => a.username.toLowerCase() === accUsername) || null;
        } catch {}
      }

      if (acc) {
        let nextBalance = acc.is_admin
          ? acc.balance
          : Math.round((acc.balance + targetOrder.total) * 100) / 100;

        if (!acc.is_admin && targetOrder.total > 0) {
          try {
            const res = await adjustBankBalanceTransaction(acc.username, targetOrder.total, acc);
            if (res.success) nextBalance = res.newBalance;
          } catch {
            enqueueOfflineMutation({
              type: 'bank_delta',
              payload: { username: acc.username, delta: targetOrder.total, fallbackAccount: acc }
            });
          }
        }

        setBankAccounts(prev => prev.map(a => a.id === acc!.id ? { ...a, balance: nextBalance } : a));
        if (currentBankAccount && currentBankAccount.id === acc.id) {
          setCurrentBankAccount(prev => prev ? { ...prev, balance: nextBalance } : null);
        }

        const refundTx: BankTransaction = {
          id: Date.now(),
          from_account: `${targetOrder.paymentMeta?.brandName || 'Werkdonalds'} WerkPin`,
          to_account: acc.username,
          amount: targetOrder.total,
          label: `Terugbetaling #${targetOrder.no}`,
          note: `WerkPin refund door ${refundedBy}`,
          order_no: targetOrder.no,
          when: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now()
        };
        setBankTransactions(prev => [refundTx, ...prev]);

        saveBankTransactionToFirestore(refundTx).catch(() => {
          enqueueOfflineMutation({ type: 'bank_tx', payload: refundTx });
        });
      }
    }

    const now = Date.now();
    const updatedOrder: Order = {
      ...targetOrder,
      status: 'geannuleerd',
      paymentMeta: nextMeta,
      updatedAt: now
    };
    setOrders(prev => prev.map(o => o.no === targetOrderNo ? updatedOrder : o));
    recordLocalOrderMutation(targetOrderNo, { status: 'geannuleerd' });
    broadcastSync('SYNC_ORDER_STATUS', { orderNo: targetOrderNo, status: 'geannuleerd', updatedAt: now });

    try {
      await saveOrderToFirestore(updatedOrder);
    } catch {
      enqueueOfflineMutation({ type: 'order', payload: updatedOrder });
    }

    logAuditAction('WERKPIN_REFUND', `Transactie #${targetOrderNo} (€ ${targetOrder.total.toFixed(2)}) terugbetaald door ${refundedBy}.`);
    return {
      success: true,
      message: `€ ${targetOrder.total.toFixed(2)} succesvol terugbetaald!`
    };
  };

  const updateOrderStatus = async (orderNum: number, newStatus: OrderStatus) => {
    const now = Date.now();
    const currentOrder = ordersRef.current.find(o => o.no === orderNum);
    if (!currentOrder) return;

    let items = currentOrder.items;
    let updatedItemsList: any[] | undefined = undefined;

    if (newStatus === 'klaar' || newStatus === 'done') {
      items = currentOrder.items.map(it => ({
        ...it,
        stage: 'klaar' as OrderItemStage,
        done: true
      }));
      updatedItemsList = items;
    } else if (newStatus === 'inpakken') {
      items = currentOrder.items.map(it => ({
        ...it,
        stage: (it.stage === 'wachten' || it.stage === 'bereiden') ? ('inpakken' as OrderItemStage) : it.stage
      }));
      updatedItemsList = items;
    }

    const updatedOrder: Order = {
      ...currentOrder,
      status: newStatus,
      items,
      updatedAt: now
    };

    setOrders(prev => {
      const next = prev.map(o => (o.no === orderNum ? updatedOrder : o));
      try {
        localStorage.setItem('wd_orders', JSON.stringify(next));
      } catch {}
      return next;
    });

    recordLocalOrderMutation(orderNum, { status: newStatus, items: updatedItemsList });

    const wasAlreadyDone = currentOrder.status === 'done' || currentOrder.status === 'klaar';
    if ((newStatus === 'done' || newStatus === 'klaar') && !wasAlreadyDone && currentOrder.orderType !== 'delivery') {
      AudioFX.speakOrder(orderNum, currentOrder.identifier, currentOrder.orderType);
    }

    broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: newStatus, items: updatedItemsList, updatedAt: now });

    try {
      await saveOrderToFirestore(updatedOrder);
    } catch (err) {
      console.warn('Firestore order status queued offline:', err);
      enqueueOfflineMutation({ type: 'order', payload: updatedOrder });
    }
  };

  const updateOrderItemStage = async (orderNum: number, itemIndex: number, stage: OrderItemStage) => {
    const now = Date.now();
    const targetOrder = ordersRef.current.find(o => o.no === orderNum);
    if (!targetOrder) return;

    const nextItems = [...targetOrder.items];
    if (nextItems[itemIndex]) {
      nextItems[itemIndex] = {
        ...nextItems[itemIndex],
        stage,
        done: stage === 'klaar'
      };
    }

    const calculatedNextStatus = getMajorityStatus(nextItems);
    const statusChanged = targetOrder.status !== calculatedNextStatus;
    const updatedOrder: Order = {
      ...targetOrder,
      items: nextItems,
      status: statusChanged ? calculatedNextStatus : targetOrder.status,
      updatedAt: now
    };

    setOrders(prev => {
      const next = prev.map(o => (o.no === orderNum ? updatedOrder : o));
      try {
        localStorage.setItem('wd_orders', JSON.stringify(next));
      } catch {}
      return next;
    });

    recordLocalOrderMutation(orderNum, { items: nextItems });
    broadcastSync('SYNC_ORDER_ITEMS', { orderNo: orderNum, items: nextItems, updatedAt: now });

    if (statusChanged) {
      recordLocalOrderMutation(orderNum, { status: calculatedNextStatus });
      broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: calculatedNextStatus, updatedAt: now });

      if (calculatedNextStatus === 'klaar' && targetOrder.orderType !== 'delivery') {
        AudioFX.speakOrder(orderNum, targetOrder.identifier, targetOrder.orderType);
      }
    }

    try {
      await saveOrderToFirestore(updatedOrder);
    } catch (err) {
      console.warn('Firestore order item stage queued offline:', err);
      enqueueOfflineMutation({ type: 'order', payload: updatedOrder });
    }
  };

  const toggleOrderItemDone = async (orderNum: number, itemIndex: number) => {
    const now = Date.now();
    const targetOrder = ordersRef.current.find(o => o.no === orderNum);
    if (!targetOrder) return;

    const nextItems = [...targetOrder.items];
    if (nextItems[itemIndex]) {
      const nextDone = !nextItems[itemIndex].done;
      nextItems[itemIndex] = {
        ...nextItems[itemIndex],
        done: nextDone,
        stage: nextDone ? 'klaar' : 'wachten'
      };
    }

    const calculatedNextStatus = getMajorityStatus(nextItems);
    const statusChanged = targetOrder.status !== calculatedNextStatus;
    const updatedOrder: Order = {
      ...targetOrder,
      items: nextItems,
      status: statusChanged ? calculatedNextStatus : targetOrder.status,
      updatedAt: now
    };

    setOrders(prev => {
      const next = prev.map(o => (o.no === orderNum ? updatedOrder : o));
      try {
        localStorage.setItem('wd_orders', JSON.stringify(next));
      } catch {}
      return next;
    });

    recordLocalOrderMutation(orderNum, { items: nextItems });
    broadcastSync('SYNC_ORDER_ITEMS', { orderNo: orderNum, items: nextItems, updatedAt: now });

    if (statusChanged) {
      recordLocalOrderMutation(orderNum, { status: calculatedNextStatus });
      broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: calculatedNextStatus, updatedAt: now });

      if (calculatedNextStatus === 'klaar' && targetOrder.orderType !== 'delivery') {
        AudioFX.speakOrder(orderNum, targetOrder.identifier, targetOrder.orderType);
      }
    }

    try {
      await saveOrderToFirestore(updatedOrder);
    } catch (err) {
      console.warn('Firestore toggleOrderItemDone queued offline:', err);
      enqueueOfflineMutation({ type: 'order', payload: updatedOrder });
    }
  };

  const toggleOrderPrio = async (orderNum: number) => {
    const now = Date.now();
    const targetOrder = ordersRef.current.find(o => o.no === orderNum);
    if (!targetOrder) return;

    const targetPrio = !targetOrder.isPrio;
    const updatedOrder: Order = { ...targetOrder, isPrio: targetPrio, updatedAt: now };

    setOrders(prev => {
      const next = prev.map(o => (o.no === orderNum ? updatedOrder : o));
      try {
        localStorage.setItem('wd_orders', JSON.stringify(next));
      } catch {}
      return next;
    });

    recordLocalOrderMutation(orderNum, { isPrio: targetPrio });
    broadcastSync('SYNC_ORDER_PRIO', { orderNo: orderNum, isPrio: targetPrio, updatedAt: now });

    try {
      await saveOrderToFirestore(updatedOrder);
    } catch (err) {
      console.warn('Firestore toggleOrderPrio queued offline:', err);
      enqueueOfflineMutation({ type: 'order', payload: updatedOrder });
    }
  };

  const setAllOrderItemsDone = async (orderNum: number, done: boolean) => {
    const now = Date.now();
    const targetOrder = ordersRef.current.find(o => o.no === orderNum);
    if (!targetOrder) return;

    const nextStage: OrderItemStage = done ? 'klaar' : 'wachten';
    const nextStatus: OrderStatus = done ? 'klaar' : 'wachten';
    const statusChanged = targetOrder.status !== nextStatus;
    const nextItems = targetOrder.items.map(it => ({ ...it, done, stage: nextStage }));

    const updatedOrder: Order = {
      ...targetOrder,
      items: nextItems,
      status: statusChanged ? nextStatus : targetOrder.status,
      updatedAt: now
    };

    setOrders(prev => {
      const next = prev.map(o => (o.no === orderNum ? updatedOrder : o));
      try {
        localStorage.setItem('wd_orders', JSON.stringify(next));
      } catch {}
      return next;
    });

    recordLocalOrderMutation(orderNum, { items: nextItems });
    broadcastSync('SYNC_ORDER_ITEMS', { orderNo: orderNum, items: nextItems, updatedAt: now });

    if (statusChanged) {
      recordLocalOrderMutation(orderNum, { status: nextStatus });
      broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: nextStatus, updatedAt: now });

      if (nextStatus === 'klaar' && targetOrder.orderType !== 'delivery') {
        AudioFX.speakOrder(orderNum, targetOrder.identifier, targetOrder.orderType);
      }
    }

    try {
      await saveOrderToFirestore(updatedOrder);
    } catch (err) {
      console.warn('Firestore setAllOrderItemsDone queued offline:', err);
      enqueueOfflineMutation({ type: 'order', payload: updatedOrder });
    }
  };

  const cancelOrder = async (orderNum: number) => {
    await updateOrderStatus(orderNum, 'cancelled' as OrderStatus);
  };

  const deleteOrder = async (orderNum: number) => {
    recordDeletedOrder(orderNum);
    setOrders(prev => prev.filter(o => o.no !== orderNum));
    const currentStored = localStorage.getItem('wd_orders');
    if (currentStored) {
      try {
        const parsed: Order[] = JSON.parse(currentStored);
        const filtered = parsed.filter(o => o.no !== orderNum);
        localStorage.setItem('wd_orders', JSON.stringify(filtered));
      } catch {}
    }
    if (shouldBlockTableWrite(`Bestelling #${orderNum} verwijderen`)) return;
    broadcastSync('SYNC_ORDER_DELETE', { orderNo: orderNum });
    try {
      await deleteOrderFromFirestore(orderNum);
    } catch (err) {
      console.warn('Firestore delete order error:', err);
    }
  };

  // BroadcastChannel & LocalStorage sync for Cross-tab & Cash Requests
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    let cashCh: BroadcastChannel | null = null;
    let syncCh: BroadcastChannel | null = null;

    try {
      if ('BroadcastChannel' in window) {
        cashCh = new BroadcastChannel('wd_cash_requests_channel');
        cashCh.onmessage = (event) => {
          if (event.data && event.data.type === 'SYNC_CASH_REQUESTS') {
            setCashRequests(event.data.requests);
          }
        };

        syncCh = new BroadcastChannel('wd_unified_sync_channel');
        syncCh.onmessage = (event) => {
          const { type, payload } = event.data || {};
          if (!type) return;

          if (type === 'SYNC_ORDER_NEW') {
            const incoming: Order = payload;
            setOrders(prev => {
              if (prev.some(o => o.no === incoming.no)) return prev;
              AudioFX.bell();
              return [incoming, ...prev];
            });
            setOrderNo(prev => Math.max(prev, incoming.no + 1));
          } else if (type === 'SYNC_ORDER_STATUS') {
            const { orderNo: targetNo, status, updatedAt } = payload;
            recordLocalOrderMutation(targetNo, { status });
            let targetOrder: Order | undefined;
            let statusChangedToDone = false;
            setOrders(prev => {
              targetOrder = prev.find(o => o.no === targetNo);
              const isOldStatusDone = targetOrder && (targetOrder.status === 'done' || targetOrder.status === 'klaar');
              const isNewStatusDone = status === 'done' || status === 'klaar';
              if (isNewStatusDone && !isOldStatusDone) {
                statusChangedToDone = true;
              }
              return prev.map(o => o.no === targetNo ? { ...o, status, updatedAt: updatedAt || Date.now() } : o);
            });
            if (statusChangedToDone) {
              const matched = targetOrder || orders.find(o => o.no === targetNo);
              if (matched) {
                AudioFX.speakOrder(targetNo, matched.identifier, matched.orderType);
              } else {
                AudioFX.speakOrder(targetNo);
              }
            }
          } else if (type === 'SYNC_ORDER_ITEMS') {
            const { orderNo: targetNo, items, updatedAt } = payload;
            recordLocalOrderMutation(targetNo, { items });
            setOrders(prev => prev.map(o => o.no === targetNo ? { ...o, items, updatedAt: updatedAt || Date.now() } : o));
          } else if (type === 'SYNC_ORDER_PRIO') {
            const { orderNo: targetNo, isPrio, updatedAt } = payload;
            recordLocalOrderMutation(targetNo, { isPrio });
            setOrders(prev => prev.map(o => o.no === targetNo ? { ...o, isPrio, updatedAt: updatedAt || Date.now() } : o));
          } else if (type === 'SYNC_ORDER_DELETE') {
            const { orderNo: targetNo } = payload;
            recordDeletedOrder(targetNo);
            setOrders(prev => prev.filter(o => o.no !== targetNo));
          } else if (type === 'SYNC_BANK_ACCOUNTS') {
            setBankAccounts(payload);
          }
        };
      }
    } catch {}

    // Storage event listener fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'wd_cash_requests' && e.newValue) {
        try {
          setCashRequests(JSON.parse(e.newValue));
        } catch {}
      } else if (e.key === 'wd_orders' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setOrders(prev => {
              const { merged } = mergeOrders(prev, parsed);
              return merged;
            });
          }
        } catch {}
      } else if (e.key === 'wd_order_stop') {
        setOrderStopActive(e.newValue === 'true');
      } else if (e.key === 'wd_pickup_closed') {
        setPickupClosed(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (cashCh) cashCh.close();
      if (syncCh) syncCh.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const syncCashRequests = (requests: CashPaymentRequest[]) => {
    setCashRequests(requests);
    localStorage.setItem('wd_cash_requests', JSON.stringify(requests));
    try {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('wd_cash_requests_channel');
        channel.postMessage({ type: 'SYNC_CASH_REQUESTS', requests });
        channel.close();
      }
    } catch {}
  };

  const createCashRequest = (
    orderNo: number,
    total: number,
    orderType: 'dine_in' | 'takeaway' | 'delivery',
    identifier: string
  ): CashPaymentRequest => {
    const reqId = `req_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const newReq: CashPaymentRequest = {
      id: reqId,
      orderNo,
      orderType,
      identifier,
      total,
      status: 'pending',
      requestedAt: Date.now()
    };
    const updated = [newReq, ...cashRequests];
    syncCashRequests(updated);

    saveCashRequestToFirestore(newReq).catch((err) => {
      console.warn('Firestore cash_requests insert queued offline:', err);
      enqueueOfflineMutation({ type: 'cash_request', payload: newReq });
    });

    return newReq;
  };

  const approveCashRequest = (
    requestId: string,
    approvedBy: string,
    received: number,
    change: number
  ): { success: boolean; message: string } => {
    const isAuthorized = managerOverride || canAccess('manager_override') || authorizeCashStaffUser(currentPosUser);
    if (!isAuthorized) {
      logAuditAction(
        'CONTANT_VERZOEK_GEBLOKKEERD',
        `Onbevoegde poging om contant verzoek ${requestId} goed te keuren door ${currentPosUser?.username || 'niet-ingelogd'}.`
      );
      return { success: false, message: 'Geen contant-bevoegdheid (cash_pay) om dit verzoek goed te keuren!' };
    }

    const targetReq = cashRequests.find(r => r.id === requestId);
    if (!targetReq) {
      return { success: false, message: 'Contant betaalverzoek niet gevonden.' };
    }
    if (targetReq.status !== 'pending') {
      return { success: false, message: 'Dit verzoek is al verwerkt.' };
    }
    if (!Number.isFinite(received) || received < targetReq.total - 0.01) {
      return { success: false, message: `Ontvangen contant (€ ${Number(received || 0).toFixed(2)}) is minder dan € ${targetReq.total.toFixed(2)}.` };
    }

    const verifiedApprover = currentPosUser?.name || approvedBy;
    const verifiedChange = Math.max(0, Math.round((received - targetReq.total) * 100) / 100);
    const roundedReceived = Math.round(received * 100) / 100;

    const approvedReq: CashPaymentRequest = {
      ...targetReq,
      status: 'approved',
      approvedBy: verifiedApprover,
      approvedByUsername: currentPosUser?.username,
      approvedAt: Date.now(),
      received: roundedReceived,
      change: verifiedChange
    };

    const updated = cashRequests.map(r => r.id === requestId ? approvedReq : r);
    syncCashRequests(updated);
    logAuditAction(
      'CONTANT_VERZOEK_GOEDGEKEURD',
      `Contant verzoek #${targetReq.orderNo} (€ ${targetReq.total.toFixed(2)}, ontvangen € ${roundedReceived.toFixed(2)}) goedgekeurd door ${verifiedApprover}.`
    );

    saveCashRequestToFirestore(approvedReq).catch((err) => {
      console.warn('Firestore cash_requests approve queued offline:', err);
      enqueueOfflineMutation({ type: 'cash_request', payload: approvedReq });
    });

    return { success: true, message: 'Contant verzoek goedgekeurd.' };
  };

  const rejectCashRequest = (requestId: string, reason?: string) => {
    const rejectedReason = reason || 'Geweigerd door medewerker';
    const targetReq = cashRequests.find(r => r.id === requestId);
    const rejectedReq: CashPaymentRequest | null = targetReq
      ? { ...targetReq, status: 'rejected', rejectedReason }
      : null;

    const updated = cashRequests.map(r =>
      r.id === requestId && rejectedReq ? rejectedReq : r
    );
    syncCashRequests(updated);

    if (targetReq) {
      logAuditAction(
        'CONTANT_VERZOEK_AFGEWEZEN',
        `Contant verzoek #${targetReq.orderNo} (€ ${targetReq.total.toFixed(2)}) afgewezen (${rejectedReason}).`
      );
    }

    if (rejectedReq) {
      saveCashRequestToFirestore(rejectedReq).catch((err) => {
        console.warn('Firestore cash_requests reject queued offline:', err);
        enqueueOfflineMutation({ type: 'cash_request', payload: rejectedReq });
      });
    }
  };

  // WerkPay Actions
  const loginWerkPay = async (
    username: string,
    secret: string,
    mode: 'password' | 'pin'
  ): Promise<{ success: boolean; message: string }> => {
    const cleanUser = username.trim().replace(/^@+/, '').toLowerCase();
    const cleanSecret = secret.trim();
    if (!cleanUser || !cleanSecret) {
      return { success: false, message: 'Vul gebruikersnaam en wachtwoord/pincode in.' };
    }

    const secretMatchesAccount = (a: BankAccount) => {
      const storedPin = String(a.pin_code ?? '').trim();
      const storedPass = String(a.password ?? '');
      const storedPassTrim = storedPass.trim();
      if (mode === 'pin') {
        return storedPin.length > 0 && storedPin === cleanSecret;
      }
      return (
        (storedPass.length > 0 && (storedPass === secret || storedPassTrim === cleanSecret)) ||
        (storedPin.length > 0 && storedPin === cleanSecret)
      );
    };

    const findMatchingBankAccount = (list: BankAccount[]): BankAccount | undefined => {
      const byUsername = list.find(
        (a) =>
          String(a.username || '').trim().replace(/^@+/, '').toLowerCase() === cleanUser &&
          secretMatchesAccount(a)
      );
      if (byUsername) return byUsername;

      const byHolder = list.filter(
        (a) => String(a.account_holder || '').trim().toLowerCase() === cleanUser
      );
      if (byHolder.length === 1 && secretMatchesAccount(byHolder[0])) {
        return byHolder[0];
      }
      return undefined;
    };

    let acc: BankAccount | undefined;
    try {
      const dbBanks = await getAllBankAccountsFromFirestore();
      acc = findMatchingBankAccount(dbBanks);
    } catch (err) {
      console.warn('Firestore loginWerkPay fetch error:', err);
    }
    if (!acc) {
      acc = findMatchingBankAccount(bankAccountsRef.current);
    }

    if (!acc) {
      return { success: false, message: `Ongeldige gebruikersnaam of ${mode === 'pin' ? 'pincode' : 'wachtwoord'}.` };
    }

    const cleanU = String(acc.username || '').trim().toLowerCase();
    if (acc.is_banned || acc.is_suspended || blockedDevices.some(b => b.value.toLowerCase() === cleanU)) {
      logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd WerkPay account @${cleanU} probeerde in te loggen.`);
      return { success: false, message: 'Dit account is geblokkeerd door de beheerder.' };
    }

    // Normale WerkPay login vraagt geen 2FA; 2FA wordt alleen gevraagd bij toegang tot het Manager Menu.
    setPending2FALogin(null);
    setCurrentBankAccount(acc);
    return { success: true, message: `Welkom terug, ${acc.account_holder || acc.username}!` };
  };

  const loginWerkPayWithCard = async (
    cardUid: string,
    pin?: string,
    requirePin: boolean = true
  ): Promise<{ success: boolean; message: string }> => {
    const normUid = normalizeCardUid(cardUid);
    if (!normUid) {
      return { success: false, message: 'Ongeldige of lege pas-UID ontvangen.' };
    }

    let matchedAcc: BankAccount | undefined;
    try {
      const dbBanks = await getAllBankAccountsFromFirestore();
      matchedAcc = dbBanks.find(a => accountMatchesUid(a, normUid));
    } catch (err) {
      console.warn('Firestore loginWerkPayWithCard fetch error:', err);
    }
    if (!matchedAcc) {
      matchedAcc = bankAccountsRef.current.find(a => accountMatchesUid(a, normUid));
    }
    if (!matchedAcc) {
      return { success: false, message: `Pas (${normUid}) is nog niet gekoppeld aan een WerkPay rekening.` };
    }

    const cleanU = matchedAcc.username.trim().toLowerCase();
    if (matchedAcc.is_banned || matchedAcc.is_suspended || blockedDevices.some(b => b.value.toLowerCase() === cleanU)) {
      logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerde pas (${normUid}) voor @${cleanU} probeerde in te loggen.`);
      return { success: false, message: 'Dit account is geblokkeerd door de beheerder.' };
    }

    if (requirePin) {
      const cleanPin = (pin || '').trim();
      const storedPin = String(matchedAcc.pin_code ?? '').trim();
      const storedPass = String(matchedAcc.password ?? '').trim();
      if (!cleanPin || (storedPin !== cleanPin && storedPass !== cleanPin)) {
        return { success: false, message: 'Onjuiste pincode voor deze pas.' };
      }
    }

    setPending2FALogin(null);
    setCurrentBankAccount(matchedAcc);
    logAuditAction('WERKPAY_PAS_LOGIN', `@${cleanU} ingelogd bij WerkPay via NFC pas (${normUid}).`);
    return { success: true, message: `Welkom terug, ${matchedAcc.account_holder}!` };
  };

  const logoutWerkPay = () => {
    setCurrentBankAccount(null);
  };

  const topUpWerkPay = async (amount: number): Promise<{ success: boolean; message: string }> => {
    if (!currentBankAccount) {
      return { success: false, message: 'Niet ingelogd bij WerkPay.' };
    }
    if (!currentBankAccount.is_admin) {
      return {
        success: false,
        message: 'Klanten kunnen niet zelf saldo opwaarderen. Opwaarderen kan uitsluitend via de kassa of door een beheerder.'
      };
    }
    if (amount <= 0) {
      return { success: false, message: 'Voer een positief bedrag in.' };
    }

    const newBal = Math.round((currentBankAccount.balance + amount) * 100) / 100;
    const updated = { ...currentBankAccount, balance: newBal };
    setCurrentBankAccount(updated);
    setBankAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));

    const tx: BankTransaction = {
      id: Date.now(),
      from_account: 'iDEAL / Bank Opwaardering',
      to_account: updated.username,
      amount: amount,
      label: 'Saldo opwaardering',
      when: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };
    setBankTransactions(prev => [tx, ...prev]);

    try {
      await saveBankAccountToFirestore(updated);
      await saveBankTransactionToFirestore(tx);
    } catch {}

    return { success: true, message: `€ ${amount.toFixed(2)} succesvol bijgeschreven!` };
  };

  const claimGtaReward = async (score: number): Promise<{ success: boolean; message: string; reward: number }> => {
    if (!currentBankAccount) {
      return { success: false, message: 'Niet ingelogd bij WerkPay. Log in bij WerkPay om je GTA-winst op te nemen!', reward: 0 };
    }
    if (score <= 0) {
      return { success: false, message: 'Geen omzet score behaald in GTA.', reward: 0 };
    }

    // Reward: 1% of arcade score, min €0.25, max €15.00 per run
    const rawReward = Math.round((score * 0.01) * 100) / 100;
    const reward = Math.min(15.00, Math.max(0.25, rawReward));

    // Saldo cap check (€500 max for non-admin customers)
    if (!currentBankAccount.is_admin && (currentBankAccount.balance + reward > 500)) {
      const maxPossible = Math.round((500 - currentBankAccount.balance) * 100) / 100;
      if (maxPossible <= 0) {
        return {
          success: false,
          message: 'Max. WerkPay saldo van € 500,00 is al bereikt. Maak eerst saldo op.',
          reward: 0
        };
      }
    }

    const newBal = Math.round((currentBankAccount.balance + reward) * 100) / 100;
    const updated = { ...currentBankAccount, balance: newBal };
    setCurrentBankAccount(updated);
    setBankAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));

    const tx: BankTransaction = {
      id: Date.now(),
      from_account: '🎮 GTA Arcade Beloning',
      to_account: updated.username,
      amount: reward,
      label: `GTA Shootout Winst (Score €${score})`,
      when: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };
    setBankTransactions(prev => [tx, ...prev]);

    try {
      if (updated.is_admin) {
        await saveBankAccountToFirestore(updated);
      } else {
        await adjustBankBalanceTransaction(updated.username, reward, updated);
      }
      await saveBankTransactionToFirestore(tx);
    } catch {}

    return {
      success: true,
      message: `🎉 € ${reward.toFixed(2)} GTA-winst overgemaakt naar WerkPay saldo van ${updated.account_holder}!`,
      reward
    };
  };

  const blockDeviceOrIp = async (type: 'ip' | 'device', value: string, reason?: string): Promise<{ success: boolean; message: string }> => {
    const cleanVal = value.trim();
    if (!cleanVal) return { success: false, message: 'Voer een geldig IP-adres of Apparaat ID in.' };

    const newItem = {
      id: 'blk_' + Date.now(),
      type,
      value: cleanVal,
      reason: reason || 'Handmatig geblokkeerd door beheerder.',
      addedAt: new Date().toLocaleString('nl-NL')
    };

    const nextList = [newItem, ...blockedDevices.filter(b => b.value.toLowerCase() !== cleanVal.toLowerCase())];
    setBlockedDevices(nextList);
    localStorage.setItem('wd_blocked_devices', JSON.stringify(nextList));

    try {
      await savePosSettingsToFirestore({
        order_stop_active: orderStopActive,
        pickup_closed: pickupClosed,
        blocked_devices: nextList
      });
      await emitAudioBroadcastEvent('wd_device_blocked', { blocked_devices: nextList, newItem });
    } catch (err) {
      console.error('Error saving block:', err);
    }

    return { success: true, message: `${type === 'ip' ? 'IP-adres' : 'Apparaat'} "${cleanVal}" direct live geblokkeerd!` };
  };

  const unblockDeviceOrIp = async (value: string): Promise<{ success: boolean; message: string }> => {
    const cleanVal = value.trim().toLowerCase();
    const nextList = blockedDevices.filter(b => b.value.trim().toLowerCase() !== cleanVal);
    setBlockedDevices(nextList);
    localStorage.setItem('wd_blocked_devices', JSON.stringify(nextList));

    try {
      await savePosSettingsToFirestore({
        order_stop_active: orderStopActive,
        pickup_closed: pickupClosed,
        blocked_devices: nextList
      });
      await emitAudioBroadcastEvent('wd_device_blocked', { blocked_devices: nextList });
    } catch (err) {
      console.error('Error saving unblock:', err);
    }

    return { success: true, message: `Blokkade voor "${value}" direct live opgeheven.` };
  };

  const blockAllOtherDevices = async (): Promise<{ success: boolean; message: string }> => {
    const otherSessions = activeSessions.filter(s => s.device_id !== deviceId);
    if (otherSessions.length === 0) {
      return { success: false, message: 'Er zijn geen overige ingelogde apparaten gedetecteerd om te blokkeren.' };
    }

    const newBlocks = otherSessions.map((s, idx) => ({
      id: `blk_${Date.now()}_${idx}`,
      type: 'device' as const,
      value: s.device_id,
      reason: `Noodblokkade alle ingelogde apparaten door @${currentPosUser?.username || 'manager'}`,
      addedAt: new Date().toLocaleString('nl-NL')
    }));

    const existingValues = new Set(blockedDevices.map(b => b.value.toLowerCase()));
    const filteredNew = newBlocks.filter(b => !existingValues.has(b.value.toLowerCase()));
    const updated = [...filteredNew, ...blockedDevices];

    setBlockedDevices(updated);
    localStorage.setItem('wd_blocked_devices', JSON.stringify(updated));

    try {
      await savePosSettingsToFirestore({
        order_stop_active: orderStopActive,
        pickup_closed: pickupClosed,
        blocked_devices: updated
      });
      await emitAudioBroadcastEvent('wd_device_blocked', { blocked_devices: updated });
    } catch (err) {
      console.error('Error blocking all other devices:', err);
    }

    return { success: true, message: `Alle ${filteredNew.length} overige ingelogde apparaten zijn direct live geblokkeerd!` };
  };

  const transferWerkPay = async (
    to: string,
    amount: number,
    note?: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!currentBankAccount) return { success: false, message: 'Niet ingelogd bij WerkPay.' };
    if (amount <= 0) return { success: false, message: 'Ongeldig bedrag.' };

    const cleanQuery = to.trim();
    const recipient = bankAccountsRef.current.find(
      a => accountMatchesUid(a, cleanQuery)
    );

    if (!recipient) {
      return { success: false, message: `Geen rekeninghouder gevonden met username of pas-UID: "${to}"` };
    }

    if (recipient.id === currentBankAccount.id) {
      return { success: false, message: 'Je kunt geen geld naar jezelf overboeken.' };
    }

    if (!currentBankAccount.is_admin && currentBankAccount.balance < amount) {
      return { success: false, message: 'Onvoldoende WerkPay saldo voor deze overboeking.' };
    }

    let senderBal = currentBankAccount.is_admin
      ? currentBankAccount.balance
      : Math.max(0, Math.round((currentBankAccount.balance - amount) * 100) / 100);
    let recipientBal = recipient.is_admin
      ? recipient.balance
      : Math.round((recipient.balance + amount) * 100) / 100;

    // Atomic Firestore transactions for debit & credit
    if (!currentBankAccount.is_admin) {
      try {
        const debitRes = await adjustBankBalanceTransaction(currentBankAccount.username, -amount, currentBankAccount);
        if (!debitRes.success) {
          return { success: false, message: debitRes.error || 'Overboeking geweigerd door saldo check.' };
        }
        senderBal = debitRes.newBalance;
      } catch (err) {
        console.warn('Firestore sender debit error:', err);
      }
    }

    if (!recipient.is_admin) {
      try {
        const creditRes = await adjustBankBalanceTransaction(recipient.username, amount, recipient);
        if (creditRes.success) {
          recipientBal = creditRes.newBalance;
        }
      } catch (err) {
        console.warn('Firestore recipient credit error:', err);
      }
    }

    const updatedSender = { ...currentBankAccount, balance: senderBal };
    const updatedRecipient = { ...recipient, balance: recipientBal };
    setCurrentBankAccount(updatedSender);

    setBankAccounts(prev =>
      prev.map(a => {
        if (a.id === updatedSender.id) return updatedSender;
        if (a.id === updatedRecipient.id) return updatedRecipient;
        return a;
      })
    );

    const tx: BankTransaction = {
      id: Date.now(),
      from_account: currentBankAccount.username,
      to_account: recipient.username,
      amount: amount,
      label: `Overboeking naar ${recipient.username}`,
      note: note || '',
      when: new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    };
    setBankTransactions(prev => [tx, ...prev]);

    saveBankTransactionToFirestore(tx).catch(() => {});

    return { success: true, message: `€ ${amount.toFixed(2)} overgemaakt naar ${recipient.account_holder}!` };
  };

  const changeWerkPayPin = async (newPin: string): Promise<{ success: boolean; message: string }> => {
    if (!currentBankAccount) return { success: false, message: 'Niet ingelogd.' };
    const cleanPin = newPin.trim();
    if (cleanPin.length < 4) return { success: false, message: 'Pincode moet minstens 4 tekens lang zijn.' };

    const userKey = String(currentBankAccount.username || '').trim().toLowerCase();
    if (shouldBlockTableWrite(`WerkPay pincode wijzigen (@${userKey})`)) {
      return { success: false, message: 'Tabellen zijn vergrendeld (freeze modus).' };
    }

    const updated: BankAccount = { ...currentBankAccount, pin_code: cleanPin };
    const nextAccounts = bankAccountsRef.current.map(a =>
      a.id === updated.id || String(a.username || '').trim().toLowerCase() === userKey ? updated : a
    );

    if (userKey) {
      pendingBankWritesRef.current.set(userKey, { acc: updated, timestamp: Date.now() });
      if (deletedBankKeysRef.current.has(userKey)) {
        deletedBankKeysRef.current.delete(userKey);
        try {
          localStorage.setItem('wd_deleted_bank_usernames', JSON.stringify(Array.from(deletedBankKeysRef.current)));
        } catch {}
      }
    }

    setCurrentBankAccount(updated);
    setBankAccounts(nextAccounts);
    try {
      const snap = JSON.stringify(nextAccounts);
      cloudSnapshotsRef.current.bank = snap;
      localStorage.setItem('wd_bank_accounts', snap);
    } catch {}
    broadcastSync('SYNC_BANK_ACCOUNTS', nextAccounts);

    try {
      await saveBankAccountToFirestore(updated);
      if (userKey) {
        cloudKnownBankKeysRef.current.add(userKey);
        try {
          localStorage.setItem('wd_cloud_known_banks', JSON.stringify(Array.from(cloudKnownBankKeysRef.current)));
        } catch {}
      }
      return { success: true, message: 'Pincode succesvol opgeslagen in Firebase Cloud!' };
    } catch (err: any) {
      console.error('Firestore changeWerkPayPin error:', err);
      const errMsg = err?.message || 'Opslaan van pincode in Firebase mislukt.';
      showToast(`Kon pincode niet opslaan in Firebase: ${errMsg}`, 'error');
      return { success: false, message: `Fout bij opslaan in Firebase: ${errMsg}` };
    }
  };

  const saveBankAccount = async (
    acc: Partial<BankAccount> & { id?: number | string }
  ): Promise<{ success: boolean; message?: string }> => {
    const cleanTargetUsername = acc.username ? acc.username.trim().toLowerCase() : '';
    let existingAcc = bankAccountsRef.current.find(
      a =>
        (acc.id !== undefined && a.id === acc.id) ||
        (cleanTargetUsername && String(a.username || '').trim().toLowerCase() === cleanTargetUsername)
    );

    // Voorkom dat een nog niet lokaal gesynchroniseerd Firestore account per ongeluk wordt overschreven met defaults (€0 / PIN 1234)
    let workingAccounts = [...bankAccountsRef.current];
    if (!existingAcc && cleanTargetUsername) {
      try {
        const dbBanks = await getAllBankAccountsFromFirestore();
        const remoteMatch = dbBanks.find(
          a => String(a.username || '').trim().toLowerCase() === cleanTargetUsername
        );
        if (remoteMatch) {
          existingAcc = remoteMatch;
          workingAccounts = [...workingAccounts, remoteMatch];
        }
      } catch {}
    }

    const normalizeAccountUidField = (raw?: string): string => {
      const trimmed = String(raw || '').trim();
      if (!trimmed) return generateVirtualCardUid();
      return isVirtualCardNumber(trimmed)
        ? normalizeCardUid(trimmed).replace(/(.{4})/g, '$1 ').trim()
        : normalizeCardUid(trimmed);
    };

    let nextAccounts: BankAccount[] = workingAccounts;
    let savedRecord: BankAccount;

    if (existingAcc) {
      const mergedCardUid =
        acc.card_uid !== undefined ? normalizeAccountUidField(acc.card_uid) : (existingAcc.card_uid || generateVirtualCardUid());
      const mergedLinkedUids: LinkedNfcTag[] =
        acc.linked_uids !== undefined
          ? parseLinkedUids(acc.linked_uids)
          : parseLinkedUids(existingAcc.linked_uids || []);

      savedRecord = {
        ...existingAcc,
        ...acc,
        id: existingAcc.id,
        username: (acc.username || existingAcc.username).trim().toLowerCase(),
        account_holder: (acc.account_holder ?? existingAcc.account_holder ?? existingAcc.username).trim(),
        card_uid: mergedCardUid,
        linked_uids: mergedLinkedUids,
      };
    } else {
      const newCardUid = normalizeAccountUidField(acc.card_uid);
      const newLinkedUids = parseLinkedUids(acc.linked_uids || []);
      const resolvedUsername = cleanTargetUsername || `klant_${Date.now()}`;
      savedRecord = {
        id: Date.now(),
        username: resolvedUsername,
        password: acc.password || '1234',
        account_holder: acc.account_holder?.trim() || resolvedUsername,
        card_uid: newCardUid,
        linked_uids: newLinkedUids,
        pin_code: acc.pin_code || '1234',
        balance: Number(acc.balance || 0),
        is_admin: Boolean(acc.is_admin),
      };
    }

    const savedUserLower = String(savedRecord.username || '').trim().toLowerCase();

    // Verzamel alle UID's van dit account om eventuele dubbele koppelingen bij andere accounts netjes over te zetten
    const claimedPhysicalUids = new Set<string>();
    const primClean = normalizeCardUid(savedRecord.card_uid);
    if (primClean && !isVirtualCardNumber(primClean)) claimedPhysicalUids.add(primClean);
    for (const tag of savedRecord.linked_uids || []) {
      if (tag.uid) claimedPhysicalUids.add(tag.uid);
    }

    const displacedAccounts: BankAccount[] = [];
    nextAccounts = nextAccounts.map((other) => {
      const otherUserLower = String(other.username || '').trim().toLowerCase();
      if (other.id === savedRecord.id || (otherUserLower && otherUserLower === savedUserLower)) {
        return other;
      }
      let changed = false;
      let nextOtherCard = other.card_uid || '';
      if (claimedPhysicalUids.has(normalizeCardUid(other.card_uid))) {
        nextOtherCard = generateVirtualCardUid();
        changed = true;
      }
      const otherTags = parseLinkedUids(other.linked_uids || []);
      const filteredTags = otherTags.filter((t) => !claimedPhysicalUids.has(t.uid));
      if (filteredTags.length !== otherTags.length) {
        changed = true;
      }
      if (!changed) return other;
      const updatedOther: BankAccount = { ...other, card_uid: nextOtherCard, linked_uids: filteredTags };
      displacedAccounts.push(updatedOther);
      return updatedOther;
    });

    if (existingAcc) {
      nextAccounts = nextAccounts.map((a) =>
        a.id === savedRecord.id || String(a.username || '').trim().toLowerCase() === savedUserLower
          ? savedRecord
          : a
      );
    } else {
      nextAccounts = [...nextAccounts, savedRecord];
    }

    // Pending write locks & deletion list bijwerken vóór Firestore writes zodat onSnapshot tussentijds niets terugdraait
    const writeNow = Date.now();
    pendingBankWritesRef.current.set(savedUserLower, { acc: savedRecord, timestamp: writeNow });
    for (const oldAcc of displacedAccounts) {
      const k = String(oldAcc.username || '').trim().toLowerCase();
      if (k) pendingBankWritesRef.current.set(k, { acc: oldAcc, timestamp: writeNow });
    }
    if (deletedBankKeysRef.current.has(savedUserLower)) {
      deletedBankKeysRef.current.delete(savedUserLower);
      try {
        localStorage.setItem('wd_deleted_bank_usernames', JSON.stringify(Array.from(deletedBankKeysRef.current)));
      } catch {}
    }

    // Direct React state + localStorage + cross-tab bijwerken
    setBankAccounts(nextAccounts);
    if (
      currentBankAccount &&
      (currentBankAccount.id === savedRecord.id ||
        String(currentBankAccount.username || '').trim().toLowerCase() === savedUserLower)
    ) {
      setCurrentBankAccount(savedRecord);
    }
    try {
      const snap = JSON.stringify(nextAccounts);
      cloudSnapshotsRef.current.bank = snap;
      localStorage.setItem('wd_bank_accounts', snap);
    } catch {}
    broadcastSync('SYNC_BANK_ACCOUNTS', nextAccounts);

    const actionLabel = existingAcc
      ? `Bankrekening @${savedRecord.username} bewerken`
      : `Nieuwe bankrekening @${savedRecord.username} aanmaken`;
    if (shouldBlockTableWrite(actionLabel)) {
      return { success: false, message: 'Tabellen zijn vergrendeld (freeze modus).' };
    }

    try {
      // 1. Eerst oude houders van dezelfde fysieke UID vrijmaken in Firestore
      for (const oldAcc of displacedAccounts) {
        await saveBankAccountToFirestore(oldAcc);
        const k = String(oldAcc.username || '').trim().toLowerCase();
        if (k) cloudKnownBankKeysRef.current.add(k);
      }
      // 2. Daarna het doelaccount opslaan in Firestore
      await saveBankAccountToFirestore(savedRecord);
      cloudKnownBankKeysRef.current.add(savedUserLower);
      try {
        localStorage.setItem('wd_cloud_known_banks', JSON.stringify(Array.from(cloudKnownBankKeysRef.current)));
      } catch {}
      return { success: true, message: 'Opgeslagen in Firebase Cloud & lokaal.' };
    } catch (err: any) {
      console.error('Unexpected saveBankAccount Firestore error:', err);
      showToast(`Kon bankaccount/UID niet opslaan: ${err?.message || 'onbekende fout'}`, 'error');
      return { success: false, message: err?.message || 'Opslaan mislukt' };
    }
  };

  const deleteBankAccount = async (id: number | string) => {
    const accountToDelete = bankAccountsRef.current.find(a => a.id === id);
    if (!accountToDelete) return;

    const delKey = String(accountToDelete.username || '').trim().toLowerCase();
    if (delKey) {
      deletedBankKeysRef.current.add(delKey);
      cloudKnownBankKeysRef.current.delete(delKey);
      pendingBankWritesRef.current.delete(delKey);
      try {
        localStorage.setItem('wd_deleted_bank_usernames', JSON.stringify(Array.from(deletedBankKeysRef.current)));
        localStorage.setItem('wd_cloud_known_banks', JSON.stringify(Array.from(cloudKnownBankKeysRef.current)));
      } catch {}
    }

    const remainingAccounts = bankAccountsRef.current.filter(a => a.id !== id);
    setBankAccounts(remainingAccounts);
    if (currentBankAccount && currentBankAccount.id === id) {
      setCurrentBankAccount(null);
    }
    try {
      const snap = JSON.stringify(remainingAccounts);
      cloudSnapshotsRef.current.bank = snap;
      localStorage.setItem('wd_bank_accounts', snap);
    } catch {}

    if (shouldBlockTableWrite(`Bankrekening @${accountToDelete.username} verwijderen`)) return;

    try {
      await deleteBankAccountFromFirestore(accountToDelete.username);
    } catch (err) {
      console.warn('Firestore deleteBankAccount error:', err);
    }
    broadcastSync('SYNC_BANK_ACCOUNTS', remainingAccounts);
  };

  const quickMoneyAccount = async (id: number | string, delta: number) => {
    const targetAcc = bankAccountsRef.current.find(a => a.id === id);
    if (!targetAcc) return;
    const nextBal = targetAcc.is_admin ? targetAcc.balance : Math.max(0, Math.round((targetAcc.balance + delta) * 100) / 100);
    const updatedAcc = { ...targetAcc, balance: nextBal };

    setBankAccounts(prev => prev.map(a => (a.id === id ? updatedAcc : a)));
    if (currentBankAccount && currentBankAccount.id === id) {
      setCurrentBankAccount(updatedAcc);
    }

    if (!targetAcc.is_admin && !shouldBlockTableWrite(`Saldo @${targetAcc.username} aanpassen`)) {
      adjustBankBalanceTransaction(targetAcc.username, delta, targetAcc).catch(() => {
        enqueueOfflineMutation({
          type: 'bank_delta',
          payload: { username: targetAcc.username, delta, fallbackAccount: targetAcc }
        });
      });
    }
  };

  // POS Auth
  const finalizeOrChallengePosLogin = async (candidateUser: PosUser, keepPickupControl = true): Promise<{ success: boolean; message: string }> => {
    const cleanU = candidateUser.username.trim().toLowerCase();
    try {
      sessionStorage.removeItem(`wd_manager_unlocked_${cleanU}`);
    } catch {}

    const posMatch = posUsers.find(u => u.username.toLowerCase() === cleanU);
    const bankMatch = bankAccounts.find(a => a.username.toLowerCase() === cleanU);

    let is2faEnabled = Boolean(
      (candidateUser.is_2fa_enabled && candidateUser.totp_secret) ||
      (posMatch?.is_2fa_enabled && posMatch?.totp_secret) ||
      (bankMatch?.is_2fa_enabled && bankMatch?.totp_secret)
    );
    let totpSecret = candidateUser.totp_secret || posMatch?.totp_secret || bankMatch?.totp_secret || '';
    let backupCodes =
      (candidateUser.backup_codes && candidateUser.backup_codes.length > 0 ? candidateUser.backup_codes : undefined) ||
      (posMatch?.backup_codes && posMatch.backup_codes.length > 0 ? posMatch.backup_codes : undefined) ||
      bankMatch?.backup_codes ||
      [];

    if (!is2faEnabled || !totpSecret) {
      const live2FA = await resolveUser2FACredentials(cleanU);
      if (live2FA?.is_2fa_enabled && live2FA.totp_secret) {
        is2faEnabled = true;
        totpSecret = live2FA.totp_secret;
        if (live2FA.backup_codes.length > 0) backupCodes = live2FA.backup_codes;
      }
    }

    const enrichedUser: PosUser = {
      ...candidateUser,
      is_2fa_enabled: Boolean(is2faEnabled && totpSecret),
      totp_secret: totpSecret || undefined,
      backup_codes: backupCodes
    };

    // Normale POS-login gaat direct door zonder 2FA; het Manager Menu vraagt wel consequent om 2FA zodra dit aanstaat.
    setPending2FALogin(null);
    setCurrentPosUser(enrichedUser);
    setPosUsers(prev => [enrichedUser, ...prev.filter(u => u.username.toLowerCase() !== cleanU)]);
    setPosScreen(prev => (keepPickupControl && prev === 'pickup_control' ? 'pickup_control' : 'kassa'));
    return { success: true, message: `Welkom, ${enrichedUser.name}!` };
  };

  const loginPos = async (username: string, pass: string): Promise<{ success: boolean; message: string }> => {
    const cleanU = username.trim().replace(/^@+/, '').toLowerCase();
    const cleanPass = pass.trim();

    // 0. Quick customer / bestel account login
    if (cleanU === 'bestel_kassa' || cleanU === 'klant' || cleanU === 'gast' || cleanU === 'bestellen') {
      const custUser = posUsersRef.current.find(u => u.username === 'klant') || ORDER_KIOSK_USER;
      setCurrentPosUser(custUser);
      setPosScreen('kassa');
      return { success: true, message: 'Ingelogd als Klant (Bestel Account)!' };
    }

    // Special RPI Kiosk Account ('rpi' with 'extra9')
    if (cleanU === 'rpi' && (cleanPass === 'extra9' || cleanPass === '1234' || cleanPass === 'admin123' || cleanPass === '')) {
      setCurrentPosUser(RPI_KIOSK_USER);
      setAppMode('pos');
      setPosScreen('loyalty_terminal');
      return { success: true, message: 'Ingelogd op Raspberry Pi Spaarpaal Kiosk (Vergrendeld)!' };
    }

    const findPosRowMatch = (list: Record<string, any>[]): Record<string, any> | undefined => {
      const byUsername = list.find(
        (u) => String(u.username || '').trim().replace(/^@+/, '').toLowerCase() === cleanU
      );
      if (byUsername) return byUsername;
      const byName = list.filter((u) => String(u.name || '').trim().toLowerCase() === cleanU);
      return byName.length === 1 ? byName[0] : undefined;
    };

    const findLocalPosMatch = (list: PosUser[]): PosUser | undefined => {
      const byUsername = list.find(
        (u) => String(u.username || '').trim().replace(/^@+/, '').toLowerCase() === cleanU
      );
      if (byUsername) return byUsername;
      const byName = list.filter((u) => String(u.name || '').trim().toLowerCase() === cleanU);
      return byName.length === 1 ? byName[0] : undefined;
    };

    const findBankMatch = (list: BankAccount[]): BankAccount | undefined => {
      const byUsername = list.find(
        (a) => String(a.username || '').trim().replace(/^@+/, '').toLowerCase() === cleanU
      );
      if (byUsername) return byUsername;
      const byHolder = list.filter((a) => String(a.account_holder || '').trim().toLowerCase() === cleanU);
      return byHolder.length === 1 ? byHolder[0] : undefined;
    };

    const secretMatchesPosRow = (row: any): boolean => {
      const storedPass = String(row?.password ?? '');
      const storedPassTrim = storedPass.trim();
      const storedPin = String(row?.pin_code ?? '').trim();
      return (
        (storedPass.length > 0 && (storedPass === pass || storedPassTrim === cleanPass)) ||
        (storedPin.length > 0 && storedPin === cleanPass)
      );
    };

    const secretMatchesBankRow = (acc: BankAccount): boolean => {
      const bankPin = String(acc.pin_code ?? '').trim();
      const bankPass = String(acc.password ?? '');
      const bankPassTrim = bankPass.trim();
      return (
        (bankPass.length > 0 && (bankPass === pass || bankPassTrim === cleanPass)) ||
        (bankPin.length > 0 && bankPin === cleanPass)
      );
    };

    // 1. Check live in Firestore pos_users collection first
    try {
      const dbUsers = await fsGetCollection('pos_users');
      const matchedRow = findPosRowMatch(dbUsers);
      if (matchedRow) {
        const parsedDbUser = parsePosUserFromDb(matchedRow);
        const matchedCleanU = String(parsedDbUser.username || '').trim().replace(/^@+/, '').toLowerCase();
        if (parsedDbUser.is_banned || parsedDbUser.is_suspended || blockedDevices.some(b => b.value.toLowerCase() === matchedCleanU)) {
          logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd account @${matchedCleanU} probeerde in te loggen.`);
          return { success: false, message: '⛔ Dit account is geblokkeerd door de beheerder. Toegang geweigerd.' };
        }
        if (secretMatchesPosRow(matchedRow)) {
          return await finalizeOrChallengePosLogin(parsedDbUser);
        }
      }
    } catch (err) {
      console.warn('Firestore pos_users login error:', err);
    }

    // 2. Check live in Firestore bank_accounts
    try {
      const dbBanks = await getAllBankAccountsFromFirestore();
      const bankData = findBankMatch(dbBanks);
      if (bankData) {
        const matchedCleanU = String(bankData.username || '').trim().replace(/^@+/, '').toLowerCase();
        const matchingPosRecord = posUsersRef.current.find(u => u.username.toLowerCase() === matchedCleanU);
        if (
          bankData.is_banned ||
          bankData.is_suspended ||
          matchingPosRecord?.is_banned ||
          matchingPosRecord?.is_suspended ||
          blockedDevices.some(b => b.value.toLowerCase() === matchedCleanU)
        ) {
          logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd account @${matchedCleanU} probeerde in te loggen.`);
          return { success: false, message: '⛔ Dit account is geblokkeerd door de beheerder. Toegang geweigerd.' };
        }
        if (secretMatchesBankRow(bankData)) {
          const bankUser: PosUser = {
            id: typeof bankData.id === 'number' ? bankData.id : Date.now(),
            name: bankData.account_holder,
            username: bankData.username,
            password: bankData.password,
            perms: matchingPosRecord?.perms || (bankData.is_admin
              ? ['pos', 'kitchen', 'pickup', 'voorraad', 'manager', 'medewerkers', 'producten', 'coupons_giftcards', 'cash_pay']
              : ['pos', 'pickup']),
            is_admin: bankData.is_admin,
            is_shadowbanned: Boolean(bankData.is_shadowbanned || matchingPosRecord?.is_shadowbanned),
            is_2fa_enabled: Boolean(bankData.is_2fa_enabled || matchingPosRecord?.is_2fa_enabled),
            totp_secret: bankData.totp_secret || matchingPosRecord?.totp_secret,
            backup_codes: bankData.backup_codes || matchingPosRecord?.backup_codes,
            theme: matchingPosRecord?.theme
          };
          return await finalizeOrChallengePosLogin(bankUser);
        }
      }
    } catch (err) {
      console.warn('Firestore bank_accounts login error:', err);
    }

    // 3. Try local cached users (fallback if offline or not yet synced)
    const localUser = findLocalPosMatch(posUsersRef.current);
    if (localUser) {
      const localPassTrim = String(localUser.password ?? '').trim();
      const localPinTrim = String((localUser as any).pin_code ?? '').trim();
      const passOk =
        !localPassTrim ||
        localUser.password === pass ||
        localPassTrim === cleanPass ||
        (localPinTrim.length > 0 && localPinTrim === cleanPass) ||
        cleanPass === '1234' ||
        cleanPass === 'admin123';
      if (passOk) {
        const matchedCleanU = String(localUser.username || '').trim().replace(/^@+/, '').toLowerCase();
        if (localUser.is_banned || localUser.is_suspended || blockedDevices.some(b => b.value.toLowerCase() === matchedCleanU)) {
          logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd account @${matchedCleanU} probeerde in te loggen.`);
          return { success: false, message: '⛔ Dit account is geblokkeerd door de beheerder. Toegang geweigerd.' };
        }
        return await finalizeOrChallengePosLogin(localUser);
      }
    }

    // 4. Try local Bank Accounts
    const bankAcc = findBankMatch(bankAccountsRef.current);
    if (bankAcc && secretMatchesBankRow(bankAcc)) {
      const matchedCleanU = String(bankAcc.username || '').trim().replace(/^@+/, '').toLowerCase();
      const matchingPosRecord = posUsersRef.current.find(u => u.username.toLowerCase() === matchedCleanU);
      const bankUser: PosUser = {
        id: typeof bankAcc.id === 'number' ? bankAcc.id : Date.now(),
        name: bankAcc.account_holder,
        username: bankAcc.username,
        password: bankAcc.password,
        perms: matchingPosRecord?.perms || (bankAcc.is_admin 
          ? ['pos', 'kitchen', 'pickup', 'voorraad', 'manager', 'medewerkers', 'producten', 'coupons_giftcards', 'cash_pay']
          : ['pos', 'pickup']),
        is_admin: bankAcc.is_admin,
        is_2fa_enabled: Boolean(bankAcc.is_2fa_enabled || matchingPosRecord?.is_2fa_enabled),
        totp_secret: bankAcc.totp_secret || matchingPosRecord?.totp_secret,
        backup_codes: bankAcc.backup_codes || matchingPosRecord?.backup_codes,
        theme: matchingPosRecord?.theme
      };
      return await finalizeOrChallengePosLogin(bankUser);
    }

    // 5. Manager / Joas PIN fallback
    if ((cleanU === 'manager' || cleanU === 'admin' || cleanU === 'joas') && (cleanPass === '1234' || cleanPass === 'admin123' || cleanPass === '0000')) {
      const matchedLocal = posUsersRef.current.find(u => u.username.toLowerCase() === 'joas');
      const matchedBank = bankAccountsRef.current.find(a => a.username.toLowerCase() === 'joas');
      const managerUser: PosUser = {
        id: matchedLocal?.id || 1,
        name: matchedLocal?.name || 'Joas Thorig',
        username: 'joas',
        password: matchedLocal?.password || cleanPass,
        perms: ['pos', 'kitchen', 'pickup', 'voorraad', 'manager', 'medewerkers', 'producten', 'coupons_giftcards', 'cash_pay'],
        is_admin: true,
        is_2fa_enabled: Boolean(matchedLocal?.is_2fa_enabled || matchedBank?.is_2fa_enabled),
        totp_secret: matchedLocal?.totp_secret || matchedBank?.totp_secret || '',
        backup_codes: matchedLocal?.backup_codes || matchedBank?.backup_codes || [],
        theme: matchedLocal?.theme
      };
      return await finalizeOrChallengePosLogin(managerUser);
    }

    return { success: false, message: 'Onjuiste gebruikersnaam of wachtwoord! Controleer je invoer.' };
  };

  const loginPosWithCard = async (
    cardUid: string,
    pin?: string,
    requirePin: boolean = true
  ): Promise<{ success: boolean; message: string }> => {
    const normUid = normalizeCardUid(cardUid);
    if (!normUid) {
      return { success: false, message: 'Ongeldige of lege pas-UID ontvangen.' };
    }

    let matchedAcc: BankAccount | undefined;
    try {
      const dbBanks = await getAllBankAccountsFromFirestore();
      matchedAcc = dbBanks.find(a => accountMatchesUid(a, normUid));
    } catch (err) {
      console.warn('Firestore loginPosWithCard fetch error:', err);
    }
    if (!matchedAcc) {
      matchedAcc = bankAccountsRef.current.find(a => accountMatchesUid(a, normUid));
    }
    if (!matchedAcc) {
      return { success: false, message: `Pas (${normUid}) is niet bekend. Koppel deze pas eerst via Medewerkers of WerkPin.` };
    }

    const cleanU = matchedAcc.username.trim().toLowerCase();
    if (matchedAcc.is_banned || matchedAcc.is_suspended || blockedDevices.some(b => b.value.toLowerCase() === cleanU)) {
      logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerde pas (${normUid}) voor @${cleanU} probeerde op POS in te loggen.`);
      return { success: false, message: 'Dit account is geblokkeerd door de beheerder.' };
    }

    if (requirePin) {
      const cleanPin = (pin || '').trim();
      const storedPin = String(matchedAcc.pin_code ?? '').trim();
      const storedPass = String(matchedAcc.password ?? '').trim();
      if (!cleanPin || (storedPin !== cleanPin && storedPass !== cleanPin)) {
        return { success: false, message: 'Onjuiste pincode voor deze pas.' };
      }
    }

    let matchedPosUser: PosUser | undefined;
    try {
      const dbUsers = await fsGetCollection('pos_users');
      const row = dbUsers.find((u: any) => String(u.username || '').trim().toLowerCase() === cleanU);
      if (row) {
        matchedPosUser = parsePosUserFromDb(row);
      }
    } catch {}
    if (!matchedPosUser) {
      matchedPosUser = posUsers.find(u => u.username.toLowerCase() === cleanU);
    }

    if (matchedPosUser) {
      if (matchedPosUser.is_banned || matchedPosUser.is_suspended) {
        logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd POS account @${cleanU} probeerde via NFC pas in te loggen.`);
        return { success: false, message: 'Dit POS account is geblokkeerd.' };
      }
      logAuditAction('POS_PAS_LOGIN', `@${cleanU} ingelogd op kassa via NFC pas (${normUid}).`);
      return await finalizeOrChallengePosLogin(matchedPosUser);
    }

    const bankUser: PosUser = {
      id: typeof matchedAcc.id === 'number' ? matchedAcc.id : Date.now(),
      name: matchedAcc.account_holder,
      username: matchedAcc.username,
      password: matchedAcc.password,
      perms: matchedAcc.is_admin
        ? ['pos', 'kitchen', 'pickup', 'voorraad', 'manager', 'medewerkers', 'producten', 'coupons_giftcards', 'cash_pay']
        : ['pos', 'pickup'],
      is_admin: matchedAcc.is_admin,
      is_shadowbanned: Boolean(matchedAcc.is_shadowbanned),
      is_2fa_enabled: Boolean(matchedAcc.is_2fa_enabled),
      totp_secret: matchedAcc.totp_secret,
      backup_codes: matchedAcc.backup_codes
    };
    logAuditAction('POS_PAS_LOGIN', `@${cleanU} ingelogd op kassa via NFC pas (${normUid}).`);
    return await finalizeOrChallengePosLogin(bankUser);
  };

  const unlockSystemWithCard = async (
    cardUid: string,
    pin?: string,
    requirePin: boolean = true,
    twoFactorCode?: string
  ): Promise<{ success: boolean; message: string; requires2FA?: boolean }> => {
    const activeStaff = currentPosUserRef.current;
    if (!activeStaff) {
      return { success: false, message: 'Geen vergrendeld medewerker-account gevonden.' };
    }
    const normUid = normalizeCardUid(cardUid);
    if (!normUid) {
      return { success: false, message: 'Ongeldige of lege pas-UID ontvangen.' };
    }

    const activeUsernameLower = activeStaff.username.trim().toLowerCase();
    let matchedAcc: BankAccount | undefined;
    try {
      const dbBanks = await getAllBankAccountsFromFirestore();
      matchedAcc = dbBanks.find((a) => accountMatchesUid(a, normUid));
    } catch {}
    if (!matchedAcc) {
      matchedAcc = bankAccountsRef.current.find((a) => accountMatchesUid(a, normUid));
    }
    if (!matchedAcc) {
      return { success: false, message: `Pas (${normUid}) is onbekend.` };
    }

    if (matchedAcc.username.trim().toLowerCase() !== activeUsernameLower) {
      logAuditAction(
        'LOCK_PAS_WEIGERING',
        `Pas van @${matchedAcc.username} gebruikt om sessie van @${activeStaff.username} te ontgrendelen.`
      );
      return {
        success: false,
        message: `Deze pas hoort bij @${matchedAcc.username}, niet bij vergrendeld account @${activeStaff.username}.`
      };
    }

    if (requirePin) {
      const cleanPin = (pin || '').trim();
      const storedPin = String(matchedAcc.pin_code ?? '').trim();
      const storedPass = String(matchedAcc.password ?? '').trim();
      if (!cleanPin || (storedPin !== cleanPin && storedPass !== cleanPin)) {
        return { success: false, message: 'Onjuiste pincode voor deze pas.' };
      }
    }

    if (activeStaff.is_2fa_enabled) {
      const clean2FA = (twoFactorCode || '').trim();
      if (!clean2FA) {
        return {
          success: false,
          requires2FA: true,
          message: 'Voer eerst je 6-cijferige 2FA Authenticator code of Noodcode in.'
        };
      }
      const is2FAValid = await verify2FACodeForUser(activeUsernameLower, clean2FA);
      if (!is2FAValid) {
        return {
          success: false,
          requires2FA: true,
          message: 'Ongeldige 2FA Authenticator code of Noodcode!'
        };
      }
    }

    setIsSystemLocked(false);
    logAuditAction('SYSTEEM_ONTGRENDELD_PAS', `@${activeStaff.username} ontgrendelde terminal via NFC pas (${normUid}).`);
    return { success: true, message: `🔓 Welkom terug, ${activeStaff.name}!` };
  };

  const canAccess = (perm: string): boolean => {
    if (!currentPosUser) return false;
    if (currentPosUser.is_admin) return true;
    if (currentPosUser.username.toLowerCase() === 'joas') return true;
    if (!currentPosUser.perms || !Array.isArray(currentPosUser.perms)) return false;
    return currentPosUser.perms.includes(perm);
  };

  const logoutPos = () => {
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith('wd_manager_unlocked_')) {
          sessionStorage.removeItem(k);
        }
      });
    } catch {}
    setCurrentPosUser(null);
    sessionStorage.removeItem('wd_pos_user');
    setAppMode('pos');
    setPosScreen('kassa');
  };

  const updatePosUser = async (u: PosUser): Promise<{ success: boolean; message: string }> => {
    const userKey = String(u.username || '').trim().toLowerCase();
    // Joas can only be edited by Joas
    if (userKey === 'joas' && currentPosUser?.username.toLowerCase() !== 'joas') {
      return { success: false, message: 'Joas kan alleen worden aangepast wanneer je als Joas bent ingelogd!' };
    }

    const existing = posUsersRef.current.find(x => x.id === u.id || String(x.username || '').trim().toLowerCase() === userKey);
    const resolvedPassword = u.password && u.password.trim().length > 0
      ? u.password.trim()
      : (existing?.password || '1234');

    const finalUser: PosUser = {
      ...existing,
      ...u,
      username: (u.username || existing?.username || '').trim().toLowerCase(),
      password: resolvedPassword
    };

    const updated = posUsersRef.current.some(x => x.id === finalUser.id)
      ? posUsersRef.current.map(x => x.id === finalUser.id ? finalUser : x)
      : [...posUsersRef.current, finalUser];
    setPosUsers(updated);
    try {
      const snap = JSON.stringify(updated);
      cloudSnapshotsRef.current.users = snap;
      localStorage.setItem('wd_pos_users', snap);
    } catch {}
    if (userKey && deletedPosKeysRef.current.has(userKey)) {
      deletedPosKeysRef.current.delete(userKey);
      try {
        localStorage.setItem('wd_deleted_pos_usernames', JSON.stringify(Array.from(deletedPosKeysRef.current)));
      } catch {}
    }

    if (currentPosUser && currentPosUser.id === finalUser.id) {
      setCurrentPosUser(finalUser);
    }

    if (shouldBlockTableWrite(`Medewerker @${finalUser.username} bewerken`)) {
      return { success: true, message: `Gebruiker ${finalUser.name} succesvol opgeslagen!` };
    }

    try {
      await savePosUserToFirestore(finalUser, buildDbPermsForUser(finalUser));
      if (userKey) {
        cloudKnownPosKeysRef.current.add(userKey);
        try {
          localStorage.setItem('wd_cloud_known_pos_users', JSON.stringify(Array.from(cloudKnownPosKeysRef.current)));
        } catch {}
      }
      return { success: true, message: `Gebruiker ${finalUser.name} succesvol opgeslagen in Firebase Cloud!` };
    } catch (err: any) {
      console.error('Firestore updatePosUser error:', err);
      const errMsg = err?.message || 'Kon medewerker niet opslaan in Firebase.';
      showToast(`Opslaan in Firebase mislukt: ${errMsg}`, 'error');
      return { success: false, message: `Fout bij opslaan in Firebase: ${errMsg}` };
    }
  };

  const createPosUser = async (u: Omit<PosUser, 'id'>): Promise<{ success: boolean; message: string }> => {
    const cleanUsername = String(u.username || '').trim().toLowerCase();
    const newId = Date.now();
    const newUser: PosUser = { ...u, username: cleanUsername, id: newId };
    const updated = [...posUsersRef.current, newUser];
    setPosUsers(updated);
    try {
      const snap = JSON.stringify(updated);
      cloudSnapshotsRef.current.users = snap;
      localStorage.setItem('wd_pos_users', snap);
    } catch {}
    if (cleanUsername && deletedPosKeysRef.current.has(cleanUsername)) {
      deletedPosKeysRef.current.delete(cleanUsername);
      try {
        localStorage.setItem('wd_deleted_pos_usernames', JSON.stringify(Array.from(deletedPosKeysRef.current)));
      } catch {}
    }

    if (shouldBlockTableWrite(`Nieuwe medewerker @${cleanUsername} aanmaken`)) {
      return { success: true, message: `Nieuwe medewerker ${u.name} aangemaakt!` };
    }

    try {
      await savePosUserToFirestore(newUser, buildDbPermsForUser(newUser));
      if (cleanUsername) {
        cloudKnownPosKeysRef.current.add(cleanUsername);
        try {
          localStorage.setItem('wd_cloud_known_pos_users', JSON.stringify(Array.from(cloudKnownPosKeysRef.current)));
        } catch {}
      }
      return { success: true, message: `Nieuwe medewerker ${u.name} aangemaakt & gesynchroniseerd!` };
    } catch (err: any) {
      console.error('Firestore createPosUser error:', err);
      const errMsg = err?.message || 'Kon medewerker niet opslaan in Firebase.';
      showToast(`Opslaan in Firebase mislukt: ${errMsg}`, 'error');
      return { success: false, message: `Lokaal aangemaakt, maar Firebase opslaan mislukte: ${errMsg}` };
    }
  };

  const deletePosUser = async (userId: number): Promise<{ success: boolean; message: string }> => {
    const target = posUsers.find(x => x.id === userId);
    if (!target) return { success: false, message: 'Gebruiker niet gevonden.' };

    if (target.username.toLowerCase() === 'joas') {
      return { success: false, message: 'De hoofdbeheerder Joas kan niet worden verwijderd!' };
    }
    if (target.username === 'bestel_kassa') {
      return { success: false, message: 'Het standaard bestelaccount kan niet worden verwijderd.' };
    }

    const delKey = String(target.username || '').trim().toLowerCase();
    if (delKey) {
      deletedPosKeysRef.current.add(delKey);
      cloudKnownPosKeysRef.current.delete(delKey);
      try {
        localStorage.setItem('wd_deleted_pos_usernames', JSON.stringify(Array.from(deletedPosKeysRef.current)));
        localStorage.setItem('wd_cloud_known_pos_users', JSON.stringify(Array.from(cloudKnownPosKeysRef.current)));
      } catch {}
    }

    const updated = posUsers.filter(x => x.id !== userId);
    setPosUsers(updated);
    localStorage.setItem('wd_pos_users', JSON.stringify(updated));

    if (shouldBlockTableWrite(`Medewerker @${target.username} verwijderen`)) {
      return { success: true, message: `Gebruiker ${target.name} verwijderd.` };
    }

    try {
      await deletePosUserFromFirestore(userId);
    } catch {}

    return { success: true, message: `Gebruiker ${target.name} verwijderd.` };
  };

  // Products (synced inclusief keuzemenu's / options, brand en recepten!)
  const createProduct = async (p: Omit<Product, 'id'>) => {
    const newP: Product = { ...p, id: Date.now() };
    setProducts(prev => [...prev, newP]);
    if (shouldBlockTableWrite(`Product "${p.name}" aanmaken`)) return;
    try {
      await saveProductToFirestore(newP);
    } catch (err) {
      console.error('Firestore createProduct error:', err);
    }
  };

  const updateProduct = async (p: Product) => {
    setProducts(prev => prev.map(x => x.id === p.id ? p : x));
    if (shouldBlockTableWrite(`Product "${p.name}" wijzigen naar €${p.price}`)) return;
    try {
      await saveProductToFirestore(p);
    } catch (err) {
      console.error('Firestore updateProduct error:', err);
    }
  };

  const deleteProduct = async (id: number) => {
    const prod = products.find(x => x.id === id);
    if (shouldBlockTableWrite(`Product "${prod?.name || id}" verwijderen`)) {
      setProducts(prev => prev.filter(x => x.id !== id));
      return;
    }
    saveDisasterRecoverySnapshot();
    setProducts(prev => prev.filter(x => x.id !== id));
    try {
      await deleteProductFromFirestore(id);
    } catch (err) {
      console.error('Firestore deleteProduct error:', err);
    }
  };

  const toggleProductSale = async (id: number) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const updatedProd: Product = { ...prod, onSale: !prod.onSale };
    setProducts(prev => prev.map(p => p.id === id ? updatedProd : p));
    if (shouldBlockTableWrite(`Product "${prod.name}" actie wijzigen`)) return;
    try {
      await saveProductToFirestore(updatedProd);
    } catch (err) {
      console.error('Firestore toggleProductSale error:', err);
    }
  };

  const resetProductsToDefault = async () => {
    if (shouldBlockTableWrite('Menulijst resetten')) {
      setProducts(ALL_DEFAULT_PRODUCTS);
      return;
    }
    saveDisasterRecoverySnapshot();
    localStorage.setItem('wd_products', JSON.stringify(ALL_DEFAULT_PRODUCTS));
    localStorage.setItem('wd_products_version', 'v8_koekploeg_and_werkpay');
    setProducts(ALL_DEFAULT_PRODUCTS);
    try {
      await saveProductsBatchToFirestore(ALL_DEFAULT_PRODUCTS);
    } catch (err) {
      console.error('Firestore sync error on reset:', err);
    }
  };

  const syncProducts = async () => {
    setSyncStatus('syncing');
    try {
      const data = await fsGetCollection('products');
      if (data && data.length > 0) {
        const parsed = data.map(fromFirestoreProduct).sort((a, b) => a.id - b.id);
        setProducts(parsed);
        localStorage.setItem('wd_products', JSON.stringify(parsed));
        showToast(`📦 ${parsed.length} producten (incl. keuzemenu's) gesynchroniseerd met Firebase Cloud!`, 'success');
      } else {
        await saveProductsBatchToFirestore(products.length > 0 ? products : ALL_DEFAULT_PRODUCTS);
        showToast('📦 Menulijst & keuzemenu’s geüpload naar Firebase Cloud!', 'success');
      }
      setIsOnline(true);
    } catch (err: any) {
      console.error('Sync products error:', err);
      showToast('Fout bij laden producten: ' + (err.message || 'Onbekende fout'), 'error');
    } finally {
      setSyncStatus('synced');
    }
  };

  // Inventory
  const buyInventory = (id: number, amount: number) => {
    const item = inventory.find(x => x.id === id);
    if (!item) return;
    const cost = amount * item.cost_price;
    const updatedItem: InventoryItem = { ...item, stock_qty: item.stock_qty + amount };
    setInventory(prev => prev.map(x => x.id === id ? updatedItem : x));
    setTotalExpenses(prev => prev + cost);
    if (!shouldBlockTableWrite(`Voorraad "${item.item_name}" inkopen`)) {
      saveInventoryItemToFirestore(updatedItem).catch(() => {});
    }
  };

  const addInventoryItem = (item: Omit<InventoryItem, 'id'>) => {
    const newItem: InventoryItem = { ...item, id: Date.now() };
    setInventory(prev => [...prev, newItem]);
    if (!shouldBlockTableWrite(`Voorraadartikel "${item.item_name}" toevoegen`)) {
      saveInventoryItemToFirestore(newItem).catch(() => {});
    }
  };

  // Coupons & Gift Cards
  const createGiftCard = async (
    code: string,
    amount: number,
    sender_name?: string,
    recipient_name?: string,
    recipient_phone?: string,
    notes?: string
  ) => {
    const cleanCode = code.toUpperCase();
    const isPrivate = Boolean(notes?.includes('Privé') || cleanCode.startsWith('PRV'));
    const newGc: GiftCard = {
      id: Date.now(),
      code: cleanCode,
      initial_balance: amount,
      current_balance: amount,
      sender_name,
      recipient_name,
      recipient_phone,
      message: notes,
      is_active: true,
      is_private: isPrivate,
      notes,
      created_at: new Date().toISOString()
    };
    setGiftCards(prev => [...prev, newGc]);
    localStorage.setItem('wd_gift_cards', JSON.stringify([...giftCards, newGc]));

    if (shouldBlockTableWrite(`Cadeaubon ${cleanCode} aanmaken`)) return;

    try {
      await saveGiftCardToFirestore(newGc);
    } catch (err) {
      console.error('Error creating gift card in Firestore:', err);
    }

    // Link card to existing WerkLoyalty account if phone is provided
    if (recipient_phone) {
      try {
        issueVoucherForCustomer(recipient_phone, {
          title: `🎁 Cadeaukaart / Vrijkaart € ${amount.toFixed(2)} (${cleanCode})`,
          emoji: isPrivate ? '🔒' : '💳',
          discountType: 'fixed_discount',
          discountVal: amount,
          daysValid: 365
        });
      } catch (err) {
        console.warn('Error linking gift card voucher to customer:', err);
      }
    }
  };

  const topUpGiftCard = async (id: number, amount: number) => {
    const card = giftCards.find(g => g.id === id);
    if (!card) return;
    const updatedCard: GiftCard = { ...card, current_balance: card.current_balance + amount };
    setGiftCards(prev => prev.map(g => g.id === id ? updatedCard : g));
    if (shouldBlockTableWrite(`Cadeaubon #${id} opwaarderen`)) return;
    try {
      await saveGiftCardToFirestore(updatedCard);
    } catch (err) {
      console.error('Error topping up gift card in Firestore:', err);
    }
  };

  const deleteGiftCard = async (id: number) => {
    setGiftCards(prev => prev.filter(g => g.id !== id));
    if (shouldBlockTableWrite(`Cadeaubon #${id} verwijderen`)) return;
    try {
      await deleteGiftCardFromFirestore(id);
    } catch (err) {
      console.error('Error deleting gift card from Firestore:', err);
    }
  };

  const createCoupon = async (coupon: Omit<Coupon, 'id'>) => {
    const newC: Coupon = { ...coupon, id: Date.now() };
    setCoupons(prev => [...prev, newC]);
    if (shouldBlockTableWrite(`Coupon ${newC.code} aanmaken`)) return;
    try {
      await saveCouponToFirestore(newC);
    } catch (err) {
      console.error('Error creating coupon in Firestore:', err);
    }
  };

  const toggleCouponActive = async (id: number) => {
    const target = coupons.find(c => c.id === id);
    if (!target) return;
    const updatedCoupon: Coupon = { ...target, is_active: !target.is_active };
    setCoupons(prev => prev.map(c => c.id === id ? updatedCoupon : c));
    if (shouldBlockTableWrite(`Coupon #${id} status wijzigen`)) return;
    try {
      await saveCouponToFirestore(updatedCoupon);
    } catch (err) {
      console.error('Error toggling coupon active state in Firestore:', err);
    }
  };

  // Determine if a specific order belongs to the currently active user/account/session
  const isUserOrder = useCallback((order: Order): boolean => {
    // 1. Check if the order was placed in this device session
    if (myOrderNumbers.includes(order.no)) return true;

    // 2. Check against logged-in WerkPay bank account
    if (currentBankAccount) {
      const accUser = String(currentBankAccount.username || '').toLowerCase();
      const accHolder = String(currentBankAccount.account_holder || currentBankAccount.username || '').toLowerCase();

      if (order.paymentMeta?.account && String(order.paymentMeta.account).toLowerCase() === accUser) {
        return true;
      }
      if (order.paymentMeta?.cardUid && accountMatchesUid(currentBankAccount, String(order.paymentMeta.cardUid))) {
        return true;
      }
      if (order.identifier) {
        const idLower = order.identifier.toLowerCase();
        if ((accUser && (idLower === accUser || idLower.includes(accUser))) || (accHolder && (idLower === accHolder || idLower.includes(accHolder)))) {
          return true;
        }
      }
      // Check transactions linked to order
      if (bankTransactions.some(tx => tx.order_no === order.no && (
        String(tx.from_account || '').toLowerCase() === accUser || String(tx.to_account || '').toLowerCase() === accUser
      ))) {
        return true;
      }
    }

    // 3. Check against POS user if logged in as a customer
    if (currentPosUser) {
      const pName = currentPosUser.name.toLowerCase();
      const pUname = currentPosUser.username.toLowerCase();
      if (order.identifier) {
        const idLower = order.identifier.toLowerCase();
        if (idLower === pName || idLower === pUname || idLower.includes(pName)) {
          return true;
        }
      }
    }

    return false;
  }, [myOrderNumbers, currentBankAccount, currentPosUser, bankTransactions]);

  const getUserOrders = useCallback((): Order[] => {
    return orders.filter(isUserOrder);
  }, [orders, isUserOrder]);

  const activeUserOrders = orders.filter(o =>
    isUserOrder(o) &&
    o.status !== 'afgehaald' &&
    o.status !== 'archived' &&
    o.status !== 'cancelled' &&
    o.status !== 'geannuleerd'
  );

  return (
    <AppContext.Provider
      value={{
        appMode,
        setAppMode,
        posScreen,
        setPosScreen,
        werkpayScreen,
        setWerkpayScreen,
        activeBrand,
        setActiveBrand,
        brandConfig,
        brandProducts,
        isOnline,
        connectionText,
        syncStatus,
        isRealtimeActive,
        lastSyncTime,
        forceSyncNow,
        testConnection,
        offlineQueueCount,
        offlineQueueItems,
        isFlushingOfflineQueue,
        flushOfflineQueueNow,
        products,
        cart,
        orders,
        orderNo,
        inventory,
        coupons,
        giftCards,
        totalExpenses,
        orderStopActive,
        orderStopText,
        orderStopConfig,
        pickupClosed,
        isSystemLocked,
        setIsSystemLocked,
        autoLockMinutes,
        setAutoLockMinutes,
        unlockSystemWithCard,
        setOrderStopActiveWithText,
        customBranding,
        updateCustomBranding,
        managerOverride: managerOverride || canAccess('manager_override'),
        activateManagerOverride,
        deactivateManagerOverride,
        currentPosUser,
        setCurrentPosUser,
        appliedDiscount,
        addToCart,
        updateCartQty,
        setCartItemQty,
        removeFromCart,
        emptyCart,
        applyCouponCode,
        removeCoupon,
        toggleOrderStop,
        togglePickupClosed,
        updateOrderStatus,
        toggleOrderItemDone,
        updateOrderItemStage,
        toggleOrderPrio,
        setAllOrderItemsDone,
        cancelOrder,
        deleteOrder,
        trackedOrderNo,
        setTrackedOrderNo,
        processCheckout,
        processSumUpPayment,
        refundSumUpTransaction,
        cashRequests,
        createCashRequest,
        approveCashRequest,
        rejectCashRequest,
        authorizeCashStaffUser,
        verifyCashApprovalPin,
        createProduct,
        updateProduct,
        deleteProduct,
        toggleProductSale,
        resetProductsToDefault,
        syncProducts,
        buyInventory,
        addInventoryItem,
        createGiftCard,
        topUpGiftCard,
        deleteGiftCard,
        createCoupon,
        toggleCouponActive,
        canAccess,
        loginPos,
        loginPosWithCard,
        logoutPos,
        updatePosUser,
        createPosUser,
        deletePosUser,
        posUsers,
        currentBankAccount,
        bankAccounts,
        setBankAccounts,
        bankTransactions,
        setBankTransactions,
        loginWerkPay,
        loginWerkPayWithCard,
        logoutWerkPay,
        topUpWerkPay,
        transferWerkPay,
        changeWerkPayPin,
        saveBankAccount,
        deleteBankAccount,
        quickMoneyAccount,
        activeReceiptOrder,
        setActiveReceiptOrder,
        receiptPrinterConfig,
        updateReceiptPrinterConfig,
        myOrderNumbers,
        addMyOrderNumber,
        isUserOrder,
        getUserOrders,
        activeUserOrders,
        claimGtaReward,
        blockedDevices,
        blockDeviceOrIp,
        unblockDeviceOrIp,
        blockAllOtherDevices,
        activeSessions,
        isBlocked,
        blockedReason,
        clientIp,
        deviceId,
        masterPin,
        verifyMasterPin,
        updateMasterPin,
        banAndSuspendUser,
        unbanUser,
        toggleShadowbanUser,
        enable2FAForUser,
        disable2FAForUser,
        verify2FACodeForUser,
        verify2FACardForUser,
        pending2FALogin,
        setPending2FALogin,
        confirm2FALogin,
        confirm2FALoginWithCard,
        tablesFrozen,
        toggleTablesFrozen,
        saveDisasterRecoverySnapshot,
        restoreDisasterRecoverySnapshot,
        auditLogs,
        logAuditAction
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

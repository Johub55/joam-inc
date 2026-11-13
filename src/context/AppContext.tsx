import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
  SupabaseConfig,
  CashPaymentRequest,
  BrandType,
  BrandConfig,
  OrderStopConfig,
  CustomBrandingConfig,
  LinkedNfcTag
} from '../types';
import { showToast } from '../services/appToast';
import {
  DEFAULT_SUPABASE_POS_URL,
  DEFAULT_SUPABASE_POS_KEY,
  DEFAULT_SUPABASE_PAY_URL,
  DEFAULT_SUPABASE_PAY_KEY,
  INITIAL_BANK_ACCOUNTS,
  INITIAL_INVENTORY,
  INITIAL_COUPONS,
  INITIAL_GIFT_CARDS,
  INITIAL_POS_USERS,
  ORDER_KIOSK_USER,
  RPI_KIOSK_USER,
  BRAND_CONFIGS,
  getSupabaseClient,
  normalizeCardUid,
  parseLinkedUids,
  accountMatchesUid,
  generateVirtualCardUid,
  isVirtualCardNumber
} from '../services/store';
import { DEFAULT_PRODUCTS, ALL_DEFAULT_PRODUCTS, KOEKPLOEG_PRODUCTS } from '../services/defaultProducts';
import { AudioFX } from '../services/audio';
import { 
  formatDbOrder, 
  mergeOrders, 
  broadcastSync, 
  recordLocalOrderMutation, 
  recordDeletedOrder, 
  pendingOrderMutations 
} from '../services/syncHelpers';
import { calculateDiscount } from '../services/discountService';
import { redeemVoucherAnyCustomer, addCoinsToCustomer, isVipSubscriberPhone, issueVoucherForCustomer } from '../services/loyalty';
import { verifyTotpCode } from '../services/totp';

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

  // Connection & Supabase
  supabaseConfig: SupabaseConfig;
  setSupabaseConfig: (cfg: Partial<SupabaseConfig>) => void;
  posClient: SupabaseClient | null;
  payClient: SupabaseClient | null;
  isOnline: boolean;
  isSupabaseConfigured: boolean;
  connectionText: string;
  syncStatus: 'synced' | 'syncing' | 'error' | 'offline';
  isRealtimeActive: boolean;
  lastSyncTime: Date | null;
  forceSyncNow: () => Promise<void>;
  testConnection: () => Promise<{ success: boolean; message: string }>;

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

  // Cash Payment Requests (Cross-terminal / Staff authorization)
  cashRequests: CashPaymentRequest[];
  createCashRequest: (orderNo: number, total: number, orderType: 'dine_in' | 'takeaway' | 'delivery', identifier: string) => CashPaymentRequest;
  approveCashRequest: (requestId: string, approvedBy: string, received: number, change: number) => void;
  rejectCashRequest: (requestId: string, reason?: string) => void;

  // Product & Inventory Actions
  createProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: number) => Promise<void>;
  toggleProductSale: (id: number) => Promise<void>;
  resetProductsToDefault: () => void;
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
  logoutWerkPay: () => void;
  topUpWerkPay: (amount: number) => Promise<{ success: boolean; message: string }>;
  transferWerkPay: (to: string, amount: number, note?: string) => Promise<{ success: boolean; message: string }>;
  changeWerkPayPin: (newPin: string) => Promise<{ success: boolean; message: string }>;
  saveBankAccount: (acc: Partial<BankAccount> & { id?: number | string }) => Promise<{ success: boolean; message?: string }>;
  deleteBankAccount: (id: number | string) => Promise<void>;
  quickMoneyAccount: (id: number | string, delta: number) => Promise<void>;

  // Receipt Modal State
  activeReceiptOrder: Order | null;
  setActiveReceiptOrder: (order: Order | null) => void;

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
  pending2FALogin: { user: PosUser | BankAccount; loginType: 'pos' | 'werkpay' } | null;
  setPending2FALogin: (val: { user: PosUser | BankAccount; loginType: 'pos' | 'werkpay' } | null) => void;
  confirm2FALogin: (code: string) => Promise<{ success: boolean; message: string }>;
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
    if (posClient) {
      try {
        await posClient.from('pos_settings').upsert({
          id: 'default',
          master_security_pin: clean,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Fout bij opslaan master_security_pin in pos_settings:', e);
      }
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
  };

  // Helper: Encode security & theme flags inside existing JSONB `perms` array so Supabase sync works 100% WITHOUT needing new SQL columns!
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

  const syncUserSecurityToSupabase = async (targetUser: PosUser, overrideFreeze?: boolean) => {
    const client = posClient || payClient;
    if (!client) return;
    const cleanU = targetUser.username.trim().toLowerCase();
    const dbPerms = buildDbPermsForUser(targetUser, overrideFreeze);
    try {
      // 1. Update via standard `perms` JSONB column (always exists in every Supabase setup, 0 SQL changes needed!)
      const { data: existingRows } = await client.from('pos_users').select('id, username').ilike('username', cleanU);
      if (existingRows && existingRows.length > 0) {
        await client.from('pos_users').update({ perms: dbPerms }).ilike('username', cleanU);
      } else {
        await client.from('pos_users').insert({
          name: targetUser.name || cleanU,
          username: targetUser.username,
          password: targetUser.password || '1234',
          perms: dbPerms,
          is_admin: Boolean(targetUser.is_admin)
        });
      }
      // 2. Also update dedicated columns if they exist
      try {
        await client.from('pos_users').update({
          is_shadowbanned: Boolean(targetUser.is_shadowbanned),
          is_banned: Boolean(targetUser.is_banned),
          is_suspended: Boolean(targetUser.is_suspended),
          is_2fa_enabled: Boolean(targetUser.is_2fa_enabled),
          totp_secret: targetUser.totp_secret || '',
          backup_codes: targetUser.backup_codes || []
        }).ilike('username', cleanU);
        await client.from('bank_accounts').update({
          is_shadowbanned: Boolean(targetUser.is_shadowbanned),
          is_banned: Boolean(targetUser.is_banned),
          is_suspended: Boolean(targetUser.is_suspended),
          is_2fa_enabled: Boolean(targetUser.is_2fa_enabled),
          totp_secret: targetUser.totp_secret || '',
          backup_codes: targetUser.backup_codes || []
        }).ilike('username', cleanU);
      } catch {}

      // 3. Broadcast live to all open tabs & GitHub Pages sessions
      const bc = client.channel('global_audio_broadcast');
      bc.send({
        type: 'broadcast',
        event: 'wd_security_state_sync',
        payload: {
          username: cleanU,
          is_shadowbanned: Boolean(targetUser.is_shadowbanned),
          is_banned: Boolean(targetUser.is_banned),
          is_suspended: Boolean(targetUser.is_suspended),
          tables_frozen: overrideFreeze !== undefined ? overrideFreeze : tablesFrozen
        }
      }).catch(() => {});
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

    const client = posClient || payClient;
    if (client) {
      try {
        // 1. Sync via existing `pos_users.perms` on joas/admin so 0 SQL changes are required
        const adminTarget = posUsers.find(u => u.username.toLowerCase() === 'joas') || posUsers[0];
        if (adminTarget) {
          await syncUserSecurityToSupabase(adminTarget, nextFreeze);
        }
        // 2. Also store in pos_settings.news_config (which already exists)
        const currentNewsCfgRaw = localStorage.getItem('wd_pickup_news_config_v2');
        let newsCfg: any = {};
        try { if (currentNewsCfgRaw) newsCfg = JSON.parse(currentNewsCfgRaw); } catch {}
        newsCfg.tables_frozen = nextFreeze;
        newsCfg.lastUpdated = Date.now();
        localStorage.setItem('wd_pickup_news_config_v2', JSON.stringify(newsCfg));
        await client.from('pos_settings').upsert({
          id: 'default',
          order_stop_active: orderStopActive,
          pickup_closed: pickupClosed,
          news_config: newsCfg,
          updated_at: new Date().toISOString()
        });
        // 3. Try server-side PostgreSQL REVOKE/GRANT RPC if installed
        try {
          await client.rpc('werkpay_set_tables_readonly', { p_lock: nextFreeze, p_allow_orders: true });
        } catch {}
      } catch {}
    }

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
    await syncUserSecurityToSupabase(fallbackUser);

    logAuditAction('ACCOUNT_GESCHORST', `Account @${cleanU} geschorst en geblokkeerd (zichtbare rechten behouden)! ${reason || ''}`);
    return { success: true, message: `Account @${cleanU} is direct online geblokkeerd (zonder SQL aanpassing nodig)!` };
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
      await syncUserSecurityToSupabase(targetObj);
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
      await syncUserSecurityToSupabase(targetObj);
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
    await syncUserSecurityToSupabase(userToSync);

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
    await syncUserSecurityToSupabase(disabledUser);

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

    // Fallback: check live Supabase in case 2FA was just toggled on another device or before initial poll finished
    if (posClient) {
      try {
        const { data: dbU } = await posClient.from('pos_users').select('*').ilike('username', cleanU).maybeSingle();
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
    }
    const targetPay = payClient || posClient;
    if (targetPay) {
      try {
        const { data: dbA } = await targetPay.from('bank_accounts').select('is_2fa_enabled, totp_secret, backup_codes').ilike('username', cleanU).maybeSingle();
        if (dbA && dbA.is_2fa_enabled && dbA.totp_secret) {
          return {
            is_2fa_enabled: true,
            totp_secret: dbA.totp_secret,
            backup_codes: Array.isArray(dbA.backup_codes) ? dbA.backup_codes : []
          };
        }
      } catch {}
    }

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

  // Supabase Config
  const [supabaseConfig, setSupabaseConfigState] = useState<SupabaseConfig>(() => {
    const saved = localStorage.getItem('wd_sb_cfg');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const resolvedUrl = parsed.unifiedUrl || parsed.supabaseUrl || '';
        const resolvedKey = parsed.unifiedKey || parsed.supabaseAnonKey || '';
        
        // Ensure both URL and KEY are present and the URL is not a known bad value
        if (resolvedUrl && resolvedKey && !resolvedUrl.includes('ezndrnnywjznxpzxgksb')) {
          return {
            unifiedUrl: resolvedUrl,
            unifiedKey: resolvedKey,
            useSeparatePay: Boolean(parsed.useSeparatePay),
            payUrl: parsed.payUrl || resolvedUrl,
            payKey: parsed.payKey || resolvedKey,
            supabaseUrl: resolvedUrl,
            supabaseAnonKey: resolvedKey
          };
        } else {
          // If the config in localStorage is incomplete or invalid, remove it
          localStorage.removeItem('wd_sb_cfg');
        }
      } catch (e) {
        // If JSON parsing fails, remove the invalid config
        localStorage.removeItem('wd_sb_cfg');
      }
    }
    // Fallback to defaults
    return {
      unifiedUrl: DEFAULT_SUPABASE_POS_URL,
      unifiedKey: DEFAULT_SUPABASE_POS_KEY,
      useSeparatePay: false,
      payUrl: DEFAULT_SUPABASE_PAY_URL,
      payKey: DEFAULT_SUPABASE_PAY_KEY,
      supabaseUrl: DEFAULT_SUPABASE_POS_URL,
      supabaseAnonKey: DEFAULT_SUPABASE_POS_KEY
    };
  });

  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [connectionText, setConnectionText] = useState<string>('Verbinden met Supabase...');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'offline'>('synced');
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());

  // Clients
  const [posClient, setPosClient] = useState<SupabaseClient | null>(null);
  const [payClient, setPayClient] = useState<SupabaseClient | null>(null);

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
      storeName: 'WerkPay',
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

  const [isSystemLocked, setIsSystemLockedState] = useState<boolean>(() => {
    return localStorage.getItem('wd_system_locked') === 'true';
  });

  const setIsSystemLocked = (locked: boolean) => {
    setIsSystemLockedState(locked);
    localStorage.setItem('wd_system_locked', String(locked));
    if (locked) {
      logAuditAction('SYSTEEM_VERGRENDELD', 'Systeem handmatig vergrendeld via Numpad Enter.');
    } else {
      logAuditAction('SYSTEEM_ONTGRENDELD', 'Systeem succesvol ontgrendeld met wachtwoord en 2FA.');
    }
  };

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

  // WerkPay State
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    const saved = localStorage.getItem('wd_bank_accounts');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return INITIAL_BANK_ACCOUNTS;
  });

  // User requirement: "je begint bij allebei op het inlog scherm zonder bijvoorbeeld!"
  const [currentBankAccount, setCurrentBankAccount] = useState<BankAccount | null>(null);

  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>(() => {
    const saved = localStorage.getItem('wd_bank_txs');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return [
      { id: 1, from_account: 'klant01', to_account: 'WerkPay Kassa', amount: 14.50, label: 'WerkPay Bestelling #1000', when: 'Vandaag 12:30', timestamp: Date.now() - 3600000 },
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

  const setSupabaseConfig = (cfg: Partial<SupabaseConfig>) => {
    const resolvedUrl = cfg.unifiedUrl || cfg.supabaseUrl || supabaseConfig.unifiedUrl || DEFAULT_SUPABASE_POS_URL;
    const resolvedKey = cfg.unifiedKey || cfg.supabaseAnonKey || supabaseConfig.unifiedKey || DEFAULT_SUPABASE_POS_KEY;
    const normalized: SupabaseConfig = {
      unifiedUrl: resolvedUrl,
      unifiedKey: resolvedKey,
      useSeparatePay: cfg.useSeparatePay ?? supabaseConfig.useSeparatePay ?? false,
      payUrl: cfg.payUrl || (cfg.useSeparatePay ? (cfg.payUrl || resolvedUrl) : resolvedUrl),
      payKey: cfg.payKey || (cfg.useSeparatePay ? (cfg.payKey || resolvedKey) : resolvedKey),
      supabaseUrl: resolvedUrl,
      supabaseAnonKey: resolvedKey
    };
    setSupabaseConfigState(normalized);
    localStorage.setItem('wd_sb_cfg', JSON.stringify(normalized));
  };

  // Initialize Supabase Clients with Realtime configuration
  useEffect(() => {
    console.log("DEBUG: AppContext init, config:", supabaseConfig);
    console.log("DEBUG: Component mounted in AppContext");
    try {
      const pUrl = supabaseConfig.unifiedUrl || supabaseConfig.supabaseUrl;
      const pKey = supabaseConfig.unifiedKey || supabaseConfig.supabaseAnonKey;
      console.log("DEBUG: Resolved pUrl:", pUrl, "resolved pKey:", pKey);
      const bUrl = supabaseConfig.useSeparatePay ? (supabaseConfig.payUrl || pUrl) : pUrl;
      const bKey = supabaseConfig.useSeparatePay ? (supabaseConfig.payKey || pKey) : pKey;

      if (!pUrl || !pKey) {
        console.warn("DEBUG: pUrl or pKey is missing!");
      }
      
      if (bUrl === pUrl && bKey === pKey) {
        if (pUrl && pKey) {
          const pc = getSupabaseClient(pUrl, pKey, {
            realtime: { params: { eventsPerSecond: 10 } }
          });
          if (pc) {
            console.log("DEBUG: Successfully set posClient and payClient");
            setPosClient(pc);
            setPayClient(pc);
          } else {
             console.error("DEBUG: Failed to get supabase client");
          }
        }
      } else {
        if (pUrl && pKey) {
          const pc = getSupabaseClient(pUrl, pKey, {
            realtime: { params: { eventsPerSecond: 10 } }
          });
          if (pc) setPosClient(pc);
          else console.error("DEBUG: Failed to get posClient");
        }
        if (bUrl && bKey) {
          const bc = getSupabaseClient(bUrl, bKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            realtime: { params: { eventsPerSecond: 10 } }
          });
          if (bc) setPayClient(bc);
          else console.error("DEBUG: Failed to get payClient");
        }
      }

      setConnectionText('Verbonden (Live Supabase & Lokale Cache)');
      setIsOnline(true);
      console.log("DEBUG: AppContext set to ONLINE");
    } catch (e: any) {
      console.error("DEBUG: Kritieke fout in client init:", e);
      setConnectionText('Offline / Lokale Simulatiemodus');
      setIsOnline(false);
      setSyncStatus('offline');
    }
  }, [supabaseConfig]);

// Helper to convert DB cash_request row to CashPaymentRequest
const formatDbCashRequest = (row: any): CashPaymentRequest => {
  return {
    id: row.req_id || `req_${row.id}`,
    orderNo: Number(row.order_no || 0),
    orderType: row.order_type || 'takeaway',
    identifier: row.identifier || row.cashier || '',
    total: Number(row.amount || 0),
    status: row.status as 'pending' | 'approved' | 'rejected',
    requestedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    approvedBy: row.approved_by || undefined,
    received: row.received !== null && row.received !== undefined ? Number(row.received) : undefined,
    change: row.change !== null && row.change !== undefined ? Number(row.change) : undefined,
    rejectedReason: row.rejected_reason || undefined
  };
};

  const currentPosUserRef = useRef(currentPosUser);
  currentPosUserRef.current = currentPosUser;
  const currentBankAccountRef = useRef(currentBankAccount);
  currentBankAccountRef.current = currentBankAccount;
  const tablesFrozenRef = useRef(tablesFrozen);
  tablesFrozenRef.current = tablesFrozen;
  const isRealtimeActiveRef = useRef(isRealtimeActive);
  isRealtimeActiveRef.current = isRealtimeActive;

  const cloudSnapshotsRef = useRef<{
    bank: string;
    users: string;
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
    coupons: '',
    giftCards: '',
    cashReqs: '',
    loyalty: '',
    sessions: '',
    blocked: '',
    news: ''
  });

  // Unified cloud data fetch
  const fetchCloudData = useCallback(async (isBackground = false) => {
    if (!posClient) return;
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
      // 1. Fetch orders (unless current user is shadowbanned so their fake local changes stay visible to them)
      const { data: dbOrders, error: orderErr } = await posClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);

      if (!orderErr && dbOrders && !isShadowbanned) {
        const parsed: Order[] = dbOrders.map(formatDbOrder);
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

      // 2. Fetch bank accounts (preserving local linked_uids if SQL column doesn't exist yet)
      const targetPay = payClient || posClient;
      const { data: dbAccounts, error: payErr } = await targetPay
        .from('bank_accounts')
        .select('*');

      let mergedDbAccounts: BankAccount[] | null = null;
      if (!payErr && dbAccounts && dbAccounts.length > 0 && !isShadowbanned) {
        const localBankMap = new Map<string, BankAccount>();
        try {
          const savedRaw = localStorage.getItem('wd_bank_accounts');
          if (savedRaw) {
            for (const la of JSON.parse(savedRaw)) {
              if (la?.username) localBankMap.set(String(la.username).toLowerCase(), la);
            }
          }
        } catch {}

        mergedDbAccounts = dbAccounts.map((row: any) => {
          const localMatch = localBankMap.get(String(row.username || '').toLowerCase());
          const hasRemoteLinkedCol = row.linked_uids !== undefined;
          return {
            ...row,
            balance: Number(row.balance || 0),
            is_admin: Boolean(row.is_admin),
            linked_uids: hasRemoteLinkedCol
              ? parseLinkedUids(row.linked_uids)
              : parseLinkedUids(localMatch?.linked_uids || [])
          } as BankAccount;
        });

        const bankSnap = JSON.stringify(mergedDbAccounts);
        if (bankSnap !== cloudSnapshotsRef.current.bank) {
          cloudSnapshotsRef.current.bank = bankSnap;
          setBankAccounts(mergedDbAccounts);
          localStorage.setItem('wd_bank_accounts', bankSnap);
        }
        if (activeBankAcc) {
          const found = mergedDbAccounts.find(
            a => a.id === activeBankAcc.id || a.username.toLowerCase() === activeBankAcc.username.toLowerCase()
          );
          if (
            found &&
            (found.balance !== activeBankAcc.balance ||
              found.is_2fa_enabled !== activeBankAcc.is_2fa_enabled ||
              found.card_uid !== activeBankAcc.card_uid ||
              JSON.stringify(found.linked_uids || []) !== JSON.stringify(activeBankAcc.linked_uids || []))
          ) {
            setCurrentBankAccount(found);
          }
        }
      }

      // 3. Fetch POS users from Supabase (with Zero-SQL `perms` marker decoding for Shadowban, Ban & Table Freeze!)
      const { data: dbUsers, error: userErr } = await posClient
        .from('pos_users')
        .select('*');

      if (!userErr && dbUsers && dbUsers.length > 0) {
        // Check if any admin user has __tables_frozen__ marker in perms
        const remoteFreezeFromPerms = dbUsers.some(u => {
          const rawP = Array.isArray(u.perms) ? u.perms : (typeof u.perms === 'string' ? (() => { try { return JSON.parse(u.perms); } catch { return []; } })() : []);
          return rawP.includes('__tables_frozen__');
        });

        const parsedUsers: PosUser[] = dbUsers.map(u => parsePosUserFromDb(u));
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

      // 4. Fetch coupons from Supabase
      const { data: dbCoupons, error: couponErr } = await posClient
        .from('coupons')
        .select('*');
      if (!couponErr && dbCoupons && !isShadowbanned) {
        const parsedCoupons: Coupon[] = dbCoupons.map(c => ({
          id: Number(c.id),
          code: c.code,
          discount_type: c.discount_type as any,
          discount_val: Number(c.discount_val),
          min_subtotal: c.min_subtotal ? Number(c.min_subtotal) : undefined,
          target_product_name: c.target_product_name || undefined,
          is_active: Boolean(c.is_active)
        }));
        const couponsSnap = JSON.stringify(parsedCoupons);
        if (couponsSnap !== cloudSnapshotsRef.current.coupons) {
          cloudSnapshotsRef.current.coupons = couponsSnap;
          setCoupons(parsedCoupons);
          localStorage.setItem('wd_coupons', couponsSnap);
        }
      }

      // 5. Fetch gift cards from Supabase
      const { data: dbGiftCards, error: gcErr } = await posClient
        .from('gift_cards')
        .select('*');
      if (!gcErr && dbGiftCards && !isShadowbanned) {
        const parsedGiftCards: GiftCard[] = dbGiftCards.map(g => ({
          id: Number(g.id),
          code: g.code,
          initial_balance: Number(g.initial_balance),
          current_balance: Number(g.current_balance),
          is_active: Boolean(g.is_active)
        }));
        const gcSnap = JSON.stringify(parsedGiftCards);
        if (gcSnap !== cloudSnapshotsRef.current.giftCards) {
          cloudSnapshotsRef.current.giftCards = gcSnap;
          setGiftCards(parsedGiftCards);
          localStorage.setItem('wd_gift_cards', gcSnap);
        }
      }

      // 6. Fetch pos_settings from Supabase
      const { data: dbSettings, error: settingsErr } = await posClient
        .from('pos_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      // Check local intent FIRST
      const localOrderStop = localStorage.getItem('wd_order_stop') === 'true';

      if (!settingsErr && dbSettings) {
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

        if (dbSettings.branding_config && typeof dbSettings.branding_config === 'object') {
          setCustomBranding(dbSettings.branding_config);
          localStorage.setItem('wd_custom_branding', JSON.stringify(dbSettings.branding_config));
        }

        if (dbSettings.master_security_pin) {
          const pinVal = String(dbSettings.master_security_pin).trim();
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
          if (remoteNewsStr !== cloudSnapshotsRef.current.news && (!currentNewsCfg || !currentNewsCfg.lastUpdated || (remoteNewsCfg.lastUpdated && remoteNewsCfg.lastUpdated > currentNewsCfg.lastUpdated))) {
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
      } else if (!settingsErr && !dbSettings) {
        await posClient.from('pos_settings').insert({ id: 'default', order_stop_active: false, pickup_closed: false });
      }

      // 7. Fetch cash_requests from Supabase (for cross-terminal staff notifications)
      const { data: dbCashReqs, error: cashErr } = await posClient
        .from('cash_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (!cashErr && dbCashReqs) {
        const parsedCashReqs = dbCashReqs.map(formatDbCashRequest);
        const cashSnap = JSON.stringify(parsedCashReqs);
        if (cashSnap !== cloudSnapshotsRef.current.cashReqs) {
          cloudSnapshotsRef.current.cashReqs = cashSnap;
          setCashRequests(parsedCashReqs);
          localStorage.setItem('wd_cash_requests', cashSnap);
        }
      }

      // 8. Fetch loyalty_customers from Supabase (for WerkLoyalty cross-terminal sync)
      const { data: dbLoyalty, error: loyaltyErr } = await posClient
        .from('loyalty_customers')
        .select('*');
      if (!loyaltyErr && dbLoyalty && dbLoyalty.length > 0) {
        const parsedLoyalty = dbLoyalty.map((c: any) => {
          const phone = String(c.phone || '');
          const activeVipRec = isVipSubscriberPhone(phone);
          const isVip = Boolean(c.vip_subscription_active || activeVipRec);

          return {
            id: String(c.id),
            name: String(c.name || ''),
            phone,
            coins: Number(c.coins || 0),
            totalSpent: Number(c.total_spent || 0),
            ordersCount: Number(c.orders_count || 0),
            tier: isVip ? 'VIP Diamant' : ((c.tier as any) || 'Brons'),
            level: isVip ? 4 : undefined,
            currentMonthSpent: Number(c.current_month_spent || 0),
            lastMonthSpent: Number(c.last_month_spent || 0),
            currentMonthKey: c.current_month_key || '',
            monthsBelowTarget: Number(c.months_below_target || 0),
            vipSubscriptionActive: isVip,
            vipSubscriptionExpires: activeVipRec?.expiresAt || c.vip_subscription_expires || undefined,
            vipPlan: activeVipRec?.plan || c.vip_plan || undefined,
            vouchers: Array.isArray(c.vouchers) ? c.vouchers : (typeof c.vouchers === 'string' ? JSON.parse(c.vouchers) : []),
            lastSpinDate: c.last_spin_date || undefined,
            ordersTodayCount: Number(c.orders_today_count || 0),
            joinedDate: c.joined_date || new Date().toISOString().split('T')[0]
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

      // 9. Fetch active connected pos_sessions
      const { data: dbSessions, error: sessErr } = await posClient
        .from('pos_sessions')
        .select('*')
        .order('last_seen', { ascending: false });

      if (!sessErr && dbSessions) {
        const now = Date.now();
        const recent = dbSessions.filter((s: any) => {
          const t = new Date(s.last_seen).getTime();
          return (now - t) < 60000; // seen within last 60s
        }).map((s: any) => ({
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
    } catch (err: any) {
      console.error('Cloud sync failure details:', err);
      setIsOnline(false);
      if (!isBackground) {
        setSyncStatus('error');
      }
    }
  }, [posClient, payClient]);

  const forceSyncNow = async () => {
    await fetchCloudData(false);
  };

  // Initial products seed & check
  useEffect(() => {
    if (!posClient) return;
    const initProducts = async () => {
      try {
        console.log("DEBUG: Initializing products...");
        const { data: dbProds, error: fetchErr } = await posClient.from('products').select('*');
        if (fetchErr) {
          console.error("DEBUG: Error fetching products from Supabase:", fetchErr);
          throw fetchErr;
        }
        
        console.log("DEBUG: Fetched products from DB:", dbProds?.length || 0);

        if (dbProds && dbProds.length >= 1) { // Changed threshold to 1 for safer testing
          let localList: Product[] = [];
          try {
            const rawLocal = localStorage.getItem('wd_products');
            if (rawLocal) localList = JSON.parse(rawLocal);
          } catch {}
          setProducts(dbProds.map(p => {
            const defP = ALL_DEFAULT_PRODUCTS.find(d => d.id === p.id);
            const locP = localList.find(l => l.id === p.id);
            return {
              id: p.id,
              name: p.name,
              price: Number(p.price),
              salePrice: Number(p.sale_price || 0),
              onSale: Boolean(p.on_sale),
              cat: p.cat,
              emoji: p.emoji,
              inStock: Boolean(p.in_stock),
              options: p.options || locP?.options || defP?.options,
              brand: p.brand || locP?.brand || defP?.brand,
              recipe: p.recipe || locP?.recipe || defP?.recipe,
              recipeDescription: p.recipe_description || locP?.recipeDescription || defP?.recipeDescription
            };
          }));
          console.log("DEBUG: Successfully set products from DB");
        } else {
          console.log("DEBUG: No products found, upserting defaults...");
          const rows = ALL_DEFAULT_PRODUCTS.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            sale_price: p.salePrice || 0,
            on_sale: p.onSale || false,
            cat: p.cat,
            emoji: p.emoji,
            in_stock: p.inStock
          }));
          const { error: upsertErr } = await posClient.from('products').upsert(rows);
          if (upsertErr) {
            console.error("DEBUG: Error upserting default products:", upsertErr);
          } else {
            console.log("DEBUG: Successfully upserted default products");
            setProducts(ALL_DEFAULT_PRODUCTS);
          }
        }
      } catch (err) {
        console.error('Product init error:', err);
      }
    };
    initProducts();
  }, [posClient]);

  // Continuous Adaptive Polling (pauses when tab hidden, slower when Realtime WebSocket is live)
  useEffect(() => {
    if (!posClient) return;

    fetchCloudData(false);

    const pollMs = isRealtimeActive ? 15000 : 6000;
    const intervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchCloudData(true);
    }, pollMs);

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchCloudData(false);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [fetchCloudData, posClient, isRealtimeActive]);

  // Active Device Heartbeat to pos_sessions (lightweight 12s heartbeat, skips hidden tabs)
  useEffect(() => {
    if (!posClient || !deviceId) return;

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

        await posClient.from('pos_sessions').upsert({
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
    const interval = setInterval(sendHeartbeat, 12000);
    return () => clearInterval(interval);
  }, [posClient, deviceId, clientIp, currentPosUser, currentBankAccount, appMode, posScreen]);

  // Live Supabase Realtime WebSocket Subscriptions
  useEffect(() => {
    if (!posClient) return;
    let isMounted = true;
    let orderChannel: any = null;
    let bankChannel: any = null;
    let prodChannel: any = null;
    let couponChannel: any = null;
    let gcChannel: any = null;
    let settingsChannel: any = null;
    let cashReqChannel: any = null;
    let broadcastChannelRef: any = null;

    try {
      // 1. Orders Realtime
      orderChannel = posClient
        .channel('realtime_orders_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            if (!isMounted) return;
            console.log('⚡ Realtime Order Event received:', payload.eventType);
            if (payload.eventType === 'INSERT') {
              const newOrder = formatDbOrder(payload.new);
              setOrders(prev => {
                if (prev.some(o => o.no === newOrder.no)) return prev;
                AudioFX.bell();
                return [newOrder, ...prev];
              });
              setOrderNo(prev => Math.max(prev, newOrder.no + 1));
              setLastSyncTime(new Date());
              setSyncStatus('synced');
            } else if (payload.eventType === 'UPDATE') {
              const updatedOrder = formatDbOrder(payload.new);
              let statusChangedToDone = false;
              setOrders(prev => prev.map(o => {
                if (o.no !== updatedOrder.no) return o;
                const localMutation = pendingOrderMutations.get(o.no);
                const isMutationFresh = localMutation && Date.now() - localMutation.timestamp < 15000;
                const finalStatus = (isMutationFresh && localMutation.status) ? localMutation.status : updatedOrder.status;
                const finalItems = (isMutationFresh && localMutation.items) 
                  ? localMutation.items 
                  : (updatedOrder.items && updatedOrder.items.length > 0 ? updatedOrder.items : o.items);
                const finalPrio = (isMutationFresh && localMutation.isPrio !== undefined) 
                  ? localMutation.isPrio 
                  : (o.isPrio ?? updatedOrder.isPrio ?? false);

                const isOldStatusDone = o.status === 'done' || o.status === 'klaar';
                const isNewStatusDone = finalStatus === 'done' || finalStatus === 'klaar';
                if (isNewStatusDone && !isOldStatusDone) {
                  statusChangedToDone = true;
                }

                return {
                  ...o,
                  ...updatedOrder,
                  status: finalStatus,
                  items: finalItems,
                  isPrio: finalPrio,
                  updatedAt: Math.max(o.updatedAt || 0, updatedOrder.updatedAt || 0)
                };
              }));
              if (statusChangedToDone) {
                AudioFX.speakOrder(updatedOrder.no, updatedOrder.identifier, updatedOrder.orderType);
              }
              setLastSyncTime(new Date());
              setSyncStatus('synced');
            } else if (payload.eventType === 'DELETE') {
              const orderNoToDelete = payload.old?.order_no;
              if (orderNoToDelete) {
                setOrders(prev => prev.filter(o => o.no !== orderNoToDelete));
              } else if (payload.old?.id) {
                setOrders(prev => prev.filter(o => o.id !== payload.old.id));
              }
              setLastSyncTime(new Date());
            }
          }
        )
        .subscribe((status) => {
          if (!isMounted) return;
          if (status === 'SUBSCRIBED') {
            setIsRealtimeActive(true);
            setConnectionText('🟢 Realtime Live Supabase (WebSocket)');
          } else if (status === 'CHANNEL_ERROR') {
            setIsRealtimeActive(false);
            setConnectionText('🟢 Supabase Live Polling (3s interval)');
          }
        });

      // 2. Bank Accounts Realtime
      const targetPay = payClient || posClient;
      bankChannel = targetPay
        .channel('realtime_bank_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bank_accounts' },
          (payload) => {
            if (!isMounted) return;
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const rawAcc = payload.new as any;
              const parsedLinked = rawAcc.linked_uids !== undefined ? parseLinkedUids(rawAcc.linked_uids) : undefined;
              setBankAccounts(prev => {
                const idx = prev.findIndex(a => a.id === rawAcc.id || a.username.toLowerCase() === String(rawAcc.username || '').toLowerCase());
                if (idx !== -1) {
                  const copy = [...prev];
                  copy[idx] = {
                    ...copy[idx],
                    ...rawAcc,
                    balance: Number(rawAcc.balance ?? copy[idx].balance),
                    linked_uids: parsedLinked !== undefined ? parsedLinked : (copy[idx].linked_uids || [])
                  };
                  return copy;
                }
                return [...prev, { ...rawAcc, balance: Number(rawAcc.balance || 0), linked_uids: parsedLinked || [] }];
              });
              setCurrentBankAccount(prev => {
                if (prev && (prev.id === rawAcc.id || prev.username.toLowerCase() === String(rawAcc.username || '').toLowerCase())) {
                  return {
                    ...prev,
                    balance: Number(rawAcc.balance ?? prev.balance),
                    card_uid: rawAcc.card_uid ?? prev.card_uid,
                    linked_uids: parsedLinked !== undefined ? parsedLinked : prev.linked_uids
                  };
                }
                return prev;
              });
              setLastSyncTime(new Date());
            }
          }
        )
        .subscribe();

      // 3. Products Realtime
      prodChannel = posClient
        .channel('realtime_products_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products' },
          (payload) => {
            if (!isMounted) return;
            if (payload.eventType === 'UPDATE') {
              const p = payload.new;
              setProducts(prev => prev.map(prod => prod.id === p.id ? {
                ...prod,
                name: p.name,
                price: Number(p.price),
                salePrice: Number(p.sale_price || 0),
                onSale: Boolean(p.on_sale),
                inStock: Boolean(p.in_stock),
                cat: p.cat,
                emoji: p.emoji
              } : prod));
            }
          }
        )
        .subscribe();

      // 4. Coupons Realtime
      couponChannel = posClient
        .channel('realtime_coupons_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'coupons' },
          (payload) => {
            if (!isMounted) return;
            console.log('⚡ Realtime Coupon Event received:', payload.eventType);
            if (payload.eventType === 'INSERT') {
              const newC = payload.new;
              const parsed: Coupon = {
                id: Number(newC.id),
                code: newC.code,
                discount_type: newC.discount_type as any,
                discount_val: Number(newC.discount_val),
                min_subtotal: newC.min_subtotal ? Number(newC.min_subtotal) : undefined,
                target_product_name: newC.target_product_name || undefined,
                is_active: Boolean(newC.is_active)
              };
              setCoupons(prev => {
                if (prev.some(c => c.id === parsed.id || c.code === parsed.code)) return prev;
                return [...prev, parsed];
              });
            } else if (payload.eventType === 'UPDATE') {
              const updatedC = payload.new;
              const parsed: Coupon = {
                id: Number(updatedC.id),
                code: updatedC.code,
                discount_type: updatedC.discount_type as any,
                discount_val: Number(updatedC.discount_val),
                min_subtotal: updatedC.min_subtotal ? Number(updatedC.min_subtotal) : undefined,
                target_product_name: updatedC.target_product_name || undefined,
                is_active: Boolean(updatedC.is_active)
              };
              setCoupons(prev => prev.map(c => c.id === parsed.id ? parsed : c));
            } else if (payload.eventType === 'DELETE') {
              const idToDelete = payload.old?.id;
              if (idToDelete) {
                setCoupons(prev => prev.filter(c => c.id !== Number(idToDelete)));
              }
            }
          }
        )
        .subscribe();

      // 5. Gift Cards Realtime
      gcChannel = posClient
        .channel('realtime_gift_cards_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'gift_cards' },
          (payload) => {
            if (!isMounted) return;
            console.log('⚡ Realtime Gift Card Event received:', payload.eventType);
            if (payload.eventType === 'INSERT') {
              const newG = payload.new;
              const parsed: GiftCard = {
                id: Number(newG.id),
                code: newG.code,
                initial_balance: Number(newG.initial_balance),
                current_balance: Number(newG.current_balance),
                is_active: Boolean(newG.is_active)
              };
              setGiftCards(prev => {
                if (prev.some(g => g.id === parsed.id || g.code === parsed.code)) return prev;
                return [...prev, parsed];
              });
            } else if (payload.eventType === 'UPDATE') {
              const updatedG = payload.new;
              const parsed: GiftCard = {
                id: Number(updatedG.id),
                code: updatedG.code,
                initial_balance: Number(updatedG.initial_balance),
                current_balance: Number(updatedG.current_balance),
                is_active: Boolean(updatedG.is_active)
              };
              setGiftCards(prev => prev.map(g => g.id === parsed.id ? parsed : g));
            } else if (payload.eventType === 'DELETE') {
              const idToDelete = payload.old?.id;
              if (idToDelete) {
                setGiftCards(prev => prev.filter(g => g.id !== Number(idToDelete)));
              }
            }
          }
        )
        .subscribe();

      // 6. Settings Realtime
      settingsChannel = posClient
        .channel('realtime_settings_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pos_settings' },
          (payload) => {
            if (!isMounted) return;
            console.log('⚡ Realtime Settings Event received:', payload.eventType);
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const settings = payload.new;
              if (settings && settings.id === 'default') {
                setOrderStopActive(Boolean(settings.order_stop_active));
                setPickupClosed(Boolean(settings.pickup_closed));

                if (settings.order_stop_text) {
                  setOrderStopTextState(settings.order_stop_text);
                  localStorage.setItem('wd_order_stop_text', settings.order_stop_text);
                } else if (settings.news_config && typeof settings.news_config === 'object' && settings.news_config.orderStopText) {
                  setOrderStopTextState(settings.news_config.orderStopText);
                  localStorage.setItem('wd_order_stop_text', settings.news_config.orderStopText);
                }

                if (settings.order_stop_config && typeof settings.order_stop_config === 'object') {
                  setOrderStopConfig(settings.order_stop_config);
                  localStorage.setItem('wd_order_stop_config', JSON.stringify(settings.order_stop_config));
                }
                if (settings.branding_config && typeof settings.branding_config === 'object') {
                  setCustomBranding(settings.branding_config);
                  localStorage.setItem('wd_custom_branding', JSON.stringify(settings.branding_config));
                }

                if (settings.news_config && typeof settings.news_config === 'object') {
                  localStorage.setItem('wd_pickup_news_config_v2', JSON.stringify(settings.news_config));
                  window.dispatchEvent(new Event('wd_news_config_updated'));
                }
                if (settings.custom_news_items && Array.isArray(settings.custom_news_items)) {
                  localStorage.setItem('wd_pickup_custom_items_v2', JSON.stringify(settings.custom_news_items));
                  window.dispatchEvent(new Event('wd_news_config_updated'));
                }
                if (settings.blocked_devices && Array.isArray(settings.blocked_devices)) {
                  setBlockedDevices(settings.blocked_devices);
                  localStorage.setItem('wd_blocked_devices', JSON.stringify(settings.blocked_devices));
                }
              }
            }
          }
        )
        .subscribe();

      // 7. Cash Requests Realtime
      cashReqChannel = posClient
        .channel('realtime_cash_requests_live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'cash_requests' },
          (payload) => {
            if (!isMounted) return;
            console.log('⚡ Realtime Cash Request Event received:', payload.eventType);
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const parsed = formatDbCashRequest(payload.new);
              setCashRequests(prev => {
                const idx = prev.findIndex(r => r.id === parsed.id);
                if (idx !== -1) {
                  const copy = [...prev];
                  copy[idx] = { ...copy[idx], ...parsed };
                  return copy;
                }
                return [parsed, ...prev];
              });
              if (payload.eventType === 'INSERT' && parsed.status === 'pending') {
                try { AudioFX.bell(); } catch {}
              }
            } else if (payload.eventType === 'DELETE') {
              const reqId = payload.old?.req_id || `req_${payload.old?.id}`;
              if (reqId) {
                setCashRequests(prev => prev.filter(r => r.id !== reqId));
              }
            }
          }
        )
        .subscribe();

      // 8. Global Announcement Broadcast Channel
      const broadcastChannel = posClient.channel('global_audio_broadcast');
      broadcastChannelRef = broadcastChannel;
      broadcastChannel
        .on('broadcast', { event: 'speak_order' }, (payload: any) => {
          if (!isMounted) return;
          console.log('📣 Received cross-device order speak broadcast:', payload);
          if (payload && payload.payload) {
            const { orderNo, identifier, orderType } = payload.payload;
            AudioFX.speakOrder(orderNo, identifier, orderType, true, true); // force=true, fromBroadcast=true
          }
        })
        .on('broadcast', { event: 'speak_text' }, (payload: any) => {
          if (!isMounted) return;
          console.log('📣 Received cross-device custom text speak broadcast:', payload);
          if (payload && payload.payload) {
            const { text, orderNo, target } = payload.payload;
            AudioFX.playSpeech(text, orderNo, target, true); // fromBroadcast=true
          }
        })
        .on('broadcast', { event: 'wd_device_blocked' }, (payload: any) => {
          if (!isMounted) return;
          console.log('📣 Received live device blocked broadcast:', payload);
          if (payload && payload.payload && Array.isArray(payload.payload.blocked_devices)) {
            const updated = payload.payload.blocked_devices;
            setBlockedDevices(updated);
            localStorage.setItem('wd_blocked_devices', JSON.stringify(updated));
          }
        })
        .on('broadcast', { event: 'wd_security_state_sync' }, (payload: any) => {
          if (!isMounted || !payload?.payload) return;
          const { username, is_shadowbanned, is_banned, is_suspended, tables_frozen } = payload.payload;
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
        })
        .subscribe((status: any) => {
          if (status === 'SUBSCRIBED' && isMounted) {
            console.log('🟢 Audio Broadcast Channel subscribed successfully!');
            AudioFX.setBroadcastSender((event: string, pld: any) => {
              broadcastChannel.send({
                type: 'broadcast',
                event,
                payload: pld
              }).catch((e: any) => console.warn('Broadcast send error:', e));
            });
          }
        });

    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }

    return () => {
      isMounted = false;
      AudioFX.setBroadcastSender(() => {});
      if (orderChannel && posClient) posClient.removeChannel(orderChannel);
      if (bankChannel && (payClient || posClient)) (payClient || posClient).removeChannel(bankChannel);
      if (prodChannel && posClient) posClient.removeChannel(prodChannel);
      if (couponChannel && posClient) posClient.removeChannel(couponChannel);
      if (gcChannel && posClient) posClient.removeChannel(gcChannel);
      if (settingsChannel && posClient) posClient.removeChannel(settingsChannel);
      if (cashReqChannel && posClient) posClient.removeChannel(cashReqChannel);
      if (broadcastChannelRef && posClient) posClient.removeChannel(broadcastChannelRef);
    };
  }, [posClient, payClient]);

  // Test Supabase Connection
  const testConnection = async (): Promise<{ success: boolean; message: string }> => {
    try {
      if (!posClient) throw new Error("Geen Supabase client beschikbaar.");
      const { error: posErr } = await posClient.from('orders').select('id').limit(1);
      const targetPay = payClient || posClient;
      const { error: payErr } = await targetPay.from('bank_accounts').select('id').limit(1);

      if (posErr && payErr) {
        return {
          success: false,
          message: `Verbinding mislukt. Zorg dat het SQL script is uitgevoerd in Supabase! Fout: ${posErr.message || payErr.message}`
        };
      }

      setIsOnline(true);
      setConnectionText('Online & Realtime gesynchroniseerd');
      return {
        success: true,
        message: 'Verbinding met Supabase is geslaagd! Tabellen zijn bereikbaar.'
      };
    } catch (e: any) {
      return {
        success: false,
        message: e.message || 'Onbekende fout bij verbinden met Supabase.'
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

    if (posClient) {
      // Create a copy of current news configuration and put orderStopText in there
      let newsCfg: any = {};
      try {
        const saved = localStorage.getItem('wd_pickup_news_config_v2');
        if (saved) newsCfg = JSON.parse(saved);
      } catch {}
      newsCfg.orderStopText = text;

      const updatePayload: any = {
        id: 'default',
        order_stop_active: active,
        pickup_closed: pickupClosed,
        news_config: newsCfg,
        order_stop_text: text,
        order_stop_config: nextConfig
      };

      await posClient.from('pos_settings').upsert(updatePayload);
    }
  };

  const updateCustomBranding = async (config: Partial<CustomBrandingConfig>) => {
    const nextBranding = { ...customBranding, ...config };
    setCustomBranding(nextBranding);
    localStorage.setItem('wd_custom_branding', JSON.stringify(nextBranding));

    if (posClient) {
      try {
        await posClient.from('pos_settings').upsert({
          id: 'default',
          branding_config: nextBranding,
          updated_at: new Date().toISOString()
        });
        showToast('Branding instellingen succesvol opgeslagen!', 'success');
      } catch (e) {
        console.error('Fout bij opslaan branding_config:', e);
        showToast('Fout bij opslaan branding in database.', 'error');
      }
    }
  };

  const toggleOrderStop = async () => {
    const nextVal = !orderStopActive;
    
    if (posClient) {
      await posClient.from('pos_settings').upsert({
        id: 'default',
        order_stop_active: nextVal,
        order_stop_text: orderStopText
      });
    }

    setOrderStopActive(nextVal);
    localStorage.setItem('wd_order_stop', String(nextVal));
  };

  const togglePickupClosed = async () => {
    const nextVal = !pickupClosed;
    
    if (posClient) {
      await posClient.from('pos_settings').upsert({
        id: 'default',
        pickup_closed: nextVal,
        order_stop_text: orderStopText
      });
    }

    setPickupClosed(nextVal);
  };

  // Inventory deductions
  const deductInventoryForItems = (orderItems: CartItem[]) => {
    setInventory(prev => {
      const updated = [...prev];
      orderItems.forEach(item => {
        const name = item.name.toLowerCase();
        const qty = item.qty;

        if (name.includes('burger') || name.includes('mac') || name.includes('quarter') || name.includes('tasty')) {
          const bun = updated.find(i => i.item_name.includes('Broodjes'));
          if (bun && bun.stock_qty >= qty) bun.stock_qty -= qty;
          const beef = updated.find(i => i.item_name.includes('Rundvlees'));
          if (beef && beef.stock_qty >= qty) beef.stock_qty -= (name.includes('double') ? qty * 2 : qty);
        }
        if (name.includes('chicken') || name.includes('kip') || name.includes('nugget')) {
          const chicken = updated.find(i => i.item_name.includes('Kip'));
          if (chicken && chicken.stock_qty >= qty) chicken.stock_qty -= qty;
        }
        if (name.includes('friet') || name.includes('menu')) {
          const fries = updated.find(i => i.item_name.includes('Friet'));
          if (fries && fries.stock_qty > 0) fries.stock_qty = Math.max(0, fries.stock_qty - Math.ceil(qty * 0.1));
        }
      });
      return updated;
    });
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
      const targetClient = payClient || posClient;

      if (mode === 'quick') {
        if (!currentBankAccount) {
          return { success: false, message: 'Geen actief WerkPay account ingelogd!' };
        }
        // Strict Security: Require PIN verification even on quick pay!
        const pin = String(paymentMeta.pin || '').trim();
        if (!pin) {
          return { success: false, message: 'Voer uw 4-cijferige pincode in om de betaling te autoriseren.' };
        }
        const validPin = (currentBankAccount.pin_code && currentBankAccount.pin_code === pin) || 
                         (currentBankAccount.password && currentBankAccount.password === pin);
        if (!validPin) {
          return { success: false, message: 'Onjuiste pincode! Betaling op deze rekening is geweigerd.' };
        }
        chargedAccount = currentBankAccount;
      } else if (mode === 'login') {
        const username = paymentMeta.username?.trim().toLowerCase();
        const password = paymentMeta.password?.trim();
        if (!username || !password) {
          return { success: false, message: 'Voer zowel gebruikersnaam als wachtwoord/pin in!' };
        }

        chargedAccount = bankAccounts.find(
          a => a.username.toLowerCase() === username && (a.password === password || a.pin_code === password)
        ) || null;

        // Try Supabase if not found locally
        if (!chargedAccount && targetClient) {
          try {
            const { data } = await targetClient
              .from('bank_accounts')
              .select('*')
              .ilike('username', username)
              .or(`password.eq.${password},pin_code.eq.${password}`)
              .single();
            if (data) {
              chargedAccount = {
                id: data.id,
                username: data.username,
                account_holder: data.account_holder,
                card_uid: data.card_uid,
                pin_code: data.pin_code,
                balance: Number(data.balance),
                is_admin: Boolean(data.is_admin)
              };
            }
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

        chargedAccount = bankAccounts.find(a => {
          const matchUid = accountMatchesUid(a, cleanUid);
          const matchPin = (a.pin_code === pin || a.password === pin);
          return matchUid && matchPin;
        }) || null;

        // Try Supabase if not found locally (supports spaces, casing & linked_uids)
        if (!chargedAccount && targetClient) {
          try {
            const { data: allDbAccs } = await targetClient
              .from('bank_accounts')
              .select('*');
            const matchedRow = (allDbAccs || []).find((row: any) => {
              const candidate: BankAccount = {
                id: row.id,
                username: row.username,
                account_holder: row.account_holder,
                card_uid: row.card_uid,
                linked_uids: parseLinkedUids(row.linked_uids),
                pin_code: row.pin_code,
                password: row.password,
                balance: Number(row.balance),
                is_admin: Boolean(row.is_admin)
              };
              const matchPin = candidate.pin_code === pin || candidate.password === pin;
              return matchPin && accountMatchesUid(candidate, cleanUid);
            });
            if (matchedRow) {
              chargedAccount = {
                id: matchedRow.id,
                username: matchedRow.username,
                account_holder: matchedRow.account_holder,
                card_uid: matchedRow.card_uid,
                linked_uids: parseLinkedUids(matchedRow.linked_uids),
                pin_code: matchedRow.pin_code,
                balance: Number(matchedRow.balance),
                is_admin: Boolean(matchedRow.is_admin)
              };
            }
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

      // Debit account with strict 2-decimal cent precision
      const newBal = chargedAccount.is_admin 
        ? chargedAccount.balance 
        : Math.max(0, Math.round((chargedAccount.balance - finalTotal) * 100) / 100);
      setBankAccounts(prev => prev.map(a => a.id === chargedAccount!.id ? { ...a, balance: newBal } : a));
      if (currentBankAccount && currentBankAccount.id === chargedAccount.id) {
        setCurrentBankAccount(prev => prev ? { ...prev, balance: newBal } : null);
      }

      // Determine brand for proper transaction logging
      const currentBrandKey = activeBrand || 'koekploeg';
      const isKoekploegBrand = currentBrandKey === 'koekploeg';
      const brandName = isKoekploegBrand ? 'De Koekploeg' : 'WerkPay';
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

      // Call Supabase RPC / update if online
      if (targetClient) {
        try {
          if (mode === 'card' || mode === 'terminal') {
            await targetClient.rpc('werkpay_charge_by_card', {
              p_card_uid: chargedAccount.card_uid || paymentMeta.cardUid,
              p_pin: paymentMeta.pin,
              p_amount: finalTotal,
              p_reference: `${isKoekploegBrand ? 'KP' : 'WD'}-ORD-${orderNo}`,
              p_cashier: currentPosUser?.name || `${brandName} Kassa`,
              p_order_no: orderNo,
              p_brand: brandName
            });
          } else {
            await targetClient.rpc('werkpay_charge_by_login', {
              p_username: chargedAccount.username,
              p_password: chargedAccount.password || paymentMeta.password || paymentMeta.pin,
              p_amount: finalTotal,
              p_reference: `${isKoekploegBrand ? 'KP' : 'WD'}-ORD-${orderNo}`,
              p_cashier: currentPosUser?.name || `${brandName} Kassa`,
              p_order_no: orderNo,
              p_brand: brandName
            });
          }
          // Direct table update fallback
          await targetClient
            .from('bank_accounts')
            .update({ balance: newBal })
            .eq('id', chargedAccount.id);
        } catch {
          // Handled gracefully
        }
      }

      paymentMeta.account = chargedAccount.username;
      paymentMeta.balance_after = newBal;
      paymentMeta.brand = currentBrandKey;
      paymentMeta.brandName = brandName;
    }

    // 2. Gift card deduction
    if (method === 'giftcard') {
      const card = giftCards.find(g => g.code === paymentMeta.code && g.is_active);
      if (!card) return { success: false, message: 'Ongeldige cadeaubon!' };
      if (card.current_balance < finalTotal) {
        return { success: false, message: `Onvoldoende saldo op cadeaubon (${card.current_balance.toFixed(2)})` };
      }
      const nextBalance = card.current_balance - finalTotal;
      setGiftCards(prev => prev.map(g => g.id === card.id ? { ...g, current_balance: nextBalance } : g));
      if (posClient) {
        try {
          await posClient.from('gift_cards').update({ current_balance: nextBalance }).eq('id', card.id);
        } catch (err) {
          console.error('Error updating gift card balance in DB during checkout:', err);
        }
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
      notes: paymentMeta?.note || '',
      paymentMethod: method,
      paymentMeta,
      cashier: currentPosUser?.name || 'Kassa',
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

    // 5. Audio chime & print receipt
    AudioFX.bell();
    setActiveReceiptOrder(newOrder);
    setTrackedOrderNo(newOrder.no);
    addMyOrderNumber(newOrder.no);

    // 6. Push to Supabase if online
    if (posClient) {
      try {
        await posClient.from('orders').insert({
          order_no: newOrder.no,
          items: newOrder.items,
          total: newOrder.total,
          discount: newOrder.discount,
          order_type: newOrder.orderType,
          identifier: newOrder.identifier,
          notes: newOrder.notes,
          payment_method: newOrder.paymentMethod,
          payment_meta: newOrder.paymentMeta,
          cashier: newOrder.cashier,
          status: newOrder.status
        });
      } catch (err) {
        console.warn('Supabase insert order error:', err);
      }
    }

    // Instant cross-tab broadcast for other open windows
    broadcastSync('SYNC_ORDER_NEW', newOrder);

    return {
      success: true,
      message: `Bestelling #${newOrder.no} is succesvol geplaatst!`,
      order: newOrder
    };
  };

  const updateOrderStatus = async (orderNum: number, newStatus: OrderStatus) => {
    const now = Date.now();
    let updatedItemsList: any[] | undefined = undefined;
    let currentOrder: Order | undefined;

    setOrders(prev => {
      currentOrder = prev.find(o => o.no === orderNum);
      return prev.map(o => {
        if (o.no !== orderNum) return o;

        // User directive: "als het is ingepakt moeten de statussen van de producten ook naar klaar"
        let items = o.items;
        if (newStatus === 'klaar' || newStatus === 'done') {
          items = o.items.map(it => ({
            ...it,
            stage: 'klaar' as OrderItemStage,
            done: true
          }));
          updatedItemsList = items;
        } else if (newStatus === 'inpakken') {
          items = o.items.map(it => ({
            ...it,
            stage: (it.stage === 'wachten' || it.stage === 'bereiden') ? ('inpakken' as OrderItemStage) : it.stage
          }));
          updatedItemsList = items;
        }

        return {
          ...o,
          status: newStatus,
          items,
          updatedAt: now
        };
      });
    });

    recordLocalOrderMutation(orderNum, { status: newStatus, items: updatedItemsList });

    if (newStatus === 'done' || newStatus === 'klaar') {
      const orderToAnnounce = currentOrder || orders.find(o => o.no === orderNum);
      if (orderToAnnounce && orderToAnnounce.orderType !== 'delivery') {
        AudioFX.speakOrder(orderNum, orderToAnnounce.identifier, orderToAnnounce.orderType);
      }
    }

    broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: newStatus, items: updatedItemsList, updatedAt: now });

    if (posClient) {
      try {
        const updatePayload: any = { status: newStatus };
        if (updatedItemsList) {
          updatePayload.items = updatedItemsList;
        }
        const { error } = await posClient.from('orders').update(updatePayload).eq('order_no', orderNum);
        if (error) {
          console.warn('⚠️ Supabase order status update niet opgeslagen in cloud:', error.message);
        }
      } catch (err) {
        console.warn('Supabase order status update error:', err);
      }
    }
  };

  const updateOrderItemStage = async (orderNum: number, itemIndex: number, stage: OrderItemStage) => {
    const now = Date.now();
    let nextItems: any[] | null = null;
    let calculatedNextStatus: OrderStatus | null = null;
    let statusChanged = false;
    let targetOrderBefore: Order | undefined;

    setOrders(prev => {
      const targetOrder = prev.find(o => o.no === orderNum);
      if (!targetOrder) return prev;
      targetOrderBefore = targetOrder;

      nextItems = [...targetOrder.items];
      if (nextItems[itemIndex]) {
        nextItems[itemIndex] = {
          ...nextItems[itemIndex],
          stage,
          done: stage === 'klaar'
        };
      }

      calculatedNextStatus = getMajorityStatus(nextItems);
      statusChanged = targetOrder.status !== calculatedNextStatus;

      // Sync to LocalStorage inside the state updater so we are guaranteed to have the correct state
      const currentStored = localStorage.getItem('wd_orders');
      if (currentStored) {
        try {
          const parsed: Order[] = JSON.parse(currentStored);
          const updated = parsed.map(o => o.no === orderNum ? { 
            ...o, 
            items: nextItems!, 
            status: statusChanged ? calculatedNextStatus! : o.status,
            updatedAt: now 
          } : o);
          localStorage.setItem('wd_orders', JSON.stringify(updated));
        } catch {}
      }

      return prev.map(o => o.no === orderNum ? { 
        ...o, 
        items: nextItems!, 
        status: statusChanged ? calculatedNextStatus! : o.status,
        updatedAt: now 
      } : o);
    });

    // Run this in the next microtask or slightly deferred so we have the calculated nextItems
    setTimeout(async () => {
      if (nextItems) {
        recordLocalOrderMutation(orderNum, { items: nextItems });
        broadcastSync('SYNC_ORDER_ITEMS', { orderNo: orderNum, items: nextItems, updatedAt: now });

        if (statusChanged && calculatedNextStatus) {
          recordLocalOrderMutation(orderNum, { status: calculatedNextStatus });
          broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: calculatedNextStatus, updatedAt: now });

          if (calculatedNextStatus === 'klaar') {
            const orderToAnnounce = targetOrderBefore;
            if (orderToAnnounce && orderToAnnounce.orderType !== 'delivery') {
              AudioFX.speakOrder(orderNum, orderToAnnounce.identifier, orderToAnnounce.orderType);
            }
          }
        }

        if (posClient) {
          try {
            const updatePayload: any = { items: nextItems };
            if (statusChanged && calculatedNextStatus) {
              updatePayload.status = calculatedNextStatus;
            }
            await posClient.from('orders').update(updatePayload).eq('order_no', orderNum);
          } catch {}
        }
      }
    }, 10);
  };

  const toggleOrderItemDone = async (orderNum: number, itemIndex: number) => {
    const now = Date.now();
    let nextItems: any[] | null = null;
    let calculatedNextStatus: OrderStatus | null = null;
    let statusChanged = false;
    let targetOrderBefore: Order | undefined;

    setOrders(prev => {
      const targetOrder = prev.find(o => o.no === orderNum);
      if (!targetOrder) return prev;
      targetOrderBefore = targetOrder;

      nextItems = [...targetOrder.items];
      if (nextItems[itemIndex]) {
        const nextDone = !nextItems[itemIndex].done;
        nextItems[itemIndex] = {
          ...nextItems[itemIndex],
          done: nextDone,
          stage: nextDone ? 'klaar' : 'wachten'
        };
      }

      calculatedNextStatus = getMajorityStatus(nextItems);
      statusChanged = targetOrder.status !== calculatedNextStatus;

      const currentStored = localStorage.getItem('wd_orders');
      if (currentStored) {
        try {
          const parsed: Order[] = JSON.parse(currentStored);
          const updated = parsed.map(o => o.no === orderNum ? { 
            ...o, 
            items: nextItems!, 
            status: statusChanged ? calculatedNextStatus! : o.status,
            updatedAt: now 
          } : o);
          localStorage.setItem('wd_orders', JSON.stringify(updated));
        } catch {}
      }

      return prev.map(o => o.no === orderNum ? { 
        ...o, 
        items: nextItems!, 
        status: statusChanged ? calculatedNextStatus! : o.status,
        updatedAt: now 
      } : o);
    });

    setTimeout(async () => {
      if (nextItems) {
        recordLocalOrderMutation(orderNum, { items: nextItems });
        broadcastSync('SYNC_ORDER_ITEMS', { orderNo: orderNum, items: nextItems, updatedAt: now });

        if (statusChanged && calculatedNextStatus) {
          recordLocalOrderMutation(orderNum, { status: calculatedNextStatus });
          broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: calculatedNextStatus, updatedAt: now });

          if (calculatedNextStatus === 'klaar') {
            const orderToAnnounce = targetOrderBefore;
            if (orderToAnnounce && orderToAnnounce.orderType !== 'delivery') {
              AudioFX.speakOrder(orderNum, orderToAnnounce.identifier, orderToAnnounce.orderType);
            }
          }
        }

        if (posClient) {
          try {
            const updatePayload: any = { items: nextItems };
            if (statusChanged && calculatedNextStatus) {
              updatePayload.status = calculatedNextStatus;
            }
            await posClient.from('orders').update(updatePayload).eq('order_no', orderNum);
          } catch {}
        }
      }
    }, 10);
  };

  const toggleOrderPrio = async (orderNum: number) => {
    const now = Date.now();
    let targetPrio = false;
    setOrders(prev => prev.map(o => {
      if (o.no !== orderNum) return o;
      targetPrio = !o.isPrio;
      return { ...o, isPrio: targetPrio, updatedAt: now };
    }));
    recordLocalOrderMutation(orderNum, { isPrio: targetPrio });
    broadcastSync('SYNC_ORDER_PRIO', { orderNo: orderNum, isPrio: targetPrio, updatedAt: now });
  };

  const setAllOrderItemsDone = async (orderNum: number, done: boolean) => {
    const now = Date.now();
    let nextItems: any[] | null = null;
    const nextStage: OrderItemStage = done ? 'klaar' : 'wachten';
    const nextStatus: OrderStatus = done ? 'klaar' : 'wachten';
    let statusChanged = false;
    let targetOrderBefore: Order | undefined;

    setOrders(prev => {
      const targetOrder = prev.find(o => o.no === orderNum);
      if (!targetOrder) return prev;
      targetOrderBefore = targetOrder;
      statusChanged = targetOrder.status !== nextStatus;

      nextItems = targetOrder.items.map(it => ({ ...it, done, stage: nextStage }));

      const currentStored = localStorage.getItem('wd_orders');
      if (currentStored) {
        try {
          const parsed: Order[] = JSON.parse(currentStored);
          const updated = parsed.map(o => o.no === orderNum ? { 
            ...o, 
            items: nextItems!, 
            status: statusChanged ? nextStatus : o.status,
            updatedAt: now 
          } : o);
          localStorage.setItem('wd_orders', JSON.stringify(updated));
        } catch {}
      }

      return prev.map(o => o.no === orderNum ? { 
        ...o, 
        items: nextItems!, 
        status: statusChanged ? nextStatus : o.status,
        updatedAt: now 
      } : o);
    });

    setTimeout(async () => {
      if (nextItems) {
        recordLocalOrderMutation(orderNum, { items: nextItems });
        broadcastSync('SYNC_ORDER_ITEMS', { orderNo: orderNum, items: nextItems, updatedAt: now });

        if (statusChanged) {
          recordLocalOrderMutation(orderNum, { status: nextStatus });
          broadcastSync('SYNC_ORDER_STATUS', { orderNo: orderNum, status: nextStatus, updatedAt: now });

          if (nextStatus === 'klaar') {
            const orderToAnnounce = targetOrderBefore;
            if (orderToAnnounce && orderToAnnounce.orderType !== 'delivery') {
              AudioFX.speakOrder(orderNum, orderToAnnounce.identifier, orderToAnnounce.orderType);
            }
          }
        }

        if (posClient) {
          try {
            const updatePayload: any = { items: nextItems };
            if (statusChanged) {
              updatePayload.status = nextStatus;
            }
            await posClient.from('orders').update(updatePayload).eq('order_no', orderNum);
          } catch {}
        }
      }
    }, 10);
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
    if (posClient) {
      try {
        const { error } = await posClient.from('orders').delete().eq('order_no', orderNum);
        if (error) {
          console.warn('Supabase delete order error:', error.message);
        }
      } catch {}
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

    if (posClient) {
      posClient.from('cash_requests').insert({
        req_id: reqId,
        order_no: orderNo,
        order_type: orderType,
        identifier: identifier,
        amount: total,
        cashier: identifier,
        status: 'pending'
      }).then(({ error }) => {
        if (error) console.warn('Supabase cash_requests insert error:', error);
      });
    }

    return newReq;
  };

  const approveCashRequest = (
    requestId: string,
    approvedBy: string,
    received: number,
    change: number
  ) => {
    const updated = cashRequests.map(r =>
      r.id === requestId
        ? { ...r, status: 'approved' as const, approvedBy, received, change }
        : r
    );
    syncCashRequests(updated);

    if (posClient) {
      posClient.from('cash_requests').update({
        status: 'approved',
        approved_by: approvedBy,
        received: received,
        change: change
      }).or(`req_id.eq.${requestId},id.eq.${requestId.replace('req_', '')}`)
        .then(({ error }) => {
          if (error) console.warn('Supabase cash_requests approve error:', error);
        });
    }
  };

  const rejectCashRequest = (requestId: string, reason?: string) => {
    const rejectedReason = reason || 'Geweigerd door medewerker';
    const updated = cashRequests.map(r =>
      r.id === requestId
        ? { ...r, status: 'rejected' as const, rejectedReason }
        : r
    );
    syncCashRequests(updated);

    if (posClient) {
      posClient.from('cash_requests').update({
        status: 'rejected',
        rejected_reason: rejectedReason
      }).or(`req_id.eq.${requestId},id.eq.${requestId.replace('req_', '')}`)
        .then(({ error }) => {
          if (error) console.warn('Supabase cash_requests reject error:', error);
        });
    }
  };

  // WerkPay Actions
  const loginWerkPay = async (
    username: string,
    secret: string,
    mode: 'password' | 'pin'
  ): Promise<{ success: boolean; message: string }> => {
    const cleanUser = username.trim().toLowerCase();
    const acc = bankAccounts.find(a => {
      if (a.username.toLowerCase() !== cleanUser) return false;
      return mode === 'pin' ? a.pin_code === secret : a.password === secret;
    });

    if (!acc) {
      return { success: false, message: `Ongeldige gebruikersnaam of ${mode === 'pin' ? 'pincode' : 'wachtwoord'}.` };
    }

    // Normale WerkPay login vraagt geen 2FA; 2FA wordt alleen gevraagd bij toegang tot het Manager Menu.
    setPending2FALogin(null);
    setCurrentBankAccount(acc);
    return { success: true, message: `Welkom terug, ${acc.account_holder}!` };
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

    const newBal = currentBankAccount.balance + amount;
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

    if (payClient || posClient) {
      const client = payClient || posClient;
      try {
        await client?.from('bank_accounts').update({ balance: newBal }).eq('id', updated.id);
      } catch {}
    }

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

    if (payClient || posClient) {
      const client = payClient || posClient;
      try {
        await client?.from('bank_accounts').update({ balance: newBal }).eq('id', updated.id);
      } catch {}
    }

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

    if (posClient) {
      try {
        await posClient.from('pos_settings').upsert({
          id: 'default',
          order_stop_active: orderStopActive,
          pickup_closed: pickupClosed,
          blocked_devices: nextList,
          updated_at: new Date().toISOString()
        });

        // Broadcast realtime event so all devices block IMMEDIATELY without reload
        const bc = posClient.channel('global_audio_broadcast');
        bc.send({
          type: 'broadcast',
          event: 'wd_device_blocked',
          payload: { blocked_devices: nextList, newItem }
        }).catch(() => {});
      } catch (err) {
        console.error('Error saving block:', err);
      }
    }

    return { success: true, message: `${type === 'ip' ? 'IP-adres' : 'Apparaat'} "${cleanVal}" direct live geblokkeerd!` };
  };

  const unblockDeviceOrIp = async (value: string): Promise<{ success: boolean; message: string }> => {
    const cleanVal = value.trim().toLowerCase();
    const nextList = blockedDevices.filter(b => b.value.trim().toLowerCase() !== cleanVal);
    setBlockedDevices(nextList);
    localStorage.setItem('wd_blocked_devices', JSON.stringify(nextList));

    if (posClient) {
      try {
        await posClient.from('pos_settings').upsert({
          id: 'default',
          order_stop_active: orderStopActive,
          pickup_closed: pickupClosed,
          blocked_devices: nextList,
          updated_at: new Date().toISOString()
        });

        const bc = posClient.channel('global_audio_broadcast');
        bc.send({
          type: 'broadcast',
          event: 'wd_device_blocked',
          payload: { blocked_devices: nextList }
        }).catch(() => {});
      } catch (err) {
        console.error('Error saving unblock:', err);
      }
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

    if (posClient) {
      try {
        await posClient.from('pos_settings').upsert({
          id: 'default',
          order_stop_active: orderStopActive,
          pickup_closed: pickupClosed,
          blocked_devices: updated,
          updated_at: new Date().toISOString()
        });

        const bc = posClient.channel('global_audio_broadcast');
        bc.send({
          type: 'broadcast',
          event: 'wd_device_blocked',
          payload: { blocked_devices: updated }
        }).catch(() => {});
      } catch (err) {
        console.error('Error blocking all other devices:', err);
      }
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
    const recipient = bankAccounts.find(
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

    // Debit sender (unless God mode)
    const senderBal = currentBankAccount.is_admin 
      ? currentBankAccount.balance 
      : Math.max(0, Math.round((currentBankAccount.balance - amount) * 100) / 100);
    const updatedSender = { ...currentBankAccount, balance: senderBal };
    setCurrentBankAccount(updatedSender);

    // Credit recipient
    const recipientBal = Math.round((recipient.balance + amount) * 100) / 100;
    const updatedRecipient = { ...recipient, balance: recipientBal };

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

    if (payClient || posClient) {
      const client = payClient || posClient;
      try {
        if (!currentBankAccount.is_admin) {
          await client?.from('bank_accounts').update({ balance: senderBal }).eq('id', updatedSender.id);
        }
        await client?.from('bank_accounts').update({ balance: recipientBal }).eq('id', updatedRecipient.id);
      } catch {}
    }

    return { success: true, message: `€ ${amount.toFixed(2)} overgemaakt naar ${recipient.account_holder}!` };
  };

  const changeWerkPayPin = async (newPin: string): Promise<{ success: boolean; message: string }> => {
    if (!currentBankAccount) return { success: false, message: 'Niet ingelogd.' };
    if (newPin.trim().length < 4) return { success: false, message: 'Pincode moet minstens 4 tekens lang zijn.' };

    const updated = { ...currentBankAccount, pin_code: newPin.trim() };
    setCurrentBankAccount(updated);
    setBankAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));

    if (payClient || posClient) {
      const client = payClient || posClient;
      try {
        await client?.from('bank_accounts').update({ pin_code: newPin.trim() }).eq('id', updated.id);
      } catch {}
    }

    return { success: true, message: 'Pincode succesvol gewijzigd!' };
  };

  const saveBankAccount = async (
    acc: Partial<BankAccount> & { id?: number | string }
  ): Promise<{ success: boolean; message?: string }> => {
    const cleanTargetUsername = acc.username ? acc.username.trim().toLowerCase() : '';
    const existingAcc = bankAccounts.find(
      a => (acc.id !== undefined && a.id === acc.id) || (cleanTargetUsername && a.username.toLowerCase() === cleanTargetUsername)
    );

    const normalizeAccountUidField = (raw?: string): string => {
      const trimmed = String(raw || '').trim();
      if (!trimmed) return generateVirtualCardUid();
      return isVirtualCardNumber(trimmed)
        ? normalizeCardUid(trimmed).replace(/(.{4})/g, '$1 ').trim()
        : normalizeCardUid(trimmed);
    };

    const client = payClient || posClient;
    let nextAccounts: BankAccount[] = [...bankAccounts];
    let savedRecord: BankAccount;

    if (existingAcc) {
      const mergedCardUid =
        acc.card_uid !== undefined ? normalizeAccountUidField(acc.card_uid) : existingAcc.card_uid;
      const mergedLinkedUids: LinkedNfcTag[] =
        acc.linked_uids !== undefined
          ? parseLinkedUids(acc.linked_uids)
          : parseLinkedUids(existingAcc.linked_uids || []);

      savedRecord = {
        ...existingAcc,
        ...acc,
        id: existingAcc.id,
        card_uid: mergedCardUid,
        linked_uids: mergedLinkedUids,
      };
    } else {
      const newCardUid = normalizeAccountUidField(acc.card_uid);
      const newLinkedUids = parseLinkedUids(acc.linked_uids || []);
      savedRecord = {
        id: Date.now(),
        username: acc.username?.trim() || `klant_${Date.now()}`,
        password: acc.password || '1234',
        account_holder: acc.account_holder?.trim() || 'Nieuwe Klant',
        card_uid: newCardUid,
        linked_uids: newLinkedUids,
        pin_code: acc.pin_code || '1234',
        balance: Number(acc.balance || 0),
        is_admin: Boolean(acc.is_admin),
      };
    }

    // Verzamel alle UID's van dit account om eventuele dubbele koppelingen bij andere accounts netjes over te zetten
    const claimedPhysicalUids = new Set<string>();
    const primClean = normalizeCardUid(savedRecord.card_uid);
    if (primClean && !isVirtualCardNumber(primClean)) claimedPhysicalUids.add(primClean);
    for (const tag of savedRecord.linked_uids || []) {
      if (tag.uid) claimedPhysicalUids.add(tag.uid);
    }

    const displacedAccounts: BankAccount[] = [];
    nextAccounts = nextAccounts.map((other) => {
      if (other.id === savedRecord.id || other.username.toLowerCase() === savedRecord.username.toLowerCase()) {
        return other;
      }
      let changed = false;
      let nextOtherCard = other.card_uid;
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
        a.id === savedRecord.id || a.username.toLowerCase() === savedRecord.username.toLowerCase()
          ? savedRecord
          : a
      );
    } else {
      nextAccounts = [...nextAccounts, savedRecord];
    }

    // Direct React state + localStorage + cross-tab bijwerken (GEEN async updater bug!)
    setBankAccounts(nextAccounts);
    if (
      currentBankAccount &&
      (currentBankAccount.id === savedRecord.id ||
        currentBankAccount.username.toLowerCase() === savedRecord.username.toLowerCase())
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

    if (!client) {
      return { success: true, message: 'Lokaal opgeslagen (offline modus).' };
    }

    // Helper voor veilige Supabase write (valt terug zonder linked_uids als oude SQL nog draait)
    const persistAccountToSupabase = async (record: BankAccount, isInsert: boolean) => {
      const basePayload: Record<string, any> = {
        username: record.username,
        account_holder: record.account_holder,
        card_uid: record.card_uid,
        pin_code: record.pin_code || '1234',
        balance: Number(record.balance || 0),
        is_admin: Boolean(record.is_admin),
      };
      if (record.password) basePayload.password = record.password;

      const withLinkedPayload = {
        ...basePayload,
        linked_uids: parseLinkedUids(record.linked_uids || []),
      };

      const runWrite = async (payload: Record<string, any>) => {
        if (isInsert) {
          return await client.from('bank_accounts').insert({
            ...payload,
            password: record.password || '1234',
          }).select('*');
        }
        if (typeof record.id === 'number' && record.id < 10000000000) {
          const res = await client.from('bank_accounts').update(payload).eq('id', record.id).select('*');
          if (!res.error && (!res.data || res.data.length === 0)) {
            return await client.from('bank_accounts').update(payload).ilike('username', record.username).select('*');
          }
          return res;
        }
        return await client.from('bank_accounts').update(payload).ilike('username', record.username).select('*');
      };

      let res = await runWrite(withLinkedPayload);
      if (
        res.error &&
        (String(res.error.code) === 'PGRST204' ||
          String(res.error.code) === '42703' ||
          String(res.error.message || '').toLowerCase().includes('linked_uids'))
      ) {
        res = await runWrite(basePayload);
      }
      return res;
    };

    try {
      // 1. Eerst oude houders van dezelfde fysieke UID vrijmaken in Supabase om UNIQUE conflicten te voorkomen
      for (const oldAcc of displacedAccounts) {
        await persistAccountToSupabase(oldAcc, false);
      }

      // 2. Daarna het doelaccount opslaan (insert of update)
      const res = await persistAccountToSupabase(savedRecord, !existingAcc);
      if (res.error) {
        console.error('Supabase saveBankAccount error:', res.error);
        showToast(`Fout bij opslaan naar Supabase: ${res.error.message}`, 'error');
        return { success: false, message: res.error.message };
      }

      if (res.data && res.data.length > 0) {
        const dbRow = res.data[0];
        setBankAccounts((prev) => {
          const synced = prev.map((a) =>
            a.username.toLowerCase() === savedRecord.username.toLowerCase()
              ? {
                  ...a,
                  id: dbRow.id,
                  card_uid: dbRow.card_uid ?? a.card_uid,
                  linked_uids: dbRow.linked_uids !== undefined ? parseLinkedUids(dbRow.linked_uids) : a.linked_uids,
                }
              : a
          );
          try {
            const snap = JSON.stringify(synced);
            cloudSnapshotsRef.current.bank = snap;
            localStorage.setItem('wd_bank_accounts', snap);
          } catch {}
          return synced;
        });
      }

      return { success: true, message: 'Opgeslagen in Supabase & lokaal.' };
    } catch (err: any) {
      console.error('Unexpected saveBankAccount error:', err);
      showToast(`Kon bankaccount/UID niet opslaan: ${err?.message || 'onbekende fout'}`, 'error');
      return { success: false, message: err?.message || 'Opslaan mislukt' };
    }
  };

  const deleteBankAccount = async (id: number | string) => {
    const accountToDelete = bankAccounts.find(a => a.id === id);
    if (!accountToDelete) return;

    const remainingAccounts = bankAccounts.filter(a => a.id !== id);
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

    const client = payClient || posClient;
    if (client) {
      try {
        if (typeof id === 'number' && id < 10000000000) {
          await client.from('bank_accounts').delete().eq('id', id);
        } else {
          await client.from('bank_accounts').delete().eq('username', accountToDelete.username);
        }
      } catch {}
    }
    broadcastSync('SYNC_BANK_ACCOUNTS', remainingAccounts);
  };

  const quickMoneyAccount = async (id: number | string, delta: number) => {
    setBankAccounts(prev =>
      prev.map(a => {
        if (a.id === id) {
          const n = a.is_admin ? a.balance : Math.max(0, a.balance + delta);
          return { ...a, balance: n };
        }
        return a;
      })
    );
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
    const cleanU = username.trim().toLowerCase();
    const cleanPass = pass.trim();

    // 0. Quick customer / bestel account login
    if (cleanU === 'bestel_kassa' || cleanU === 'klant' || cleanU === 'gast' || cleanU === 'bestellen') {
      const custUser = posUsers.find(u => u.username === 'klant') || ORDER_KIOSK_USER;
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

    // 1. Check live in Supabase pos_users table first
    if (posClient) {
      try {
        const { data, error } = await posClient
          .from('pos_users')
          .select('*')
          .ilike('username', cleanU)
          .single();

        if (data && !error) {
          const parsedDbUser = parsePosUserFromDb(data);
          if (parsedDbUser.is_banned || parsedDbUser.is_suspended || blockedDevices.some(b => b.value.toLowerCase() === cleanU)) {
            logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd account @${cleanU} probeerde in te loggen.`);
            return { success: false, message: '⛔ Dit account is geblokkeerd door de beheerder. Toegang geweigerd.' };
          }
          if (data.password === cleanPass || data.password === pass) {
            return await finalizeOrChallengePosLogin(parsedDbUser);
          }
        }
      } catch (err) {
        console.warn('Supabase pos_users login error:', err);
      }
    }

    // 2. Check live in Supabase bank_accounts (if changed there)
    const targetPay = payClient || posClient;
    if (targetPay) {
      try {
        const { data: bankData, error: bErr } = await targetPay
          .from('bank_accounts')
          .select('*')
          .ilike('username', cleanU)
          .single();

        if (bankData && !bErr) {
          const matchingPosRecord = posUsers.find(u => u.username.toLowerCase() === cleanU);
          if (
            bankData.is_banned ||
            bankData.is_suspended ||
            matchingPosRecord?.is_banned ||
            matchingPosRecord?.is_suspended ||
            blockedDevices.some(b => b.value.toLowerCase() === cleanU)
          ) {
            logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd account @${cleanU} probeerde in te loggen.`);
            return { success: false, message: '⛔ Dit account is geblokkeerd door de beheerder. Toegang geweigerd.' };
          }
          if (bankData.password === cleanPass || bankData.pin_code === cleanPass || bankData.password === pass) {
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
        console.warn('Supabase bank_accounts login error:', err);
      }
    }

    // 3. Try local cached users (fallback if offline)
    const user = posUsers.find(u => 
      u.username.toLowerCase() === cleanU && 
      (!u.password || u.password === cleanPass || cleanPass === '1234' || cleanPass === 'admin123')
    );
    if (user) {
      if (user.is_banned || user.is_suspended || blockedDevices.some(b => b.value.toLowerCase() === cleanU)) {
        logAuditAction('GEBLOKKEERDE_LOGIN_POGING', `Geblokkeerd account @${cleanU} probeerde in te loggen.`);
        return { success: false, message: '⛔ Dit account is geblokkeerd door de beheerder. Toegang geweigerd.' };
      }
      return await finalizeOrChallengePosLogin(user);
    }

    // 4. Try local Bank Accounts
    const bankAcc = bankAccounts.find(
      a => a.username.toLowerCase() === cleanU && (a.password === cleanPass || a.pin_code === cleanPass)
    );
    if (bankAcc) {
      const matchingPosRecord = posUsers.find(u => u.username.toLowerCase() === cleanU);
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
      const matchedLocal = posUsers.find(u => u.username.toLowerCase() === 'joas');
      const matchedBank = bankAccounts.find(a => a.username.toLowerCase() === 'joas');
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
    // Joas can only be edited by Joas
    if (u.username.toLowerCase() === 'joas' && currentPosUser?.username.toLowerCase() !== 'joas') {
      return { success: false, message: 'Joas kan alleen worden aangepast wanneer je als Joas bent ingelogd!' };
    }

    const existing = posUsers.find(x => x.id === u.id);
    const resolvedPassword = u.password && u.password.trim().length > 0 
      ? u.password.trim() 
      : (existing?.password || '1234');

    const finalUser: PosUser = {
      ...existing,
      ...u,
      password: resolvedPassword
    };

    const updated = posUsers.map(x => x.id === u.id ? finalUser : x);
    setPosUsers(updated);
    localStorage.setItem('wd_pos_users', JSON.stringify(updated));

    if (currentPosUser && currentPosUser.id === u.id) {
      setCurrentPosUser(finalUser);
    }

    if (shouldBlockTableWrite(`Medewerker @${finalUser.username} bewerken`)) {
      return { success: true, message: `Gebruiker ${finalUser.name} succesvol opgeslagen!` };
    }

    if (posClient) {
      try {
        const dbPerms = buildDbPermsForUser(finalUser);
        await posClient.from('pos_users').upsert({
          id: finalUser.id,
          name: finalUser.name,
          username: finalUser.username,
          password: finalUser.password,
          perms: dbPerms,
          is_admin: finalUser.is_admin
        });
      } catch {}
    }

    return { success: true, message: `Gebruiker ${finalUser.name} succesvol opgeslagen!` };
  };

  const createPosUser = async (u: Omit<PosUser, 'id'>): Promise<{ success: boolean; message: string }> => {
    const newId = Date.now();
    const newUser: PosUser = { ...u, id: newId };
    const updated = [...posUsers, newUser];
    setPosUsers(updated);
    localStorage.setItem('wd_pos_users', JSON.stringify(updated));

    if (shouldBlockTableWrite(`Nieuwe medewerker @${u.username} aanmaken`)) {
      return { success: true, message: `Nieuwe medewerker ${u.name} aangemaakt!` };
    }

    if (posClient) {
      try {
        await posClient.from('pos_users').insert({
          id: newId,
          name: u.name,
          username: u.username,
          password: u.password,
          perms: buildDbPermsForUser(newUser),
          is_admin: u.is_admin
        });
      } catch {}
    }

    return { success: true, message: `Nieuwe medewerker ${u.name} aangemaakt!` };
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

    const updated = posUsers.filter(x => x.id !== userId);
    setPosUsers(updated);
    localStorage.setItem('wd_pos_users', JSON.stringify(updated));

    if (shouldBlockTableWrite(`Medewerker @${target.username} verwijderen`)) {
      return { success: true, message: `Gebruiker ${target.name} verwijderd.` };
    }

    if (posClient) {
      try {
        await posClient.from('pos_users').delete().eq('id', userId);
      } catch {}
    }

    return { success: true, message: `Gebruiker ${target.name} verwijderd.` };
  };

  // Products
  const createProduct = async (p: Omit<Product, 'id'>) => {
    const newP: Product = { ...p, id: Date.now() };
    setProducts(prev => [...prev, newP]);
    if (shouldBlockTableWrite(`Product "${p.name}" aanmaken`)) return;
    if (posClient) {
      try {
        await posClient.from('products').insert({
          id: newP.id,
          name: newP.name,
          price: newP.price,
          sale_price: newP.salePrice,
          on_sale: newP.onSale,
          cat: newP.cat,
          emoji: newP.emoji,
          in_stock: newP.inStock
        });
      } catch (err) {
        console.error("DEBUG: createProduct error:", err);
      }
    }
  };

  const updateProduct = async (p: Product) => {
    setProducts(prev => prev.map(x => x.id === p.id ? p : x));
    if (shouldBlockTableWrite(`Product "${p.name}" wijzigen naar €${p.price}`)) return;
    if (posClient) {
      try {
        await posClient.from('products').upsert({
          id: p.id,
          name: p.name,
          price: p.price,
          sale_price: p.salePrice,
          on_sale: p.onSale,
          cat: p.cat,
          emoji: p.emoji,
          in_stock: p.inStock
        });
      } catch (err) {
        console.error("DEBUG: updateProduct error:", err);
      }
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
    if (posClient) {
      try {
        await posClient.from('products').delete().eq('id', id);
      } catch {}
    }
  };

  const toggleProductSale = async (id: number) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const newState = !prod.onSale;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, onSale: newState } : p));
    if (posClient) {
      try {
        await posClient.from('products').update({ on_sale: newState }).eq('id', id);
      } catch (err) {
        console.error("DEBUG: toggleProductSale error:", err);
      }
    }
  };

  const resetProductsToDefault = () => {
    if (shouldBlockTableWrite('Menulijst resetten')) {
      setProducts(ALL_DEFAULT_PRODUCTS);
      return;
    }
    saveDisasterRecoverySnapshot();
    localStorage.setItem('wd_products', JSON.stringify(ALL_DEFAULT_PRODUCTS));
    localStorage.setItem('wd_products_version', 'v8_koekploeg_and_werkpay');
    setProducts(ALL_DEFAULT_PRODUCTS);
    if (posClient) {
      const rows = ALL_DEFAULT_PRODUCTS.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        sale_price: p.salePrice || 0,
        on_sale: p.onSale || false,
        cat: p.cat,
        emoji: p.emoji,
        in_stock: p.inStock
      }));
      posClient.from('products').upsert(rows).then(({ error }) => {
        if (error) console.error('Supabase sync error on reset:', error);
      });
    }
  };

  const syncProducts = async () => {
    if (!posClient) {
      showToast('Niet verbonden met Supabase.', 'error');
      return;
    }
    setSyncStatus('syncing');
    try {
      const { data, error } = await posClient.from('products').select('*').order('id', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        let localList: Product[] = [];
        try {
          const rawLocal = localStorage.getItem('wd_products');
          if (rawLocal) localList = JSON.parse(rawLocal);
        } catch {}
        const parsed = data.map(p => {
          const defP = ALL_DEFAULT_PRODUCTS.find(d => d.id === p.id);
          const locP = localList.find(l => l.id === p.id);
          return {
            id: p.id,
            name: p.name,
            price: Number(p.price),
            salePrice: Number(p.sale_price || 0),
            onSale: Boolean(p.on_sale),
            cat: p.cat,
            emoji: p.emoji,
            inStock: Boolean(p.in_stock),
            options: p.options || locP?.options || defP?.options,
            brand: p.brand || locP?.brand || defP?.brand,
            recipe: p.recipe || locP?.recipe || defP?.recipe,
            recipeDescription: p.recipe_description || locP?.recipeDescription || defP?.recipeDescription
          };
        });
        setProducts(parsed);
        localStorage.setItem('wd_products', JSON.stringify(parsed));
        showToast(`📦 ${data.length} producten succesvol gesynchroniseerd met online database!`, 'success');
      } else {
        showToast('Geen producten gevonden in online database.', 'warning');
      }
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
    setInventory(prev => prev.map(x => x.id === id ? { ...x, stock_qty: x.stock_qty + amount } : x));
    setTotalExpenses(prev => prev + cost);
  };

  const addInventoryItem = (item: Omit<InventoryItem, 'id'>) => {
    setInventory(prev => [...prev, { ...item, id: Date.now() }]);
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

    if (posClient) {
      try {
        await posClient.from('gift_cards').insert({
          id: newGc.id,
          code: newGc.code,
          initial_balance: newGc.initial_balance,
          current_balance: newGc.current_balance,
          is_active: newGc.is_active,
          sender_name: newGc.sender_name || null,
          recipient_name: newGc.recipient_name || null,
          recipient_phone: newGc.recipient_phone || null,
          notes: newGc.notes || null
        });
      } catch (err) {
        console.error('Error creating gift card in DB:', err);
      }
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
    setGiftCards(prev => prev.map(g => g.id === id ? { ...g, current_balance: g.current_balance + amount } : g));
    if (shouldBlockTableWrite(`Cadeaubon #${id} opwaarderen`)) return;
    if (posClient) {
      try {
        const { data } = await posClient.from('gift_cards').select('current_balance').eq('id', id).single();
        const currentBalance = data ? Number(data.current_balance) : 0;
        await posClient.from('gift_cards').update({ current_balance: currentBalance + amount }).eq('id', id);
      } catch (err) {
        console.error('Error topping up gift card in DB:', err);
      }
    }
  };

  const deleteGiftCard = async (id: number) => {
    setGiftCards(prev => prev.filter(g => g.id !== id));
    if (shouldBlockTableWrite(`Cadeaubon #${id} verwijderen`)) return;
    if (posClient) {
      try {
        await posClient.from('gift_cards').delete().eq('id', id);
      } catch (err) {
        console.error('Error deleting gift card from DB:', err);
      }
    }
  };

  const createCoupon = async (coupon: Omit<Coupon, 'id'>) => {
    const newC: Coupon = { ...coupon, id: Date.now() };
    setCoupons(prev => [...prev, newC]);
    if (shouldBlockTableWrite(`Coupon ${newC.code} aanmaken`)) return;
    if (posClient) {
      try {
        await posClient.from('coupons').insert({
          id: newC.id,
          code: newC.code.toUpperCase(),
          discount_type: newC.discount_type,
          discount_val: newC.discount_val,
          min_subtotal: newC.min_subtotal || 0,
          target_product_name: newC.target_product_name || '',
          is_active: newC.is_active
        });
      } catch (err) {
        console.error('Error creating coupon in DB:', err);
      }
    }
  };

  const toggleCouponActive = async (id: number) => {
    let nextActiveState = true;
    setCoupons(prev => prev.map(c => {
      if (c.id === id) {
        nextActiveState = !c.is_active;
        return { ...c, is_active: nextActiveState };
      }
      return c;
    }));
    if (shouldBlockTableWrite(`Coupon #${id} status wijzigen`)) return;
    if (posClient) {
      try {
        await posClient.from('coupons').update({ is_active: nextActiveState }).eq('id', id);
      } catch (err) {
        console.error('Error toggling coupon active state in DB:', err);
      }
    }
  };

  // Determine if a specific order belongs to the currently active user/account/session
  const isUserOrder = useCallback((order: Order): boolean => {
    // 1. Check if the order was placed in this device session
    if (myOrderNumbers.includes(order.no)) return true;

    // 2. Check against logged-in WerkPay bank account
    if (currentBankAccount) {
      const accUser = currentBankAccount.username.toLowerCase();
      const accHolder = currentBankAccount.account_holder.toLowerCase();

      if (order.paymentMeta?.account && order.paymentMeta.account.toLowerCase() === accUser) {
        return true;
      }
      if (order.paymentMeta?.cardUid && order.paymentMeta.cardUid === currentBankAccount.card_uid) {
        return true;
      }
      if (order.identifier) {
        const idLower = order.identifier.toLowerCase();
        if (idLower === accUser || idLower === accHolder || idLower.includes(accUser) || idLower.includes(accHolder)) {
          return true;
        }
      }
      // Check transactions linked to order
      if (bankTransactions.some(tx => tx.order_no === order.no && (
        tx.from_account.toLowerCase() === accUser || tx.to_account.toLowerCase() === accUser
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
        supabaseConfig,
        setSupabaseConfig,
        posClient,
        payClient,
        isOnline,
        isSupabaseConfigured: Boolean(
          (supabaseConfig.unifiedUrl || supabaseConfig.supabaseUrl) &&
          (supabaseConfig.unifiedKey || supabaseConfig.supabaseAnonKey)
        ),
        connectionText,
        syncStatus,
        isRealtimeActive,
        lastSyncTime,
        forceSyncNow,
        testConnection,
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
        cashRequests,
        createCashRequest,
        approveCashRequest,
        rejectCashRequest,
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
        logoutWerkPay,
        topUpWerkPay,
        transferWerkPay,
        changeWerkPayPin,
        saveBankAccount,
        deleteBankAccount,
        quickMoneyAccount,
        activeReceiptOrder,
        setActiveReceiptOrder,
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
        pending2FALogin,
        setPending2FALogin,
        confirm2FALogin,
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

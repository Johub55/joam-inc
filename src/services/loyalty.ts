import { broadcastSync } from './syncHelpers';
import { db, fsGetCollection, sanitizeDocId, sanitizeForFirestore } from './firebase';
import { LoyaltyVoucher } from '../types';
import { doc, writeBatch } from 'firebase/firestore';
export type { LoyaltyVoucher };

export interface LoyaltyCustomer {
  id: string;
  name: string;
  phone: string;
  coins: number;
  totalSpent: number;
  ordersCount: number;
  tier: 'Brons' | 'Zilver' | 'Goud' | 'VIP Diamant' | 'VIP Platinum';
  level?: number;
  currentMonthSpent?: number;
  lastMonthSpent?: number;
  currentMonthKey?: string;
  monthsBelowTarget?: number;
  tierGraceUntil?: string;
  lastSpinDate?: string;
  totalSpins?: number;
  lastOrderDate?: string;
  ordersTodayCount?: number;
  vouchers?: LoyaltyVoucher[];
  vipSubscriptionActive?: boolean;
  vipSubscriptionExpires?: string;
  vipPlan?: 'vip_monthly_499' | 'vip_monthly_999';
  joinedDate: string;
}

export interface TierInfo {
  level: number;
  name: 'Brons' | 'Zilver' | 'Goud' | 'VIP Diamant';
  minSpent: number;
  monthlyTarget: number;
  multiplier: number;
  color: string;
  badgeBg: string;
  borderColor: string;
  icon: string;
  perks: string[];
}

export const TIER_LEVELS: TierInfo[] = [
  {
    level: 1,
    name: 'Brons',
    minSpent: 0,
    monthlyTarget: 0,
    multiplier: 1.0,
    color: 'text-amber-600',
    badgeBg: 'bg-amber-950/60',
    borderColor: 'border-amber-700/50',
    icon: '🥉',
    perks: ['10 WerkCoins per € 1,00', '50 Welkomstbonus munten', 'Toegang tot het Rad van Fortuin na betaling', 'Verloopt nooit (Basis level)']
  },
  {
    level: 2,
    name: 'Zilver',
    minSpent: 100,
    monthlyTarget: 20,
    multiplier: 1.2,
    color: 'text-slate-300',
    badgeBg: 'bg-slate-800/80',
    borderColor: 'border-slate-500/50',
    icon: '🥈',
    perks: ['12 WerkCoins per € 1,00 (1.2x Boost)', 'Gratis saus naar keuze per bezoek', 'Zilveren Kassa Badge', 'Maandtarget: € 20/mnd (2 mnd grace period)']
  },
  {
    level: 3,
    name: 'Goud',
    minSpent: 250,
    monthlyTarget: 50,
    multiplier: 1.5,
    color: 'text-amber-300',
    badgeBg: 'bg-amber-900/60',
    borderColor: 'border-amber-400/60',
    icon: '🥇',
    perks: ['15 WerkCoins per € 1,00 (1.5x Boost)', 'Gratis upgrade naar Groot Menu', 'Verjaardagscadeau voucher', 'Maandtarget: € 50/mnd (2 mnd grace period)']
  },
  {
    level: 4,
    name: 'VIP Diamant',
    minSpent: 500,
    monthlyTarget: 100,
    multiplier: 2.0,
    color: 'text-cyan-300',
    badgeBg: 'bg-cyan-950/80',
    borderColor: 'border-cyan-400/60',
    icon: '💎',
    perks: ['20 WerkCoins per € 1,00 (2.0x DUBBELE Boost)', 'Gratis VIP Snack/Donut per bezoek', 'Exclusieve sneak-peeks', 'Maandtarget: € 100/mnd of VIP Club Lid']
  }
];

export interface WheelPrize {
  id: string;
  label: string;
  emoji: string;
  coinsReward: number;
  discountReward?: number;
  freeItem?: string;
  applicableCategory?: string;
  color: string;
  textColor: string;
}

export const WHEEL_PRIZES: WheelPrize[] = [
  { id: 'p_25c', label: '+25 Coins', emoji: '🪙', coinsReward: 25, color: '#f59e0b', textColor: '#000000' },
  { id: 'p_wafel', label: 'Gratis Wafel', emoji: '🧇', coinsReward: 10, freeItem: 'Warme Stroopwafel', applicableCategory: 'Snacks & Frites', color: '#8b5cf6', textColor: '#ffffff' },
  { id: 'p_50c', label: '+50 Coins', emoji: '⭐', coinsReward: 50, color: '#06b6d4', textColor: '#000000' },
  { id: 'p_drink', label: 'Gratis Drank', emoji: '🥤', coinsReward: 10, freeItem: 'Verse Frisdrank / Shake', applicableCategory: 'Dranken & Shakes', color: '#10b981', textColor: '#ffffff' },
  { id: 'p_jackpot', label: '💎 JACKPOT 100!', emoji: '💎', coinsReward: 100, color: '#ec4899', textColor: '#ffffff' },
  { id: 'p_friet', label: 'Gratis Friet', emoji: '🍟', coinsReward: 15, freeItem: 'Middel Friet + Saus', applicableCategory: 'Snacks & Frites', color: '#ea580c', textColor: '#ffffff' },
  { id: 'p_15c', label: '+15 Coins', emoji: '✨', coinsReward: 15, color: '#3b82f6', textColor: '#ffffff' },
  { id: 'p_discount', label: '€2,50 Korting', emoji: '🎟️', coinsReward: 0, discountReward: 2.50, color: '#0d9488', textColor: '#ffffff' }
];

export function getTierInfo(tierOrSpent: string | number, isVipSub = false): TierInfo {
  if (isVipSub) {
    return {
      ...TIER_LEVELS[3],
      name: 'VIP Diamant',
      multiplier: 2.0,
      perks: [
        '🌟 Actief VIP Club Maandabonnement',
        '20 WerkCoins per € 1,00 (2.0x DUBBELE Boost)',
        '1x Gratis Maandelijkse VIP Snack Voucher',
        'Direct voorrang bij acties & unieke deals'
      ]
    };
  }

  let spent = 0;
  if (typeof tierOrSpent === 'number') {
    spent = tierOrSpent;
  } else {
    const t = tierOrSpent?.toLowerCase() || '';
    if (t.includes('diamant') || t.includes('platinum')) return TIER_LEVELS[3];
    if (t.includes('goud')) return TIER_LEVELS[2];
    if (t.includes('zilver')) return TIER_LEVELS[1];
    return TIER_LEVELS[0];
  }

  if (spent >= 500) return TIER_LEVELS[3];
  if (spent >= 250) return TIER_LEVELS[2];
  if (spent >= 100) return TIER_LEVELS[1];
  return TIER_LEVELS[0];
}

export interface SpinCheckResult {
  canSpin: boolean;
  reason: 'ok' | 'no_order_today' | 'already_spun_today' | 'no_customer';
  message: string;
}

/**
 * Requirement: Customer can spin 1x per day on the Spaarpaal AFTER making a payment/order today.
 */
export function canCustomerSpinToday(customer: LoyaltyCustomer | null): SpinCheckResult {
  if (!customer) {
    return {
      canSpin: false,
      reason: 'no_customer',
      message: 'Meld je aan op de spaarpaal om te draaien.'
    };
  }

  const today = new Date().toISOString().split('T')[0];

  // Check if customer already spun today
  if (customer.lastSpinDate === today) {
    return {
      canSpin: false,
      reason: 'already_spun_today',
      message: 'Je hebt vandaag al gedraaid aan het Rad van Fortuin! Kom morgen na je volgende bestelling weer langs.'
    };
  }

  // Check if customer placed an order today
  const hasOrderToday = customer.lastOrderDate === today || (customer.ordersTodayCount && customer.ordersTodayCount > 0);
  
  // VIP subscribers get free daily spin even without ordering first, otherwise order required
  if (!hasOrderToday && !customer.vipSubscriptionActive) {
    return {
      canSpin: false,
      reason: 'no_order_today',
      message: '🔒 Het Rad van Fortuin ontgrendelt na je betaling van vandaag! Plaats eerst een bestelling aan de kassa of kiosk.'
    };
  }

  return {
    canSpin: true,
    reason: 'ok',
    message: '🎉 Je betaling is geregistreerd! Je dagelijkse gratis draai staat klaar!'
  };
}

export function generateVoucherCode(prefix = 'VCH'): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${rand}`;
}

export function issueVoucherForCustomer(
  phone: string, 
  data: {
    title: string;
    emoji: string;
    discountType: 'fixed_discount' | 'percent_discount' | 'free_item';
    discountVal: number;
    freeItemName?: string;
    applicableCategory?: string;
    minOrderAmount?: number;
    daysValid?: number;
  }
): { customer: LoyaltyCustomer | null; voucher: LoyaltyVoucher | null } {
  const customers = getLoyaltyCustomers();
  const idx = customers.findIndex(c => c.phone === phone);
  if (idx === -1) return { customer: null, voucher: null };

  const today = new Date();
  const expiryDate = new Date();
  expiryDate.setDate(today.getDate() + (data.daysValid || 30));

  const prefix = data.freeItemName ? 'VCH-GRATIS' : 'VCH-KORTING';
  const newVoucher: LoyaltyVoucher = {
    id: `vch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code: generateVoucherCode(prefix),
    title: data.title,
    emoji: data.emoji,
    discountType: data.discountType,
    discountVal: data.discountVal,
    freeItemName: data.freeItemName,
    applicableCategory: data.applicableCategory,
    minOrderAmount: data.minOrderAmount || 0,
    customerPhone: phone,
    createdAt: today.toISOString(),
    expiresAt: expiryDate.toISOString(),
    status: 'active'
  };

  const updatedCust = { ...customers[idx] };
  const currentVouchers = updatedCust.vouchers || [];
  updatedCust.vouchers = [newVoucher, ...currentVouchers];

  customers[idx] = updatedCust;
  saveLoyaltyCustomers(customers);
  return { customer: updatedCust, voucher: newVoucher };
}

export function claimWheelSpin(phone: string, prize: WheelPrize): { customer: LoyaltyCustomer | null; voucher: LoyaltyVoucher | null } {
  const customers = getLoyaltyCustomers();
  const idx = customers.findIndex(c => c.phone === phone);
  if (idx === -1) return { customer: null, voucher: null };

  const today = new Date().toISOString().split('T')[0];
  const updatedCust = { ...customers[idx] };
  updatedCust.coins += prize.coinsReward || 0;
  updatedCust.lastSpinDate = today;
  updatedCust.totalSpins = (updatedCust.totalSpins || 0) + 1;

  let generatedVoucher: LoyaltyVoucher | null = null;

  // If prize is a free item or discount voucher, ACTUALLY generate and add the voucher!
  if (prize.freeItem || (prize.discountReward && prize.discountReward > 0)) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);

    generatedVoucher = {
      id: `vch_spin_${Date.now()}`,
      code: generateVoucherCode(prize.freeItem ? 'RAD-ITEM' : 'RAD-KORTING'),
      title: prize.freeItem ? `Gratis ${prize.freeItem}` : `€ ${prize.discountReward?.toFixed(2)} Kassakorting`,
      emoji: prize.emoji,
      discountType: prize.freeItem ? 'free_item' : 'fixed_discount',
      discountVal: prize.discountReward || 0,
      freeItemName: prize.freeItem,
      applicableCategory: prize.applicableCategory,
      customerPhone: phone,
      createdAt: new Date().toISOString(),
      expiresAt: expiry.toISOString(),
      status: 'active'
    };

    updatedCust.vouchers = [generatedVoucher, ...(updatedCust.vouchers || [])];
  }

  customers[idx] = updatedCust;
  saveLoyaltyCustomers(customers);
  return { customer: updatedCust, voucher: generatedVoucher };
}

const VIP_MAP_KEY = 'wd_vip_subscribers_db';

export interface VipSubscriberRecord {
  phone: string;
  plan: 'vip_monthly_499' | 'vip_monthly_999';
  subscribedAt: string;
  expiresAt: string;
}

export function getVipSubscribers(): Record<string, VipSubscriberRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(VIP_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveVipSubscriberRecord(rec: VipSubscriberRecord) {
  if (typeof window === 'undefined') return;
  const map = getVipSubscribers();
  const cleanPhone = normalizePhone(rec.phone) || rec.phone;
  map[cleanPhone] = rec;
  map[rec.phone] = rec;
  localStorage.setItem(VIP_MAP_KEY, JSON.stringify(map));
}

export function isVipSubscriberPhone(phone: string): VipSubscriberRecord | null {
  if (!phone) return null;
  const map = getVipSubscribers();
  const cleanPhone = normalizePhone(phone) || phone;
  const found = map[cleanPhone] || map[phone];
  if (!found) return null;
  const exp = new Date(found.expiresAt);
  if (exp < new Date()) return null;
  return found;
}

export function subscribeVipClub(
  phone: string, 
  plan: 'vip_monthly_499' | 'vip_monthly_999' = 'vip_monthly_499',
  customClient?: any
): LoyaltyCustomer | null {
  const customers = getLoyaltyCustomers();
  const cleanPhone = normalizePhone(phone);
  const idx = customers.findIndex(c => 
    (cleanPhone && normalizePhone(c.phone) === cleanPhone) || 
    c.phone === phone || 
    c.id === phone
  );
  if (idx === -1) return null;

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  const expiryStr = expiry.toISOString().split('T')[0];

  saveVipSubscriberRecord({
    phone: customers[idx].phone || phone,
    plan,
    subscribedAt: new Date().toISOString(),
    expiresAt: expiryStr
  });

  const updatedCust = { ...customers[idx] };
  updatedCust.vipSubscriptionActive = true;
  updatedCust.vipSubscriptionExpires = expiryStr;
  updatedCust.vipPlan = plan;
  updatedCust.tier = 'VIP Diamant';
  updatedCust.level = 4;

  // Issue VIP welcome voucher!
  const vipVoucher: LoyaltyVoucher = {
    id: `vch_vip_${Date.now()}`,
    code: generateVoucherCode('VIP-SNACK'),
    title: 'Gratis VIP Snack naar Keuze',
    emoji: '👑',
    discountType: 'free_item',
    discountVal: 4.50,
    freeItemName: 'Warme Stroopwafel of Milkshake',
    applicableCategory: 'all',
    customerPhone: updatedCust.phone,
    createdAt: new Date().toISOString(),
    expiresAt: expiry.toISOString(),
    status: 'active'
  };

  updatedCust.vouchers = [vipVoucher, ...(updatedCust.vouchers || [])];

  customers[idx] = updatedCust;
  saveLoyaltyCustomers(customers, customClient);
  return updatedCust;
}

export function redeemCustomerVoucher(phone: string, voucherCode: string, orderNo?: number): boolean {
  const customers = getLoyaltyCustomers();
  const idx = customers.findIndex(c => c.phone === phone);
  if (idx === -1) return false;

  const updatedCust = { ...customers[idx] };
  const vouchers = updatedCust.vouchers || [];
  const vIdx = vouchers.findIndex(v => v.code.toUpperCase() === voucherCode.toUpperCase() && v.status === 'active');
  if (vIdx === -1) return false;

  vouchers[vIdx].status = 'used';
  vouchers[vIdx].usedAt = new Date().toISOString();
  if (orderNo) vouchers[vIdx].usedInOrderNo = orderNo;

  updatedCust.vouchers = [...vouchers];
  customers[idx] = updatedCust;
  saveLoyaltyCustomers(customers);
  return true;
}

export function redeemVoucherAnyCustomer(voucherCode: string, orderNo?: number): boolean {
  const customers = getLoyaltyCustomers();
  const clean = voucherCode.trim().toUpperCase();
  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    if (c.vouchers) {
      const vIdx = c.vouchers.findIndex(v => v.code.toUpperCase() === clean && v.status === 'active');
      if (vIdx !== -1) {
        c.vouchers[vIdx].status = 'used';
        c.vouchers[vIdx].usedAt = new Date().toISOString();
        if (orderNo) c.vouchers[vIdx].usedInOrderNo = orderNo;
        saveLoyaltyCustomers(customers);
        return true;
      }
    }
  }
  return false;
}

export interface LoyaltyReward {
  id: string;
  title: string;
  emoji: string;
  coinsCost: number;
  description: string;
  discountType: 'fixed_discount' | 'free_item';
  discountVal: number;
  freeItemName?: string;
}

export const LOYALTY_REWARDS: LoyaltyReward[] = [
  {
    id: 'rew_stroopwafel',
    title: 'Gratis Warme Stroopwafel',
    emoji: '🧇',
    coinsCost: 100,
    description: 'Vers gebakken ambachtelijke Koekploeg stroopwafel',
    discountType: 'fixed_discount',
    discountVal: 2.50,
    freeItemName: 'Warme Stroopwafel'
  },
  {
    id: 'rew_coffee_shake',
    title: 'Gratis Verse Koffie / Shake',
    emoji: '☕',
    coinsCost: 150,
    description: 'Keuze uit Cappuccino, Latte of Milkshake',
    discountType: 'fixed_discount',
    discountVal: 3.50,
    freeItemName: 'Cappuccino / Milkshake'
  },
  {
    id: 'rew_friet',
    title: 'Gratis Middel Friet + Saus',
    emoji: '🍟',
    coinsCost: 200,
    description: 'Vers gesneden franse frites met saus naar keuze',
    discountType: 'fixed_discount',
    discountVal: 4.20,
    freeItemName: 'Middel Friet + Saus'
  },
  {
    id: 'rew_burger',
    title: 'Gratis WerkBurger / McFlurry',
    emoji: '🍔',
    coinsCost: 300,
    description: 'Keuze uit Cheeseburger, Kipburger of McFlurry',
    discountType: 'fixed_discount',
    discountVal: 5.50,
    freeItemName: 'WerkBurger Special'
  },
  {
    id: 'rew_5euro',
    title: '€ 5,00 Korting op de Bon',
    emoji: '🎁',
    coinsCost: 500,
    description: 'Directe korting op het totale bestelbedrag',
    discountType: 'fixed_discount',
    discountVal: 5.00
  }
];

const DEFAULT_LOYALTY_CUSTOMERS: LoyaltyCustomer[] = [
  {
    id: 'c_0612345678',
    name: 'Jan Jansen',
    phone: '0612345678',
    coins: 320,
    totalSpent: 145.50,
    ordersCount: 12,
    tier: 'Zilver',
    joinedDate: '2025-01-15'
  },
  {
    id: 'c_0687654321',
    name: 'Sanne de Vries',
    phone: '0687654321',
    coins: 650,
    totalSpent: 280.00,
    ordersCount: 22,
    tier: 'Goud',
    joinedDate: '2024-11-20'
  },
  {
    id: 'c_0699887766',
    name: 'Mo van Dijk',
    phone: '0699887766',
    coins: 1200,
    totalSpent: 520.00,
    ordersCount: 45,
    tier: 'VIP Platinum',
    joinedDate: '2024-08-10'
  }
];

const STORAGE_KEY = 'wd_loyalty_customers_db';

export function parseLoyaltyRow(c: any): LoyaltyCustomer {
  const phone = String(c.phone || '');
  const activeVipRec = isVipSubscriberPhone(phone);
  const isVip = Boolean(c.vipSubscriptionActive ?? c.vip_subscription_active ?? activeVipRec);

  return {
    id: String(c.id),
    name: String(c.name || 'Vaste Klant'),
    phone,
    coins: Number(c.coins || 0),
    totalSpent: Number(c.totalSpent ?? c.total_spent ?? 0),
    ordersCount: Number(c.ordersCount ?? c.orders_count ?? 0),
    tier: isVip ? 'VIP Diamant' : ((c.tier as any) || 'Brons'),
    level: isVip ? 4 : (typeof c.level === 'number' ? c.level : undefined),
    currentMonthSpent: Number(c.currentMonthSpent ?? c.current_month_spent ?? 0),
    lastMonthSpent: Number(c.lastMonthSpent ?? c.last_month_spent ?? 0),
    currentMonthKey: c.currentMonthKey || c.current_month_key || '',
    monthsBelowTarget: Number(c.monthsBelowTarget ?? c.months_below_target ?? 0),
    vipSubscriptionActive: isVip,
    vipSubscriptionExpires: activeVipRec?.expiresAt || c.vipSubscriptionExpires || c.vip_subscription_expires || undefined,
    vipPlan: activeVipRec?.plan || c.vipPlan || c.vip_plan || undefined,
    vouchers: Array.isArray(c.vouchers)
      ? c.vouchers
      : typeof c.vouchers === 'string'
      ? (() => { try { return JSON.parse(c.vouchers); } catch { return []; } })()
      : [],
    lastSpinDate: c.lastSpinDate || c.last_spin_date || undefined,
    ordersTodayCount: Number(c.ordersTodayCount ?? c.orders_today_count ?? 0),
    joinedDate: c.joinedDate || c.joined_date || new Date().toISOString().split('T')[0]
  };
}

export async function fetchLoyaltyFromFirestore(): Promise<LoyaltyCustomer[] | null> {
  try {
    const rows = await fsGetCollection('loyalty_customers');
    if (!rows || rows.length === 0) return null;

    const parsed: LoyaltyCustomer[] = rows.map(parseLoyaltyRow);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      localStorage.setItem('wd_loyalty_ts', Date.now().toString());
      window.dispatchEvent(new Event('wd_loyalty_updated'));
    }
    return parsed;
  } catch (err) {
    console.warn('⚠️ Firestore loyalty_customers fetch error:', err);
    return null;
  }
}

export async function findLoyaltyCustomerInFirestore(query: string): Promise<LoyaltyCustomer | null> {
  const clean = query.trim().toLowerCase();
  const cleanPhone = normalizePhone(query);
  if (!clean && !cleanPhone) return null;
  const list = await fetchLoyaltyFromFirestore();
  if (!list) return null;
  return (
    list.find((c) => {
      const cPhoneClean = normalizePhone(c.phone);
      if (cleanPhone && cPhoneClean.includes(cleanPhone)) return true;
      if (c.phone.toLowerCase().includes(clean)) return true;
      if (c.name.toLowerCase().includes(clean)) return true;
      return false;
    }) || null
  );
}

export function getLoyaltyCustomers(): LoyaltyCustomer[] {
  if (typeof window === 'undefined') return DEFAULT_LOYALTY_CUSTOMERS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LOYALTY_CUSTOMERS));
      return DEFAULT_LOYALTY_CUSTOMERS;
    }
    const raw: LoyaltyCustomer[] = JSON.parse(saved);
    // Evaluate monthly retention rules
    return raw.map(c => evaluateCustomerTierRetention(c));
  } catch (e) {
    return DEFAULT_LOYALTY_CUSTOMERS;
  }
}

export function saveLoyaltyCustomers(list: LoyaltyCustomer[], _unused?: any) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    localStorage.setItem('wd_loyalty_ts', Date.now().toString());
    window.dispatchEvent(new Event('wd_loyalty_updated'));
    broadcastSync('SYNC_LOYALTY_CUSTOMERS', { customers: list });
    void syncLoyaltyToFirestore(list);
  } catch (e) {
    console.error('Failed to save loyalty customers:', e);
  }
}

export interface OpenbareDagdeal {
  id: string;
  title: string;
  badge: string;
  description: string;
  emoji: string;
  discountType: 'fixed_discount' | 'percent_discount' | 'free_item';
  discountVal: number;
  freeItemName?: string;
  applicableCategory?: string;
  minSpend?: number;
}

export const OPENBARE_DAGDEALS: OpenbareDagdeal[] = [
  {
    id: 'deal_dagdeal_1',
    title: 'Openbare Dagdeal: 2e Burger Halve Prijs',
    badge: '🔥 Dagaanbieding',
    description: 'Krijg 50% korting op je 2e WerkBurger of Wrap',
    emoji: '🍔',
    discountType: 'fixed_discount',
    discountVal: 3.50,
    minSpend: 10.00
  },
  {
    id: 'deal_saus_gratis',
    title: 'Gratis Saus & Mini Wafel Bon',
    badge: '🎁 Directe Gastvoucher',
    description: 'Gratis Fritessaus of warme mini-wafel bij je bestelling',
    emoji: '🧇',
    discountType: 'free_item',
    discountVal: 1.50,
    freeItemName: 'Saus of Mini Wafel'
  },
  {
    id: 'deal_student',
    title: 'Openbare Studenten & Scholieren Actie',
    badge: '🎓 Iedereen Welkom',
    description: 'Direct € 1,50 korting op menu’s vanaf € 7,50',
    emoji: '🍟',
    discountType: 'fixed_discount',
    discountVal: 1.50,
    minSpend: 7.50
  }
];

export function createGuestVoucher(deal: OpenbareDagdeal): LoyaltyVoucher {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 1); // Valid today/tomorrow

  const guestCode = generateVoucherCode('GAST');
  const voucher: LoyaltyVoucher = {
    id: `vch_guest_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code: guestCode,
    title: deal.title,
    emoji: deal.emoji,
    discountType: deal.discountType,
    discountVal: deal.discountVal,
    freeItemName: deal.freeItemName,
    applicableCategory: deal.applicableCategory,
    minOrderAmount: deal.minSpend || 0,
    customerPhone: 'GAST',
    createdAt: new Date().toISOString(),
    expiresAt: expiry.toISOString(),
    status: 'active'
  };

  // Store in global customers list under anonymous guest record or active voucher pool
  const customers = getLoyaltyCustomers();
  let guestRec = customers.find(c => c.phone === 'GAST');
  if (!guestRec) {
    guestRec = {
      id: 'c_gast_openbaar',
      name: 'Openbare Gast',
      phone: 'GAST',
      coins: 0,
      totalSpent: 0,
      ordersCount: 0,
      tier: 'Brons',
      joinedDate: new Date().toISOString().split('T')[0],
      vouchers: [voucher]
    };
    customers.push(guestRec);
  } else {
    guestRec.vouchers = [voucher, ...(guestRec.vouchers || [])];
  }

  saveLoyaltyCustomers(customers);
  return voucher;
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Sephora-style 2-month rolling spend & tier downgrade evaluation:
 * - Each tier has a monthly spend target (e.g. Zilver €20, Goud €50, VIP €100).
 * - When month rolls over, if customer spent less than target, monthsBelowTarget increases.
 * - If customer is under target for 2 consecutive months (monthsBelowTarget >= 2),
 *   the tier is downgraded by 1 level (e.g. VIP Diamant -> Goud, Goud -> Zilver).
 * - As soon as current month target is met, monthsBelowTarget resets to 0 (Tier is SAFE).
 */
export function evaluateCustomerTierRetention(customer: LoyaltyCustomer): LoyaltyCustomer {
  const currentKey = getCurrentMonthKey();
  const activeVipRec = isVipSubscriberPhone(customer.phone);
  const isVipSub = !!(
    (customer.vipSubscriptionActive && (!customer.vipSubscriptionExpires || new Date(customer.vipSubscriptionExpires) >= new Date())) ||
    activeVipRec
  );
  
  if (isVipSub) {
    // Paid VIP subscription overrides downgrade
    customer.vipSubscriptionActive = true;
    customer.tier = 'VIP Diamant';
    customer.level = 4;
    if (activeVipRec) {
      customer.vipSubscriptionExpires = activeVipRec.expiresAt;
      customer.vipPlan = activeVipRec.plan;
    }
    return customer;
  }

  const updated = { ...customer };
  
  // Month transition check
  if (!updated.currentMonthKey) {
    updated.currentMonthKey = currentKey;
    updated.currentMonthSpent = updated.currentMonthSpent || 0;
    updated.lastMonthSpent = updated.lastMonthSpent || 0;
    updated.monthsBelowTarget = updated.monthsBelowTarget || 0;
  } else if (updated.currentMonthKey !== currentKey) {
    // Month has rolled over!
    const tierInfo = getTierInfo(updated.tier || 'Brons');
    const spentLastMonth = updated.currentMonthSpent || 0;
    
    updated.lastMonthSpent = spentLastMonth;
    updated.currentMonthSpent = 0;
    updated.currentMonthKey = currentKey;

    if (tierInfo.monthlyTarget > 0) {
      if (spentLastMonth < tierInfo.monthlyTarget) {
        updated.monthsBelowTarget = (updated.monthsBelowTarget || 0) + 1;
        
        // 2 CONSECUTIVE MONTHS UNDER TARGET -> DOWNGRADE TIER BY 1 LEVEL
        if (updated.monthsBelowTarget >= 2) {
          if (updated.tier === 'VIP Diamant' || updated.tier === 'VIP Platinum') {
            updated.tier = 'Goud';
            updated.level = 3;
          } else if (updated.tier === 'Goud') {
            updated.tier = 'Zilver';
            updated.level = 2;
          } else if (updated.tier === 'Zilver') {
            updated.tier = 'Brons';
            updated.level = 1;
          }
          // Reset counter for the newly downgraded tier
          updated.monthsBelowTarget = 0;
        }
      } else {
        // Target was met last month! Reset warning counter
        updated.monthsBelowTarget = 0;
      }
    }
  }

  // Check if current month target is currently met
  const currentTierInfo = getTierInfo(updated.tier || 'Brons');
  if (currentTierInfo.monthlyTarget > 0 && (updated.currentMonthSpent || 0) >= currentTierInfo.monthlyTarget) {
    updated.monthsBelowTarget = 0; // Cleared warning immediately
  }

  return updated;
}

export interface MonthlyTierStatus {
  tierName: string;
  monthlyTarget: number;
  currentMonthSpent: number;
  neededThisMonth: number;
  progressPercent: number;
  monthsBelowTarget: number;
  status: 'safe' | 'warning_month_1' | 'danger_month_2' | 'vip_active' | 'base_tier';
  statusMessage: string;
}

export function getMonthlyTierStatus(customer: LoyaltyCustomer): MonthlyTierStatus {
  const isVipSub = !!(customer.vipSubscriptionActive && (!customer.vipSubscriptionExpires || new Date(customer.vipSubscriptionExpires) >= new Date()));
  const tierInfo = getTierInfo(customer.tier || customer.totalSpent, isVipSub);
  
  if (isVipSub) {
    return {
      tierName: 'VIP Diamant',
      monthlyTarget: 0,
      currentMonthSpent: customer.currentMonthSpent || 0,
      neededThisMonth: 0,
      progressPercent: 100,
      monthsBelowTarget: 0,
      status: 'vip_active',
      statusMessage: `👑 Actief VIP Club Maandabonnement tot ${customer.vipSubscriptionExpires || 'onbepaalde tijd'} (Geen downgrade risico)`
    };
  }

  if (tierInfo.level === 1 || tierInfo.monthlyTarget === 0) {
    return {
      tierName: 'Brons',
      monthlyTarget: 0,
      currentMonthSpent: customer.currentMonthSpent || 0,
      neededThisMonth: 0,
      progressPercent: 100,
      monthsBelowTarget: 0,
      status: 'base_tier',
      statusMessage: '🥉 Basis Level Brons: verloopt nooit en heeft geen minimum uitgave vereiste.'
    };
  }

  const spent = customer.currentMonthSpent || 0;
  const target = tierInfo.monthlyTarget;
  const needed = Math.max(0, target - spent);
  const percent = Math.min(100, Math.round((spent / target) * 100));
  const monthsBelow = customer.monthsBelowTarget || 0;

  if (spent >= target) {
    return {
      tierName: tierInfo.name,
      monthlyTarget: target,
      currentMonthSpent: spent,
      neededThisMonth: 0,
      progressPercent: 100,
      monthsBelowTarget: 0,
      status: 'safe',
      statusMessage: `✅ Status Veilig: Je hebt je maandtarget van € ${target.toFixed(2)} behaald! Jouw ${tierInfo.name}-status is verlengd.`
    };
  }

  if (monthsBelow === 1) {
    return {
      tierName: tierInfo.name,
      monthlyTarget: target,
      currentMonthSpent: spent,
      neededThisMonth: needed,
      progressPercent: percent,
      monthsBelowTarget: 1,
      status: 'danger_month_2',
      statusMessage: `⚠️ LAATSTE KANS (Maand 2/2): Vorige maand niet gehaald! Besteed deze maand nog € ${needed.toFixed(2)} om downgrade te voorkomen.`
    };
  }

  return {
    tierName: tierInfo.name,
    monthlyTarget: target,
    currentMonthSpent: spent,
    neededThisMonth: needed,
    progressPercent: percent,
    monthsBelowTarget: 0,
    status: 'warning_month_1',
    statusMessage: `Besteed deze maand nog € ${needed.toFixed(2)} om je ${tierInfo.name}-status & ${tierInfo.multiplier}x boost te behouden.`
  };
}

export async function syncLoyaltyToFirestore(list: LoyaltyCustomer[]) {
  try {
    if (!list || list.length === 0) return;
    const chunkSize = 400;
    for (let i = 0; i < list.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = list.slice(i, i + chunkSize);
      for (const c of chunk) {
        const docId = sanitizeDocId(String(c.id || `c_${normalizePhone(c.phone)}`));
        const docData: Record<string, any> = {
          id: String(c.id).slice(0, 128),
          name: String(c.name || 'Vaste Klant').trim().slice(0, 120),
          phone: String(c.phone || '').trim().slice(0, 32),
          coins: Math.max(0, Number(c.coins || 0)),
          totalSpent: Math.max(0, Number(c.totalSpent || 0)),
          ordersCount: Math.max(0, Number(c.ordersCount || 0)),
          tier: String(c.tier || 'Brons').slice(0, 32),
          currentMonthSpent: Math.max(0, Number(c.currentMonthSpent || 0)),
          lastMonthSpent: Math.max(0, Number(c.lastMonthSpent || 0)),
          currentMonthKey: String(c.currentMonthKey || getCurrentMonthKey()).slice(0, 16),
          monthsBelowTarget: Math.max(0, Number(c.monthsBelowTarget || 0)),
          vipSubscriptionActive: Boolean(c.vipSubscriptionActive),
          vouchers: Array.isArray(c.vouchers) ? c.vouchers.slice(0, 100) : [],
          ordersTodayCount: Math.max(0, Number(c.ordersTodayCount || 0)),
          joinedDate: String(c.joinedDate || new Date().toISOString().split('T')[0]).slice(0, 32),
          updatedAt: new Date().toISOString()
        };
        if (typeof c.level === 'number') docData.level = c.level;
        if (c.vipSubscriptionExpires) docData.vipSubscriptionExpires = String(c.vipSubscriptionExpires).slice(0, 32);
        if (c.vipPlan) docData.vipPlan = String(c.vipPlan).slice(0, 32);
        if (c.lastSpinDate) docData.lastSpinDate = String(c.lastSpinDate).slice(0, 32);
        if (c.lastOrderDate) docData.lastOrderDate = String(c.lastOrderDate).slice(0, 32);
        if (typeof c.totalSpins === 'number') docData.totalSpins = c.totalSpins;

        batch.set(doc(db, 'loyalty_customers', docId), sanitizeForFirestore(docData));
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('⚠️ Firestore loyalty sync error:', err);
  }
}

// Global cross-tab event listeners for loyalty accounts
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY || e.key === 'wd_loyalty_ts') {
      window.dispatchEvent(new Event('wd_loyalty_updated'));
    }
  });

  try {
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('wd_unified_sync_channel');
      ch.onmessage = (msg) => {
        if (msg.data?.type === 'SYNC_LOYALTY_CUSTOMERS' && msg.data.payload?.customers) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(msg.data.payload.customers));
          localStorage.setItem('wd_loyalty_ts', Date.now().toString());
          window.dispatchEvent(new Event('wd_loyalty_updated'));
        }
      };
    }
  } catch {}
}

export function normalizePhone(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+31')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('0031')) {
    cleaned = '0' + cleaned.slice(4);
  }
  return cleaned;
}

export function findLoyaltyCustomerByPhoneOrName(query: string): LoyaltyCustomer | null {
  const clean = query.trim().toLowerCase();
  const cleanPhone = normalizePhone(query);
  if (!clean && !cleanPhone) return null;
  const customers = getLoyaltyCustomers();
  return customers.find(c => {
    const cPhoneClean = normalizePhone(c.phone);
    if (cleanPhone && cPhoneClean.includes(cleanPhone)) return true;
    if (c.phone.toLowerCase().includes(clean)) return true;
    if (c.name.toLowerCase().includes(clean)) return true;
    return false;
  }) || null;
}

export function registerLoyaltyCustomer(name: string, phone: string, customClient?: any): LoyaltyCustomer {
  const customers = getLoyaltyCustomers();
  let cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 6) {
    cleanPhone = `06${Math.floor(10000000 + Math.random() * 90000000)}`;
  }

  // Check if customer already exists with this phone number
  const existingIdx = customers.findIndex(c => normalizePhone(c.phone) === cleanPhone || c.phone === cleanPhone);
  if (existingIdx !== -1) {
    const existing = customers[existingIdx];
    // If name is provided and different, update name
    if (name.trim() && existing.name !== name.trim() && name.trim() !== 'Vaste Klant') {
      customers[existingIdx] = { ...existing, name: name.trim() };
      saveLoyaltyCustomers(customers, customClient);
      return customers[existingIdx];
    }
    return existing;
  }

  const newCust: LoyaltyCustomer = {
    id: `c_${cleanPhone}_${Date.now()}`,
    name: name.trim() || 'Vaste Klant',
    phone: cleanPhone,
    coins: 50, // 50 Welcome bonus WerkCoins!
    totalSpent: 0,
    ordersCount: 0,
    tier: 'Brons',
    joinedDate: new Date().toISOString().split('T')[0]
  };

  const updated = [newCust, ...customers];
  saveLoyaltyCustomers(updated, customClient);
  return newCust;
}

export function addCoinsToCustomer(phone: string, subtotalAmount: number, paidAmount?: number, orderNo?: number, customClient?: any): LoyaltyCustomer | null {
  const customers = getLoyaltyCustomers();
  const idx = customers.findIndex(c => c.phone === phone);
  if (idx === -1) return null;

  const current = customers[idx];
  const isVipSub = !!(current.vipSubscriptionActive && (!current.vipSubscriptionExpires || new Date(current.vipSubscriptionExpires) >= new Date()));
  const tierInfo = getTierInfo(current.tier || current.totalSpent, isVipSub);

  // €1 = 10 WerkCoins * Tier Multiplier (e.g. 1.5x for Gold, 2.0x for VIP)
  const actualPaid = typeof paidAmount === 'number' ? paidAmount : subtotalAmount;
  const baseCoins = Math.max(1, Math.floor(Math.max(subtotalAmount, actualPaid) * 10));
  const earnedCoins = Math.round(baseCoins * (tierInfo.multiplier || 1.0));
  
  const today = new Date().toISOString().split('T')[0];
  const updatedCust = { ...current };
  updatedCust.coins += earnedCoins;
  updatedCust.totalSpent += actualPaid;
  updatedCust.currentMonthSpent = (updatedCust.currentMonthSpent || 0) + actualPaid;
  updatedCust.ordersCount += 1;
  updatedCust.lastOrderDate = today;
  updatedCust.ordersTodayCount = (updatedCust.lastOrderDate === today ? (updatedCust.ordersTodayCount || 0) : 0) + 1;

  // Update Tier & Level
  if (!isVipSub) {
    const newTier = getTierInfo(updatedCust.totalSpent);
    updatedCust.tier = newTier.name;
    updatedCust.level = newTier.level;
  }

  // Clear grace warnings if monthly target reached
  const finalEvaluated = evaluateCustomerTierRetention(updatedCust);

  customers[idx] = finalEvaluated;
  saveLoyaltyCustomers(customers, customClient);
  return finalEvaluated;
}

export function redeemRewardForCustomer(
  phone: string, 
  reward: LoyaltyReward,
  customClient?: any
): { customer: LoyaltyCustomer | null; voucher: LoyaltyVoucher | null; error?: string } {
  const customers = getLoyaltyCustomers();
  const idx = customers.findIndex(c => c.phone === phone);
  if (idx === -1) return { customer: null, voucher: null, error: 'Klant niet gevonden' };

  const cust = customers[idx];
  if (cust.coins < reward.coinsCost) {
    return { customer: cust, voucher: null, error: 'Onvoldoende WerkCoins' };
  }

  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);

  const prefix = reward.freeItemName ? 'VCH-ITEM' : 'VCH-DEAL';
  const newVoucher: LoyaltyVoucher = {
    id: `vch_rew_${Date.now()}`,
    code: generateVoucherCode(prefix),
    title: reward.title,
    emoji: reward.emoji,
    discountType: reward.discountType,
    discountVal: reward.discountVal,
    freeItemName: reward.freeItemName,
    applicableCategory: 'all',
    customerPhone: phone,
    createdAt: new Date().toISOString(),
    expiresAt: expiry.toISOString(),
    status: 'active'
  };

  const updatedCust = { ...cust };
  updatedCust.coins -= reward.coinsCost;
  updatedCust.vouchers = [newVoucher, ...(updatedCust.vouchers || [])];

  customers[idx] = updatedCust;
  saveLoyaltyCustomers(customers, customClient);
  return { customer: updatedCust, voucher: newVoucher };
}

export function deductCoinsFromCustomer(phone: string, coinsToDeduct: number, customClient?: any): LoyaltyCustomer | null {
  const customers = getLoyaltyCustomers();
  const idx = customers.findIndex(c => c.phone === phone);
  if (idx === -1) return null;

  const updatedCust = { ...customers[idx] };
  updatedCust.coins = Math.max(0, updatedCust.coins - coinsToDeduct);

  customers[idx] = updatedCust;
  saveLoyaltyCustomers(customers, customClient);
  return updatedCust;
}

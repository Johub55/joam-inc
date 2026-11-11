import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  Order, 
  Product, 
  CartItem, 
  BankAccount, 
  BankTransaction, 
  InventoryItem, 
  Coupon, 
  GiftCard, 
  PosUser, 
  SupabaseConfig,
  BrandType,
  BrandConfig
} from '../types';
import { DEFAULT_PRODUCTS, KOEKPLOEG_PRODUCTS, ALL_DEFAULT_PRODUCTS } from './defaultProducts';
import { AudioFX } from './audio';

// Default Supabase project endpoints provided by the user
export const DEFAULT_SUPABASE_POS_URL = "https://qbncbzchrmbqhfbxgvbr.supabase.co";
export const DEFAULT_SUPABASE_POS_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFibmNiemNocm1icWhmYnhndmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjI4OTUsImV4cCI6MjEwNDQzODg5NX0.cBbcg-VQyZ8NoxkVlDWF2ddmyD8MAS2jtHjRvDtrlOo";

export const DEFAULT_SUPABASE_PAY_URL = "https://qbncbzchrmbqhfbxgvbr.supabase.co";
export const DEFAULT_SUPABASE_PAY_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFibmNiemNocm1icWhmYnhndmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4NjI4OTUsImV4cCI6MjEwNDQzODg5NX0.cBbcg-VQyZ8NoxkVlDWF2ddmyD8MAS2jtHjRvDtrlOo";

// Store / Brand Branding Presets
export const BRAND_CONFIGS: Record<BrandType, BrandConfig> = {
  werkpay: {
    id: 'werkpay',
    name: 'Werkdonalds',
    tagline: 'Vers Bereid • Snelle Kassa & Keuken',
    logoEmoji: '🍔',
    themeColor: 'blue',
    badgeText: 'WERKDONALDS POS',
    kitchenTitle: 'Werkdonalds Keuken KDS',
    primaryButtonClass: 'bg-blue-600 hover:bg-blue-500 text-white',
    accentBadgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    headerGradient: 'from-blue-600 via-blue-500 to-cyan-400'
  },
  koekploeg: {
    id: 'koekploeg',
    name: 'De Koekploeg',
    tagline: 'Ambachtelijke Stroopwafels & Verse Bakkerij',
    logoEmoji: '🧇',
    themeColor: 'yellow',
    badgeText: 'DE KOEKPLOEG 🧇',
    kitchenTitle: 'De Koekploeg Bakkerij Keuken',
    primaryButtonClass: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/20',
    accentBadgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    headerGradient: 'from-amber-500 via-yellow-400 to-amber-600'
  }
};

// Initial Demo data
export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  { id: 1, username: 'joas', password: 'admin123', account_holder: 'Joas Thorig', card_uid: '4129 8831 5504 9012', pin_code: '0000', balance: 999999.00, is_admin: true }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  { id: 1, item_name: "🍔 Burger Broodjes (Sesam)", stock_qty: 150, min_qty: 30, unit: "stuks", cost_price: 0.35, supplier_name: "Bakkerij Bakkersland" },
  { id: 2, item_name: "🥩 100% Rundvlees Patties", stock_qty: 120, min_qty: 25, unit: "stuks", cost_price: 0.65, supplier_name: "Vleesbedrijf Van Loon" },
  { id: 3, item_name: "🍗 Krokante Kip Patties", stock_qty: 80, min_qty: 20, unit: "stuks", cost_price: 0.55, supplier_name: "Pluimvee Verbeek" },
  { id: 4, item_name: "🍟 Franse Friet (Dozen 10kg)", stock_qty: 25, min_qty: 5, unit: "dozen", cost_price: 4.50, supplier_name: "Aviko Potato" },
  { id: 5, item_name: "🧀 Cheddar Kaas Plakjes", stock_qty: 200, min_qty: 40, unit: "stuks", cost_price: 0.15, supplier_name: "FrieslandCampina" },
  { id: 6, item_name: "🥤 Coca-Cola Siroop (Tanks)", stock_qty: 10, min_qty: 2, unit: "stuks", cost_price: 18.50, supplier_name: "Coca-Cola Europacific" },
  { id: 7, item_name: "🎁 WerkMeal Speeltjes & Verrassingen", stock_qty: 100, min_qty: 20, unit: "stuks", cost_price: 0.80, supplier_name: "Toy Logistics Europe" }
];

export const INITIAL_COUPONS: Coupon[] = [];

export const INITIAL_GIFT_CARDS: GiftCard[] = [];

export const ORDER_KIOSK_USER: PosUser = {
  id: 0,
  name: 'Bestel Account (Klant)',
  username: 'bestel_kassa',
  perms: ['pos', 'pickup'],
  is_admin: false
};

export const RPI_KIOSK_USER: PosUser = {
  id: 98,
  name: 'Raspberry Pi Spaarpaal Terminal',
  username: 'rpi',
  password: 'extra9',
  perms: ['loyalty_terminal'],
  is_admin: false,
  is_terminal_locked: true,
  assigned_screen: 'loyalty_terminal'
};

export const INITIAL_POS_USERS: PosUser[] = [
  { 
    id: 1, 
    name: 'Joas Thorig', 
    username: 'joas', 
    password: 'admin123', 
    perms: ['pos', 'kitchen', 'pickup', 'voorraad', 'manager', 'medewerkers', 'producten', 'coupons_giftcards', 'cash_pay'], 
    is_admin: true 
  },
  ORDER_KIOSK_USER,
  RPI_KIOSK_USER
];

export function euro(amount: number | string | undefined | null): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '€ 0,00';
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n);
}

export function formatCardUid(uid?: string): string {
  const raw = String(uid || '').replace(/\s+/g, '');
  if (!raw) return '•••• •••• •••• ••••';
  return raw.replace(/(.{4})/g, '$1 ').trim();
}

// Supabase Client Factory to prevent multiple instances
const _clientCache = new Map<string, SupabaseClient>();

export function getSupabaseClient(url?: string, key?: string, options?: any): SupabaseClient | null {
  // 1. Try to load from arguments
  let targetUrl = url;
  let targetKey = key;

  // 2. If not in arguments, try localStorage
  if (!targetUrl || !targetKey) {
    if (typeof window !== 'undefined') {
      try {
        const cfgRaw = localStorage.getItem('wd_sb_cfg');
        const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
        if (!targetUrl) targetUrl = cfg.unifiedUrl || cfg.supabaseUrl;
        if (!targetKey) targetKey = cfg.unifiedKey || cfg.supabaseAnonKey;
      } catch (e) {}
    }
  }

  // 3. If still not found, fallback to hardcoded defaults
  if (!targetUrl) targetUrl = DEFAULT_SUPABASE_POS_URL;
  if (!targetKey) targetKey = DEFAULT_SUPABASE_POS_KEY;

  if (!targetUrl || !targetKey) return null;

  const cacheKey = `${targetUrl}::${targetKey}`;
  if (_clientCache.has(cacheKey)) {
    return _clientCache.get(cacheKey) || null;
  }

  const client = createClient(targetUrl, targetKey, options || {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } }
  });

  _clientCache.set(cacheKey, client);
  return client;
}

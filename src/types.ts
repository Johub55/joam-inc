export type AppMode = 'pos' | 'werkpay' | 'split' | 'setup';

export type BrandType = 'werkpay' | 'koekploeg';

export interface BrandConfig {
  id: BrandType;
  name: string;
  tagline: string;
  logoEmoji: string;
  themeColor: string;
  badgeText: string;
  kitchenTitle: string;
  primaryButtonClass: string;
  accentBadgeClass: string;
  headerGradient: string;
}

export type PosScreenType = 'kassa' | 'keuken' | 'afhaal' | 'pickup_control' | 'volgscherm' | 'voorraad' | 'manager' | 'loyalty_terminal';

export type WerkPayScreenType = 'wallet' | 'overboeken' | 'accounts';

export interface ProductOption {
  id: string;
  name: string;
  choices: { name: string; priceAdjustment: number }[];
  multipleSelection: boolean;
}

export interface ProductRecipeItem {
  inventoryItemId?: number;
  ingredientName: string;
  amount: number;
  unit?: string;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  salePrice: number;
  onSale: boolean;
  cat: string;
  emoji: string;
  inStock: boolean;
  options?: ProductOption[];
  brand?: 'werkpay' | 'koekploeg' | 'both';
  recipe?: ProductRecipeItem[];
  recipeDescription?: string;
}

export interface CartItem {
  id: number | string;
  productId: number;
  name: string;
  price: number;
  qty: number;
  itemNote?: string;
}

export type OrderStatus =
  | 'wachten'
  | 'bereiden'
  | 'oven_grill'
  | 'frituren'
  | 'inpakken'
  | 'klaar'
  | 'afgehaald'
  | 'geannuleerd'
  | 'new'
  | 'done'
  | 'archived'
  | 'cancelled';

export type OrderItemStage = 'wachten' | 'bereiden' | 'inpakken' | 'klaar';

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
  cat?: string;
  itemNote?: string;
  done?: boolean;
  stage?: OrderItemStage;
}

export interface Order {
  id?: number | string;
  no: number;
  items: OrderItem[];
  total: number;
  discount: number;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  identifier: string; // Tafelnummer, Klantnaam of Bezorgadres
  notes?: string;
  paymentMethod: 'workpay' | 'cash' | 'giftcard';
  paymentMeta?: {
    mode?: 'login' | 'card' | 'quick' | 'terminal';
    reference?: string;
    account?: string;
    cardUid?: string;
    balance_after?: number;
    received?: number;
    change?: number;
    accepted_by?: string;
    brand?: string;
    brandName?: string;
  };
  cashier: string;
  status: OrderStatus;
  isPrio?: boolean;
  time: string;
  timestamp: number;
  updatedAt?: number;
}

export interface LinkedNfcTag {
  uid: string;
  label?: string;
  linkedAt?: string;
}

export interface BankAccount {
  id: number | string;
  username: string;
  password?: string;
  account_holder: string;
  card_uid: string;
  linked_uids?: LinkedNfcTag[];
  pin_code?: string;
  balance: number;
  is_admin: boolean;
  is_banned?: boolean;
  is_suspended?: boolean;
  is_shadowbanned?: boolean;
  is_2fa_enabled?: boolean;
  totp_secret?: string;
  backup_codes?: string[];
  created_at?: string;
}

export interface BankTransaction {
  id: number | string;
  from_account: string;
  to_account: string;
  amount: number;
  label: string;
  note?: string;
  order_no?: number;
  when: string;
  timestamp: number;
}

export interface InventoryItem {
  id: number;
  item_name: string;
  stock_qty: number;
  min_qty: number;
  unit: string;
  cost_price: number;
  supplier_name: string;
}

export interface Coupon {
  id: number;
  code: string;
  discount_type: 'percent' | 'fixed' | 'product' | 'threshold' | 'free_item';
  discount_val: number;
  min_subtotal?: number;
  target_product_name?: string;
  target_category?: string;
  description?: string;
  is_active: boolean;
}

export interface GiftCard {
  id: number;
  code: string;
  initial_balance: number;
  current_balance: number;
  sender_name?: string;
  recipient_name?: string;
  recipient_phone?: string;
  message?: string;
  is_active: boolean;
  is_private?: boolean;
  notes?: string;
  created_at?: string;
}

export interface LoyaltyVoucher {
  id: string;
  code: string;
  title: string;
  emoji: string;
  discountType: 'fixed_discount' | 'percent_discount' | 'free_item';
  discountVal: number;
  freeItemName?: string;
  minOrderAmount?: number;
  applicableCategory?: string;
  customerPhone: string;
  createdAt: string;
  expiresAt: string;
  status: 'active' | 'used' | 'expired';
  usedAt?: string;
  usedInOrderNo?: number;
}

export interface PosUser {
  id: number;
  name: string;
  username: string;
  password?: string;
  perms: string[];
  is_admin?: boolean;
  is_banned?: boolean;
  is_suspended?: boolean;
  is_shadowbanned?: boolean;
  is_2fa_enabled?: boolean;
  totp_secret?: string;
  backup_codes?: string[];
  is_terminal_locked?: boolean;
  assigned_screen?: PosScreenType;
  session_token?: string;
  theme?: string;
}

export interface OrderStopConfig {
  showClock: boolean;
  showNews: boolean;
  theme: 'rose' | 'amber' | 'emerald' | 'blue' | 'slate';
  blockPickup: boolean;
  icon: string;
  title: string;
}

export interface CustomBrandingConfig {
  storeName: string;
  tagline: string;
  logoEmoji: string;
  primaryColor: string;
  headerGradient: string;
  useCustomBranding: boolean;
  tvAutoStart: boolean;
  tvStartTime: string;
  tvWidgets: {
    prep: boolean;
    ready: boolean;
    menu: boolean;
    ticker: boolean;
    deal: boolean;
    waitTime: boolean;
    stats: boolean;
  };
  tvLayout: 'split_50' | 'menu_focus' | 'pickup_focus';
  nosCategory: 'general' | 'sport' | 'tech' | 'binnenland';
}

export interface SupabaseConfig {
  unifiedUrl: string;
  unifiedKey: string;
  useSeparatePay: boolean;
  payUrl?: string;
  payKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface CashPaymentRequest {
  id: string;
  orderNo: number;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  identifier: string;
  total: number;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: number;
  approvedBy?: string;
  received?: number;
  change?: number;
  rejectedReason?: string;
}


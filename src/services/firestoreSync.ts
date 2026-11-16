import {
  BankAccount,
  BankTransaction,
  CashPaymentRequest,
  Coupon,
  GiftCard,
  InventoryItem,
  Order,
  OrderStatus,
  PosUser,
  Product
} from '../types';
import { ALL_DEFAULT_PRODUCTS } from './defaultProducts';
import { LoyaltyCustomer } from './loyalty';
import {
  db,
  fsDeleteDoc,
  fsGetCollection,
  fsGetDoc,
  fsRunTransaction,
  fsSetDoc,
  OperationType,
  handleFirestoreError,
  sanitizeDocId,
  sanitizeForFirestore
} from './firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { formatCardUid, parseLinkedUids } from './store';

// Document ID builders matching firestore.rules isValidId regex ^[a-zA-Z0-9_\-]+$
export const productDocId = (id: number | string) => `prod_${sanitizeDocId(String(id))}`;
export const orderDocId = (orderNo: number | string) => `ord_${sanitizeDocId(String(orderNo))}`;
export const bankAccountDocId = (username: string) => `acc_${sanitizeDocId(username.toLowerCase())}`;
export const bankTxDocId = (id: number | string) => `tx_${sanitizeDocId(String(id))}`;
export const posUserDocId = (id: number | string) => `usr_${sanitizeDocId(String(id))}`;
export const inventoryDocId = (id: number | string) => `inv_${sanitizeDocId(String(id))}`;
export const couponDocId = (id: number | string) => `coup_${sanitizeDocId(String(id))}`;
export const giftCardDocId = (id: number | string) => `gc_${sanitizeDocId(String(id))}`;
export const cashRequestDocId = (id: string) => sanitizeDocId(id);
export const loyaltyDocId = (id: string) => sanitizeDocId(id);
export const sessionDocId = (deviceId: string) => `sess_${sanitizeDocId(deviceId)}`;
export const tvPresetDocId = (id: string) => sanitizeDocId(id);

function clampStr(val: unknown, max: number, fallback = ''): string {
  const s = val === undefined || val === null ? fallback : String(val);
  return s.slice(0, max);
}

function clampNum(val: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ===============================================================
// Products (including full keuzemenu's / Product.options & recipes!)
// ===============================================================
export function toFirestoreProduct(p: Product): Record<string, any> {
  const docData: Record<string, any> = {
    id: clampNum(p.id, 0, 9999999999999, Date.now()),
    name: clampStr(p.name, 160, 'Product'),
    price: clampNum(p.price, 0, 100000, 0),
    salePrice: clampNum(p.salePrice, 0, 100000, 0),
    onSale: Boolean(p.onSale),
    cat: clampStr(p.cat, 80, 'Overig'),
    emoji: clampStr(p.emoji, 32, '🍔'),
    inStock: p.inStock !== false,
    updatedAt: Date.now()
  };

  // Preserve explicit empty array `[]` so deleting keuzemenu's persists!
  if (Array.isArray(p.options)) {
    docData.options = p.options
      .slice(0, 30)
      .filter((o) => o && typeof o === 'object')
      .map((o) => sanitizeForFirestore(o));
  }

  if (p.brand && (p.brand === 'werkpay' || p.brand === 'koekploeg' || p.brand === 'both')) {
    docData.brand = p.brand;
  }

  if (Array.isArray(p.recipe)) {
    docData.recipe = p.recipe
      .slice(0, 50)
      .filter((r) => r && typeof r === 'object')
      .map((r) => sanitizeForFirestore(r));
  }

  if (typeof p.recipeDescription === 'string' && p.recipeDescription.length > 0) {
    docData.recipeDescription = p.recipeDescription.slice(0, 1000);
  }

  return docData;
}

export function fromFirestoreProduct(raw: any): Product {
  const numId = Number(raw.id);
  const defP = ALL_DEFAULT_PRODUCTS.find((d) => d.id === numId);

  // CRITICAL: Only fall back to default options if the field is completely absent (`=== undefined`),
  // so explicitly cleared choice menus (`options: []`) stay empty across devices!
  const options =
    raw.options !== undefined
      ? Array.isArray(raw.options)
        ? raw.options
        : []
      : defP?.options;

  const recipe =
    raw.recipe !== undefined
      ? Array.isArray(raw.recipe)
        ? raw.recipe
        : []
      : defP?.recipe;

  return {
    id: numId,
    name: String(raw.name || defP?.name || ''),
    price: Number(raw.price ?? defP?.price ?? 0),
    salePrice: Number(raw.salePrice ?? raw.sale_price ?? defP?.salePrice ?? 0),
    onSale: Boolean(raw.onSale ?? raw.on_sale),
    cat: String(raw.cat || defP?.cat || 'Overig'),
    emoji: String(raw.emoji || defP?.emoji || '🍔'),
    inStock: raw.inStock !== undefined ? Boolean(raw.inStock) : raw.in_stock !== undefined ? Boolean(raw.in_stock) : true,
    options,
    brand: raw.brand || defP?.brand,
    recipe,
    recipeDescription:
      raw.recipeDescription !== undefined
        ? raw.recipeDescription
        : raw.recipe_description !== undefined
        ? raw.recipe_description
        : defP?.recipeDescription
  };
}

export async function saveProductToFirestore(p: Product): Promise<void> {
  await fsSetDoc('products', productDocId(p.id), toFirestoreProduct(p));
}

export async function deleteProductFromFirestore(id: number): Promise<void> {
  await fsDeleteDoc('products', productDocId(id));
}

export async function saveProductsBatchToFirestore(list: Product[]): Promise<void> {
  try {
    const chunkSize = 400;
    for (let i = 0; i < list.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = list.slice(i, i + chunkSize);
      for (const p of chunk) {
        const ref = doc(db, 'products', productDocId(p.id));
        batch.set(ref, sanitizeForFirestore(toFirestoreProduct(p)));
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'products');
  }
}

// ===============================================================
// Orders
// ===============================================================
const VALID_ORDER_STATUSES = new Set([
  'wachten',
  'bereiden',
  'oven_grill',
  'frituren',
  'inpakken',
  'klaar',
  'afgehaald',
  'geannuleerd',
  'new',
  'done',
  'archived',
  'cancelled'
]);

const VALID_PAYMENT_METHODS = new Set(['workpay', 'cash', 'giftcard']);

export function toFirestoreOrder(o: Order): Record<string, any> {
  const status = VALID_ORDER_STATUSES.has(o.status) ? o.status : 'wachten';
  const orderType =
    o.orderType === 'dine_in' || o.orderType === 'takeaway' || o.orderType === 'delivery'
      ? o.orderType
      : 'takeaway';

  const items = Array.isArray(o.items)
    ? o.items.slice(0, 150).map((it) => sanitizeForFirestore({ ...it }))
    : [];

  const docData: Record<string, any> = {
    id: o.id ?? o.no,
    no: clampNum(o.no, 0, 999999999, 1),
    items,
    total: clampNum(o.total, 0, 100000, 0),
    discount: clampNum(o.discount, 0, 100000, 0),
    orderType,
    identifier: clampStr(o.identifier, 160, 'Klant'),
    status,
    isPrio: Boolean(o.isPrio),
    time: clampStr(o.time, 32, ''),
    timestamp: clampNum(o.timestamp, 0, 9999999999999, Date.now()),
    updatedAt: clampNum(o.updatedAt, 0, 9999999999999, Date.now())
  };

  if (o.notes) docData.notes = clampStr(o.notes, 500);
  if (o.cashier) docData.cashier = clampStr(o.cashier, 100);
  if (o.paymentMethod && VALID_PAYMENT_METHODS.has(o.paymentMethod)) {
    docData.paymentMethod = o.paymentMethod;
  }
  if (o.paymentMeta && typeof o.paymentMeta === 'object') {
    docData.paymentMeta = sanitizeForFirestore(o.paymentMeta);
  }

  return docData;
}

export async function saveOrderToFirestore(o: Order): Promise<void> {
  await fsSetDoc('orders', orderDocId(o.no), toFirestoreOrder(o));
}

export async function deleteOrderFromFirestore(orderNo: number): Promise<void> {
  await fsDeleteDoc('orders', orderDocId(orderNo));
}

// ===============================================================
// Bank Accounts & Transactions
// ===============================================================
export function toFirestoreBankAccount(acc: BankAccount): Record<string, any> {
  const linked = parseLinkedUids(acc.linked_uids)
    .slice(0, 50)
    .map((u) => sanitizeForFirestore(u));

  const cardUids = Array.isArray(acc.card_uids)
    ? acc.card_uids.slice(0, 50).map((x) => String(x).slice(0, 64))
    : undefined;

  const docData: Record<string, any> = {
    id: acc.id,
    username: clampStr(acc.username.trim().toLowerCase(), 64, 'user'),
    account_holder: clampStr(acc.account_holder, 120, acc.username),
    balance: clampNum(acc.balance, 0, 100000000, 0),
    is_admin: Boolean(acc.is_admin),
    is_banned: Boolean(acc.is_banned),
    is_suspended: Boolean(acc.is_suspended),
    is_shadowbanned: Boolean(acc.is_shadowbanned),
    is_2fa_enabled: Boolean(acc.is_2fa_enabled),
    linked_uids: linked,
    updated_at: new Date().toISOString()
  };

  if (acc.password) docData.password = clampStr(acc.password, 128);
  if (acc.card_uid) docData.card_uid = clampStr(acc.card_uid, 64);
  if (cardUids && cardUids.length > 0) docData.card_uids = cardUids;
  if (acc.pin_code) docData.pin_code = clampStr(acc.pin_code, 32);
  if (acc.totp_secret) docData.totp_secret = clampStr(acc.totp_secret, 128);
  if (Array.isArray(acc.backup_codes)) {
    docData.backup_codes = acc.backup_codes.slice(0, 20).map((c) => clampStr(c, 32));
  }
  if (acc.created_at) docData.created_at = clampStr(acc.created_at, 64);

  return docData;
}

export function fromFirestoreBankAccount(raw: any): BankAccount {
  return {
    id: raw.id,
    username: String(raw.username || ''),
    password: raw.password ? String(raw.password) : undefined,
    account_holder: String(raw.account_holder || raw.username || ''),
    card_uid: raw.card_uid ? formatCardUid(raw.card_uid) : undefined,
    linked_uids: parseLinkedUids(raw.linked_uids),
    card_uids: Array.isArray(raw.card_uids) ? raw.card_uids : undefined,
    pin_code: raw.pin_code ? String(raw.pin_code) : undefined,
    balance: Number(raw.balance ?? 0),
    is_admin: Boolean(raw.is_admin),
    is_banned: Boolean(raw.is_banned),
    is_suspended: Boolean(raw.is_suspended),
    is_shadowbanned: Boolean(raw.is_shadowbanned),
    is_2fa_enabled: Boolean(raw.is_2fa_enabled),
    totp_secret: raw.totp_secret ? String(raw.totp_secret) : undefined,
    backup_codes: Array.isArray(raw.backup_codes) ? raw.backup_codes : undefined,
    created_at: raw.created_at ? String(raw.created_at) : undefined
  };
}

export async function saveBankAccountToFirestore(acc: BankAccount): Promise<void> {
  await fsSetDoc('bank_accounts', bankAccountDocId(acc.username), toFirestoreBankAccount(acc));
}

export async function deleteBankAccountFromFirestore(username: string): Promise<void> {
  await fsDeleteDoc('bank_accounts', bankAccountDocId(username));
}

export function toFirestoreBankTransaction(tx: BankTransaction): Record<string, any> {
  const docData: Record<string, any> = {
    id: tx.id,
    from_account: clampStr(tx.from_account, 100, 'onbekend'),
    to_account: clampStr(tx.to_account, 100, 'onbekend'),
    amount: clampNum(tx.amount, 0, 100000000, 0),
    label: clampStr(tx.label, 160, 'Transactie'),
    when: clampStr(tx.when, 64, new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })),
    timestamp: clampNum(tx.timestamp, 0, 9999999999999, Date.now())
  };
  if (tx.note) docData.note = clampStr(tx.note, 500);
  if (typeof tx.order_no === 'number' && Number.isFinite(tx.order_no)) {
    docData.order_no = tx.order_no;
  }
  return docData;
}

export async function saveBankTransactionToFirestore(tx: BankTransaction): Promise<void> {
  await fsSetDoc('bank_transactions', bankTxDocId(tx.id), toFirestoreBankTransaction(tx));
}

export async function adjustBankBalanceTransaction(
  username: string,
  delta: number,
  fallbackAccount?: BankAccount
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  const docId = bankAccountDocId(username);
  const path = `bank_accounts/${docId}`;
  return await fsRunTransaction(async (tx) => {
    const ref = doc(db, 'bank_accounts', docId);
    const snap = await tx.get(ref);
    let baseData: Record<string, any> | null = snap.exists() ? snap.data() : null;
    if (!baseData && fallbackAccount) {
      baseData = toFirestoreBankAccount(fallbackAccount);
    }
    if (!baseData) {
      return { success: false, newBalance: 0, error: 'WerkPay rekening niet gevonden.' };
    }
    const isAdmin = Boolean(baseData.is_admin);
    const currentBal = Number(baseData.balance || 0);
    if (!isAdmin && delta < 0 && currentBal + delta < -0.001) {
      return { success: false, newBalance: currentBal, error: 'Onvoldoende saldo op WerkPay rekening.' };
    }
    const nextBal = isAdmin
      ? currentBal
      : Math.max(0, Math.min(100000000, Math.round((currentBal + delta) * 100) / 100));

    const payload = sanitizeForFirestore({
      ...baseData,
      balance: nextBal,
      updated_at: new Date().toISOString()
    });
    tx.set(ref, payload);
    return { success: true, newBalance: nextBal };
  }, path);
}

// ===============================================================
// POS Users
// ===============================================================
export function toFirestorePosUser(u: PosUser, cleanPerms: string[]): Record<string, any> {
  const docData: Record<string, any> = {
    id: u.id,
    username: clampStr(u.username, 64, 'user'),
    name: clampStr(u.name, 120, u.username),
    perms: cleanPerms.slice(0, 50).map((p) => clampStr(p, 64)),
    is_admin: Boolean(u.is_admin),
    is_banned: Boolean(u.is_banned),
    is_suspended: Boolean(u.is_suspended),
    is_shadowbanned: Boolean(u.is_shadowbanned),
    is_2fa_enabled: Boolean(u.is_2fa_enabled),
    is_terminal_locked: Boolean(u.is_terminal_locked),
    updated_at: new Date().toISOString()
  };

  if (u.password) docData.password = clampStr(u.password, 128);
  if (u.totp_secret) docData.totp_secret = clampStr(u.totp_secret, 128);
  if (Array.isArray(u.backup_codes)) {
    docData.backup_codes = u.backup_codes.slice(0, 20).map((c) => clampStr(c, 32));
  }
  if (u.assigned_screen) docData.assigned_screen = clampStr(u.assigned_screen, 64);
  if (u.session_token) docData.session_token = clampStr(u.session_token, 128);
  if (u.theme) docData.theme = clampStr(u.theme, 64);

  return docData;
}

export async function savePosUserToFirestore(u: PosUser, dbPerms: string[]): Promise<void> {
  await fsSetDoc('pos_users', posUserDocId(u.id), toFirestorePosUser(u, dbPerms));
}

export async function deletePosUserFromFirestore(id: number | string): Promise<void> {
  await fsDeleteDoc('pos_users', posUserDocId(id));
}

// ===============================================================
// Inventory
// ===============================================================
export function toFirestoreInventoryItem(item: InventoryItem): Record<string, any> {
  return {
    id: clampNum(item.id, 0, 9999999999999, Date.now()),
    item_name: clampStr(item.item_name, 160, 'Artikel'),
    stock_qty: clampNum(item.stock_qty, 0, 1000000, 0),
    min_qty: clampNum(item.min_qty, 0, 1000000, 0),
    unit: clampStr(item.unit, 32, 'stuks'),
    cost_price: clampNum(item.cost_price, 0, 100000, 0),
    supplier_name: clampStr(item.supplier_name, 120, 'Leverancier'),
    updated_at: new Date().toISOString()
  };
}

export async function saveInventoryItemToFirestore(item: InventoryItem): Promise<void> {
  await fsSetDoc('inventory', inventoryDocId(item.id), toFirestoreInventoryItem(item));
}

export async function saveInventoryBatchToFirestore(list: InventoryItem[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const item of list) {
      batch.set(doc(db, 'inventory', inventoryDocId(item.id)), sanitizeForFirestore(toFirestoreInventoryItem(item)));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'inventory');
  }
}

// ===============================================================
// Coupons & Gift Cards
// ===============================================================
export function toFirestoreCoupon(c: Coupon): Record<string, any> {
  const validType = ['percent', 'fixed', 'product', 'threshold', 'free_item'].includes(c.discount_type)
    ? c.discount_type
    : 'fixed';
  const docData: Record<string, any> = {
    id: clampNum(c.id, 0, 9999999999999, Date.now()),
    code: clampStr(c.code.toUpperCase(), 64, 'CODE'),
    discount_type: validType,
    discount_val: clampNum(c.discount_val, 0, 100000, 0),
    is_active: Boolean(c.is_active),
    updated_at: new Date().toISOString()
  };
  if (typeof c.min_subtotal === 'number' && c.min_subtotal > 0) {
    docData.min_subtotal = clampNum(c.min_subtotal, 0, 100000, 0);
  }
  if (c.target_product_name) docData.target_product_name = clampStr(c.target_product_name, 160);
  if (c.target_category) docData.target_category = clampStr(c.target_category, 80);
  if (c.description) docData.description = clampStr(c.description, 300);
  return docData;
}

export async function saveCouponToFirestore(c: Coupon): Promise<void> {
  await fsSetDoc('coupons', couponDocId(c.id), toFirestoreCoupon(c));
}

export function toFirestoreGiftCard(g: GiftCard): Record<string, any> {
  const docData: Record<string, any> = {
    id: clampNum(g.id, 0, 9999999999999, Date.now()),
    code: clampStr(g.code.toUpperCase(), 64, 'GC'),
    initial_balance: clampNum(g.initial_balance, 0, 100000, 0),
    current_balance: clampNum(g.current_balance, 0, 100000, 0),
    is_active: Boolean(g.is_active),
    is_private: Boolean(g.is_private),
    updated_at: new Date().toISOString()
  };
  if (g.sender_name) docData.sender_name = clampStr(g.sender_name, 120);
  if (g.recipient_name) docData.recipient_name = clampStr(g.recipient_name, 120);
  if (g.recipient_phone) docData.recipient_phone = clampStr(g.recipient_phone, 32);
  if (g.message) docData.message = clampStr(g.message, 500);
  if (g.notes) docData.notes = clampStr(g.notes, 500);
  if (g.created_at) docData.created_at = clampStr(g.created_at, 64);
  return docData;
}

export async function saveGiftCardToFirestore(g: GiftCard): Promise<void> {
  await fsSetDoc('gift_cards', giftCardDocId(g.id), toFirestoreGiftCard(g));
}

export async function deleteGiftCardFromFirestore(id: number): Promise<void> {
  await fsDeleteDoc('gift_cards', giftCardDocId(id));
}

// ===============================================================
// Cash Requests
// ===============================================================
export function toFirestoreCashRequest(req: CashPaymentRequest): Record<string, any> {
  const orderType =
    req.orderType === 'dine_in' || req.orderType === 'takeaway' || req.orderType === 'delivery'
      ? req.orderType
      : 'takeaway';
  const status =
    req.status === 'pending' ||
    req.status === 'approved' ||
    req.status === 'rejected' ||
    req.status === 'consumed'
      ? req.status
      : 'pending';

  const docData: Record<string, any> = {
    id: clampStr(req.id, 128),
    orderNo: clampNum(req.orderNo, 0, 999999999, 1),
    orderType,
    identifier: clampStr(req.identifier, 160, 'Klant'),
    total: clampNum(req.total, 0, 100000, 0),
    status,
    requestedAt: clampNum(req.requestedAt, 0, 9999999999999, Date.now())
  };

  if (req.approvedBy) docData.approvedBy = clampStr(req.approvedBy, 120);
  if (req.approvedByUsername) docData.approvedByUsername = clampStr(req.approvedByUsername, 64);
  if (typeof req.approvedAt === 'number') docData.approvedAt = req.approvedAt;
  if (typeof req.consumedAt === 'number') docData.consumedAt = req.consumedAt;
  if (typeof req.received === 'number') docData.received = clampNum(req.received, 0, 1000000, 0);
  if (typeof req.change === 'number') docData.change = clampNum(req.change, 0, 1000000, 0);
  if (req.rejectedReason) docData.rejectedReason = clampStr(req.rejectedReason, 300);

  return docData;
}

export async function saveCashRequestToFirestore(req: CashPaymentRequest): Promise<void> {
  await fsSetDoc('cash_requests', cashRequestDocId(req.id), toFirestoreCashRequest(req));
}

// ===============================================================
// Settings, Audio Broadcast Events, Sessions & Audit Logs
// ===============================================================
export async function savePosSettingsToFirestore(partial: Record<string, any>): Promise<void> {
  await fsSetDoc(
    'pos_settings',
    'default',
    {
      ...sanitizeForFirestore(partial),
      updated_at: new Date().toISOString()
    },
    { merge: true }
  );
}

export async function emitAudioBroadcastEvent(event: string, payload: Record<string, any>): Promise<void> {
  await fsSetDoc('audio_events', 'latest', {
    event: clampStr(event, 64, 'ping'),
    payload: sanitizeForFirestore(payload || {}),
    ts: Date.now()
  });
}

export async function saveAuditLogToFirestore(log: {
  action: string;
  user_name: string;
  details: string;
  timestamp: string;
}): Promise<void> {
  const id = `aud_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  await fsSetDoc('pos_audit_logs', id, {
    id,
    action: clampStr(log.action, 80, 'ACTION'),
    user_name: clampStr(log.user_name, 120, 'System'),
    details: clampStr(log.details, 500, ''),
    timestamp: clampStr(log.timestamp, 64, new Date().toISOString())
  });
}

export async function savePosSessionToFirestore(session: {
  device_id: string;
  ip_address: string;
  user_name: string;
  app_mode: string;
  pos_screen: string;
  user_agent: string;
  last_seen: string;
}): Promise<void> {
  await fsSetDoc('pos_sessions', sessionDocId(session.device_id), {
    device_id: clampStr(session.device_id, 128),
    ip_address: clampStr(session.ip_address, 64, 'Onbekend'),
    user_name: clampStr(session.user_name, 120, 'Gast'),
    app_mode: clampStr(session.app_mode, 32, 'pos'),
    pos_screen: clampStr(session.pos_screen, 64, 'kassa'),
    user_agent: clampStr(session.user_agent, 256, 'Browser'),
    last_seen: clampStr(session.last_seen, 64, new Date().toISOString())
  });
}

// ===============================================================
// Loyalty
// ===============================================================
export function toFirestoreLoyaltyCustomer(c: LoyaltyCustomer): Record<string, any> {
  const docData: Record<string, any> = {
    id: clampStr(c.id, 128),
    name: clampStr(c.name, 120, 'Vaste Klant'),
    phone: clampStr(c.phone, 32, ''),
    coins: clampNum(c.coins, 0, 100000000, 0),
    totalSpent: clampNum(c.totalSpent, 0, 100000000, 0),
    ordersCount: clampNum(c.ordersCount, 0, 1000000, 0),
    tier: clampStr(c.tier, 32, 'Brons'),
    joinedDate: clampStr(c.joinedDate, 32, new Date().toISOString().split('T')[0]),
    updatedAt: new Date().toISOString()
  };

  if (typeof c.level === 'number') docData.level = clampNum(c.level, 1, 10, 1);
  if (typeof c.currentMonthSpent === 'number') {
    docData.currentMonthSpent = clampNum(c.currentMonthSpent, 0, 100000000, 0);
  }
  if (typeof c.lastMonthSpent === 'number') {
    docData.lastMonthSpent = clampNum(c.lastMonthSpent, 0, 100000000, 0);
  }
  if (c.currentMonthKey) docData.currentMonthKey = clampStr(c.currentMonthKey, 16);
  if (typeof c.monthsBelowTarget === 'number') {
    docData.monthsBelowTarget = clampNum(c.monthsBelowTarget, 0, 100, 0);
  }
  if (c.tierGraceUntil) docData.tierGraceUntil = clampStr(c.tierGraceUntil, 32);
  if (c.lastSpinDate) docData.lastSpinDate = clampStr(c.lastSpinDate, 32);
  if (typeof c.totalSpins === 'number') docData.totalSpins = clampNum(c.totalSpins, 0, 1000000, 0);
  if (c.lastOrderDate) docData.lastOrderDate = clampStr(c.lastOrderDate, 32);
  if (typeof c.ordersTodayCount === 'number') {
    docData.ordersTodayCount = clampNum(c.ordersTodayCount, 0, 10000, 0);
  }
  if (Array.isArray(c.vouchers)) {
    docData.vouchers = c.vouchers.slice(0, 100).map((v) => sanitizeForFirestore(v));
  }
  if (c.vipSubscriptionActive !== undefined) {
    docData.vipSubscriptionActive = Boolean(c.vipSubscriptionActive);
  }
  if (c.vipSubscriptionExpires) {
    docData.vipSubscriptionExpires = clampStr(c.vipSubscriptionExpires, 32);
  }
  if (c.vipPlan) docData.vipPlan = clampStr(c.vipPlan, 32);

  return docData;
}

export async function getAllBankAccountsFromFirestore(): Promise<BankAccount[]> {
  const rows = await fsGetCollection('bank_accounts');
  return rows.map(fromFirestoreBankAccount);
}

export async function getPosSettingsFromFirestore(): Promise<Record<string, any> | null> {
  return await fsGetDoc('pos_settings', 'default');
}

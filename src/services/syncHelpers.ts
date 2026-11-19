import type { BankAccount, Coupon, GiftCard, Order, OrderStatus, PosUser } from '../types';

/**
 * Optimistic mutation lock tracker.
 * Prevents cloud polling or cross-tab echoes from overwriting freshly changed statuses or items.
 */
export const pendingOrderMutations = new Map<number, {
  status?: OrderStatus;
  items?: any[];
  isPrio?: boolean;
  timestamp: number;
}>();

export const recentlyDeletedOrders = new Map<number, number>();

export function recordLocalOrderMutation(
  orderNo: number,
  mutation: { status?: OrderStatus; items?: any[]; isPrio?: boolean }
) {
  const existing = pendingOrderMutations.get(orderNo);
  pendingOrderMutations.set(orderNo, {
    ...existing,
    ...mutation,
    timestamp: Date.now()
  });
}

export function recordDeletedOrder(orderNo: number) {
  recentlyDeletedOrders.set(orderNo, Date.now());
  pendingOrderMutations.delete(orderNo);
}

export function clearLocalOrderMutation(orderNo: number) {
  pendingOrderMutations.delete(orderNo);
}

/**
 * Format an order raw record from Firestore or storage into our strongly-typed Order object.
 */
export const formatDbOrder = (o: any): Order => {
  let parsedItems = [];
  if (typeof o.items === 'string') {
    try {
      parsedItems = JSON.parse(o.items);
    } catch {
      parsedItems = [];
    }
  } else if (Array.isArray(o.items)) {
    parsedItems = o.items;
  }

  let parsedMeta: any = {};
  const rawMeta = o.paymentMeta ?? o.payment_meta;
  if (typeof rawMeta === 'string') {
    try {
      parsedMeta = JSON.parse(rawMeta);
    } catch {
      parsedMeta = {};
    }
  } else if (typeof rawMeta === 'object' && rawMeta !== null) {
    parsedMeta = rawMeta;
  }

  const createdTs =
    typeof o.timestamp === 'number'
      ? o.timestamp
      : o.created_at
      ? new Date(o.created_at).getTime()
      : Date.now();
  const updatedTs =
    typeof o.updatedAt === 'number'
      ? o.updatedAt
      : o.updated_at
      ? new Date(o.updated_at).getTime()
      : createdTs;
  const createdDate = new Date(createdTs);

  return {
    id: o.id || createdTs,
    no: Number(o.no ?? o.order_no ?? 0),
    items: parsedItems,
    total: Number(o.total || 0),
    discount: Number(o.discount || 0),
    orderType: (o.orderType || o.order_type || 'dine_in') as any,
    identifier: o.identifier || '',
    notes: o.notes || '',
    paymentMethod: (o.paymentMethod || o.payment_method || 'workpay') as any,
    paymentMeta: parsedMeta,
    cashier: o.cashier || 'Kassa',
    status: (o.status as OrderStatus) || 'wachten',
    isPrio: Boolean(o.isPrio ?? o.is_prio ?? parsedMeta?.isPrio ?? false),
    time: o.time || createdDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
    timestamp: createdTs,
    updatedAt: updatedTs
  };
};

/**
 * Intelligently merge remote orders with local orders without glitching or bouncing back.
 * - Protects recent local status changes from being overwritten by stale cloud polling.
 * - Prevents ghost reappearance of recently deleted orders.
 * - Respects timestamps and optimistic locks.
 */
export const mergeOrders = (
  current: Order[],
  incoming: Order[]
): { merged: Order[]; hasNewRemoteOrder: boolean } => {
  let hasNewRemoteOrder = false;
  const now = Date.now();
  const currentMap = new Map<number, Order>();
  current.forEach(o => currentMap.set(o.no, o));

  const result: Order[] = [];
  const processedNos = new Set<number>();

  for (const inc of incoming) {
    // 1. If this order was deleted locally within the last 20 seconds, reject stale remote row
    const deletedTime = recentlyDeletedOrders.get(inc.no);
    if (deletedTime && now - deletedTime < 20000) {
      continue;
    }

    processedNos.add(inc.no);
    const exist = currentMap.get(inc.no);

    if (!exist) {
      // Discovered a genuine new order from another terminal/kiosk
      hasNewRemoteOrder = true;
      result.push(inc);
    } else {
      // Check for pending local mutations within protection window (15s)
      const localMutation = pendingOrderMutations.get(inc.no);
      const isMutationFresh = localMutation && now - localMutation.timestamp < 15000;

      // Status resolution: if locally mutated, NEVER let older remote poll overwrite it!
      let resolvedStatus = exist.status;
      if (isMutationFresh && localMutation.status) {
        resolvedStatus = localMutation.status;
      } else if (inc.status && inc.status !== exist.status) {
        // If remote has a genuine newer update timestamp, accept it; otherwise keep local
        if (inc.updatedAt && exist.updatedAt && inc.updatedAt > exist.updatedAt) {
          resolvedStatus = inc.status;
        } else if (!exist.updatedAt) {
          resolvedStatus = inc.status;
        }
      }

      // Items resolution: keep locally updated stages if mutated recently
      let resolvedItems = exist.items;
      if (isMutationFresh && localMutation.items) {
        resolvedItems = localMutation.items;
      } else if (inc.items && inc.items.length > 0) {
        if (inc.updatedAt && exist.updatedAt && inc.updatedAt > exist.updatedAt) {
          resolvedItems = inc.items;
        } else {
          resolvedItems = exist.items.length > 0 ? exist.items : inc.items;
        }
      }

      // Prio resolution: local toggle takes precedence
      const resolvedPrio = isMutationFresh && localMutation.isPrio !== undefined
        ? localMutation.isPrio
        : (exist.isPrio ?? inc.isPrio ?? false);

      result.push({
        ...exist,
        ...inc,
        status: resolvedStatus,
        items: resolvedItems,
        isPrio: resolvedPrio,
        updatedAt: Math.max(exist.updatedAt || exist.timestamp || 0, inc.updatedAt || inc.timestamp || 0)
      });
    }
  }

  // Keep any optimistic local orders that have not yet arrived from Firestore
  for (const exist of current) {
    if (!processedNos.has(exist.no)) {
      const deletedTime = recentlyDeletedOrders.get(exist.no);
      if (deletedTime && now - deletedTime < 20000) {
        continue; // Was recently deleted locally, skip it
      }
      
      // If the order was created very recently (e.g. less than 15 seconds ago),
      // it might be optimistic local-only and hasn't finished uploading to Firebase yet.
      // Otherwise, if it is older, and we are connected to Firestore, and it's not in incoming,
      // it has been deleted on another terminal/tab! So we should NOT keep it.
      const isOptimistic = now - exist.timestamp < 15000;
      if (isOptimistic) {
        result.push(exist);
      }
    }
  }

  // Sort descending by order number (latest first)
  result.sort((a, b) => b.no - a.no);

  return { merged: result, hasNewRemoteOrder };
};

/**
 * Universal cross-tab BroadcastChannel wrapper
 */
export const broadcastSync = (type: string, payload: any) => {
  if (typeof window === 'undefined') return;
  try {
    if ('BroadcastChannel' in window) {
      const ch = new BroadcastChannel('wd_unified_sync_channel');
      ch.postMessage({ type, payload, timestamp: Date.now() });
      ch.close();
    }
  } catch (err) {
    console.debug('BroadcastChannel post error:', err);
  }
};

export interface PendingBankWrite {
  acc: BankAccount;
  timestamp: number;
}

/**
 * Safely merge Firestore bank accounts with local & seed accounts.
 * Prevents a partial Firestore collection (e.g. 1 newly linked card) from wiping
 * other local/seed WerkPay accounts, while still propagating genuine cloud deletions
 * of accounts that were previously known to exist in Firestore.
 */
export function mergeBankAccountsList(params: {
  local: BankAccount[];
  remote: BankAccount[];
  initial?: BankAccount[];
  knownCloudKeys: Set<string>;
  deletedKeys: Set<string>;
  pendingWrites?: Map<string, PendingBankWrite>;
}): { merged: BankAccount[]; nextKnownCloudKeys: Set<string> } {
  const now = Date.now();
  const nextKnownCloudKeys = new Set(params.knownCloudKeys);
  const byUser = new Map<string, BankAccount>();

  const normKey = (u?: string) => String(u || '').trim().toLowerCase();

  // 1. Remote accounts are authoritative for anything present in Firestore
  for (const rAcc of params.remote) {
    const key = normKey(rAcc.username);
    if (!key) continue;
    nextKnownCloudKeys.add(key);

    // Protect freshly written local account for 15s against intermediate snapshots
    const pending = params.pendingWrites?.get(key);
    if (pending && now - pending.timestamp < 15000) {
      byUser.set(key, pending.acc);
    } else {
      byUser.set(key, rAcc);
    }
  }

  // 2. Keep un-uploaded local accounts (or pending writes) not in remote yet
  for (const lAcc of params.local) {
    const key = normKey(lAcc.username);
    if (!key || byUser.has(key)) continue;

    const pending = params.pendingWrites?.get(key);
    if (pending && now - pending.timestamp < 15000) {
      byUser.set(key, pending.acc);
      continue;
    }

    if (params.deletedKeys.has(key)) continue;

    // If this account previously existed in Firestore and is now missing remotely,
    // another device intentionally deleted it from the cloud.
    if (params.remote.length > 0 && params.knownCloudKeys.has(key)) {
      nextKnownCloudKeys.delete(key);
      continue;
    }

    byUser.set(key, lAcc);
  }

  // 3. Restore seed accounts (e.g. @joas) if never uploaded to cloud and never deleted
  for (const initAcc of params.initial || []) {
    const key = normKey(initAcc.username);
    if (!key || byUser.has(key)) continue;
    if (params.deletedKeys.has(key)) continue;
    byUser.set(key, initAcc);
  }

  return { merged: Array.from(byUser.values()), nextKnownCloudKeys };
}

/**
 * Safely merge Firestore POS users with local & seed POS users.
 */
export function mergePosUsersList(params: {
  local: PosUser[];
  remote: PosUser[];
  initial?: PosUser[];
  knownCloudKeys: Set<string>;
  deletedKeys: Set<string>;
}): { merged: PosUser[]; nextKnownCloudKeys: Set<string> } {
  const nextKnownCloudKeys = new Set(params.knownCloudKeys);
  const byUser = new Map<string, PosUser>();
  const normKey = (u?: string) => String(u || '').trim().toLowerCase();

  for (const rUser of params.remote) {
    const key = normKey(rUser.username);
    if (!key) continue;
    nextKnownCloudKeys.add(key);
    byUser.set(key, rUser);
  }

  for (const lUser of params.local) {
    const key = normKey(lUser.username);
    if (!key || byUser.has(key)) continue;
    if (params.deletedKeys.has(key)) continue;
    if (params.remote.length > 0 && params.knownCloudKeys.has(key)) {
      nextKnownCloudKeys.delete(key);
      continue;
    }
    byUser.set(key, lUser);
  }

  for (const initUser of params.initial || []) {
    const key = normKey(initUser.username);
    if (!key || byUser.has(key)) continue;
    if (params.deletedKeys.has(key)) continue;
    byUser.set(key, initUser);
  }

  return { merged: Array.from(byUser.values()), nextKnownCloudKeys };
}

/**
 * Safely merge numeric-id collections (coupons, gift cards) with local un-synced items.
 */
export function mergeByIdWithCloud<T extends { id: number }>(params: {
  local: T[];
  remote: T[];
  knownCloudIds: Set<number>;
}): { merged: T[]; nextKnownCloudIds: Set<number> } {
  const nextKnownCloudIds = new Set(params.knownCloudIds);
  const byId = new Map<number, T>();

  for (const rItem of params.remote) {
    nextKnownCloudIds.add(Number(rItem.id));
    byId.set(Number(rItem.id), rItem);
  }

  for (const lItem of params.local) {
    const id = Number(lItem.id);
    if (byId.has(id)) continue;
    if (params.remote.length > 0 && params.knownCloudIds.has(id)) {
      nextKnownCloudIds.delete(id);
      continue;
    }
    byId.set(id, lItem);
  }

  return { merged: Array.from(byId.values()), nextKnownCloudIds };
}

export type MergedCouponOrGiftCard = Coupon | GiftCard;

import type {
  BankAccount,
  BankTransaction,
  CashPaymentRequest,
  GiftCard,
  InventoryItem,
  Order,
} from '../types';
import {
  adjustBankBalanceTransaction,
  saveBankTransactionToFirestore,
  saveCashRequestToFirestore,
  saveGiftCardToFirestore,
  saveInventoryBatchToFirestore,
  saveOrderToFirestore,
} from './firestoreSync';

export type OfflineMutationType =
  | 'order'
  | 'bank_delta'
  | 'bank_tx'
  | 'gift_card'
  | 'cash_request'
  | 'inventory_batch';

export type OfflineMutationItem =
  | {
      qid: string;
      type: 'order';
      payload: Order;
      createdAt: number;
      attempts: number;
      lastError?: string;
    }
  | {
      qid: string;
      type: 'bank_delta';
      payload: { username: string; delta: number; fallbackAccount?: BankAccount };
      createdAt: number;
      attempts: number;
      lastError?: string;
    }
  | {
      qid: string;
      type: 'bank_tx';
      payload: BankTransaction;
      createdAt: number;
      attempts: number;
      lastError?: string;
    }
  | {
      qid: string;
      type: 'gift_card';
      payload: GiftCard;
      createdAt: number;
      attempts: number;
      lastError?: string;
    }
  | {
      qid: string;
      type: 'cash_request';
      payload: CashPaymentRequest;
      createdAt: number;
      attempts: number;
      lastError?: string;
    }
  | {
      qid: string;
      type: 'inventory_batch';
      payload: InventoryItem[];
      createdAt: number;
      attempts: number;
      lastError?: string;
    };

const OFFLINE_QUEUE_KEY = 'wd_offline_mutation_queue_v1';
export const OFFLINE_QUEUE_EVENT = 'wd_offline_queue_updated';

let isFlushing = false;

function notifyQueueUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
  }
}

export function getOfflineQueue(): OfflineMutationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(items: OfflineMutationItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-200)));
  } catch {}
  notifyQueueUpdated();
}

export function clearOfflineQueue(): void {
  saveOfflineQueue([]);
}

export function enqueueOfflineMutation(
  entry:
    | { type: 'order'; payload: Order }
    | { type: 'bank_delta'; payload: { username: string; delta: number; fallbackAccount?: BankAccount } }
    | { type: 'bank_tx'; payload: BankTransaction }
    | { type: 'gift_card'; payload: GiftCard }
    | { type: 'cash_request'; payload: CashPaymentRequest }
    | { type: 'inventory_batch'; payload: InventoryItem[] }
): OfflineMutationItem[] {
  const existing = getOfflineQueue();
  const qid = `${entry.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  let next = [...existing];

  // Voor orders, gift_cards en cash_requests houden we alleen de meest recente snapshot per ID/orderNo
  if (entry.type === 'order') {
    next = next.filter(
      (item) => !(item.type === 'order' && item.payload.no === entry.payload.no)
    );
  } else if (entry.type === 'gift_card') {
    next = next.filter(
      (item) => !(item.type === 'gift_card' && item.payload.id === entry.payload.id)
    );
  } else if (entry.type === 'cash_request') {
    next = next.filter(
      (item) => !(item.type === 'cash_request' && item.payload.id === entry.payload.id)
    );
  }

  const wrapped: OfflineMutationItem = {
    ...entry,
    qid,
    createdAt: Date.now(),
    attempts: 0,
  } as OfflineMutationItem;

  next.push(wrapped);
  saveOfflineQueue(next);
  return next;
}

export async function flushOfflineQueue(): Promise<{
  flushed: number;
  remaining: number;
  lastError?: string;
}> {
  if (isFlushing) {
    return { flushed: 0, remaining: getOfflineQueue().length };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { flushed: 0, remaining: getOfflineQueue().length, lastError: 'Apparaat is offline.' };
  }

  const initial = getOfflineQueue();
  if (initial.length === 0) {
    return { flushed: 0, remaining: 0 };
  }

  isFlushing = true;
  let flushedCount = 0;
  let lastError: string | undefined;
  const remaining: OfflineMutationItem[] = [];
  let stopEarly = false;

  try {
    for (let i = 0; i < initial.length; i++) {
      const item = initial[i];
      if (stopEarly) {
        remaining.push(item);
        continue;
      }

      try {
        if (item.type === 'order') {
          await saveOrderToFirestore(item.payload);
        } else if (item.type === 'bank_delta') {
          const res = await adjustBankBalanceTransaction(
            item.payload.username,
            item.payload.delta,
            item.payload.fallbackAccount
          );
          if (!res.success && !res.error?.toLowerCase().includes('niet gevonden')) {
            // Saldo of netwerk fout: laat niet eindeloos blokkeren na 5 pogingen als het een echte saldo-weigering is
            if (res.error?.toLowerCase().includes('onvoldoende') || item.attempts >= 5) {
              console.warn('[OfflineQueue] Drop non-retryable bank_delta:', res.error);
              flushedCount++;
              continue;
            }
            throw new Error(res.error || 'Saldoverwerking mislukt');
          }
        } else if (item.type === 'bank_tx') {
          await saveBankTransactionToFirestore(item.payload);
        } else if (item.type === 'gift_card') {
          await saveGiftCardToFirestore(item.payload);
        } else if (item.type === 'cash_request') {
          await saveCashRequestToFirestore(item.payload);
        } else if (item.type === 'inventory_batch') {
          await saveInventoryBatchToFirestore(item.payload);
        }
        flushedCount++;
      } catch (err: any) {
        lastError = err?.message || 'Netwerkfout tijdens wachtrij-sync';
        const isOfflineErr =
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          lastError.toLowerCase().includes('offline') ||
          lastError.toLowerCase().includes('network') ||
          lastError.toLowerCase().includes('unavailable');

        remaining.push({
          ...item,
          attempts: item.attempts + 1,
          lastError,
        });

        if (isOfflineErr) {
          stopEarly = true;
        }
      }
    }

    saveOfflineQueue(remaining);
    return { flushed: flushedCount, remaining: remaining.length, lastError };
  } finally {
    isFlushing = false;
  }
}

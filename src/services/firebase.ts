import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  Unsubscribe,
  SetOptions,
  Transaction
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;
export const FIREBASE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function sanitizeDocId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return (cleaned || `doc_${Date.now()}`).slice(0, 120);
}

/**
 * Recursively strips `undefined` and non-finite numbers so Firestore never throws
 * on unsupported field values. Preserves arrays and plain objects.
 */
export function sanitizeForFirestore<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (typeof val === 'number') {
    return (Number.isFinite(val) ? val : 0) as unknown as T;
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof val === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = sanitizeForFirestore(v);
      }
    }
    return out as T;
  }
  return val;
}

export async function testFirestoreConnection(): Promise<{
  success: boolean;
  latencyMs: number;
  message: string;
}> {
  const started = Date.now();
  try {
    await getDocFromServer(doc(db, 'pos_settings', 'default'));
    const latencyMs = Date.now() - started;
    return {
      success: true,
      latencyMs,
      message: `Verbonden met Firebase Cloud Firestore (${latencyMs}ms)`
    };
  } catch (error: any) {
    const latencyMs = Date.now() - started;
    const msg = error?.message || 'Kan geen verbinding maken met Firebase Firestore.';
    return {
      success: false,
      latencyMs,
      message: msg
    };
  }
}

export async function fsGetDoc<T = Record<string, any>>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const safeId = sanitizeDocId(docId);
  const path = `${collectionName}/${safeId}`;
  try {
    const snap = await getDoc(doc(db, collectionName, safeId));
    return snap.exists() ? (snap.data() as T) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fsGetCollection<T = Record<string, any>>(
  collectionName: string
): Promise<T[]> {
  try {
    const snap = await getDocs(collection(db, collectionName));
    return snap.docs.map((d) => ({ ...d.data(), _docId: d.id } as T));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionName);
  }
}

export async function fsSetDoc(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
  options?: SetOptions
): Promise<void> {
  const safeId = sanitizeDocId(docId);
  const path = `${collectionName}/${safeId}`;
  const clean = sanitizeForFirestore(data);
  try {
    if (options) {
      await setDoc(doc(db, collectionName, safeId), clean, options);
    } else {
      await setDoc(doc(db, collectionName, safeId), clean);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fsUpdateDoc(
  collectionName: string,
  docId: string,
  data: Record<string, any>
): Promise<void> {
  const safeId = sanitizeDocId(docId);
  const path = `${collectionName}/${safeId}`;
  const clean = sanitizeForFirestore(data);
  try {
    await updateDoc(doc(db, collectionName, safeId), clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fsDeleteDoc(
  collectionName: string,
  docId: string
): Promise<void> {
  const safeId = sanitizeDocId(docId);
  const path = `${collectionName}/${safeId}`;
  try {
    await deleteDoc(doc(db, collectionName, safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function fsSubscribeCollection<T = Record<string, any>>(
  collectionName: string,
  onData: (items: T[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, collectionName),
    (snap) => {
      const items = snap.docs.map((d) => ({ ...d.data(), _docId: d.id } as T));
      onData(items);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.LIST, collectionName);
      }
    }
  );
}

export function fsSubscribeDoc<T = Record<string, any>>(
  collectionName: string,
  docId: string,
  onData: (item: T | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const safeId = sanitizeDocId(docId);
  const path = `${collectionName}/${safeId}`;
  return onSnapshot(
    doc(db, collectionName, safeId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as T) : null);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }
  );
}

export async function fsRunTransaction<T>(
  fn: (transaction: Transaction) => Promise<T>,
  path: string
): Promise<T> {
  try {
    return await runTransaction(db, fn);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Hardware Terminal (Raspberry Pi Pico W PIN Pad) State Management
export type HardwareTerminalStatus =
  | 'IDLE'
  | 'LINK'
  | 'CARD_SCANNED'
  | 'LINKED'
  | 'PAY'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'DECLINED'
  | 'CHECK_CARD'
  | 'CHECK_RESULT';

export interface HardwareTerminalState {
  status: HardwareTerminalStatus;
  username?: string;
  amount?: number;
  orderNo?: number;
  scannedUid?: string;
  enteredPin?: string;
  reason?: string;
  updatedAt: string;
}

export interface HardwareTerminalProfile {
  id: string;
  label: string;
}

export const HARDWARE_TERMINAL_COLLECTION = 'hardware_terminals';
export const HARDWARE_TERMINAL_DOC_ID = '';

export const DEFAULT_HARDWARE_TERMINALS: HardwareTerminalProfile[] = [];

const TERMINALS_LIST_STORAGE_KEY = 'wd_hardware_terminals_list';
const ACTIVE_TERMINAL_STORAGE_KEY = 'wd_active_hardware_terminal';
export const HARDWARE_TERMINAL_EVENT = 'wd_hardware_terminal_changed';

export function normalizeHardwareTerminalId(raw?: string): string {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function getConfiguredHardwareTerminals(): HardwareTerminalProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TERMINALS_LIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const merged = new Map<string, HardwareTerminalProfile>();
    for (const item of parsed) {
      if (item && typeof item.id === 'string') {
        const normId = normalizeHardwareTerminalId(item.id);
        if (!normId) continue;
        merged.set(normId, {
          id: normId,
          label: String(item.label || normId).trim() || normId
        });
      }
    }
    return Array.from(merged.values());
  } catch {
    return [];
  }
}

export function saveCustomHardwareTerminal(id: string, label?: string): HardwareTerminalProfile[] {
  const normId = normalizeHardwareTerminalId(id);
  const existing = getConfiguredHardwareTerminals();
  if (!normId) return existing;
  const cleanLabel = (label || '').trim() || normId;
  const filtered = existing.filter(t => t.id !== normId);
  const next: HardwareTerminalProfile[] = [
    ...filtered,
    {
      id: normId,
      label: cleanLabel
    }
  ];
  try {
    localStorage.setItem(TERMINALS_LIST_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(HARDWARE_TERMINAL_EVENT));
  } catch {}
  return next;
}

export function removeCustomHardwareTerminal(id: string): HardwareTerminalProfile[] {
  const normId = normalizeHardwareTerminalId(id);
  const existing = getConfiguredHardwareTerminals().filter(t => t.id !== normId);
  try {
    localStorage.setItem(TERMINALS_LIST_STORAGE_KEY, JSON.stringify(existing));
    if (getActiveHardwareTerminalId() === normId || !existing.some(t => t.id === getActiveHardwareTerminalId())) {
      setActiveHardwareTerminalId(existing[0]?.id || '');
    } else {
      window.dispatchEvent(new Event(HARDWARE_TERMINAL_EVENT));
    }
  } catch {}
  return existing;
}

export function getActiveHardwareTerminalId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const configured = getConfiguredHardwareTerminals();
    if (configured.length === 0) return '';
    const stored = normalizeHardwareTerminalId(localStorage.getItem(ACTIVE_TERMINAL_STORAGE_KEY) || '');
    if (stored && configured.some(t => t.id === stored)) {
      return stored;
    }
    return configured[0].id;
  } catch {
    return '';
  }
}

export function setActiveHardwareTerminalId(id: string): string {
  const normId = normalizeHardwareTerminalId(id);
  try {
    if (normId) {
      localStorage.setItem(ACTIVE_TERMINAL_STORAGE_KEY, normId);
    } else {
      localStorage.removeItem(ACTIVE_TERMINAL_STORAGE_KEY);
    }
    window.dispatchEvent(new Event(HARDWARE_TERMINAL_EVENT));
  } catch {}
  return normId;
}

const TERMINAL_BUSY_STATUSES: HardwareTerminalStatus[] = ['PAY', 'SUBMITTED', 'LINK', 'CARD_SCANNED', 'CHECK_CARD'];
const TERMINAL_LOCK_TIMEOUT_MS = 90000;
const TERMINAL_RESULT_HOLD_MS = 2200;

export function getTerminalTabSessionId(): string {
  if (typeof window === 'undefined') return `srv_${Date.now()}`;
  try {
    const key = 'wp_terminal_tab_session_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = `tab_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36).slice(-4)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `tab_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function extractTerminalLockOwner(reason?: string): string | null {
  if (!reason || !reason.startsWith('LOCK:')) return null;
  return reason.slice(5).trim() || null;
}

export function isHardwareTerminalBusy(
  state: HardwareTerminalState | null | undefined,
  myClaimToken?: string
): { busy: boolean; reason?: string } {
  if (!state) return { busy: false };

  const owner = extractTerminalLockOwner(state.reason);
  if (myClaimToken && owner && owner === myClaimToken) {
    return { busy: false };
  }

  const parsedTs = Date.parse(state.updatedAt || '');
  const hasIsoAge = Number.isFinite(parsedTs);
  const ageMs = hasIsoAge ? Math.max(0, Date.now() - parsedTs) : 0;

  if (TERMINAL_BUSY_STATUSES.includes(state.status)) {
    // Als een sessie >90s stilstaat (bijv. tabblad gesloten zonder annuleren), mag hij overgenomen worden
    if (hasIsoAge && ageMs > TERMINAL_LOCK_TIMEOUT_MS) {
      return { busy: false };
    }
    const orderInfo = state.orderNo ? ` (Bon #${state.orderNo})` : '';
    const actionLabel =
      state.status === 'CHECK_CARD'
        ? 'een snelle saldo/WerkCoins pascheck'
        : state.status === 'LINK' || state.status === 'CARD_SCANNED'
        ? 'een NFC-pas scan/koppeling'
        : `een betaling${orderInfo}`;
    return {
      busy: true,
      reason: `Dit pinapparaat is momenteel bezig met ${actionLabel}. Rond die eerst af of wacht even.`
    };
  }

  if (
    (state.status === 'APPROVED' || state.status === 'DECLINED' || state.status === 'CHECK_RESULT') &&
    hasIsoAge &&
    ageMs < TERMINAL_RESULT_HOLD_MS
  ) {
    return {
      busy: true,
      reason: 'Het pinapparaat rondt nog heel even de vorige transactie op het scherm af...'
    };
  }

  return { busy: false };
}

async function testConnection() {
  try {
    const testId = getActiveHardwareTerminalId();
    if (!testId) {
      await getDocFromServer(doc(db, 'app_data', 'pos_state'));
      return;
    }
    await getDocFromServer(doc(db, HARDWARE_TERMINAL_COLLECTION, testId));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export async function setHardwareTerminalState(
  payload: HardwareTerminalState,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  const safeId = normalizeHardwareTerminalId(terminalId);
  if (!safeId) return;
  const path = `${HARDWARE_TERMINAL_COLLECTION}/${safeId}`;
  try {
    await setDoc(doc(db, HARDWARE_TERMINAL_COLLECTION, safeId), {
      ...sanitizeForFirestore(payload),
      updatedAt: payload.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function claimHardwareTerminalPayMode(
  amount: number,
  orderNo: number,
  claimToken: string,
  usernameLabel?: string,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<{ acquired: boolean; busyMessage?: string }> {
  const numAmount = Number(amount);
  const numOrderNo = Number(orderNo);
  const safeAmount = Number.isFinite(numAmount) ? Math.max(0, Math.round(numAmount * 100) / 100) : 0;
  const safeOrderNo = Number.isFinite(numOrderNo) ? Math.max(0, Math.floor(numOrderNo)) : 0;
  const safeToken = claimToken.trim().slice(0, 110);
  const safeId = normalizeHardwareTerminalId(terminalId);
  if (!safeId) {
    return {
      acquired: false,
      busyMessage: 'Nog geen pinapparaat ingesteld. Voeg eerst zelf een pinapparaat toe.'
    };
  }
  const docRef = doc(db, HARDWARE_TERMINAL_COLLECTION, safeId);
  const path = `${HARDWARE_TERMINAL_COLLECTION}/${safeId}`;

  const tryClaimOnce = async () =>
    fsRunTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const current = snap.exists() ? (snap.data() as HardwareTerminalState) : null;
      const busyCheck = isHardwareTerminalBusy(current, safeToken);
      if (busyCheck.busy) {
        return {
          acquired: false,
          busyMessage: busyCheck.reason,
          isResultHold: current?.status === 'APPROVED' || current?.status === 'DECLINED' || current?.status === 'CHECK_RESULT'
        };
      }

      tx.set(docRef, sanitizeForFirestore({
        status: 'PAY' as HardwareTerminalStatus,
        username: (usernameLabel || '').trim().slice(0, 100),
        amount: safeAmount,
        orderNo: safeOrderNo,
        scannedUid: '',
        enteredPin: '',
        reason: `LOCK:${safeToken}`.slice(0, 128),
        updatedAt: new Date().toISOString(),
      }));
      return { acquired: true, isResultHold: false };
    }, path);

  let attempt = await tryClaimOnce();
  // Als de vorige transactie nog 1-2 seconden "Betaald!" op het LCD toont, wacht kort en probeer 1x opnieuw
  if (!attempt.acquired && attempt.isResultHold) {
    await new Promise((r) => setTimeout(r, 1400));
    attempt = await tryClaimOnce();
  }

  return { acquired: attempt.acquired, busyMessage: attempt.busyMessage };
}

export async function claimHardwareTerminalLinkMode(
  username: string,
  claimToken: string,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<{ acquired: boolean; busyMessage?: string }> {
  const safeToken = claimToken.trim().slice(0, 110);
  const safeId = normalizeHardwareTerminalId(terminalId);
  if (!safeId) {
    return {
      acquired: false,
      busyMessage: 'Nog geen pinapparaat ingesteld. Voeg eerst zelf een pinapparaat toe.'
    };
  }
  const docRef = doc(db, HARDWARE_TERMINAL_COLLECTION, safeId);
  const path = `${HARDWARE_TERMINAL_COLLECTION}/${safeId}`;

  const tryClaimOnce = async () =>
    fsRunTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const current = snap.exists() ? (snap.data() as HardwareTerminalState) : null;
      const busyCheck = isHardwareTerminalBusy(current, safeToken);
      if (busyCheck.busy) {
        return {
          acquired: false,
          busyMessage: busyCheck.reason,
          isResultHold: current?.status === 'APPROVED' || current?.status === 'DECLINED' || current?.status === 'CHECK_RESULT'
        };
      }

      tx.set(docRef, sanitizeForFirestore({
        status: 'LINK' as HardwareTerminalStatus,
        username: username.trim().slice(0, 100),
        amount: 0,
        orderNo: 0,
        scannedUid: '',
        enteredPin: '',
        reason: `LOCK:${safeToken}`.slice(0, 128),
        updatedAt: new Date().toISOString(),
      }));
      return { acquired: true, isResultHold: false };
    }, path);

  let attempt = await tryClaimOnce();
  if (!attempt.acquired && attempt.isResultHold) {
    await new Promise((r) => setTimeout(r, 1400));
    attempt = await tryClaimOnce();
  }

  return { acquired: attempt.acquired, busyMessage: attempt.busyMessage };
}

export async function releaseHardwareTerminalIfOwned(
  claimToken: string,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  const safeToken = claimToken.trim().slice(0, 110);
  const safeId = normalizeHardwareTerminalId(terminalId);
  if (!safeId) return;
  const docRef = doc(db, HARDWARE_TERMINAL_COLLECTION, safeId);
  const path = `${HARDWARE_TERMINAL_COLLECTION}/${safeId}`;

  await fsRunTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists()) return;
    const current = snap.data() as HardwareTerminalState;
    const owner = extractTerminalLockOwner(current.reason);
    // Reset alleen naar IDLE als deze sessie de lock nog bezit
    if (
      owner === safeToken &&
      current.status !== 'APPROVED' &&
      current.status !== 'DECLINED' &&
      current.status !== 'CHECK_RESULT'
    ) {
      tx.set(docRef, sanitizeForFirestore({
        status: 'IDLE' as HardwareTerminalStatus,
        username: '',
        amount: 0,
        orderNo: 0,
        scannedUid: '',
        enteredPin: '',
        reason: '',
        updatedAt: new Date().toISOString(),
      }));
    }
  }, path);
}

export async function setHardwareTerminalLinkMode(
  username: string,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  const res = await claimHardwareTerminalLinkMode(username, getTerminalTabSessionId(), terminalId);
  if (!res.acquired) {
    throw new Error(res.busyMessage || 'Pinapparaat is momenteel bezet.');
  }
}

export async function setHardwareTerminalPayMode(
  amount: number,
  orderNo: number,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  const res = await claimHardwareTerminalPayMode(amount, orderNo, getTerminalTabSessionId(), undefined, terminalId);
  if (!res.acquired) {
    throw new Error(res.busyMessage || 'Pinapparaat is momenteel bezig met een andere betaling.');
  }
}

export async function setHardwareTerminalLinked(
  username: string,
  scannedUid: string,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  await setHardwareTerminalState(
    {
      status: 'LINKED',
      username: username.trim().slice(0, 100),
      scannedUid: scannedUid.trim().slice(0, 64),
      enteredPin: '',
      reason: '',
      updatedAt: new Date().toISOString(),
    },
    terminalId
  );
}

export async function setHardwareTerminalResult(
  resultStatus: 'APPROVED' | 'DECLINED',
  reason: string = '',
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  await setHardwareTerminalState(
    {
      status: resultStatus,
      reason: reason.trim().slice(0, 128),
      updatedAt: new Date().toISOString(),
    },
    terminalId
  );
}

export async function setHardwareTerminalCheckResult(
  info: {
    found: boolean;
    accountHolder?: string;
    balance?: number;
    coins?: number;
    tier?: string;
    scannedUid?: string;
    reason?: string;
  },
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  if (!info.found) {
    await setHardwareTerminalState(
      {
        status: 'DECLINED',
        scannedUid: (info.scannedUid || '').trim().slice(0, 64),
        reason: (info.reason || 'Pas onbekend!').trim().slice(0, 128),
        updatedAt: new Date().toISOString(),
      },
      terminalId
    );
    return;
  }

  const safeBalance = Number.isFinite(Number(info.balance))
    ? Math.max(0, Math.min(99999, Math.round(Number(info.balance) * 100) / 100))
    : 0;
  const safeCoins = Number.isFinite(Number(info.coins))
    ? Math.max(0, Math.min(99999999, Math.floor(Number(info.coins))))
    : 0;
  const tierShort = (info.tier || 'Brons').trim().slice(0, 24);

  await setHardwareTerminalState(
    {
      status: 'CHECK_RESULT',
      username: (info.accountHolder || 'WerkPay').trim().slice(0, 100),
      amount: safeBalance,
      orderNo: safeCoins,
      scannedUid: (info.scannedUid || '').trim().slice(0, 64),
      enteredPin: '',
      reason: `OK|${tierShort}`.slice(0, 128),
      updatedAt: new Date().toISOString(),
    },
    terminalId
  );
}

export async function triggerHardwareTerminalCheckCard(
  uid: string,
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  await setHardwareTerminalState(
    {
      status: 'CHECK_CARD',
      scannedUid: uid.trim().slice(0, 64),
      enteredPin: '',
      reason: 'Saldo check verzoek',
      updatedAt: new Date().toISOString(),
    },
    terminalId
  );
}

export async function setHardwareTerminalIdle(
  terminalId: string = getActiveHardwareTerminalId()
): Promise<void> {
  await setHardwareTerminalState(
    {
      status: 'IDLE',
      username: '',
      amount: 0,
      orderNo: 0,
      scannedUid: '',
      enteredPin: '',
      reason: '',
      updatedAt: new Date().toISOString(),
    },
    terminalId
  );
}

export function subscribeHardwareTerminal(
  onData: (state: HardwareTerminalState | null) => void,
  onError?: (err: unknown) => void,
  terminalId: string = getActiveHardwareTerminalId()
): Unsubscribe {
  const safeId = normalizeHardwareTerminalId(terminalId);
  if (!safeId) {
    onData(null);
    return () => {};
  }
  const path = `${HARDWARE_TERMINAL_COLLECTION}/${safeId}`;
  return onSnapshot(
    doc(db, HARDWARE_TERMINAL_COLLECTION, safeId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as HardwareTerminalState);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        handleFirestoreError(error, OperationType.GET, path);
      }
    }
  );
}

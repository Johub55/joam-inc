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
  | 'DECLINED';

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

export const HARDWARE_TERMINAL_COLLECTION = 'hardware_terminals';
export const HARDWARE_TERMINAL_DOC_ID = 'pico_main';

async function testConnection() {
  try {
    await getDocFromServer(doc(db, HARDWARE_TERMINAL_COLLECTION, HARDWARE_TERMINAL_DOC_ID));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export async function setHardwareTerminalState(payload: HardwareTerminalState): Promise<void> {
  const path = `${HARDWARE_TERMINAL_COLLECTION}/${HARDWARE_TERMINAL_DOC_ID}`;
  try {
    await setDoc(doc(db, HARDWARE_TERMINAL_COLLECTION, HARDWARE_TERMINAL_DOC_ID), {
      ...sanitizeForFirestore(payload),
      updatedAt: payload.updatedAt || new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function setHardwareTerminalLinkMode(username: string): Promise<void> {
  await setHardwareTerminalState({
    status: 'LINK',
    username: username.trim().slice(0, 100),
    scannedUid: '',
    enteredPin: '',
    reason: '',
    updatedAt: new Date().toISOString(),
  });
}

export async function setHardwareTerminalPayMode(amount: number, orderNo: number): Promise<void> {
  const numAmount = Number(amount);
  const numOrderNo = Number(orderNo);
  const safeAmount = Number.isFinite(numAmount) ? Math.max(0, Math.round(numAmount * 100) / 100) : 0;
  const safeOrderNo = Number.isFinite(numOrderNo) ? Math.max(0, Math.floor(numOrderNo)) : 0;

  await setHardwareTerminalState({
    status: 'PAY',
    amount: safeAmount,
    orderNo: safeOrderNo,
    scannedUid: '',
    enteredPin: '',
    reason: '',
    updatedAt: new Date().toISOString(),
  });
}

export async function setHardwareTerminalLinked(username: string, scannedUid: string): Promise<void> {
  await setHardwareTerminalState({
    status: 'LINKED',
    username: username.trim().slice(0, 100),
    scannedUid: scannedUid.trim().slice(0, 64),
    enteredPin: '',
    reason: '',
    updatedAt: new Date().toISOString(),
  });
}

export async function setHardwareTerminalResult(
  resultStatus: 'APPROVED' | 'DECLINED',
  reason: string = ''
): Promise<void> {
  await setHardwareTerminalState({
    status: resultStatus,
    reason: reason.trim().slice(0, 128),
    updatedAt: new Date().toISOString(),
  });
}

export async function setHardwareTerminalIdle(): Promise<void> {
  await setHardwareTerminalState({
    status: 'IDLE',
    username: '',
    amount: 0,
    orderNo: 0,
    scannedUid: '',
    enteredPin: '',
    reason: '',
    updatedAt: new Date().toISOString(),
  });
}

export function subscribeHardwareTerminal(
  onData: (state: HardwareTerminalState | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const path = `${HARDWARE_TERMINAL_COLLECTION}/${HARDWARE_TERMINAL_DOC_ID}`;
  return onSnapshot(
    doc(db, HARDWARE_TERMINAL_COLLECTION, HARDWARE_TERMINAL_DOC_ID),
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

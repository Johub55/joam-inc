import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

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
      ...payload,
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

"use client";

import { isUsablePinRecord, type PinVerifierRecord } from "@/core/security/pin-lock";

const DATABASE_NAME = "kjora-local-security";
const DATABASE_VERSION = 1;
const PIN_STORE = "pin-configurations";
const UNLOCK_STATE_KEY = "kjora.pin.unlock-state.v1";
const REAUTH_STATE_KEY = "kjora.pin.reauth-required.v1";

type UnlockState = {
  userId: string;
  lastActivityAt: number;
};

function openPinDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PIN_STORE)) {
        request.result.createObjectStore(PIN_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("PIN_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("PIN_STORAGE_BLOCKED"));
  });
}

async function runPinTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openPinDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(PIN_STORE, mode);
      const request = operation(transaction.objectStore(PIN_STORE));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(new Error("PIN_STORAGE_OPERATION_FAILED"));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(new Error("PIN_STORAGE_TRANSACTION_ABORTED"));
      transaction.onerror = () => reject(new Error("PIN_STORAGE_TRANSACTION_FAILED"));
    });
  } finally {
    database.close();
  }
}

export async function readPinRecord(userId: string) {
  const value = await runPinTransaction<unknown>("readonly", (store) => store.get(userId));
  if (!isUsablePinRecord(value)) {
    if (value !== undefined) await deletePinRecord(userId);
    return null;
  }
  return value;
}

export async function writePinRecord(userId: string, record: PinVerifierRecord) {
  await runPinTransaction<IDBValidKey>("readwrite", (store) => store.put(record, userId));
}

export async function deletePinRecord(userId: string) {
  await runPinTransaction<undefined>("readwrite", (store) => store.delete(userId));
}

export function markPinUnlocked(userId: string, lastActivityAt = Date.now()) {
  const state: UnlockState = { userId, lastActivityAt };
  sessionStorage.setItem(UNLOCK_STATE_KEY, JSON.stringify(state));
}

export function readPinUnlockState(userId: string): UnlockState | null {
  const value = sessionStorage.getItem(UNLOCK_STATE_KEY);
  if (!value) return null;
  try {
    const state = JSON.parse(value) as Partial<UnlockState>;
    if (state.userId === userId && typeof state.lastActivityAt === "number") {
      return { userId, lastActivityAt: state.lastActivityAt };
    }
  } catch {
    // Un état local invalide est traité comme verrouillé.
  }
  sessionStorage.removeItem(UNLOCK_STATE_KEY);
  return null;
}

export function clearPinUnlockState() {
  sessionStorage.removeItem(UNLOCK_STATE_KEY);
}

export function markPinReauthenticationRequired(userId: string) {
  sessionStorage.setItem(REAUTH_STATE_KEY, userId);
  clearPinUnlockState();
}

export function isPinReauthenticationRequired(userId: string) {
  return sessionStorage.getItem(REAUTH_STATE_KEY) === userId;
}

export function clearPinReauthenticationRequirement() {
  sessionStorage.removeItem(REAUTH_STATE_KEY);
}

export async function clearLocalPinSecurity(userId: string) {
  clearPinUnlockState();
  await deletePinRecord(userId);
}

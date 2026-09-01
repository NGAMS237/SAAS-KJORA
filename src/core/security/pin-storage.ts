"use client";

import { isUsablePinRecord, type PinVerifierRecord } from "@/core/security/pin-lock";

const DATABASE_NAME = "kjora-local-security";
const DATABASE_VERSION = 1;
const PIN_STORE = "pin-configurations";
const UNLOCK_STATE_KEY = "kjora.pin.unlock-state.v1";
const REAUTH_STATE_KEY = "kjora.pin.reauth-required.v1";

export type PinStorageScope = "internal" | "portal";

type UnlockState = {
  userId: string;
  lastActivityAt: number;
};

function recordKey(userId: string, scope: PinStorageScope) {
  return scope === "internal" ? userId : `portal:${userId}`;
}

function stateKey(key: string, scope: PinStorageScope) {
  return scope === "internal" ? key : `${key}.portal`;
}

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

export async function readPinRecord(userId: string, scope: PinStorageScope = "internal") {
  const value = await runPinTransaction<unknown>("readonly", (store) => store.get(recordKey(userId, scope)));
  if (!isUsablePinRecord(value)) {
    if (value !== undefined) await deletePinRecord(userId, scope);
    return null;
  }
  return value;
}

export async function writePinRecord(userId: string, record: PinVerifierRecord, scope: PinStorageScope = "internal") {
  await runPinTransaction<IDBValidKey>("readwrite", (store) => store.put(record, recordKey(userId, scope)));
}

export async function deletePinRecord(userId: string, scope: PinStorageScope = "internal") {
  await runPinTransaction<undefined>("readwrite", (store) => store.delete(recordKey(userId, scope)));
}

export function markPinUnlocked(userId: string, lastActivityAt = Date.now(), scope: PinStorageScope = "internal") {
  const state: UnlockState = { userId, lastActivityAt };
  sessionStorage.setItem(stateKey(UNLOCK_STATE_KEY, scope), JSON.stringify(state));
}

export function readPinUnlockState(userId: string, scope: PinStorageScope = "internal"): UnlockState | null {
  const key = stateKey(UNLOCK_STATE_KEY, scope);
  const value = sessionStorage.getItem(key);
  if (!value) return null;
  try {
    const state = JSON.parse(value) as Partial<UnlockState>;
    if (state.userId === userId && typeof state.lastActivityAt === "number") {
      return { userId, lastActivityAt: state.lastActivityAt };
    }
  } catch {
    // Un état local invalide est traité comme verrouillé.
  }
  sessionStorage.removeItem(key);
  return null;
}

export function clearPinUnlockState(scope: PinStorageScope = "internal") {
  sessionStorage.removeItem(stateKey(UNLOCK_STATE_KEY, scope));
}

export function markPinReauthenticationRequired(userId: string, scope: PinStorageScope = "internal") {
  sessionStorage.setItem(stateKey(REAUTH_STATE_KEY, scope), userId);
  clearPinUnlockState(scope);
}

export function isPinReauthenticationRequired(userId: string, scope: PinStorageScope = "internal") {
  return sessionStorage.getItem(stateKey(REAUTH_STATE_KEY, scope)) === userId;
}

export function clearPinReauthenticationRequirement(scope: PinStorageScope = "internal") {
  sessionStorage.removeItem(stateKey(REAUTH_STATE_KEY, scope));
}

export async function clearLocalPinSecurity(userId: string, scope: PinStorageScope = "internal") {
  clearPinUnlockState(scope);
  await deletePinRecord(userId, scope);
}

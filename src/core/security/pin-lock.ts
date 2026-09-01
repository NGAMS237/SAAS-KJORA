export const PIN_LENGTH = 6;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_INACTIVITY_MINUTES = 60;
export const PIN_INACTIVITY_MS = PIN_INACTIVITY_MINUTES * 60 * 1000;
export const PIN_PBKDF2_ITERATIONS = 600_000;
export const PORTAL_PIN_LOCKOUT_MS = 5 * 60 * 1000;

export type PinVerifierRecord = {
  version: 1;
  algorithm: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
  verifier: string;
  failedAttempts: number;
  lockoutUntil?: number | null;
  createdAt: string;
};

export type PinAttemptResult = {
  lockedOut: boolean;
  attemptsRemaining: number;
  failedAttempts: number;
};

export function normalizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

export function sanitizeInternalAppPath(value: string | null | undefined) {
  if (!value || value.includes("\\") || value.startsWith("//")) return "/app";
  return value === "/app" || value.startsWith("/app/") ? value : "/app";
}

export function sanitizePortalPath(value: string | null | undefined) {
  if (!value || value.includes("\\") || value.startsWith("//")) return "/portal";
  return value === "/portal" || value.startsWith("/portal/") ? value : "/portal";
}

export function isValidPin(pin: string) {
  return /^\d{6}$/.test(pin);
}

export function validatePinConfirmation(pin: string, confirmation: string) {
  if (!isValidPin(pin) || !isValidPin(confirmation)) return "invalid-format" as const;
  if (pin !== confirmation) return "mismatch" as const;
  return "valid" as const;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array) {
  return bytes.slice().buffer;
}

export async function derivePinVerifier(pin: string, salt: Uint8Array, iterations: number) {
  if (!isValidPin(pin)) throw new Error("PIN_FORMAT_INVALID");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asArrayBuffer(salt),
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export async function createPinVerifierRecord(pin: string): Promise<PinVerifierRecord> {
  if (!isValidPin(pin)) throw new Error("PIN_FORMAT_INVALID");
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const verifier = await derivePinVerifier(pin, salt, PIN_PBKDF2_ITERATIONS);
  return {
    version: 1,
    algorithm: "PBKDF2",
    hash: "SHA-256",
    iterations: PIN_PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    verifier: bytesToBase64(verifier),
    failedAttempts: 0,
    createdAt: new Date().toISOString(),
  };
}

export function isUsablePinRecord(value: unknown): value is PinVerifierRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PinVerifierRecord>;
  return record.version === 1
    && record.algorithm === "PBKDF2"
    && record.hash === "SHA-256"
    && typeof record.iterations === "number"
    && record.iterations >= PIN_PBKDF2_ITERATIONS
    && typeof record.salt === "string"
    && typeof record.verifier === "string"
    && typeof record.failedAttempts === "number"
    && record.failedAttempts >= 0
    && record.failedAttempts <= PIN_MAX_ATTEMPTS
    && (record.lockoutUntil === undefined || record.lockoutUntil === null || typeof record.lockoutUntil === "number")
    && (record.failedAttempts < PIN_MAX_ATTEMPTS || typeof record.lockoutUntil === "number");
}

export function isPortalPinLockoutActive(record: PinVerifierRecord, now = Date.now()) {
  return record.failedAttempts >= PIN_MAX_ATTEMPTS
    && typeof record.lockoutUntil === "number"
    && record.lockoutUntil > now;
}

export function portalPinLockoutRecord(record: PinVerifierRecord, now = Date.now()): PinVerifierRecord {
  return { ...record, failedAttempts: PIN_MAX_ATTEMPTS, lockoutUntil: now + PORTAL_PIN_LOCKOUT_MS };
}

export function resetExpiredPortalPinLockout(record: PinVerifierRecord, now = Date.now()): PinVerifierRecord {
  if (record.failedAttempts < PIN_MAX_ATTEMPTS || isPortalPinLockoutActive(record, now)) return record;
  return { ...record, failedAttempts: 0, lockoutUntil: null };
}

export async function verifyPin(pin: string, record: PinVerifierRecord) {
  if (!isValidPin(pin) || !isUsablePinRecord(record)) return false;
  const candidate = await derivePinVerifier(pin, base64ToBytes(record.salt), record.iterations);
  return constantTimeEqual(candidate, base64ToBytes(record.verifier));
}

export function registerFailedPinAttempt(failedAttempts: number): PinAttemptResult {
  const nextCount = Math.min(PIN_MAX_ATTEMPTS, Math.max(0, failedAttempts) + 1);
  return {
    failedAttempts: nextCount,
    attemptsRemaining: Math.max(0, PIN_MAX_ATTEMPTS - nextCount),
    lockedOut: nextCount >= PIN_MAX_ATTEMPTS,
  };
}

export function isUnlockFresh(lastActivityAt: number, now = Date.now()) {
  return Number.isFinite(lastActivityAt)
    && lastActivityAt <= now
    && now - lastActivityAt < PIN_INACTIVITY_MS;
}

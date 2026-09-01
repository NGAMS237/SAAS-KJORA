import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  constantTimeEqual,
  createPinVerifierRecord,
  isUnlockFresh,
  isUsablePinRecord,
  isValidPin,
  normalizePin,
  PIN_INACTIVITY_MS,
  PIN_MAX_ATTEMPTS,
  PIN_PBKDF2_ITERATIONS,
  PORTAL_PIN_LOCKOUT_MS,
  isPortalPinLockoutActive,
  portalPinLockoutRecord,
  resetExpiredPortalPinLockout,
  registerFailedPinAttempt,
  sanitizeInternalAppPath,
  sanitizePortalPath,
  validatePinConfirmation,
  verifyPin,
} from "../src/core/security/pin-lock.ts";

test("le PIN interne accepte exactement six chiffres", () => {
  assert.equal(normalizePin("12a34-567"), "123456");
  assert.equal(isValidPin("123456"), true);
  assert.equal(isValidPin("12345"), false);
  assert.equal(isValidPin("12345a"), false);
});

test("le retour après déverrouillage reste strictement dans l'espace interne", () => {
  assert.equal(sanitizeInternalAppPath("/app/paiements"), "/app/paiements");
  assert.equal(sanitizeInternalAppPath("/portal"), "/app");
  assert.equal(sanitizeInternalAppPath("//example.com"), "/app");
  assert.equal(sanitizeInternalAppPath("/application"), "/app");
});

test("le retour du verrou portail reste strictement dans le portail", () => {
  assert.equal(sanitizePortalPath("/portal/loyers"), "/portal/loyers");
  assert.equal(sanitizePortalPath("/app"), "/portal");
  assert.equal(sanitizePortalPath("//example.com"), "/portal");
});

test("une confirmation différente est refusée", () => {
  assert.equal(validatePinConfirmation("123456", "654321"), "mismatch");
  assert.equal(validatePinConfirmation("123456", "123456"), "valid");
});

test("le verifier PBKDF2 est salé, robuste et ne contient pas le PIN brut", async () => {
  const record = await createPinVerifierRecord("123456");
  assert.equal(record.algorithm, "PBKDF2");
  assert.equal(record.hash, "SHA-256");
  assert.equal(record.iterations, PIN_PBKDF2_ITERATIONS);
  assert.equal(isUsablePinRecord(record), true);
  assert.equal(JSON.stringify(record).includes("123456"), false);
  assert.equal(await verifyPin("123456", record), true);
  assert.equal(await verifyPin("654321", record), false);
});

test("un verifier dont le coût PBKDF2 a été affaibli est rejeté", async () => {
  const record = await createPinVerifierRecord("123456");
  assert.equal(isUsablePinRecord({ ...record, iterations: PIN_PBKDF2_ITERATIONS - 1 }), false);
});

test("la comparaison du verifier traite aussi les longueurs différentes", () => {
  assert.equal(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])), true);
  assert.equal(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
  assert.equal(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 0])), false);
});

test("le cinquième échec verrouille temporairement le PIN portail pendant cinq minutes", () => {
  let state = registerFailedPinAttempt(0);
  assert.equal(state.attemptsRemaining, 4);
  for (let failed = 1; failed < PIN_MAX_ATTEMPTS; failed += 1) {
    state = registerFailedPinAttempt(state.failedAttempts);
  }
  assert.equal(state.failedAttempts, PIN_MAX_ATTEMPTS);
  assert.equal(state.attemptsRemaining, 0);
  assert.equal(state.lockedOut, true);
  const verifier = {
    version: 1 as const, algorithm: "PBKDF2" as const, hash: "SHA-256" as const,
    iterations: PIN_PBKDF2_ITERATIONS, salt: "salt", verifier: "hash", failedAttempts: 4, createdAt: "2026-09-01T00:00:00Z",
  };
  const now = 1_000_000;
  const locked = portalPinLockoutRecord(verifier, now);
  assert.equal(PORTAL_PIN_LOCKOUT_MS, 5 * 60 * 1000);
  assert.equal(locked.lockoutUntil, now + PORTAL_PIN_LOCKOUT_MS);
  assert.equal(isPortalPinLockoutActive(locked, now + PORTAL_PIN_LOCKOUT_MS - 1), true);
  assert.equal(isPortalPinLockoutActive(locked, now + PORTAL_PIN_LOCKOUT_MS), false);
  assert.equal(resetExpiredPortalPinLockout(locked, now + PORTAL_PIN_LOCKOUT_MS).failedAttempts, 0);
});

test("l'état déverrouillé expire après une heure d'inactivité", () => {
  assert.equal(PIN_INACTIVITY_MS, 60 * 60 * 1000);
  const now = 1_000_000;
  assert.equal(isUnlockFresh(now - PIN_INACTIVITY_MS + 1, now), true);
  assert.equal(isUnlockFresh(now - PIN_INACTIVITY_MS, now), false);
});

test("les PIN interne et portail restent hachés dans des scopes locaux distincts", async () => {
  const storageSource = await readFile(new URL("../src/core/security/pin-storage.ts", import.meta.url), "utf8");
  const portalShell = await readFile(new URL("../src/tenant-portal/portal-shell.tsx", import.meta.url), "utf8");
  const portalLayout = await readFile(new URL("../src/app/(portal)/portal/layout.tsx", import.meta.url), "utf8");
  const lockScreen = await readFile(new URL("../src/core/security/pin-lock-screen.tsx", import.meta.url), "utf8");
  assert.equal(storageSource.includes("localStorage"), false);
  assert.match(storageSource, /portal:\$\{userId\}/);
  assert.match(portalShell, /PinLockButton/);
  assert.match(portalLayout, /scope="portal"/);
  assert.doesNotMatch(storageSource, /pin:\s*string/i);
  assert.match(lockScreen, /J’ai oublié mon PIN/);
  assert.match(lockScreen, /portalPinLockoutRecord/);
});

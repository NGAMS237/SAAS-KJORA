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
  registerFailedPinAttempt,
  sanitizeInternalAppPath,
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

test("le cinquième échec bloque le PIN et ne laisse aucun essai", () => {
  let state = registerFailedPinAttempt(0);
  assert.equal(state.attemptsRemaining, 4);
  for (let failed = 1; failed < PIN_MAX_ATTEMPTS; failed += 1) {
    state = registerFailedPinAttempt(state.failedAttempts);
  }
  assert.equal(state.failedAttempts, PIN_MAX_ATTEMPTS);
  assert.equal(state.attemptsRemaining, 0);
  assert.equal(state.lockedOut, true);
});

test("l'état déverrouillé expire après une heure d'inactivité", () => {
  assert.equal(PIN_INACTIVITY_MS, 60 * 60 * 1000);
  const now = 1_000_000;
  assert.equal(isUnlockFresh(now - PIN_INACTIVITY_MS + 1, now), true);
  assert.equal(isUnlockFresh(now - PIN_INACTIVITY_MS, now), false);
});

test("le stockage PIN n'utilise pas localStorage et le portail n'importe aucune logique PIN", async () => {
  const storageSource = await readFile(new URL("../src/core/security/pin-storage.ts", import.meta.url), "utf8");
  const portalShell = await readFile(new URL("../src/tenant-portal/portal-shell.tsx", import.meta.url), "utf8");
  const portalLayout = await readFile(new URL("../src/app/(portal)/portal/layout.tsx", import.meta.url), "utf8");
  assert.equal(storageSource.includes("localStorage"), false);
  assert.equal(portalShell.toLowerCase().includes("pin-lock"), false);
  assert.equal(portalLayout.toLowerCase().includes("pin-lock"), false);
});

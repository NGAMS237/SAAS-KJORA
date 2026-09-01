"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck } from "lucide-react";
import { isPortalPinLockoutActive, PIN_MAX_ATTEMPTS, portalPinLockoutRecord, registerFailedPinAttempt, resetExpiredPortalPinLockout, verifyPin } from "@/core/security/pin-lock";
import { PinInput } from "@/core/security/pin-input";
import {
  clearLocalPinSecurity,
  clearPinReauthenticationRequirement,
  isPinReauthenticationRequired,
  markPinReauthenticationRequired,
  markPinUnlocked,
  readPinRecord,
  writePinRecord,
} from "@/core/security/pin-storage";
import type { PinStorageScope } from "@/core/security/pin-storage";

async function returnToStrongAuthentication(userId: string, reason: string, scope: PinStorageScope) {
  markPinReauthenticationRequired(userId, scope);
  try {
    await clearLocalPinSecurity(userId, scope);
    const response = await fetch(scope === "portal" ? "/auth/signout?scope=portal" : "/auth/signout", { method: "POST" });
    if (!response.ok) throw new Error("SIGNOUT_FAILED");
    clearPinReauthenticationRequirement(scope);
    const login = scope === "portal" ? "/portal/connexion" : "/connexion";
    window.location.replace(`${login}?reason=${encodeURIComponent(reason)}`);
    return true;
  } catch {
    return false;
  }
}

export function PinLockScreen({ nextPath, userId, scope = "internal", language = "fr" }: { nextPath: string; userId: string; scope?: PinStorageScope; language?: "fr" | "en" }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(PIN_MAX_ATTEMPTS);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const record = await readPinRecord(userId, scope);
        if (!active) return;
        if (scope === "internal" && isPinReauthenticationRequired(userId, scope)) {
          setReady(true);
          setMessage("Pour protéger votre compte, reconnectez-vous avec votre email.");
          const redirected = await returnToStrongAuthentication(userId, "pin-attempts-exceeded", scope);
          if (!redirected && active) setMessage("La reconnexion est requise. Vérifiez votre réseau puis réessayez.");
          return;
        }
        if (!record) {
          router.replace(nextPath);
          return;
        }
        const usableRecord = scope === "portal" ? resetExpiredPortalPinLockout(record) : record;
        if (usableRecord !== record) await writePinRecord(userId, usableRecord, scope);
        if (scope === "portal" && isPortalPinLockoutActive(usableRecord)) {
          setLockedUntil(usableRecord.lockoutUntil ?? null);
          setMessage(language === "en" ? "Too many attempts. Try again in 5 minutes." : "Trop de tentatives. Réessayez dans 5 minutes.");
        }
        setAttemptsRemaining(PIN_MAX_ATTEMPTS - usableRecord.failedAttempts);
        setReady(true);
      } catch {
        setMessage("Le verrou local est indisponible. Reconnectez-vous avec votre email.");
        setReady(true);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [language, nextPath, router, scope, userId]);

  useEffect(() => {
    if (scope !== "portal" || !lockedUntil) return;
    const delay = Math.max(0, lockedUntil - Date.now());
    const timer = window.setTimeout(async () => {
      const record = await readPinRecord(userId, scope).catch(() => null);
      if (record) await writePinRecord(userId, resetExpiredPortalPinLockout(record), scope).catch(() => undefined);
      setLockedUntil(null);
      setAttemptsRemaining(PIN_MAX_ATTEMPTS);
      setMessage(language === "en" ? "You can try your PIN again." : "Vous pouvez réessayer votre PIN.");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [language, lockedUntil, scope, userId]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== 6 || busy || (lockedUntil !== null && lockedUntil > Date.now())) return;
    setBusy(true);
    setMessage(null);
    try {
      const record = await readPinRecord(userId, scope);
      if (!record) {
        router.replace(nextPath);
        return;
      }
      if (scope === "portal" && isPortalPinLockoutActive(record)) {
        setLockedUntil(record.lockoutUntil ?? null);
        setMessage(language === "en" ? "Too many attempts. Try again in 5 minutes." : "Trop de tentatives. Réessayez dans 5 minutes.");
        return;
      }
      if (await verifyPin(pin, record)) {
        await writePinRecord(userId, { ...record, failedAttempts: 0, lockoutUntil: null }, scope);
        markPinUnlocked(userId, Date.now(), scope);
        router.replace(nextPath);
        router.refresh();
        return;
      }
      const attempt = registerFailedPinAttempt(record.failedAttempts);
      setPin("");
      setAttemptsRemaining(attempt.attemptsRemaining);
      if (attempt.lockedOut) {
        if (scope === "portal") {
          const lockedRecord = portalPinLockoutRecord(record);
          await writePinRecord(userId, lockedRecord, scope);
          setLockedUntil(lockedRecord.lockoutUntil ?? null);
          setMessage(language === "en" ? "Too many attempts. Try again in 5 minutes." : "Trop de tentatives. Réessayez dans 5 minutes.");
          return;
        }
        setMessage("Pour protéger votre compte, reconnectez-vous avec votre email.");
        const redirected = await returnToStrongAuthentication(userId, "pin-attempts-exceeded", scope);
        if (!redirected) setMessage("La reconnexion est requise. Vérifiez votre réseau puis utilisez votre email.");
        return;
      }
      await writePinRecord(userId, { ...record, failedAttempts: attempt.failedAttempts }, scope);
      setMessage("PIN incorrect. Réessayez.");
    } catch {
      setMessage("Impossible de vérifier le PIN local. Utilisez votre email à la place.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pin-lock-page">
      <section className="pin-lock-panel">
        <span className="wordmark wordmark--auth">Kjora<span>.</span></span>
        <span className="pin-lock-panel__icon" aria-hidden="true"><ShieldCheck size={25} /></span>
        <p className="eyebrow">{language === "en" ? "Welcome" : "Bienvenue"}</p>
        <h1>{language === "en" ? "Enter your PIN" : "Entrez votre PIN"}</h1>
        <p className="auth-intro">{language === "en" ? "Unlock Kjora on this already authenticated device." : "Déverrouillez Kjora sur cet appareil déjà authentifié."}</p>

        <form className="pin-lock-form" onSubmit={unlock}>
          <PinInput autoFocus disabled={!ready || busy || lockedUntil !== null} id="unlock-pin" label="PIN à 6 chiffres" onChange={setPin} value={pin} />
          <button className="button button--primary" disabled={!ready || busy || pin.length !== 6 || lockedUntil !== null} type="submit">
            {busy ? "Vérification…" : "Déverrouiller"}
          </button>
        </form>

        {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
        {ready && attemptsRemaining < PIN_MAX_ATTEMPTS && attemptsRemaining > 0 ? (
          <p className="pin-attempts" aria-live="polite">{attemptsRemaining} essai{attemptsRemaining > 1 ? "s" : ""} restant{attemptsRemaining > 1 ? "s" : ""}.</p>
        ) : null}

        <button
          className="pin-email-fallback"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage(null);
            const redirected = await returnToStrongAuthentication(userId, "pin-email-required", scope);
            if (!redirected) {
              setBusy(false);
              setMessage("Impossible de terminer la session. Vérifiez votre réseau puis réessayez.");
            }
          }}
          type="button"
        >
          <Mail aria-hidden="true" size={18} />
          {scope === "portal" ? (language === "en" ? "I forgot my PIN" : "J’ai oublié mon PIN") : (language === "en" ? "Use my email instead" : "Utiliser mon email à la place")}
        </button>
        <p className="auth-footnote">Le PIN ne crée aucune session et n’est jamais envoyé à Kjora ou Supabase.</p>
      </section>
    </main>
  );
}

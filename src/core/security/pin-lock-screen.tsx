"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck } from "lucide-react";
import { PIN_MAX_ATTEMPTS, registerFailedPinAttempt, verifyPin } from "@/core/security/pin-lock";
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

async function returnToStrongAuthentication(userId: string, reason: string) {
  markPinReauthenticationRequired(userId);
  try {
    await clearLocalPinSecurity(userId);
    const response = await fetch("/auth/signout", { method: "POST" });
    if (!response.ok) throw new Error("SIGNOUT_FAILED");
    clearPinReauthenticationRequirement();
    window.location.replace(`/connexion?reason=${encodeURIComponent(reason)}`);
    return true;
  } catch {
    return false;
  }
}

export function PinLockScreen({ nextPath, userId }: { nextPath: string; userId: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(PIN_MAX_ATTEMPTS);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const record = await readPinRecord(userId);
        if (!active) return;
        if (isPinReauthenticationRequired(userId)) {
          setReady(true);
          setMessage("Pour protéger votre compte, reconnectez-vous avec votre email.");
          const redirected = await returnToStrongAuthentication(userId, "pin-attempts-exceeded");
          if (!redirected && active) setMessage("La reconnexion est requise. Vérifiez votre réseau puis réessayez.");
          return;
        }
        if (!record) {
          router.replace(nextPath);
          return;
        }
        setAttemptsRemaining(PIN_MAX_ATTEMPTS - record.failedAttempts);
        setReady(true);
      } catch {
        setMessage("Le verrou local est indisponible. Reconnectez-vous avec votre email.");
        setReady(true);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [nextPath, router, userId]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const record = await readPinRecord(userId);
      if (!record) {
        router.replace(nextPath);
        return;
      }
      if (await verifyPin(pin, record)) {
        await writePinRecord(userId, { ...record, failedAttempts: 0 });
        markPinUnlocked(userId);
        router.replace(nextPath);
        router.refresh();
        return;
      }
      const attempt = registerFailedPinAttempt(record.failedAttempts);
      setPin("");
      setAttemptsRemaining(attempt.attemptsRemaining);
      if (attempt.lockedOut) {
        setMessage("Pour protéger votre compte, reconnectez-vous avec votre email.");
        const redirected = await returnToStrongAuthentication(userId, "pin-attempts-exceeded");
        if (!redirected) setMessage("La reconnexion est requise. Vérifiez votre réseau puis utilisez votre email.");
        return;
      }
      await writePinRecord(userId, { ...record, failedAttempts: attempt.failedAttempts });
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
        <p className="eyebrow">Bienvenue</p>
        <h1>Entrez votre PIN</h1>
        <p className="auth-intro">Déverrouillez Kjora sur cet appareil déjà authentifié.</p>

        <form className="pin-lock-form" onSubmit={unlock}>
          <PinInput autoFocus disabled={!ready || busy} id="unlock-pin" label="PIN à 6 chiffres" onChange={setPin} value={pin} />
          <button className="button button--primary" disabled={!ready || busy || pin.length !== 6} type="submit">
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
            const redirected = await returnToStrongAuthentication(userId, "pin-email-required");
            if (!redirected) {
              setBusy(false);
              setMessage("Impossible de terminer la session. Vérifiez votre réseau puis réessayez.");
            }
          }}
          type="button"
        >
          <Mail aria-hidden="true" size={18} />
          Utiliser mon email à la place
        </button>
        <p className="auth-footnote">Le PIN ne crée aucune session et n’est jamais envoyé à Kjora ou Supabase.</p>
      </section>
    </main>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { validatePinConfirmation } from "@/core/security/pin-lock";
import { PinInput } from "@/core/security/pin-input";
import { usePinLock } from "@/core/security/pin-lock-provider";
import { clearLocalPinSecurity, clearPinReauthenticationRequirement } from "@/core/security/pin-storage";
import { usePreferences } from "@/core/preferences/preferences-provider";

function useCopy() {
  const { language } = usePreferences();
  return (fr: string, en: string) => language === "FR" ? fr : en;
}

export function SecureSignOutButton({ userId }: { userId: string }) {
  const t = useCopy();
  const [busy, setBusy] = useState(false);

  async function prepareSignOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    try {
      await clearLocalPinSecurity(userId);
      clearPinReauthenticationRequirement();
    } finally {
      form.submit();
    }
  }

  return (
    <form action="/auth/signout" method="post" onSubmit={prepareSignOut}>
      <button className="portal-preview-link" disabled={busy} type="submit">
        <LogOut aria-hidden="true" size={18} />
        {busy ? t("Déconnexion…", "Signing out…") : t("Déconnexion", "Sign out")}
      </button>
    </form>
  );
}

export function PinLockButton() {
  const t = useCopy();
  const { hasPin, lockNow } = usePinLock();
  if (!hasPin) return null;
  return (
    <button className="portal-preview-link" onClick={lockNow} type="button">
      <LockKeyhole aria-hidden="true" size={18} />
      {t("Verrouiller Kjora", "Lock Kjora")}
    </button>
  );
}

export function PinSetupPrompt() {
  const t = useCopy();
  const { hasPin } = usePinLock();
  const [dismissed, setDismissed] = useState(false);
  if (hasPin || dismissed) return null;
  return (
    <aside className="pin-prompt" aria-label={t("Proposition de verrouillage rapide", "Quick lock suggestion")}>
      <span className="pin-prompt__icon" aria-hidden="true"><ShieldCheck size={21} /></span>
      <div>
        <strong>{t("Protéger rapidement cet appareil ?", "Quickly protect this device?")}</strong>
        <p>{t("Configurez, si vous le souhaitez, un PIN local à 6 chiffres dans Paramètres. Votre email reste l’authentification principale.", "Optionally configure a local 6-digit PIN in Settings. Your email remains the primary authentication.")}</p>
      </div>
      <div className="pin-prompt__actions">
        <a className="button button--primary button--small" href="/app/parametres#securite">{t("Configurer", "Set up")}</a>
        <button className="button button--secondary button--small" onClick={() => setDismissed(true)} type="button">{t("Plus tard", "Later")}</button>
      </div>
    </aside>
  );
}

export function PinSecurityPanel() {
  const t = useCopy();
  const { configurePin, hasPin, lockNow, removePin } = usePinLock();
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function resetForm() {
    setPin("");
    setConfirmation("");
    setEditing(false);
  }

  async function savePin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(false);
    const validation = validatePinConfirmation(pin, confirmation);
    if (validation === "invalid-format") {
      setError(true);
      setMessage(t("Le PIN doit contenir exactement 6 chiffres.", "The PIN must contain exactly 6 digits."));
      return;
    }
    if (validation === "mismatch") {
      setError(true);
      setMessage(t("Les deux PIN ne correspondent pas.", "The two PINs do not match."));
      return;
    }
    setBusy(true);
    try {
      await configurePin(pin);
      resetForm();
      setMessage(hasPin ? t("Votre PIN a été modifié.", "Your PIN was changed.") : t("Votre PIN local est configuré.", "Your local PIN is set up."));
    } catch {
      setError(true);
      setMessage(t("Impossible de sécuriser le PIN sur cet appareil. Réessayez.", "Unable to secure the PIN on this device. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function deletePin() {
    setBusy(true);
    setMessage(null);
    setError(false);
    try {
      await removePin();
      resetForm();
      setMessage(t("Le PIN local a été supprimé de cet appareil.", "The local PIN was removed from this device."));
    } catch {
      setError(true);
      setMessage(t("Impossible de supprimer le PIN local. Réessayez.", "Unable to remove the local PIN. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pin-security" id="securite">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("Sécurité de l’appareil", "Device security")}</p>
          <h2>{t("Verrouillage rapide", "Quick lock")}</h2>
        </div>
        <span className={hasPin ? "badge badge--success" : "badge badge--neutral"}>
          {hasPin ? t("PIN actif", "PIN active") : t("Facultatif", "Optional")}
        </span>
      </div>
      <div className="pin-security__intro">
        <span aria-hidden="true"><ShieldCheck size={23} /></span>
        <p>{t("Le PIN protège localement Kjora après 1 heure d’inactivité. Il ne remplace jamais votre connexion sécurisée par email.", "The PIN locks Kjora locally after 1 hour of inactivity. It never replaces your secure email sign-in.")}</p>
      </div>

      {editing ? (
        <form className="pin-setup-form" onSubmit={savePin}>
          <PinInput disabled={busy} id="new-pin" label={t("Nouveau PIN", "New PIN")} onChange={setPin} value={pin} />
          <PinInput disabled={busy} id="confirm-pin" label={t("Confirmer le PIN", "Confirm PIN")} onChange={setConfirmation} value={confirmation} />
          <div className="pin-security__actions">
            <button className="button button--primary" disabled={busy} type="submit">{busy ? t("Protection…", "Securing…") : t("Enregistrer le PIN", "Save PIN")}</button>
            <button className="button button--secondary" disabled={busy} onClick={resetForm} type="button">{t("Annuler", "Cancel")}</button>
          </div>
        </form>
      ) : (
        <div className="pin-security__actions">
          <button className="button button--primary" onClick={() => { setEditing(true); setMessage(null); }} type="button">
            <ShieldCheck aria-hidden="true" size={18} />
            {hasPin ? t("Modifier mon PIN", "Change my PIN") : t("Configurer mon PIN", "Set up my PIN")}
          </button>
          {hasPin ? (
            <>
              <button className="button button--secondary" onClick={lockNow} type="button"><LockKeyhole aria-hidden="true" size={18} />{t("Verrouiller Kjora maintenant", "Lock Kjora now")}</button>
              <button className="button button--danger-quiet" disabled={busy} onClick={deletePin} type="button"><ShieldOff aria-hidden="true" size={18} />{t("Supprimer mon PIN", "Remove my PIN")}</button>
            </>
          ) : null}
        </div>
      )}

      {message ? <p className={error ? "form-feedback form-feedback--error" : "form-feedback"} role={error ? "alert" : "status"}>{message}</p> : null}
    </section>
  );
}

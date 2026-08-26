"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { validatePinConfirmation } from "@/core/security/pin-lock";
import { PinInput } from "@/core/security/pin-input";
import { usePinLock } from "@/core/security/pin-lock-provider";
import { clearLocalPinSecurity, clearPinReauthenticationRequirement } from "@/core/security/pin-storage";

export function SecureSignOutButton({ userId }: { userId: string }) {
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
        {busy ? "Déconnexion…" : "Déconnexion"}
      </button>
    </form>
  );
}

export function PinLockButton() {
  const { hasPin, lockNow } = usePinLock();
  if (!hasPin) return null;
  return (
    <button className="portal-preview-link" onClick={lockNow} type="button">
      <LockKeyhole aria-hidden="true" size={18} />
      Verrouiller Kjora
    </button>
  );
}

export function PinSetupPrompt() {
  const { hasPin } = usePinLock();
  const [dismissed, setDismissed] = useState(false);
  if (hasPin || dismissed) return null;
  return (
    <aside className="pin-prompt" aria-label="Proposition de verrouillage rapide">
      <span className="pin-prompt__icon" aria-hidden="true"><ShieldCheck size={21} /></span>
      <div>
        <strong>Protéger rapidement cet appareil ?</strong>
        <p>Configurez, si vous le souhaitez, un PIN local à 6 chiffres dans Paramètres. Votre email reste l’authentification principale.</p>
      </div>
      <div className="pin-prompt__actions">
        <a className="button button--primary button--small" href="/app/parametres#securite">Configurer</a>
        <button className="button button--secondary button--small" onClick={() => setDismissed(true)} type="button">Plus tard</button>
      </div>
    </aside>
  );
}

export function PinSecurityPanel() {
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
      setMessage("Le PIN doit contenir exactement 6 chiffres.");
      return;
    }
    if (validation === "mismatch") {
      setError(true);
      setMessage("Les deux PIN ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      await configurePin(pin);
      resetForm();
      setMessage(hasPin ? "Votre PIN a été modifié." : "Votre PIN local est configuré.");
    } catch {
      setError(true);
      setMessage("Impossible de sécuriser le PIN sur cet appareil. Réessayez.");
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
      setMessage("Le PIN local a été supprimé de cet appareil.");
    } catch {
      setError(true);
      setMessage("Impossible de supprimer le PIN local. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pin-security" id="securite">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sécurité de l’appareil</p>
          <h2>Verrouillage rapide</h2>
        </div>
        <span className={hasPin ? "badge badge--success" : "badge badge--neutral"}>
          {hasPin ? "PIN actif" : "Facultatif"}
        </span>
      </div>
      <div className="pin-security__intro">
        <span aria-hidden="true"><ShieldCheck size={23} /></span>
        <p>Le PIN protège localement Kjora après 5 minutes d’inactivité. Il ne remplace jamais votre connexion sécurisée par email.</p>
      </div>

      {editing ? (
        <form className="pin-setup-form" onSubmit={savePin}>
          <PinInput disabled={busy} id="new-pin" label="Nouveau PIN" onChange={setPin} value={pin} />
          <PinInput disabled={busy} id="confirm-pin" label="Confirmer le PIN" onChange={setConfirmation} value={confirmation} />
          <div className="pin-security__actions">
            <button className="button button--primary" disabled={busy} type="submit">{busy ? "Protection…" : "Enregistrer le PIN"}</button>
            <button className="button button--secondary" disabled={busy} onClick={resetForm} type="button">Annuler</button>
          </div>
        </form>
      ) : (
        <div className="pin-security__actions">
          <button className="button button--primary" onClick={() => { setEditing(true); setMessage(null); }} type="button">
            <ShieldCheck aria-hidden="true" size={18} />
            {hasPin ? "Modifier mon PIN" : "Configurer mon PIN"}
          </button>
          {hasPin ? (
            <>
              <button className="button button--secondary" onClick={lockNow} type="button"><LockKeyhole aria-hidden="true" size={18} />Verrouiller Kjora maintenant</button>
              <button className="button button--danger-quiet" disabled={busy} onClick={deletePin} type="button"><ShieldOff aria-hidden="true" size={18} />Supprimer mon PIN</button>
            </>
          ) : null}
        </div>
      )}

      {message ? <p className={error ? "form-feedback form-feedback--error" : "form-feedback"} role={error ? "alert" : "status"}>{message}</p> : null}
    </section>
  );
}

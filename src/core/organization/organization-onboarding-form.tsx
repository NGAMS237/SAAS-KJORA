"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ORGANIZATION_TIMEZONES } from "@/core/organization/settings";

export function OrganizationOnboardingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        language: form.get("language"),
        timezone: form.get("timezone"),
      }),
    });
    if (!response.ok) {
      setError("Impossible de créer l’Organization. Vérifiez les informations et réessayez.");
      setBusy(false);
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label className="field">
        <span>Nom de l’Organization</span>
        <input name="name" minLength={2} maxLength={120} required placeholder="Ex. Horizon Habitat" />
      </label>
      <div className="form-grid">
        <label className="field">
          <span>Langue</span>
          <select defaultValue="fr" name="language">
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="field">
          <span>Fuseau horaire</span>
          <select defaultValue="Africa/Douala" name="timezone" required>{ORGANIZATION_TIMEZONES.map(([id, label]) => <option key={id} value={id}>{label} · {id}</option>)}</select>
        </label>
      </div>
      <div className="fixed-configuration">
        <span><small>Pays</small><strong>Cameroun</strong></span>
        <span><small>Devise</small><strong>XAF</strong></span>
      </div>
      {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
      <button className="button button--primary" disabled={busy} type="submit">
        {busy ? "Création…" : "Créer mon espace"}
      </button>
    </form>
  );
}

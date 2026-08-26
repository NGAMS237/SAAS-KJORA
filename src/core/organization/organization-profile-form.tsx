"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrganizationOption } from "@/core/organization/select-active-organization";

export function OrganizationProfileForm({ organization }: { organization: OrganizationOption }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/organizations/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        language: form.get("language"),
        timezone: form.get("timezone"),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(response.status === 403 ? "Seul un Owner actif peut modifier ce profil." : "Modification impossible.");
      return;
    }
    setMessage("Profil de l’Organization mis à jour.");
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>Nom</span><input defaultValue={organization.name} maxLength={120} minLength={2} name="name" required /></label>
      <div className="form-grid">
        <label className="field"><span>Langue</span><select defaultValue={organization.language} name="language"><option value="fr">Français</option><option value="en">English</option></select></label>
        <label className="field"><span>Fuseau horaire</span><input defaultValue={organization.timezone} name="timezone" required /></label>
      </div>
      <div className="fixed-configuration"><span><small>Pays</small><strong>Cameroun</strong></span><span><small>Devise</small><strong>XAF</strong></span></div>
      {message ? <p className="form-feedback" role="status">{message}</p> : null}
      <button className="button button--primary" disabled={busy} type="submit">{busy ? "Enregistrement…" : "Enregistrer"}</button>
    </form>
  );
}

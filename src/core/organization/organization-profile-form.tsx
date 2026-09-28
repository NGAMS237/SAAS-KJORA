"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { OrganizationOption } from "@/core/organization/select-active-organization";
import { ORGANIZATION_TIMEZONES } from "@/core/organization/settings";
import { RENTAL_CURRENCIES, defaultsForCountry } from "@/core/currency/metadata";
import { usePreferences } from "@/core/preferences/preferences-provider";

export function OrganizationProfileForm({ organization, currencyLocked }: { organization: OrganizationOption; currencyLocked: boolean }) {
  const router = useRouter();
  const { language } = usePreferences();
  const t = (fr: string, en: string) => language === "FR" ? fr : en;
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
        currency: form.get("currency"),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      setMessage(body.error === "organization_currency_locked"
        ? t("La devise est verrouillée car l’Organization possède déjà des données financières.", "Currency is locked because the Organization already has financial data.")
        : response.status === 403 ? t("Vous n’avez pas l’autorisation de modifier ces paramètres.", "You are not allowed to change these settings.") : t("Modification impossible.", "Update failed."));
      return;
    }
    setMessage(t("Profil de l’Organization mis à jour.", "Organization profile updated."));
    router.refresh();
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label className="field"><span>{t("Nom", "Name")}</span><input defaultValue={organization.name} maxLength={120} minLength={2} name="name" required /></label>
      <div className="form-grid">
        <label className="field"><span>{t("Langue", "Language")}</span><select defaultValue={organization.language} name="language"><option value="fr">Français</option><option value="en">English</option></select></label>
        <label className="field"><span>{t("Fuseau horaire", "Time zone")}</span><select defaultValue={organization.timezone} name="timezone" required>{!ORGANIZATION_TIMEZONES.some(([id]) => id === organization.timezone) ? <option value={organization.timezone}>{organization.timezone}</option> : null}{ORGANIZATION_TIMEZONES.map(([id, label]) => <option key={id} value={id}>{label} · {id}</option>)}</select></label>
        <label className="field"><span>{t("Devise", "Currency")}</span><select defaultValue={organization.currencyCode} disabled={currencyLocked} name="currency">{RENTAL_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select><small>{currencyLocked ? t("Devise verrouillée depuis la première opération financière enregistrée pour cette Organization (bail, conditions financières du bail, échéance, paiement, allocation ou écriture de compte). Aucun historique ne sera converti.", "Currency locked since this Organization's first recorded financial operation (a lease, a lease's financial terms, a due, a payment, an allocation, or a ledger entry). History is never converted.") : t("Changeable librement tant qu’aucune donnée financière n’existe. Ne modifie jamais la devise de votre abonnement KJORA.", "Freely changeable as long as no financial data exists. Never changes your KJORA subscription currency.")}</small>{currencyLocked ? <input name="currency" type="hidden" value={organization.currencyCode} /> : null}</label>
      </div>
      <div className="fixed-configuration"><span><small>{t("Pays", "Country")}</small><strong>{t(defaultsForCountry(organization.countryCode)?.label.fr ?? organization.countryCode, defaultsForCountry(organization.countryCode)?.label.en ?? organization.countryCode)}</strong></span></div>
      {message ? <p className="form-feedback" role="status">{message}</p> : null}
      <button className="button button--primary" disabled={busy} type="submit">{busy ? t("Enregistrement…", "Saving…") : t("Enregistrer", "Save")}</button>
    </form>
  );
}

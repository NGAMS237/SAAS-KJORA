"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FileSignature } from "lucide-react";
import { Card } from "@/core/ui/ui";
import { usePreferences } from "@/core/preferences/preferences-provider";
import type { LeaseContractDates } from "./contract-dates";

const xaf = (value: number) => `${value.toLocaleString("fr-CA")} XAF`;

export type LeaseTermsView = {
  leaseId: string; status: string; startDate: string; endDate: string | null;
  baseRentXaf: number; recurringChargesXaf: number; securityDepositXaf: number; dueDay: number;
  billingFrequency: string;
};

// Une seule carte qui répond à « où modifier le bail ? » : toutes les conditions au même
// endroit, et pour chacune l'action possible ou la raison pour laquelle elle est figée.
export function LeaseTermsCard({ terms, contract, canManage }: { terms: LeaseTermsView; contract: LeaseContractDates; canManage: boolean }) {
  const { language } = usePreferences();
  const t = (fr: string, en: string) => (language === "FR" ? fr : en);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(contract.start ?? terms.startDate);
  const [end, setEnd] = useState(contract.end ?? terms.endDate ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = terms.status === "active";
  const editableDates = canManage && contract.available && terms.status !== "ended";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (end && start && end < start) { setMessage(t("La fin ne peut pas précéder le début.", "The end cannot be before the start.")); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/tenancy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "set_contract_dates", leaseId: terms.leaseId, contractStartDate: start || null, contractEndDate: end || null }) });
      if (!response.ok) { setMessage(t("Les dates n’ont pas pu être enregistrées. Rien n’a été modifié.", "The dates could not be saved. Nothing was modified.")); return; }
      setEditing(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  const row = (label: string, value: string, hint: string, link?: { href: string; text: string }) => (
    <li key={label}><strong>{label}</strong> : {value} <small>— {hint}{link ? <> <a href={link.href}>{link.text}</a></> : null}</small></li>
  );

  return (
    <Card id="conditions-bail">
      <div className="section-heading">
        <div><p className="eyebrow">{t("Bail", "Lease")}</p><h2>{t("Conditions du bail", "Lease terms")}</h2></div>
        <FileSignature size={22} />
      </div>
      <ul className="support-tips">
        {row(t("Loyer", "Rent"), xaf(terms.baseRentXaf), active ? t("modifiable à partir d’une date future", "changeable from a future date") : t("figé", "fixed"), active ? { href: "#changer-loyer", text: t("Modifier le loyer", "Change the rent") } : undefined)}
        {row(t("Charges", "Charges"), xaf(terms.recurringChargesXaf), active ? t("se changent avec le loyer", "changed together with the rent") : t("figées", "fixed"), active ? { href: "#changer-loyer", text: t("Modifier", "Change") } : undefined)}
        {row(t("Jour d’échéance", "Due day"), String(terms.dueDay), t("figé : il garantit la cohérence des échéances déjà émises", "fixed: keeps issued dues consistent"))}
        {row(t("Dépôt de garantie", "Deposit"), xaf(terms.securityDepositXaf), t("figé après activation", "fixed after activation"))}
        {row(t("Début de facturation", "Billing start"), terms.startDate, t("figé : c’est lui qui génère les échéances", "fixed: it generates the dues"))}
        {row(t("Fin de facturation", "Billing end"), terms.endDate ?? "—", t("pour terminer un bail, utilisez « Terminer le bail »", "to close a lease use “End lease”"))}
        {contract.available ? row(t("Début du contrat", "Contract start"), contract.start ?? "—", t("date informative, modifiable", "informational, editable")) : null}
        {contract.available ? row(t("Fin du contrat", "Contract end"), contract.end ?? "—", t("date informative, modifiable", "informational, editable")) : null}
      </ul>
      <p className="field-help">{t("Les dates du contrat n’ont aucun effet sur les échéances, les soldes ni les paiements : vous pouvez saisir les vraies dates sans rien casser.", "Contract dates have no effect on dues, balances or payments: you can enter the real dates safely.")}</p>
      {editableDates && !editing ? <button className="button button--secondary" onClick={() => setEditing(true)} type="button">{t("Modifier les dates du contrat", "Edit contract dates")}</button> : null}
      {editableDates && editing ? (
        <form className="form-stack" onSubmit={submit}>
          <label className="field"><span>{t("Début du contrat", "Contract start")}</span><input onChange={(event) => setStart(event.target.value)} type="date" value={start} /></label>
          <label className="field"><span>{t("Fin du contrat", "Contract end")}</span><input onChange={(event) => setEnd(event.target.value)} type="date" value={end} /></label>
          <div className="demo-form-actions">
            <button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer", "Save")}</button>
            <button className="button button--secondary" onClick={() => setEditing(false)} type="button">{t("Annuler", "Cancel")}</button>
          </div>
        </form>
      ) : null}
      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    </Card>
  );
}

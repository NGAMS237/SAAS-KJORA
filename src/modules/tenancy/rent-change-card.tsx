"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TrendingUp } from "lucide-react";
import { Card } from "@/core/ui/ui";
import { usePreferences } from "@/core/preferences/preferences-provider";
import type { ScheduledRentTerms } from "./rent-terms";

const xaf = (value: number) => `${value.toLocaleString("fr-CA")} XAF`;

export function RentChangeCard({ leaseId, currentBaseRentXaf, currentChargesXaf, earliestDate, scheduled, canManage }: {
  leaseId: string;
  currentBaseRentXaf: number;
  currentChargesXaf: number;
  earliestDate: string;
  scheduled: ScheduledRentTerms[];
  canManage: boolean;
}) {
  const { language } = usePreferences();
  const t = (fr: string, en: string) => (language === "FR" ? fr : en);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [baseRent, setBaseRent] = useState(String(currentBaseRentXaf));
  const [charges, setCharges] = useState(String(currentChargesXaf));
  const [effectiveFrom, setEffectiveFrom] = useState(earliestDate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const newBase = Number(baseRent);
    const newCharges = Number(charges || 0);
    if (!Number.isSafeInteger(newBase) || newBase <= 0 || !Number.isSafeInteger(newCharges) || newCharges < 0) {
      setMessage(t("Saisissez un loyer supérieur à 0 et des charges positives ou nulles.", "Enter a rent above 0 and charges of 0 or more."));
      return;
    }
    if (effectiveFrom < earliestDate) {
      setMessage(t(`La date doit être le ${earliestDate} ou plus tard : les échéances déjà émises ne changent pas.`, `The date must be ${earliestDate} or later: dues already issued do not change.`));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/tenancy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "schedule_rent_change", leaseId, effectiveFrom, baseRentXaf: newBase, recurringChargesXaf: newCharges }) });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage(body.error === "future_period_already_generated"
          ? t("Une échéance existe déjà à partir de cette date. Choisissez une date plus tardive.", "A due already exists from that date. Choose a later date.")
          : body.error === "duplicate_resource"
            ? t("Un changement est déjà programmé à cette date.", "A change is already scheduled for that date.")
            : t("Le changement n’a pas pu être enregistré. Rien n’a été modifié.", "The change could not be saved. Nothing was modified."));
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="changer-loyer">
      <div className="section-heading">
        <div><p className="eyebrow">{t("Conditions", "Terms")}</p><h2>{t("Modifier le loyer", "Change the rent")}</h2></div>
        <TrendingUp size={22} />
      </div>
      <p className="field-help">{t(`Loyer actuel : ${xaf(currentBaseRentXaf)} + ${xaf(currentChargesXaf)} de charges. Le nouveau montant s’applique aux échéances à partir de la date choisie ; les échéances déjà émises et les paiements restent inchangés.`, `Current rent: ${xaf(currentBaseRentXaf)} + ${xaf(currentChargesXaf)} charges. The new amount applies to dues from the chosen date; dues already issued and payments are unchanged.`)}</p>
      {scheduled.length ? (
        <ul className="support-tips">
          {scheduled.map((item) => <li key={item.id}>{t(`À partir du ${item.effectiveFrom} : ${xaf(item.baseRentXaf)} + ${xaf(item.recurringChargesXaf)} de charges`, `From ${item.effectiveFrom}: ${xaf(item.baseRentXaf)} + ${xaf(item.recurringChargesXaf)} charges`)}</li>)}
        </ul>
      ) : null}
      {canManage && !open ? <button className="button button--secondary" onClick={() => setOpen(true)} type="button">{t("Programmer un nouveau loyer", "Schedule a new rent")}</button> : null}
      {canManage && open ? (
        <form className="form-stack" onSubmit={submit}>
          <label className="field"><span>{t("Nouveau loyer hors charges (XAF)", "New base rent (XAF)")}</span><input inputMode="numeric" min={1} onChange={(event) => setBaseRent(event.target.value)} type="number" value={baseRent} /></label>
          <label className="field"><span>{t("Charges récurrentes (XAF)", "Recurring charges (XAF)")}</span><input inputMode="numeric" min={0} onChange={(event) => setCharges(event.target.value)} type="number" value={charges} /></label>
          <label className="field"><span>{t("S’applique à partir du", "Applies from")}</span><input min={earliestDate} onChange={(event) => setEffectiveFrom(event.target.value)} type="date" value={effectiveFrom} /><small>{t(`Au plus tôt le ${earliestDate} (après la dernière échéance déjà émise).`, `Earliest ${earliestDate} (after the last due already issued).`)}</small></label>
          <p className="field-help">{t("Un changement programmé ne peut plus être retiré : vérifiez les montants avant d’enregistrer.", "A scheduled change cannot be removed afterwards: check the amounts before saving.")}</p>
          <div className="demo-form-actions">
            <button className="button button--primary" disabled={busy} type="submit">{t("Enregistrer le changement", "Save change")}</button>
            <button className="button button--secondary" onClick={() => setOpen(false)} type="button">{t("Annuler", "Cancel")}</button>
          </div>
        </form>
      ) : null}
      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    </Card>
  );
}

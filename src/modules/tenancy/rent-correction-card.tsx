"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/core/ui/ui";

const xaf = (value: number) => `${value.toLocaleString("fr-CA")} XAF`;

export type RentCorrectionPreview = {
  dryRun: boolean; oldBaseRentXaf: number; oldRecurringChargesXaf: number; newBaseRentXaf: number; newRecurringChargesXaf: number;
  futureDuesFrom: string; adjustedDues: number; remainingBeforeXaf: number; remainingAfterXaf: number;
  changes: { reference: string; dueDate: string; oldTotalXaf: number; newTotalXaf: number }[];
};

const ERRORS: Record<string, string> = {
  scheduled_change_exists: "Un changement de loyer est déjà programmé pour plus tard : il faut d’abord s’en occuper (contactez le support).",
  correction_below_paid: "Le nouveau montant est inférieur à ce qui a déjà été payé sur une échéance. Corrigez d’abord le paiement concerné.",
  lease_not_active: "Ce bail n’est plus actif.",
  invalid_rent_amounts: "Saisissez un loyer supérieur à 0 et des charges positives ou nulles.",
  forbidden: "Vous n’avez pas le droit de modifier ce loyer.",
};

// Correction immédiate du loyer mensuel d'un bail actif, avec aperçu avant d'enregistrer.
export function RentCorrectionCard({ leaseId, currentBaseRentXaf, currentChargesXaf, canManage, compact = false }: {
  leaseId: string; currentBaseRentXaf: number; currentChargesXaf: number; canManage: boolean; compact?: boolean;
}) {
  const router = useRouter();
  const [baseRent, setBaseRent] = useState(String(currentBaseRentXaf));
  const [charges, setCharges] = useState(String(currentChargesXaf));
  const [applyOpen, setApplyOpen] = useState(false);
  const [preview, setPreview] = useState<RentCorrectionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function call(dryRun: boolean) {
    const base = Number(baseRent);
    const extra = Number(charges || 0);
    if (!Number.isSafeInteger(base) || base <= 0 || !Number.isSafeInteger(extra) || extra < 0) { setMessage(ERRORS.invalid_rent_amounts ?? null); return null; }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/tenancy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "correct_rent", leaseId, baseRentXaf: base, recurringChargesXaf: extra, applyToOpenDues: applyOpen, dryRun }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; result?: RentCorrectionPreview };
      if (!response.ok || !body.result) { setMessage(ERRORS[body.error ?? ""] ?? "La correction n’a pas pu être enregistrée. Rien n’a été modifié."); return null; }
      return body.result;
    } finally { setBusy(false); }
  }

  async function onPreview(event: FormEvent) { event.preventDefault(); setDone(false); setPreview(await call(true)); }
  async function onConfirm() {
    const result = await call(false);
    if (result) { setPreview(null); setDone(true); router.refresh(); }
  }

  const unchanged = Number(baseRent) === currentBaseRentXaf && Number(charges || 0) === currentChargesXaf;
  return (
    <Card id="corriger-loyer">
      <div className="section-heading">
        <div><p className="eyebrow">Montant mensuel</p><h2>Corriger le loyer</h2></div>
        <Pencil size={22} />
      </div>
      <p className="field-help">Loyer actuel : {xaf(currentBaseRentXaf)} + {xaf(currentChargesXaf)} de charges. Le nouveau montant s’applique tout de suite au bail et aux prochaines échéances.</p>
      {canManage ? (
        <form className="form-stack" onSubmit={onPreview}>
          <label className="field"><span>Loyer mensuel hors charges (XAF)</span><input inputMode="numeric" min={1} onChange={(e) => { setBaseRent(e.target.value); setPreview(null); }} type="number" value={baseRent} /></label>
          <label className="field"><span>Charges mensuelles (XAF)</span><input inputMode="numeric" min={0} onChange={(e) => { setCharges(e.target.value); setPreview(null); }} type="number" value={charges} /></label>
          <label className="checkbox-field">
            <input checked={applyOpen} onChange={(e) => { setApplyOpen(e.target.checked); setPreview(null); }} type="checkbox" />
            <span>Recalculer aussi les échéances déjà émises (ajustements tracés, rien n’est effacé)</span>
          </label>
          {applyOpen ? <p className="field-help">Attention : cela change le « reste dû » du locataire. Pour un locataire importé de Rentila, vérifiez d’abord l’aperçu : la dette de départ avait été validée avec l’ancien montant.</p> : null}
          <div className="demo-form-actions">
            <button className="button button--secondary" disabled={busy || (unchanged && !applyOpen)} type="submit">Voir l’aperçu</button>
          </div>
        </form>
      ) : <p className="field-help">Vous n’avez pas le droit de modifier ce loyer.</p>}
      {preview ? (
        <div className="form-stack" role="status">
          <p><strong>{xaf(preview.newBaseRentXaf)}</strong> + {xaf(preview.newRecurringChargesXaf)} de charges, à partir du {preview.futureDuesFrom} pour les nouvelles échéances.</p>
          {preview.adjustedDues > 0 ? (
            <>
              <p>{preview.adjustedDues} échéance(s) déjà émise(s) seront ajustées. Reste dû : {xaf(preview.remainingBeforeXaf)} → <strong>{xaf(preview.remainingAfterXaf)}</strong>.</p>
              <ul className="support-tips">{preview.changes.map((c) => <li key={c.reference}>{c.dueDate} : {xaf(c.oldTotalXaf)} → {xaf(c.newTotalXaf)}</li>)}</ul>
            </>
          ) : <p>Les échéances déjà émises et le reste dû ne changent pas.</p>}
          <div className="demo-form-actions">
            <button className="button button--primary" disabled={busy} onClick={() => void onConfirm()} type="button">Confirmer la correction</button>
            <button className="button button--secondary" onClick={() => setPreview(null)} type="button">Annuler</button>
          </div>
        </div>
      ) : null}
      {done ? <p className="form-feedback" role="status">Loyer corrigé.{compact ? " Vous pouvez fermer ce panneau." : ""}</p> : null}
      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    </Card>
  );
}

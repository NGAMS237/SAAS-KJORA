"use client";

import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Eye, ImageUp, Trash2 } from "lucide-react";
import { Card } from "@/core/ui/ui";
import type { DocumentBranding } from "@/modules/documents/pdf";

const ERRORS: Record<string, string> = {
  migration_missing: "La base de données n’est pas encore à jour : exécutez le script SQL « documents-bailleur » dans Supabase.",
  invalid_email: "L’adresse e-mail n’est pas valide.",
  invalid_payload: "Un champ est trop long ou une image n’est pas acceptée (PNG ou JPG uniquement).",
  forbidden: "Seul le propriétaire du compte peut modifier ces informations.",
};

// Réduit l'image côté navigateur (max 600 px) pour garder des documents légers.
async function toDataUrl(file: File, maxSize = 600): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("image_failed"));
    element.src = source;
  });
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function ImageField({ label, help, value, onChange }: { label: string; help: string; value: string | null; onChange: (value: string | null) => void }) {
  const [error, setError] = useState<string | null>(null);
  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { setError("Choisissez une image PNG ou JPG."); return; }
    try { setError(null); onChange(await toDataUrl(file)); } catch { setError("Cette image n’a pas pu être lue."); }
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div className="branding-image">
        {/* eslint-disable-next-line @next/next/no-img-element -- image locale (data URL), pas d’optimisation possible */}
        {value ? <img alt={label} src={value} /> : <p className="field-help">{help}</p>}
      </div>
      <div className="demo-form-actions">
        <label className="button button--secondary"><ImageUp aria-hidden="true" size={16} /> {value ? "Changer" : "Choisir une image"}<input accept="image/png,image/jpeg" hidden onChange={pick} type="file" /></label>
        {value ? <button className="button button--secondary" onClick={() => onChange(null)} type="button"><Trash2 aria-hidden="true" size={16} /> Retirer</button> : null}
      </div>
      {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
    </div>
  );
}

export function DocumentBrandingForm({ initial, organizationName, canManage, available }: {
  initial: DocumentBranding; organizationName: string; canManage: boolean; available: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<DocumentBranding>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const set = (key: keyof DocumentBranding) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/organizations/document-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) { setMessage({ tone: "error", text: ERRORS[body.error ?? ""] ?? "L’enregistrement a échoué. Réessayez." }); return; }
      setMessage({ tone: "ok", text: "Enregistré. Les prochains avis, quittances et reçus utiliseront ces informations." });
      router.refresh();
    } finally { setBusy(false); }
  }

  const disabled = !canManage || busy;
  return (
    <form className="settings-stack" onSubmit={submit}>
      {!available ? <p className="form-feedback form-feedback--error" role="alert">{ERRORS.migration_missing}</p> : null}
      <div className="branding-grid">
        <Card>
          <div className="section-heading"><div><p className="eyebrow">Bloc « De »</p><h2>Identité affichée</h2></div></div>
          <label className="field"><span>Nom affiché</span><input disabled={disabled} maxLength={120} onChange={set("displayName")} placeholder={organizationName} value={form.displayName ?? ""} /></label>
          <label className="field"><span>Représenté par</span><input disabled={disabled} maxLength={120} onChange={set("representative")} placeholder="Ex. Blaise Nganbou" value={form.representative ?? ""} /></label>
          <label className="field"><span>Téléphone</span><input disabled={disabled} inputMode="tel" maxLength={40} onChange={set("phone")} placeholder="+237 6 XX XX XX XX" value={form.phone ?? ""} /></label>
          <label className="field"><span>E-mail</span><input disabled={disabled} maxLength={160} onChange={set("email")} type="email" value={form.email ?? ""} /></label>
          <label className="field"><span>Adresse</span><input disabled={disabled} maxLength={240} onChange={set("address")} placeholder="Quartier, ville, pays" value={form.address ?? ""} /></label>
        </Card>
        <Card>
          <div className="section-heading"><div><p className="eyebrow">Image</p><h2>Logo et signature</h2></div></div>
          <ImageField help="Votre logo apparaît en haut à gauche des documents." label="Logo" onChange={(value) => setForm((current) => ({ ...current, logoDataUrl: value }))} value={form.logoDataUrl} />
          <ImageField help="Une photo de votre signature sur fond blanc, ou un PNG transparent." label="Signature" onChange={(value) => setForm((current) => ({ ...current, signatureDataUrl: value }))} value={form.signatureDataUrl} />
        </Card>
        <Card>
          <div className="section-heading"><div><p className="eyebrow">Avis d’échéance</p><h2>Paiement</h2></div></div>
          <label className="field"><span>Moyens de paiement acceptés</span><textarea disabled={disabled} maxLength={500} onChange={set("paymentInstructions")} placeholder="MTN Mobile Money 6XX XX XX XX · Orange Money 6XX XX XX XX · espèces contre reçu" rows={3} value={form.paymentInstructions ?? ""} /></label>
          <label className="field"><span>Texte en bas de l’avis</span><input disabled={disabled} maxLength={300} onChange={set("noticeFooter")} placeholder="Ex. Paiement avant le 5 de chaque mois." value={form.noticeFooter ?? ""} /></label>
        </Card>
        <Card>
          <div className="section-heading"><div><p className="eyebrow">Quittances et reçus</p><h2>Message</h2></div></div>
          <label className="field"><span>Texte en bas des quittances et reçus</span><input disabled={disabled} maxLength={300} onChange={set("receiptFooter")} placeholder="Ex. Merci pour votre ponctualité." value={form.receiptFooter ?? ""} /></label>
          <p className="field-help">Les documents déjà générés ne changent pas : seuls les nouveaux utilisent ces informations.</p>
          <div className="demo-form-actions">
            <a className="button button--secondary" href="/api/organizations/document-settings/sample?type=due_notice" rel="noopener" target="_blank"><Eye aria-hidden="true" size={16} /> Exemple d’avis</a>
            <a className="button button--secondary" href="/api/organizations/document-settings/sample?type=rent_receipt" rel="noopener" target="_blank"><Eye aria-hidden="true" size={16} /> Exemple de quittance</a>
          </div>
        </Card>
      </div>
      {canManage ? <div className="demo-form-actions"><button className="button button--primary" disabled={busy} type="submit">{busy ? "Enregistrement…" : "Enregistrer"}</button></div> : <p className="field-help">Seul le propriétaire du compte peut modifier ces informations.</p>}
      {message ? <p className={`form-feedback${message.tone === "error" ? " form-feedback--error" : ""}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p> : null}
      <p className="field-help">Astuce : enregistrez d’abord, puis ouvrez l’exemple pour voir le rendu.</p>
    </form>
  );
}

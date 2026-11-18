"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Mail, Copy } from "lucide-react";
import { SideDrawer } from "@/core/ui/side-drawer";
import { buildWhatsAppUrl } from "@/modules/communications/manual-whatsapp";
import { buildMailtoUrl, formatXaf, normalizeTenantPhone } from "@/modules/communications/message-templates";
import { buildReminder, defaultReminderTemplate, isPaymentRecordedPath, type ReminderTemplateKey } from "./reminder";

export type ReminderTarget = {
  tenantName: string; civility: "M." | "Mme" | null; unitLabel: string; phone: string | null; email: string | null;
  status: string; dueDate: string; totalDueXaf: number; rowRemainingXaf: number; rowTotalXaf: number;
  /** Échéance cliquée : permet de joindre son avis d'échéance PDF (absent en vue « par locataire »). */
  dueId?: string;
};

export type AdjustTarget = { dueId: string; leaseId: string; dueDate: string; totalXaf: number; paidXaf: number; remainingXaf: number };

export type DrawerState =
  | { type: "page"; title: string; subtitle?: string; href: string }
  | { type: "adjust"; title: string; subtitle?: string; target: AdjustTarget }
  | { type: "reminder"; title: string; subtitle?: string; target: ReminderTarget };

// Page existante de l'application affichée dans le tiroir (même logique, mêmes droits : rien n'est dupliqué).
function PageFrame({ href, onPath }: { href: string; onPath: (path: string) => void }) {
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLIFrameElement>(null);
  return (
    <div className="side-drawer__frame">
      {loading ? <p className="side-drawer__loading" role="status"><Loader2 aria-hidden="true" className="spin" size={16} /> Chargement…</p> : null}
      <iframe
        onLoad={() => {
          setLoading(false);
          try {
            const location = ref.current?.contentWindow?.location;
            if (location) onPath(`${location.pathname}${location.search}${location.hash}`);
          } catch { /* page hors de notre origine : on ne peut pas la lire, aucun effet */ }
        }}
        ref={ref}
        src={href}
        title="Contenu"
      />
    </div>
  );
}

type NoticeFile = { state: "none" } | { state: "loading" } | { state: "ready"; file: File };

function ReminderPanel({ target }: { target: ReminderTarget }) {
  const [templateKey, setTemplateKey] = useState<ReminderTemplateKey>(defaultReminderTemplate(target.status));
  const [notice, setNotice] = useState<NoticeFile>(target.dueId ? { state: "loading" } : { state: "none" });
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const withNotice = notice.state === "ready";
  const generated = buildReminder({ templateKey, tenantName: target.tenantName, civility: target.civility, unitLabel: target.unitLabel, totalDueXaf: target.totalDueXaf, rowRemainingXaf: target.rowRemainingXaf, rowTotalXaf: target.rowTotalXaf, dueDate: target.dueDate, withNotice });
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const text = edited ?? generated.body;
  const phone = normalizeTenantPhone(target.phone);
  const whatsapp = phone ? buildWhatsAppUrl(phone, text) : null;
  const mail = target.email ? buildMailtoUrl(target.email, generated.subject, text) : null;

  // Avis d'échéance de cette échéance : récupéré à l'ouverture pour être joint au message.
  useEffect(() => {
    if (!target.dueId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/financial-documents/by-due/${target.dueId}`, { credentials: "same-origin" });
        if (!response.ok) { if (!cancelled) setNotice({ state: "none" }); return; }
        const blob = await response.blob();
        const name = decodeURIComponent(response.headers.get("x-file-name") ?? "Avis d'échéance.pdf");
        if (!cancelled) setNotice({ state: "ready", file: new File([blob], name, { type: "application/pdf" }) });
      } catch { if (!cancelled) setNotice({ state: "none" }); }
    })();
    return () => { cancelled = true; };
  }, [target.dueId]);

  // Mobile : la feuille de partage du téléphone envoie le PDF et le message dans WhatsApp (il reste à choisir le contact puis « Envoyer »).
  // Ordinateur : WhatsApp s'ouvre sur le bon numéro avec le message, et le PDF se télécharge pour être glissé dans la conversation.
  async function sendWithWhatsApp() {
    setShareMessage(null);
    if (notice.state === "ready" && typeof navigator.canShare === "function" && navigator.canShare({ files: [notice.file] })) {
      try { await navigator.share({ files: [notice.file], text }); return; }
      catch (error) { if ((error as { name?: string }).name === "AbortError") return; }
    }
    if (notice.state === "ready") {
      const url = URL.createObjectURL(notice.file);
      const link = document.createElement("a"); link.href = url; link.download = notice.file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setShareMessage("Le PDF vient d’être téléchargé : glissez-le dans la conversation WhatsApp qui s’ouvre, puis envoyez.");
    }
    if (whatsapp) window.open(whatsapp, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="drawer-stack">
      <div className="drawer-facts">
        <div><small>Doit au total</small><strong>{formatXaf(generated.amountXaf)}</strong></div>
        <div><small>Cette échéance</small><strong>{formatXaf(target.rowRemainingXaf)}</strong></div>
      </div>
      <label className="field">
        <span>Modèle de message</span>
        <select onChange={(event) => { setTemplateKey(event.target.value as ReminderTemplateKey); setEdited(null); }} value={templateKey}>
          <option value="retard">Loyer en retard</option>
          <option value="rappel_avant">Rappel avant l’échéance</option>
        </select>
      </label>
      <label className="field">
        <span>Message (modifiable avant l’envoi)</span>
        <textarea onChange={(event) => setEdited(event.target.value)} rows={8} value={text} />
      </label>
      <div className="drawer-actions">
        {whatsapp || withNotice ? <button className="button button--primary" disabled={notice.state === "loading"} onClick={() => void sendWithWhatsApp()} type="button"><MessageCircle aria-hidden="true" size={16} /> {notice.state === "loading" ? "Préparation du PDF…" : withNotice ? "Envoyer sur WhatsApp avec le PDF" : "Ouvrir WhatsApp"}</button> : null}
        {mail ? <a className="button button--secondary" href={mail}><Mail aria-hidden="true" size={16} /> E-mail</a> : null}
        <button className="button button--secondary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => undefined); }} type="button"><Copy aria-hidden="true" size={16} /> {copied ? "Copié" : "Copier"}</button>
      </div>
      {shareMessage ? <p className="form-feedback" role="status">{shareMessage}</p> : null}
      {target.dueId && notice.state === "none" ? <p className="muted-note">L’avis d’échéance PDF n’est pas encore prêt ou approuvé pour cette échéance : le message part sans pièce jointe.</p> : null}
      {withNotice ? <p className="muted-note">Pièce jointe : {notice.file.name}</p> : null}
      {!whatsapp ? <p className="form-feedback" role="status">Pas de numéro WhatsApp reconnu pour ce locataire : ajoutez-le sur sa fiche, ou copiez le message.</p> : null}
      <p className="muted-note">Rien n’est envoyé automatiquement : WhatsApp ou votre messagerie s’ouvre avec le texte prêt, vous validez l’envoi.</p>
    </div>
  );
}

export function DuesDrawer({ state, onClose }: { state: DrawerState | null; onClose: (changed: boolean) => void }) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const firstPath = useRef<string | null>(null);

  const recorded = currentPath ? isPaymentRecordedPath(currentPath.split(/[?#]/)[0] ?? "") : false;
  const close = () => onClose(touched || recorded);

  return (
    <SideDrawer
      headerAction={state?.type === "page" ? <a aria-label="Ouvrir en pleine page" className="icon-button" href={currentPath ?? state.href} rel="noopener" target="_blank" title="Ouvrir en pleine page"><ExternalLink aria-hidden="true" size={16} /></a> : undefined}
      onClose={close}
      open={state !== null}
      subtitle={state?.subtitle}
      title={state?.title ?? ""}
    >
      {state?.type === "page" ? (
        <>
          {recorded ? <div className="side-drawer__success" role="status"><CheckCircle2 aria-hidden="true" size={18} /><span>Paiement enregistré.</span><button className="button button--primary" onClick={close} type="button">Terminer</button></div> : null}
          <PageFrame href={state.href} onPath={(path) => { if (firstPath.current === null) firstPath.current = path; else if (path !== firstPath.current) setTouched(true); setCurrentPath(path); }} />
        </>
      ) : null}
      {state?.type === "reminder" ? <ReminderPanel target={state.target} /> : null}
      {state?.type === "adjust" ? <AdjustDuePanel onDone={() => onClose(true)} target={state.target} /> : null}
    </SideDrawer>
  );
}

type AdjustPreview = { oldTotalXaf: number; newTotalXaf: number; diffXaf: number; paidXaf: number; remainingBeforeXaf: number; remainingAfterXaf: number };

const ADJUST_ERRORS: Record<string, string> = {
  amount_below_paid: "Le nouveau montant est inférieur à ce qui est déjà payé ou couvert par un crédit sur cette échéance.",
  due_not_adjustable: "Cette échéance ne peut pas être modifiée (annulée, dépôt de garantie ou ajustement).",
  no_change: "Le montant saisi est identique au montant actuel.",
  reason_required: "Indiquez le motif de l’arrangement (3 caractères minimum).",
  invalid_amount: "Saisissez un montant supérieur à 0.",
  forbidden: "Vous n’avez pas le droit de modifier ce montant.",
};

// Arrangement avec le locataire : on change le montant à payer d'UNE échéance (aperçu puis confirmation).
// Rien n'est effacé : un ajustement tracé, avec le motif, est ajouté au registre.
function AdjustDuePanel({ target, onDone }: { target: AdjustTarget; onDone: () => void }) {
  const [amount, setAmount] = useState(String(target.totalXaf));
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<AdjustPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function call(dryRun: boolean) {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/tenancy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adjust_due", leaseId: target.leaseId, dueId: target.dueId, newTotalXaf: Number(amount), reason, dryRun }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string; result?: AdjustPreview };
      if (!response.ok || !body.result) { setMessage(ADJUST_ERRORS[body.error ?? ""] ?? "Le montant n’a pas pu être modifié. Rien n’a été changé."); return null; }
      return body.result;
    } finally { setBusy(false); }
  }

  return (
    <div className="drawer-stack">
      <div className="drawer-facts">
        <div><small>Échéance du {target.dueDate.slice(8, 10)}/{target.dueDate.slice(5, 7)}/{target.dueDate.slice(0, 4)}</small><strong>{formatXaf(target.totalXaf)}</strong></div>
        <div><small>Déjà payé / couvert</small><strong>{formatXaf(target.paidXaf)}</strong></div>
        <div><small>Reste dû</small><strong>{formatXaf(target.remainingXaf)}</strong></div>
      </div>
      <form className="form-stack" onSubmit={async (event) => { event.preventDefault(); setDone(false); setPreview(await call(true)); }}>
        <label className="field"><span>Nouveau montant à payer pour ce mois (XAF)</span><input inputMode="numeric" min={1} onChange={(event) => { setAmount(event.target.value); setPreview(null); }} type="number" value={amount} /></label>
        <label className="field"><span>Motif de l’arrangement (visible dans l’état de compte)</span><textarea maxLength={300} onChange={(event) => { setReason(event.target.value); setPreview(null); }} placeholder="Ex. Geste commercial convenu avec le locataire" rows={3} value={reason} /></label>
        <div className="drawer-actions"><button className="button button--secondary" disabled={busy || done} type="submit">Voir l’aperçu</button></div>
      </form>
      {preview ? (
        <div className="form-stack" role="status">
          <p>Montant de l’échéance : {formatXaf(preview.oldTotalXaf)} → <strong>{formatXaf(preview.newTotalXaf)}</strong> ({preview.diffXaf < 0 ? "remise" : "majoration"} de {formatXaf(Math.abs(preview.diffXaf))}).</p>
          <p>Reste dû : {formatXaf(preview.remainingBeforeXaf)} → <strong>{formatXaf(preview.remainingAfterXaf)}</strong>. Le loyer du bail et les autres mois ne changent pas.</p>
          <div className="drawer-actions">
            <button className="button button--primary" disabled={busy} onClick={async () => { const result = await call(false); if (result) { setPreview(null); setDone(true); } }} type="button">Confirmer</button>
            <button className="button button--secondary" onClick={() => setPreview(null)} type="button">Annuler</button>
          </div>
        </div>
      ) : null}
      {done ? <div className="side-drawer__success" role="status"><CheckCircle2 aria-hidden="true" size={18} /><span>Montant modifié. L’écart est tracé dans l’état de compte.</span><button className="button button--primary" onClick={onDone} type="button">Terminer</button></div> : null}
      {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
      <p className="muted-note">Rien n’est effacé : un ajustement daté, avec votre motif, est ajouté au registre financier.</p>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, Mail, Copy } from "lucide-react";
import { SideDrawer } from "@/core/ui/side-drawer";
import { buildWhatsAppUrl } from "@/modules/communications/manual-whatsapp";
import { buildMailtoUrl, formatXaf, normalizeTenantPhone } from "@/modules/communications/message-templates";
import { buildReminder, defaultReminderTemplate, isPaymentRecordedPath, type ReminderTemplateKey } from "./reminder";

export type ReminderTarget = {
  tenantName: string; civility: "M." | "Mme" | null; unitLabel: string; phone: string | null; email: string | null;
  status: string; dueDate: string; totalDueXaf: number; rowRemainingXaf: number; rowTotalXaf: number;
};

export type DrawerState =
  | { type: "page"; title: string; subtitle?: string; href: string }
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

function ReminderPanel({ target }: { target: ReminderTarget }) {
  const [templateKey, setTemplateKey] = useState<ReminderTemplateKey>(defaultReminderTemplate(target.status));
  const generated = buildReminder({ templateKey, tenantName: target.tenantName, civility: target.civility, unitLabel: target.unitLabel, totalDueXaf: target.totalDueXaf, rowRemainingXaf: target.rowRemainingXaf, rowTotalXaf: target.rowTotalXaf, dueDate: target.dueDate });
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const text = edited ?? generated.body;
  const phone = normalizeTenantPhone(target.phone);
  const whatsapp = phone ? buildWhatsAppUrl(phone, text) : null;
  const mail = target.email ? buildMailtoUrl(target.email, generated.subject, text) : null;

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
        {whatsapp ? <a className="button button--primary" href={whatsapp} rel="noopener noreferrer" target="_blank"><MessageCircle aria-hidden="true" size={16} /> Ouvrir WhatsApp</a> : null}
        {mail ? <a className="button button--secondary" href={mail}><Mail aria-hidden="true" size={16} /> E-mail</a> : null}
        <button className="button button--secondary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => undefined); }} type="button"><Copy aria-hidden="true" size={16} /> {copied ? "Copié" : "Copier"}</button>
      </div>
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
    </SideDrawer>
  );
}

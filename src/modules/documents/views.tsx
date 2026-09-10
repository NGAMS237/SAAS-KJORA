"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellRing, CheckCheck, Download, ExternalLink, FileCheck2, FileClock, FileText, Mail, Send, TriangleAlert, X } from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Card, EmptyState } from "@/core/ui/ui";
import type { FinancialDocumentSummary, NotificationSummary } from "@/modules/documents/model";
import { notificationHref } from "@/modules/operations/model";

// DOCUMENT DELIVERY — modals explicites (§9, §10) au lieu d'un bouton
// silencieusement désactivé. Chaque modal reste sur la page, comme
// FeatureUpgradeModal : "Annuler"/"Fermer" ne fait que fermer, aucune
// navigation forcée.
function EmailMissingModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const t = useCopy();
  return (
    <div className="confirmation-modal" role="presentation">
      <button aria-label={t("Fermer", "Close")} className="confirmation-modal__backdrop" onClick={onClose} type="button" />
      <section aria-labelledby="email-missing-title" aria-modal="true" className="confirmation-modal__panel" role="dialog">
        <div className="confirmation-modal__header">
          <div><h2 id="email-missing-title">{t("Adresse email manquante", "Missing email address")}</h2></div>
          <button aria-label={t("Fermer", "Close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <p>{t("Aucune adresse email n’est renseignée pour ce locataire.", "No email address is on file for this tenant.")}</p>
        <div className="demo-form-actions">
          <button className="button button--secondary" onClick={onClose} type="button">{t("Annuler", "Cancel")}</button>
          {/* Conserve le contexte (§9) : renvoie vers la fiche locataire déjà connue, avec le champ email à modifier. */}
          <Link className="button button--primary" href={`/app/locataires/${tenantId}?focus=email`} onClick={onClose}>
            {t("Ajouter l’email", "Add email")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function EmailUnavailableModal({ downloadHref, onClose }: { downloadHref: string; onClose: () => void }) {
  const t = useCopy();
  return (
    <div className="confirmation-modal" role="presentation">
      <button aria-label={t("Fermer", "Close")} className="confirmation-modal__backdrop" onClick={onClose} type="button" />
      <section aria-labelledby="email-unavailable-title" aria-modal="true" className="confirmation-modal__panel" role="dialog">
        <div className="confirmation-modal__header">
          <div><h2 id="email-unavailable-title">{t("Envoi par email indisponible", "Email delivery unavailable")}</h2></div>
          <button aria-label={t("Fermer", "Close")} className="icon-button" onClick={onClose} type="button"><X size={18} /></button>
        </div>
        <p>{t("L’envoi automatique n’est pas encore disponible. Vous pouvez télécharger le PDF et l’envoyer manuellement.", "Automatic delivery isn’t available yet. You can download the PDF and send it yourself.")}</p>
        <div className="demo-form-actions">
          <button className="button button--secondary" onClick={onClose} type="button">{t("Fermer", "Close")}</button>
          <Link className="button button--primary" href={downloadHref} onClick={onClose} rel="noopener noreferrer" target="_blank">
            <Download size={15} />{t("Télécharger le PDF", "Download PDF")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function friendlyDeliveryError(code: string | undefined, t: ReturnType<typeof useCopy>): string {
  switch (code) {
    case "tenant_email_required":
      return t("Aucune adresse email n’est renseignée pour ce locataire.", "No email address is on file for this tenant.");
    case "email_delivery_disabled":
      return t("L’envoi automatique n’est pas encore disponible.", "Automatic delivery isn’t available yet.");
    case "forbidden":
      return t("Vous n’avez pas les droits nécessaires pour cet envoi.", "You don’t have the rights required for this delivery.");
    case "invalid_document":
    case "not_found":
      return t("Ce document n’est plus disponible.", "This document is no longer available.");
    case "rate_limited":
      return t("Trop de tentatives récentes. Réessayez dans quelques instants.", "Too many recent attempts. Try again shortly.");
    default:
      return t("Impossible de préparer cet envoi pour le moment.", "Unable to prepare this delivery right now.");
  }
}

function useCopy() {
  const { language } = usePreferences();
  return (fr: string, en: string) => language === "FR" ? fr : en;
}

function shortDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function documentLabel(document: FinancialDocumentSummary, t: ReturnType<typeof useCopy>) {
  return {
    due_notice: t("Avis d’échéance", "Due notice"),
    payment_receipt: t("Reçu de paiement", "Payment receipt"),
    rent_receipt: t("Quittance de loyer", "Rent receipt"),
    account_statement: t("État de compte", "Account statement"),
  }[document.type];
}

async function mutate(body: Record<string, unknown>) {
  const response = await fetch("/api/financial-documents", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { ok: response.ok, body: await response.json() as Record<string, unknown> };
}

function DocumentRow({ document, canShare, emailDeliveryEnabled }: {
  document: FinancialDocumentSummary; canShare: boolean; emailDeliveryEnabled: boolean;
}) {
  const t = useCopy();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modal, setModal] = useState<"missing_email" | "unavailable" | null>(null);
  const downloadHref = `/api/financial-documents/${document.id}/download`;

  async function queueEmail() {
    setBusy(true); setMessage(null);
    const result = await mutate({ action: "queue_email", documentId: document.id });
    setBusy(false);
    if (result.ok) {
      // §11 : message de succès distinct entre mise en file (asynchrone) et
      // confirmation d'envoi effectif — ici l'API ne renvoie que la mise en
      // file (le worker cron confirme l'envoi réel plus tard).
      setMessage(document.tenantEmail
        ? t(`Envoi programmé à ${document.tenantEmail}.`, `Delivery scheduled to ${document.tenantEmail}.`)
        : t("Envoi ajouté à la file sécurisée.", "Delivery added to the secure queue."));
      return;
    }
    const code = typeof result.body.error === "string" ? result.body.error : undefined;
    if (code === "tenant_email_required") { setModal("missing_email"); return; }
    if (code === "email_delivery_disabled") { setModal("unavailable"); return; }
    setMessage(friendlyDeliveryError(code, t));
  }

  function onSendClick() {
    // Portes explicites côté client (§9-§10) : on n'appelle le serveur que
    // lorsque l'envoi a une chance raisonnable d'aboutir. Le serveur revérifie
    // de toute façon les deux conditions (defense-in-depth).
    if (!document.tenantEmail) { setModal("missing_email"); return; }
    if (!emailDeliveryEnabled) { setModal("unavailable"); return; }
    void queueEmail();
  }

  return <div className={`document-row${document.status === "invalidated" ? " document-row--invalidated" : ""}`}>
    <span className="document-row__icon">{document.status === "invalidated" ? <TriangleAlert size={19} /> : document.status === "ready" ? <FileCheck2 size={19} /> : <FileClock size={19} />}</span>
    <div className="document-row__body">
      <strong>{documentLabel(document, t)}</strong>
      <span>{document.reference} · {shortDate(document.issuedOn)}</span>
      {document.periodStart ? <small>{shortDate(document.periodStart)} → {shortDate(document.periodEnd)}</small> : null}
      {document.status === "invalidated" ? <small>{t("Invalidé — original conservé", "Invalidated — original retained")}</small> : null}
      {document.lastDelivery ? <small>{document.lastDelivery.status === "sent"
        ? t(`Envoyé à ${document.lastDelivery.recipientEmail} le ${shortDate(document.lastDelivery.sentAt)}`, `Sent to ${document.lastDelivery.recipientEmail} on ${shortDate(document.lastDelivery.sentAt)}`)
        : document.lastDelivery.status === "failed"
          ? t(`Envoi en échec · essai ${document.lastDelivery.attemptCount}/3`, `Delivery failed · attempt ${document.lastDelivery.attemptCount}/3`)
          : t(`Envoi ${document.lastDelivery.status}`, `Delivery ${document.lastDelivery.status}`)}</small> : null}
      {message ? <small role="status">{message}</small> : null}
    </div>
    <div className="document-row__actions">
      <Link className="button button--secondary" href={downloadHref} prefetch={false} target="_blank"><Download size={15} />PDF</Link>
      {canShare ? <button className="button button--secondary" disabled={busy || document.status === "invalidated"} onClick={onSendClick} type="button"><Send size={15} />{busy ? t("Envoi…", "Sending…") : t("Envoyer par email", "Send by email")}</button> : null}
    </div>
    {modal === "missing_email" ? <EmailMissingModal onClose={() => setModal(null)} tenantId={document.tenantId} /> : null}
    {modal === "unavailable" ? <EmailUnavailableModal downloadHref={downloadHref} onClose={() => setModal(null)} /> : null}
  </div>;
}

export function FinancialDocumentsPanel({ documents, canShare, emailDeliveryEnabled, id = "documents" }: {
  documents: FinancialDocumentSummary[]; canShare: boolean; emailDeliveryEnabled: boolean; id?: string;
}) {
  const t = useCopy();
  return <Card className="documents-card" id={id}>
    <div className="section-heading"><div><p className="eyebrow">{t("Documents", "Documents")}</p><h2>{t("Documents financiers", "Financial documents")}</h2></div><FileText size={22} /></div>
    <p>{t("PDF privés, versionnés et rattachés à leur contexte financier réel.", "Private, versioned PDFs linked to their real financial context.")}</p>
    {documents.length ? <div className="document-list">{documents.map((document) => <DocumentRow canShare={canShare} document={document} emailDeliveryEnabled={emailDeliveryEnabled} key={document.id} />)}</div>
      : <EmptyState icon={FileText} title={t("Aucun document", "No documents")} description={t("Les documents apparaissent au fil des reçus, quittances et avis émis. Rien n’est généré rétroactivement.", "Documents appear as receipts, rent receipts and notices are issued. Nothing is generated retroactively.")} />}
  </Card>;
}

export function StatementPdfAction({ tenantId, initialDocuments }: { tenantId: string; initialDocuments: FinancialDocumentSummary[] }) {
  const t = useCopy(); const router = useRouter();
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function prepare() {
    setBusy(true); setMessage(null);
    const result = await mutate({ action: "prepare_statement", tenantId, from: from || null, to: to || null });
    setBusy(false);
    if (!result.ok || typeof result.body.documentId !== "string") return setMessage(t("Impossible de préparer le PDF.", "Unable to prepare the PDF."));
    window.open(`/api/financial-documents/${result.body.documentId}/download`, "_blank", "noopener,noreferrer");
    router.refresh();
  }
  return <Card className="statement-export-card">
    <div className="section-heading"><div><p className="eyebrow">PDF</p><h2>{t("Exporter l’état de compte", "Export account statement")}</h2></div><Download size={21} /></div>
    <div className="statement-export-controls"><label className="field"><span>{t("Du", "From")}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field"><span>{t("Au", "To")}</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="button button--accent" disabled={busy || Boolean(from && to && to < from)} onClick={prepare} type="button"><Download size={16} />{busy ? t("Préparation…", "Preparing…") : t("Générer le PDF", "Generate PDF")}</button></div>
    {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    {initialDocuments.length ? <small>{t(`${initialDocuments.length} export(s) préparé(s) récemment.`, `${initialDocuments.length} recent export(s) prepared.`)}</small> : <small>{t("Le PDF reprend uniquement les lignes Ledger du filtre choisi.", "The PDF contains only Ledger lines from the selected filter.")}</small>}
  </Card>;
}

function notificationCopy(notification: NotificationSummary, t: ReturnType<typeof useCopy>) {
  const reference = String(notification.payload.payment_reference ?? notification.payload.due_reference ?? "");
  const titles = {
    due_notice_ready: t("Avis d’échéance prêt", "Due notice ready"),
    payment_receipt_ready: t("Reçu de paiement prêt", "Payment receipt ready"),
    rent_receipt_ready: t("Quittance de loyer prête", "Rent receipt ready"),
    payment_overdue: t("Échéance en retard", "Payment overdue"),
    contract_ready: t("Contrat à consulter", "Contract ready"),
    contract_completed: t("Contrat final disponible", "Final contract available"),
    last_prepaid_period: t("Dernière période prépayée atteinte", "Last prepaid period reached"),
    low_credit: t("Crédit insuffisant pour la prochaine échéance", "Credit does not cover the next due"),
    delivery_failed: t("Échec d’envoi", "Delivery failed"),
  };
  const detail = notification.type === "low_credit"
    ? t(
      `Crédit affecté : ${Number(notification.payload.credit_applied_xaf ?? 0).toLocaleString("fr-FR")} XAF · Reste attendu : ${Number(notification.payload.expected_remainder_xaf ?? 0).toLocaleString("fr-FR")} XAF`,
      `Credit applied: ${Number(notification.payload.credit_applied_xaf ?? 0).toLocaleString("en-GB")} XAF · Expected remainder: ${Number(notification.payload.expected_remainder_xaf ?? 0).toLocaleString("en-GB")} XAF`,
    )
    : notification.type === "last_prepaid_period"
      ? t(
        `Dernière période couverte : ${shortDate(String(notification.payload.last_covered_period_end ?? ""))} · Prochaine échéance non couverte : ${shortDate(String(notification.payload.next_uncovered_due_date ?? ""))}`,
        `Last covered period: ${shortDate(String(notification.payload.last_covered_period_end ?? ""))} · Next uncovered due: ${shortDate(String(notification.payload.next_uncovered_due_date ?? ""))}`,
      )
      : reference || t("Événement financier", "Financial event");
  return { title: titles[notification.type], detail };
}

export function NotificationsView({ notifications, embedded = false }: { notifications: NotificationSummary[]; embedded?: boolean }) {
  const t = useCopy(); const router = useRouter(); const [busyId, setBusyId] = useState<string | null>(null);
  async function setReadState(id: string, isRead: boolean) {
    setBusyId(id); await mutate({ action: isRead ? "mark_notification_read" : "mark_notification_unread", notificationId: id }); setBusyId(null); router.refresh();
  }
  async function markAllRead() {
    setBusyId("all"); await mutate({ action: "mark_all_notifications_read" }); setBusyId(null); router.refresh();
  }
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  return <div className={embedded ? undefined : "page-stack"}><div className="section-heading"><div><p className="eyebrow">{t("Alertes", "Alerts")}</p><h2>{t("Notifications", "Notifications")}</h2><p>{t("Alertes autorisées de l’Organization active.", "Authorized alerts for the active Organization.")}</p></div><div className="section-heading__actions">{unreadCount ? <button className="button button--secondary" disabled={busyId === "all"} onClick={markAllRead} type="button"><CheckCheck size={16} />{t("Tout marquer comme lu", "Mark all read")}</button> : null}<BellRing size={24} /></div></div>
    <Card className="notifications-card">{notifications.length ? <div className="notification-list">{notifications.map((notification) => { const copy = notificationCopy(notification, t); const href = notificationHref(notification); return <div className={`notification-row${notification.readAt ? " is-read" : ""}`} key={notification.id}><span className="notification-row__icon">{notification.type === "delivery_failed" ? <Mail size={18} /> : <BellRing size={18} />}</span><div><strong>{copy.title}</strong><span>{copy.detail} · {shortDate(notification.createdAt)}</span></div><div className="notification-row__actions"><Link className="button button--secondary" href={href} prefetch={false} target={notification.documentId ? "_blank" : undefined}>{t("Ouvrir", "Open")}<ExternalLink size={14} /></Link><button className="button button--secondary" disabled={busyId === notification.id} onClick={() => setReadState(notification.id, !notification.readAt)} type="button">{notification.readAt ? t("Marquer non lue", "Mark unread") : t("Marquer comme lue", "Mark read")}</button></div></div>; })}</div>
      : <EmptyState icon={BellRing} title={t("Aucune notification", "No notifications")} description={t("Les futurs événements financiers autorisés apparaîtront ici.", "Future authorized financial events will appear here.")} />}</Card>
  </div>;
}

export function NotificationBell({ notifications, placement }: { notifications: NotificationSummary[]; placement: "desktop" | "mobile" }) {
  const t = useCopy();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((notification) => !notification.readAt);
  const dialogId = `notification-popover-${placement}`;
  return <div className={`notification-bell notification-bell--${placement}`}>
    <button aria-controls={dialogId} aria-expanded={open} className="icon-button notification-bell__trigger" onClick={() => setOpen((value) => !value)} type="button" aria-label={t(`${unread.length} notification(s) non lue(s)`, `${unread.length} unread notification(s)`)}>
      <Bell aria-hidden="true" size={19} />{unread.length ? <span>{Math.min(unread.length, 99)}</span> : null}
    </button>
    {open ? <div className="notification-popover" id={dialogId} role="dialog" aria-label={t("Notifications récentes", "Recent notifications")}>
      <div className="notification-popover__header"><div><strong>{t("Notifications", "Notifications")}</strong><small>{unread.length ? t(`${unread.length} non lue(s)`, `${unread.length} unread`) : t("Tout est lu", "All read")}</small></div><button className="icon-button" onClick={() => setOpen(false)} type="button" aria-label={t("Fermer", "Close")}><X size={17} /></button></div>
      <div className="notification-popover__list">{notifications.slice(0, 5).map((notification) => { const copy = notificationCopy(notification, t); return <Link className={notification.readAt ? "is-read" : ""} href={notificationHref(notification)} key={notification.id} onClick={() => setOpen(false)} prefetch={false} target={notification.documentId ? "_blank" : undefined}><span className="notification-popover__dot" /><span><strong>{copy.title}</strong><small>{copy.detail}</small></span></Link>; })}{notifications.length === 0 ? <p>{t("Aucune notification.", "No notifications.")}</p> : null}</div>
      <Link className="notification-popover__footer" href="/app/activite#notifications" onClick={() => setOpen(false)}>{t("Ouvrir le centre de notifications", "Open notification centre")}</Link>
    </div> : null}
  </div>;
}

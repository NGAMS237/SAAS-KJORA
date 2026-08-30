"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellRing, CheckCheck, Download, ExternalLink, FileCheck2, FileClock, FileText, Mail, Send, TriangleAlert, X } from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Card, EmptyState } from "@/core/ui/ui";
import type { FinancialDocumentSummary, NotificationSummary } from "@/modules/documents/model";
import { notificationHref } from "@/modules/operations/model";

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
  async function queueEmail() {
    setBusy(true); setMessage(null);
    const result = await mutate({ action: "queue_email", documentId: document.id });
    setBusy(false);
    setMessage(result.ok ? t("Envoi ajouté à la file sécurisée.", "Delivery added to the secure queue.")
      : t("Impossible de préparer cet envoi.", "Unable to prepare this delivery."));
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
      <Link className="button button--secondary" href={`/api/financial-documents/${document.id}/download`} prefetch={false} target="_blank"><Download size={15} />PDF</Link>
      {canShare ? <button className="button button--secondary" disabled={busy || document.status === "invalidated" || !emailDeliveryEnabled} onClick={queueEmail} title={!emailDeliveryEnabled ? t("L’envoi réel reste désactivé pendant le déploiement sûr.", "Real delivery remains disabled during safe rollout.") : undefined} type="button"><Send size={15} />{busy ? t("File…", "Queueing…") : t("Envoyer", "Send")}</button> : null}
    </div>
  </div>;
}

export function FinancialDocumentsPanel({ documents, canShare, emailDeliveryEnabled, id = "documents" }: {
  documents: FinancialDocumentSummary[]; canShare: boolean; emailDeliveryEnabled: boolean; id?: string;
}) {
  const t = useCopy();
  return <Card className="documents-card" id={id}>
    <div className="section-heading"><div><p className="eyebrow">6C3</p><h2>{t("Documents financiers", "Financial documents")}</h2></div><FileText size={22} /></div>
    <p>{t("PDF privés, versionnés et rattachés à leur contexte financier réel.", "Private, versioned PDFs linked to their real financial context.")}</p>
    {documents.length ? <div className="document-list">{documents.map((document) => <DocumentRow canShare={canShare} document={document} emailDeliveryEnabled={emailDeliveryEnabled} key={document.id} />)}</div>
      : <EmptyState icon={FileText} title={t("Aucun document", "No documents")} description={t("Les documents apparaissent après les événements financiers 6C3, sans rétroactivité automatique.", "Documents appear after 6C3 financial events, without automatic backfill.")} />}
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
  return <div className={embedded ? undefined : "page-stack"}><div className="section-heading"><div><p className="eyebrow">6D</p><h2>{t("Notifications", "Notifications")}</h2><p>{t("Alertes autorisées de l’Organization active.", "Authorized alerts for the active Organization.")}</p></div><div className="section-heading__actions">{unreadCount ? <button className="button button--secondary" disabled={busyId === "all"} onClick={markAllRead} type="button"><CheckCheck size={16} />{t("Tout marquer comme lu", "Mark all read")}</button> : null}<BellRing size={24} /></div></div>
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

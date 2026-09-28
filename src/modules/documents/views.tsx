"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellRing, CheckCheck, Download, ExternalLink, FileCheck2, FileClock, FileText, Mail, Send, TriangleAlert, X } from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Card, EmptyState } from "@/core/ui/ui";
import type { FinancialDocumentSummary, NotificationSummary } from "@/modules/documents/model";
import { markAllNotificationsReadAction, setNotificationReadAction } from "@/modules/notifications/actions";
import { badgeLabel, notificationActionMessage, notificationDisplay, notificationNoticeMessage, parseNotificationNotice } from "@/modules/notifications/model";
import { clearLocalReadState, setLocalReadState, useNotificationsWithLocalReadState } from "@/modules/notifications/read-state";

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

// NCE-01 v2 — états d'envoi explicites. Une relance n'a lieu qu'au prochain
// passage quotidien ou sur déclenchement Admin ; une issue incertaine n'est
// jamais renvoyée automatiquement (revue par l'équipe KJORA).
function deliveryStatusLabel(delivery: NonNullable<FinancialDocumentSummary["lastDelivery"]>, t: ReturnType<typeof useCopy>): string {
  switch (delivery.status) {
    case "sent":
      return t(`Envoyé à ${delivery.recipientEmail} le ${shortDate(delivery.sentAt)}`, `Sent to ${delivery.recipientEmail} on ${shortDate(delivery.sentAt)}`);
    case "delivered":
      return t(`Remis à ${delivery.recipientEmail}`, `Delivered to ${delivery.recipientEmail}`);
    case "failed":
      return delivery.attemptCount >= 3
        ? t("Envoi en échec définitif", "Delivery permanently failed")
        : t(`Envoi en échec · essai ${delivery.attemptCount}/3 · nouvelle tentative au prochain passage quotidien ou déclenchement Admin`, `Delivery failed · attempt ${delivery.attemptCount}/3 · retried at the next daily run or Admin trigger`);
    case "delivery_unknown":
      return t("Issue d’envoi incertaine — en vérification, aucun renvoi automatique", "Uncertain delivery outcome — under review, no automatic resend");
    case "provider_failed":
      return t("Échec signalé par le fournisseur (non remis)", "Failure reported by the provider (not delivered)");
    case "bounced":
    case "complained":
    case "suppressed":
      return t("Adresse refusée par le destinataire ou le fournisseur", "Address refused by the recipient or provider");
    case "cancelled":
      return t("Envoi annulé", "Delivery cancelled");
    default:
      return t("Envoi en file", "Delivery queued");
  }
}

function DocumentRow({ document, canShare, emailDeliveryEnabled }: {
  document: FinancialDocumentSummary; canShare: boolean; emailDeliveryEnabled: boolean;
}) {
  const t = useCopy();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [modal, setModal] = useState<"missing_email" | "unavailable" | null>(null);
  const downloadHref = `/api/financial-documents/${document.id}/download`;
  const previewHref = `${downloadHref}?preview=1`;
  const reviewStatus = document.reviewStatus ?? "approved";

  async function review(action: "approve" | "defer") {
    setBusy(true); setMessage(null);
    const deferredUntil = action === "defer"
      ? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      : null;
    const result = await mutate({ action, documentId: document.id, deferredUntil });
    setBusy(false);
    setMessage(result.ok
      ? action === "approve" ? t("Document approuvé.", "Document approved.") : t("Revue différée de 7 jours.", "Review deferred for 7 days.")
      : t("La décision n’a pas pu être enregistrée.", "The decision could not be saved."));
    if (result.ok) router.refresh();
  }

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
      {reviewStatus !== "approved" ? <small>{reviewStatus === "deferred"
        ? t(`Revue différée jusqu’au ${shortDate(document.deferredUntil ?? null)}`, `Review deferred until ${shortDate(document.deferredUntil ?? null)}`)
        : t("À approuver avant publication", "Approval required before publishing")}</small> : null}
      {document.lastDelivery ? <small>{deliveryStatusLabel(document.lastDelivery, t)}</small> : null}
      {message ? <small role="status">{message}</small> : null}
    </div>
    <div className="document-row__actions">
      <Link className="button button--secondary" href={reviewStatus === "approved" ? downloadHref : previewHref} prefetch={false} target="_blank"><Download size={15} />{reviewStatus === "approved" ? "PDF" : t("Prévisualiser", "Preview")}</Link>
      {canShare && reviewStatus !== "approved" ? <>
        <button className="button button--primary" disabled={busy} onClick={() => void review("approve")} type="button">{t("Approuver", "Approve")}</button>
        <button className="button button--secondary" disabled={busy} onClick={() => void review("defer")} type="button">{t("Différer", "Defer")}</button>
      </> : null}
      {canShare && reviewStatus === "approved" ? <button className="button button--secondary" disabled={busy || document.status === "invalidated"} onClick={onSendClick} type="button"><Send size={15} />{busy ? t("Envoi…", "Sending…") : t("Envoyer par email", "Send by email")}</button> : null}
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
    window.open(`/api/financial-documents/${result.body.documentId}/download?preview=1`, "_blank", "noopener,noreferrer");
    router.refresh();
  }
  return <Card className="statement-export-card">
    <div className="section-heading"><div><p className="eyebrow">PDF</p><h2>{t("Exporter l’état de compte", "Export account statement")}</h2></div><Download size={21} /></div>
    <div className="statement-export-controls"><label className="field"><span>{t("Du", "From")}</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="field"><span>{t("Au", "To")}</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="button button--accent" disabled={busy || Boolean(from && to && to < from)} onClick={prepare} type="button"><Download size={16} />{busy ? t("Préparation…", "Preparing…") : t("Générer le PDF", "Generate PDF")}</button></div>
    {message ? <p className="form-feedback form-feedback--error" role="alert">{message}</p> : null}
    {initialDocuments.length ? <small>{t(`${initialDocuments.length} export(s) préparé(s) récemment.`, `${initialDocuments.length} recent export(s) prepared.`)}</small> : <small>{t("Le PDF reprend uniquement les lignes Ledger du filtre choisi.", "The PDF contains only Ledger lines from the selected filter.")}</small>}
  </Card>;
}

function useNotificationDisplay() {
  const { language } = usePreferences();
  return (notification: NotificationSummary) => notificationDisplay(notification, language === "FR" ? "FR" : "EN");
}

/** NCE-01 : tout lien de notification passe par la route d'ouverture (lecture + destination fermée). */
function openHref(notification: NotificationSummary) {
  return `/api/notifications/${notification.id}/open`;
}

function opensDocument(notification: NotificationSummary) {
  return Boolean(notification.documentId)
    && (notification.type === "due_notice_ready" || notification.type === "payment_receipt_ready" || notification.type === "rent_receipt_ready");
}

function useNotificationReadActions() {
  const { language } = usePreferences();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function setRead(id: string, isRead: boolean) {
    setBusyId(id); setError(null);
    setLocalReadState([id], isRead);
    const result = await setNotificationReadAction(id, isRead);
    setBusyId(null);
    if (!result.ok) {
      clearLocalReadState([id]);
      setError(notificationActionMessage(result.error, language === "FR" ? "FR" : "EN"));
      return;
    }
    router.refresh();
  }
  async function markAll(ids: string[]) {
    setBusyId("all"); setError(null);
    setLocalReadState(ids, true);
    const result = await markAllNotificationsReadAction();
    setBusyId(null);
    if (!result.ok) {
      clearLocalReadState(ids);
      setError(notificationActionMessage(result.error, language === "FR" ? "FR" : "EN"));
      return;
    }
    router.refresh();
  }
  function markOpened(id: string) {
    // Badge immédiat, puis écriture par Server Action (POST, contrôle
    // d'origine Next) : le marquage ne dépend pas de l'en-tête
    // Sec-Fetch-Site, que la route d'ouverture exige pour écrire.
    setLocalReadState([id], true);
    void setNotificationReadAction(id, true).then((result) => {
      if (!result.ok) clearLocalReadState([id]);
    });
  }
  return { busyId, error, setRead, markAll, markOpened };
}

export function NotificationNoticeBanner({ notice }: { notice: string | null }) {
  const { language } = usePreferences();
  const parsed = parseNotificationNotice(notice);
  const [dismissed, setDismissed] = useState(false);
  if (!parsed || dismissed) return null;
  return <div className="notification-notice" role="status">
    <TriangleAlert aria-hidden="true" size={17} />
    <p>{notificationNoticeMessage(parsed, language === "FR" ? "FR" : "EN")}</p>
    <button aria-label={language === "FR" ? "Masquer ce message" : "Dismiss this message"} className="icon-button" onClick={() => setDismissed(true)} type="button"><X size={16} /></button>
  </div>;
}

export function NotificationsView({ notifications: serverNotifications, embedded = false, notice = null }: {
  notifications: NotificationSummary[]; embedded?: boolean; notice?: string | null;
}) {
  const t = useCopy();
  const display = useNotificationDisplay();
  const notifications = useNotificationsWithLocalReadState(serverNotifications);
  const { busyId, error, setRead, markAll, markOpened } = useNotificationReadActions();
  const unread = notifications.filter((notification) => !notification.readAt);
  return <div className={embedded ? undefined : "page-stack"}><div className="section-heading"><div><p className="eyebrow">{t("Alertes", "Alerts")}</p><h2>{t("Notifications", "Notifications")}</h2><p>{t("Alertes autorisées de l’Organization active.", "Authorized alerts for the active Organization.")}</p></div><div className="section-heading__actions">{unread.length ? <button className="button button--secondary" disabled={busyId === "all"} onClick={() => markAll(unread.map((notification) => notification.id))} type="button"><CheckCheck size={16} />{t("Tout marquer comme lu", "Mark all read")}</button> : null}<BellRing size={24} /></div></div>
    <NotificationNoticeBanner notice={notice} />
    {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
    <p className="sr-only" aria-live="polite">{t(`${unread.length} notification(s) non lue(s)`, `${unread.length} unread notification(s)`)}</p>
    <Card className="notifications-card">{notifications.length ? <ul className="notification-list">{notifications.map((notification) => {
      const copy = display(notification);
      const isRead = Boolean(notification.readAt);
      return <li className={`notification-row${isRead ? " is-read" : " is-unread"}`} key={notification.id}>
        <span className="notification-row__icon" aria-hidden="true">{notification.type === "delivery_failed" ? <Mail size={18} /> : <BellRing size={18} />}</span>
        <div>
          <strong>{!isRead ? <span className="notification-row__unread-dot" aria-hidden="true" /> : null}{copy.title}<span className="sr-only">{isRead ? t(" (lue)", " (read)") : t(" (non lue)", " (unread)")}</span></strong>
          {copy.context ? <span className="notification-row__context">{copy.context}</span> : null}
          <span>{copy.detail}{copy.date ? ` · ${copy.date}` : ""}</span>
        </div>
        <div className="notification-row__actions">
          <a aria-label={`${t("Ouvrir", "Open")} — ${copy.ariaLabel(isRead)}`} className="button button--secondary" href={openHref(notification)} onClick={() => markOpened(notification.id)} rel={opensDocument(notification) ? "noopener" : undefined} target={opensDocument(notification) ? "_blank" : undefined}>{t("Ouvrir", "Open")}<ExternalLink aria-hidden="true" size={14} /></a>
          <button aria-pressed={isRead} className="button button--secondary" disabled={busyId === notification.id} onClick={() => setRead(notification.id, !isRead)} type="button">{isRead ? t("Marquer non lue", "Mark unread") : t("Marquer comme lue", "Mark read")}</button>
        </div>
      </li>;
    })}</ul>
      : <EmptyState icon={BellRing} title={t("Aucune notification", "No notifications")} description={t("Les futurs événements financiers autorisés apparaîtront ici.", "Future authorized financial events will appear here.")} />}</Card>
  </div>;
}

export function NotificationBell({ notifications: serverNotifications, placement }: { notifications: NotificationSummary[]; placement: "desktop" | "mobile" }) {
  const t = useCopy();
  const display = useNotificationDisplay();
  const notifications = useNotificationsWithLocalReadState(serverNotifications);
  const { busyId, error, markAll, markOpened } = useNotificationReadActions();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((notification) => !notification.readAt);
  const badge = badgeLabel(unread.length);
  const dialogId = `notification-popover-${placement}`;
  return <div className={`notification-bell notification-bell--${placement}`}>
    <button aria-controls={dialogId} aria-expanded={open} className="icon-button notification-bell__trigger" onClick={() => setOpen((value) => !value)} type="button" aria-label={t(`${unread.length} notification(s) non lue(s)`, `${unread.length} unread notification(s)`)}>
      <Bell aria-hidden="true" size={19} />{badge ? <span aria-hidden="true">{badge}</span> : null}
    </button>
    {open ? <div className="notification-popover" id={dialogId} role="dialog" aria-label={t("Notifications récentes", "Recent notifications")}>
      <div className="notification-popover__header"><div><strong>{t("Notifications", "Notifications")}</strong><small aria-live="polite">{unread.length ? t(`${unread.length} non lue(s)`, `${unread.length} unread`) : t("Tout est lu", "All read")}</small></div>{unread.length ? <button className="button button--secondary notification-popover__mark-all" disabled={busyId === "all"} onClick={() => markAll(unread.map((notification) => notification.id))} type="button"><CheckCheck aria-hidden="true" size={15} />{t("Tout marquer comme lu", "Mark all read")}</button> : null}<button className="icon-button" onClick={() => setOpen(false)} type="button" aria-label={t("Fermer", "Close")}><X size={17} /></button></div>
      {error ? <p className="form-feedback form-feedback--error" role="alert">{error}</p> : null}
      <ul className="notification-popover__list">{notifications.slice(0, 5).map((notification) => {
        const copy = display(notification);
        const isRead = Boolean(notification.readAt);
        return <li key={notification.id}><a aria-label={copy.ariaLabel(isRead)} className={isRead ? "is-read" : "is-unread"} href={openHref(notification)} onClick={() => { markOpened(notification.id); setOpen(false); }} rel={opensDocument(notification) ? "noopener" : undefined} target={opensDocument(notification) ? "_blank" : undefined}><span className="notification-popover__dot" aria-hidden="true" /><span><strong>{copy.title}</strong>{copy.context ? <small>{copy.context}</small> : null}<small>{copy.detail}{copy.date ? ` · ${copy.date}` : ""}</small></span></a></li>;
      })}{notifications.length === 0 ? <li><p>{t("Aucune notification.", "No notifications.")}</p></li> : null}</ul>
      <Link className="notification-popover__footer" href="/app/activite#notifications" onClick={() => setOpen(false)}>{t("Ouvrir le centre de notifications", "Open notification centre")}</Link>
    </div> : null}
  </div>;
}

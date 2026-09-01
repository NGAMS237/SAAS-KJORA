"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { portalNotificationHref, type PortalNotification } from "@/tenant-portal/model";

type Language = "fr" | "en";
const copy = (language: Language, fr: string, en: string) => language === "en" ? en : fr;

function notificationCopy(notification: PortalNotification, language: Language) {
  const labels = {
    due_notice_ready: ["Nouvel avis d’échéance", "New due notice"],
    payment_receipt_ready: ["Reçu de paiement disponible", "Payment receipt available"],
    rent_receipt_ready: ["Quittance disponible", "Rent receipt available"],
    payment_overdue: ["Loyer en retard", "Rent overdue"],
  } satisfies Record<PortalNotification["notificationType"], [string, string]>;
  const title = labels[notification.notificationType][language === "en" ? 1 : 0];
  const reference = typeof notification.payload.reference === "string" ? notification.payload.reference : "";
  return { title, detail: reference || copy(language, "Ouvrir le détail autorisé", "Open the authorized detail") };
}

export function PortalNotificationsView({ language, notifications }: { language: Language; notifications: PortalNotification[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const unread = notifications.filter((notification) => !notification.readAt).length;
  async function mutate(action: string, notificationId?: string) {
    setBusy(notificationId ?? "all");
    await fetch("/api/tenant-portal/notifications", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, notificationId }),
    });
    setBusy(null);
    router.refresh();
  }
  return <div className="page-stack portal-page">
    <PageHeader eyebrow={copy(language, "Alertes utiles", "Useful alerts")} title={copy(language, "Notifications", "Notifications")} description={copy(language, "Chaque notification ouvre uniquement son contexte autorisé.", "Each notification only opens its authorized context.")} />
    {unread ? <div className="section-heading__actions"><button className="button button--secondary" disabled={busy === "all"} onClick={() => void mutate("mark_all_read")} type="button"><CheckCheck size={16} />{copy(language, "Tout marquer comme lu", "Mark all read")}</button></div> : null}
    <Card>{notifications.length ? <div className="notification-list">{notifications.map((notification) => {
      const label = notificationCopy(notification, language);
      return <div className={`notification-row${notification.readAt ? " is-read" : ""}`} key={notification.notificationId}>
        <span className="notification-row__icon"><BellRing size={18} /></span>
        <div><strong>{label.title}</strong><span>{label.detail}</span></div>
        <div className="notification-row__actions">
          <Link className="button button--primary" href={portalNotificationHref(notification)} onClick={() => { if (!notification.readAt) void mutate("mark_read", notification.notificationId); }}>{copy(language, "Ouvrir", "Open")}</Link>
          <button className="button button--secondary" disabled={busy === notification.notificationId} onClick={() => void mutate(notification.readAt ? "mark_unread" : "mark_read", notification.notificationId)} type="button">{notification.readAt ? copy(language, "Marquer non lue", "Mark unread") : copy(language, "Marquer comme lue", "Mark read")}</button>
        </div>
      </div>;
    })}</div> : <EmptyState icon={BellRing} title={copy(language, "Aucune notification", "No notifications")} description={copy(language, "Les nouveaux avis, retards et documents autorisés apparaîtront ici.", "New notices, overdue items and authorized documents will appear here.")} />}</Card>
  </div>;
}

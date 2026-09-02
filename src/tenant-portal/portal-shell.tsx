"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, ChevronDown, FileSignature } from "lucide-react";
import { portalNavigation, type NavigationItem } from "@/core/navigation/navigation";
import { PinLockButton, SecureSignOutButton } from "@/core/security/pin-controls";
import { NotificationSoundEffect } from "@/core/notifications/notification-sound";
import type { PortalNotification } from "@/tenant-portal/model";

function isActive(pathname: string, item: NavigationItem) {
  const currentPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const targetPath = item.href.length > 1 ? item.href.replace(/\/+$/, "") : item.href;
  return item.exact ? currentPath === targetPath : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function PortalLink({ item, pathname, language }: { item: NavigationItem; pathname: string; language: "fr" | "en" }) {
  const Icon = item.icon;
  const active = isActive(pathname, item);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`nav-link portal-nav-link${active ? " nav-link--active" : ""}`}
      href={item.href}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
      <span>{language === "en" ? ({ Accueil: "Home", Loyers: "Rent", "Reçus": "Receipts", Compte: "Account" }[item.label] ?? item.label) : item.label}</span>
    </Link>
  );
}

export function PortalShell({
  accessId,
  accesses,
  children,
  language,
  organizationName,
  notifications,
  userId,
}: {
  accessId: string;
  accesses: Array<{ accessId: string; organizationName: string; tenantName: string }>;
  children: ReactNode;
  language: "fr" | "en";
  organizationName: string;
  notifications: PortalNotification[];
  userId: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const unread = notifications.filter((notification) => !notification.readAt).length;

  async function switchAccess(nextAccessId: string) {
    if (nextAccessId === accessId) return;
    await fetch("/api/tenant-portal/active", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessId: nextAccessId }),
    });
    router.replace("/portal");
    router.refresh();
  }

  return (
    <div className="app-shell app-shell--portal">
      <NotificationSoundEffect notifications={notifications.map((item) => ({ id: item.notificationId, type: item.notificationType, readAt: item.readAt }))} scope={`portal:${accessId}`} />
      <aside className="desktop-rail portal-rail" aria-label="Navigation du portail locataire">
        <Link className="wordmark" href="/portal">
          Kjora<span>.</span>
        </Link>
        <div className="portal-context">
          <span>{language === "en" ? "Tenant space" : "Espace locataire"}</span>
          <strong>{organizationName}</strong>
          {accesses.length > 1 ? <label className="portal-access-select">
            <span className="sr-only">{language === "en" ? "Select a space" : "Sélectionner un espace"}</span>
            <select value={accessId} onChange={(event) => switchAccess(event.target.value)}>
              {accesses.map((access) => <option key={access.accessId} value={access.accessId}>{access.organizationName}</option>)}
            </select><ChevronDown aria-hidden="true" size={15} />
          </label> : <small>{language === "en" ? "Secure read-only access" : "Accès sécurisé en lecture"}</small>}
        </div>
        <nav className="desktop-rail__primary">
          {portalNavigation.map((item) => (
            <PortalLink item={item} key={item.href} pathname={pathname} language={language} />
          ))}
        </nav>
        <div className="desktop-rail__footer">
          <Link className="portal-preview-link" href="/portal/contrats">
            <FileSignature aria-hidden="true" size={18} />
            {language === "en" ? "Contracts" : "Contrats"}
          </Link>
          <Link className="portal-preview-link" href="/portal/notifications">
            <Bell aria-hidden="true" size={18} />
            {language === "en" ? "Notifications" : "Notifications"}{unread ? <span className="nav-alert nav-alert--info">{Math.min(unread, 99)}</span> : null}
          </Link>
          <PinLockButton language={language} />
          <SecureSignOutButton language={language} scope="portal" userId={userId} />
        </div>
      </aside>

      <header className="mobile-header portal-mobile-header">
        <div>
          <Link className="wordmark wordmark--mobile" href="/portal">
            Kjora<span>.</span>
          </Link>
          <p>{organizationName}</p>
        </div>
        <div className="portal-mobile-actions"><Link className="icon-button" href="/portal/contrats" aria-label={language === "en" ? "Contracts" : "Contrats"}><FileSignature aria-hidden="true" size={20}/></Link><Link className="icon-button notification-bell__trigger" href="/portal/notifications" aria-label={language === "en" ? `${unread} unread notifications` : `${unread} notification(s) non lue(s)`}>
          <Bell aria-hidden="true" size={20} />{unread ? <span>{Math.min(unread, 99)}</span> : null}
        </Link></div>
      </header>

      <main className="shell-content">{children}</main>

      <nav className="mobile-bottom-nav portal-bottom-nav" aria-label="Navigation du portail locataire">
        {portalNavigation.map((item) => (
          <PortalLink item={item} key={item.href} pathname={pathname} language={language} />
        ))}
      </nav>
    </div>
  );
}

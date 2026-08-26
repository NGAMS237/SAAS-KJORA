"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Bell, ChevronLeft, X } from "lucide-react";
import { demoPortalContext } from "@/core/demo/demo-context";
import { portalNavigation, type NavigationItem } from "@/core/navigation/navigation";
import { DemoNotice } from "@/core/ui/ui";

function isActive(pathname: string, item: NavigationItem) {
  const currentPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const targetPath = item.href.length > 1 ? item.href.replace(/\/+$/, "") : item.href;
  return item.exact ? currentPath === targetPath : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function PortalLink({ item, pathname }: { item: NavigationItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActive(pathname, item);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`nav-link portal-nav-link${active ? " nav-link--active" : ""}`}
      href={item.href}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
      <span>{item.label}</span>
    </Link>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  return (
    <div className="app-shell app-shell--portal">
      <aside className="desktop-rail portal-rail" aria-label="Navigation du portail locataire">
        <Link className="wordmark" href="/portal">
          Kjora<span>.</span>
        </Link>
        <div className="portal-context">
          <span>Espace locataire</span>
          <strong>{demoPortalContext.organizationName}</strong>
          <small>{demoPortalContext.home}</small>
        </div>
        <nav className="desktop-rail__primary">
          {portalNavigation.map((item) => (
            <PortalLink item={item} key={item.href} pathname={pathname} />
          ))}
        </nav>
        <div className="desktop-rail__footer">
          <button className="portal-preview-link" type="button" onClick={() => setNotificationsOpen(true)}>
            <Bell aria-hidden="true" size={18} />
            Notifications
          </button>
          <Link className="portal-preview-link portal-preview-link--quiet" href="/app">
            <ChevronLeft aria-hidden="true" size={18} />
            Quitter l’aperçu portail
          </Link>
          <DemoNotice compact />
        </div>
      </aside>

      <header className="mobile-header portal-mobile-header">
        <div>
          <Link className="wordmark wordmark--mobile" href="/portal">
            Kjora<span>.</span>
          </Link>
          <p>Espace locataire · {demoPortalContext.organizationName}</p>
        </div>
        <button className="icon-button" type="button" onClick={() => setNotificationsOpen(true)} aria-label="Ouvrir les notifications">
          <Bell aria-hidden="true" size={20} />
          <span className="notification-dot" />
        </button>
      </header>

      {notificationsOpen ? (
        <div className="notification-panel" role="dialog" aria-modal="true" aria-label="Notifications du portail">
          <button className="mobile-drawer__backdrop" type="button" onClick={() => setNotificationsOpen(false)} aria-label="Fermer" />
          <section className="notification-panel__card">
            <div className="mobile-drawer__header">
              <div>
                <p className="eyebrow">Portail locataire</p>
                <strong>Notifications</strong>
              </div>
              <button className="icon-button" type="button" onClick={() => setNotificationsOpen(false)} aria-label="Fermer les notifications">
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <div className="notification-item">
              <span className="notification-item__mark" aria-hidden="true" />
              <div>
                <strong>Reçu disponible</strong>
                <p>Votre reçu fictif de démonstration est prêt à être consulté.</p>
              </div>
            </div>
            <p className="panel-hint">Entrée légère : les notifications ne sont pas un cinquième onglet.</p>
          </section>
        </div>
      ) : null}

      <main className="shell-content">{children}</main>

      <nav className="mobile-bottom-nav portal-bottom-nav" aria-label="Navigation du portail locataire">
        {portalNavigation.map((item) => (
          <PortalLink item={item} key={item.href} pathname={pathname} />
        ))}
      </nav>
    </div>
  );
}

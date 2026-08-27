"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, ChevronLeft } from "lucide-react";
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

  return (
    <div className="app-shell app-shell--portal">
      <aside className="desktop-rail portal-rail" aria-label="Navigation du portail locataire">
        <Link className="wordmark" href="/portal">
          Kjora<span>.</span>
        </Link>
        <div className="portal-context">
          <span>Espace locataire</span>
          <strong>Accès à venir</strong>
          <small>Disponible avec le Lot 6E</small>
        </div>
        <nav className="desktop-rail__primary">
          {portalNavigation.map((item) => (
            <PortalLink item={item} key={item.href} pathname={pathname} />
          ))}
        </nav>
        <div className="desktop-rail__footer">
          <button className="portal-preview-link" type="button" disabled aria-label="Notifications disponibles avec le Lot 6E">
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
          <p>Espace locataire · Lot 6E</p>
        </div>
        <button className="icon-button" type="button" disabled aria-label="Notifications disponibles avec le Lot 6E">
          <Bell aria-hidden="true" size={20} />
        </button>
      </header>

      <main className="shell-content">{children}</main>

      <nav className="mobile-bottom-nav portal-bottom-nav" aria-label="Navigation du portail locataire">
        {portalNavigation.map((item) => (
          <PortalLink item={item} key={item.href} pathname={pathname} />
        ))}
      </nav>
    </div>
  );
}

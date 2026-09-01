"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, ChevronDown, LogOut } from "lucide-react";
import { portalNavigation, type NavigationItem } from "@/core/navigation/navigation";

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
}: {
  accessId: string;
  accesses: Array<{ accessId: string; organizationName: string; tenantName: string }>;
  children: ReactNode;
  language: "fr" | "en";
  organizationName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

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
          <button className="portal-preview-link" type="button" disabled aria-label={language === "en" ? "Notifications coming later" : "Notifications à venir"}>
            <Bell aria-hidden="true" size={18} />
            {language === "en" ? "Notifications" : "Notifications"}
          </button>
          <form action="/auth/signout?scope=portal" method="post"><button className="portal-preview-link portal-preview-link--quiet" type="submit"><LogOut aria-hidden="true" size={18} />{language === "en" ? "Sign out" : "Se déconnecter"}</button></form>
        </div>
      </aside>

      <header className="mobile-header portal-mobile-header">
        <div>
          <Link className="wordmark wordmark--mobile" href="/portal">
            Kjora<span>.</span>
          </Link>
          <p>{organizationName}</p>
        </div>
        <button className="icon-button" type="button" disabled aria-label="Notifications disponibles avec le Lot 6E">
          <Bell aria-hidden="true" size={20} />
        </button>
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

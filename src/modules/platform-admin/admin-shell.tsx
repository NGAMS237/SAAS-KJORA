"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { ADMIN_COPY } from "./copy";

// =============================================================================
// KJORA — ADMIN-01 — Coque de la console plateforme
// =============================================================================
// Volontairement distincte de InternalShell : l'Administration n'est pas un
// onglet de l'espace propriétaire. Aucune navigation ne mène de l'un à l'autre
// automatiquement, et la console n'apparaît nulle part dans l'application.
//
// Bilingue via usePreferences(), comme le reste de l'application.
// =============================================================================

const NAV = [
  { href: "/administration", key: "navOverview" as const },
  { href: "/administration/organizations", key: "navOrganizations" as const },
  { href: "/administration/abonnements", key: "navSubscriptions" as const },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { language, toggleLanguage, theme, toggleTheme } = usePreferences();
  const pathname = usePathname();
  const t = ADMIN_COPY[language === "EN" ? "en" : "fr"];

  return (
    <div className="admin-shell">
      <header className="admin-shell__bar">
        <div className="admin-shell__identity">
          <span className="admin-shell__mark" aria-hidden="true">
            K
          </span>
          <div>
            <p className="admin-shell__title">{t.consoleTitle}</p>
            <p className="admin-shell__subtitle">{t.consoleSubtitle}</p>
          </div>
        </div>

        <div className="admin-shell__actions">
          <button
            type="button"
            className="admin-shell__toggle"
            onClick={toggleLanguage}
            aria-label={t.switchLanguage}
          >
            {language === "FR" ? "EN" : "FR"}
          </button>
          <button
            type="button"
            className="admin-shell__toggle"
            onClick={toggleTheme}
            aria-label={t.switchTheme}
          >
            {theme === "light" ? "☾" : "☀"}
          </button>
        </div>
      </header>

      <nav className="admin-shell__nav" aria-label={t.navLabel}>
        {NAV.map((item) => {
          const active =
            item.href === "/administration"
              ? pathname === "/administration"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`admin-shell__link${active ? " admin-shell__link--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {t[item.key]}
            </Link>
          );
        })}
      </nav>

      <main className="admin-shell__main">{children}</main>

      <footer className="admin-shell__footer">
        <p>{t.readOnlyNotice}</p>
      </footer>
    </div>
  );
}

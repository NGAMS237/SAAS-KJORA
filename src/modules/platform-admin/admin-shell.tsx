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
  { href: "/administration/finances", key: "navFinances" as const },
  { href: "/administration/contacts", key: "navContacts" as const },
];

/** ADMIN-01.1 : jamais déduit du hostname — reçu tel quel de `VERCEL_ENV`. */
export type AdminEnvironment = "production" | "preview" | "development";

const ENV_BADGE_KEY: Record<AdminEnvironment, "envProduction" | "envPreview" | "envDev"> = {
  production: "envProduction",
  preview: "envPreview",
  development: "envDev",
};

export function AdminShell({
  children,
  environment,
  userEmail,
  commercialSiteUrl,
}: {
  children: ReactNode;
  environment: AdminEnvironment;
  userEmail: string | null;
  /**
   * ADMIN-01.1 (correctif) : URL déjà validée côté serveur (voir
   * `resolveCommercialSiteUrl` dans layout.tsx), jamais une valeur codée en
   * dur ici. `null` quand `KJORA_COMMERCIAL_SITE_URL` est absente ou
   * invalide — dans ce cas, aucun lien cliquable n'est produit et le domaine
   * hors service ne doit jamais servir de repli automatique.
   */
  commercialSiteUrl: string | null;
}) {
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
          <span
            className={`admin-shell__env-badge admin-shell__env-badge--${environment}`}
            title={t.envBadgeHint}
          >
            {t[ENV_BADGE_KEY[environment]]}
          </span>
        </div>

        <div className="admin-shell__actions">
          <Link href="/app" className="admin-shell__toggle admin-shell__nav-link">
            {t.backToApp}
          </Link>
          {commercialSiteUrl ? (
            <a
              href={commercialSiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-shell__toggle admin-shell__nav-link admin-shell__nav-link--external"
            >
              {t.commercialSiteLink}
              <span className="admin-shell__sr-only"> {t.opensInNewTab}</span>
            </a>
          ) : (
            <span
              className="admin-shell__toggle admin-shell__nav-link admin-shell__nav-link--disabled"
              title={t.commercialSiteNotConnected}
              aria-disabled="true"
            >
              {t.commercialSiteNotConnected}
            </span>
          )}
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
          {userEmail ? (
            <span className="admin-shell__identity-email" title={t.loggedInAs}>
              {userEmail}
            </span>
          ) : null}
          <form action="/auth/signout" method="post">
            <button type="submit" className="admin-shell__toggle admin-shell__signout">
              {t.signOut}
            </button>
          </form>
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

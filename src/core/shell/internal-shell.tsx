"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { Bell, Check, ChevronDown, Menu, PanelLeftClose, Plus, X } from "lucide-react";
import type { OrganizationOption } from "@/core/organization/select-active-organization";
import {
  internalPrimaryNavigation,
  internalSecondaryNavigation,
  type NavigationItem,
} from "@/core/navigation/navigation";
import { PreferencesControls } from "@/core/preferences/preferences-controls";
import { DemoNotice } from "@/core/ui/ui";
import { PinLockButton, SecureSignOutButton } from "@/core/security/pin-controls";
import { hasCapability } from "@/core/authorization/capabilities";

function isActive(pathname: string, item: NavigationItem) {
  const currentPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const targetPath = item.href.length > 1 ? item.href.replace(/\/+$/, "") : item.href;
  return item.exact ? currentPath === targetPath : currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

function NavigationLink({ item, pathname, onClick }: { item: NavigationItem; pathname: string; onClick?: () => void }) {
  const Icon = item.icon;
  const active = isActive(pathname, item);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`nav-link${active ? " nav-link--active" : ""}`}
      href={item.href}
      onClick={onClick}
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
      <span>{item.label}</span>
    </Link>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function OrganizationSwitcher({
  organizations,
  activeOrganization,
}: {
  organizations: OrganizationOption[];
  activeOrganization: OrganizationOption;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function changeOrganization(organizationId: string) {
    const response = await fetch("/api/organizations/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });
    if (response.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="organization-switcher">
      <button
        aria-expanded={open}
        className="organization-switcher__button"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="organization-switcher__mark" aria-hidden="true">
          {initials(activeOrganization.name)}
        </span>
        <span className="organization-switcher__text">
          <small>Organization active</small>
          <strong>{activeOrganization.name}</strong>
        </span>
        <ChevronDown aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
      {open ? (
        <div className="organization-switcher__menu">
          <p>Sélection d’Organization</p>
          {organizations.map((organization) => (
            <button type="button" key={organization.id} onClick={() => changeOrganization(organization.id)}>
              <span><strong>{organization.name}</strong><small>{organization.role.replaceAll("_", " ")}</small></span>
              {organization.id === activeOrganization.id ? <Check aria-hidden="true" size={18} /> : null}
            </button>
          ))}
          <Link className="organization-switcher__create" href="/onboarding/organization?mode=new" onClick={() => setOpen(false)}>
            <Plus aria-hidden="true" size={17} /> Créer une Organization
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function InternalShell({
  children,
  organizations,
  activeOrganization,
  userEmail,
  userId,
}: {
  children: ReactNode;
  organizations: OrganizationOption[];
  activeOrganization: OrganizationOption;
  userEmail: string | null;
  userId: string;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const primaryNavigation = internalPrimaryNavigation.filter(
    (item) => !item.requiredCapability || hasCapability(activeOrganization.capabilities, item.requiredCapability),
  );
  const secondaryNavigation = internalSecondaryNavigation.filter(
    (item) => !item.requiredCapability || hasCapability(activeOrganization.capabilities, item.requiredCapability),
  );

  return (
    <div className="app-shell app-shell--internal">
      <aside className="desktop-rail" aria-label="Navigation interne">
        <Link className="wordmark" href="/app" aria-label="Kjora — Accueil interne">
          Kjora<span>.</span>
        </Link>
        <OrganizationSwitcher organizations={organizations} activeOrganization={activeOrganization} />
        <nav className="desktop-rail__primary">
          {primaryNavigation.map((item) => (
            <NavigationLink item={item} key={item.href} pathname={pathname} />
          ))}
        </nav>
        <div className="desktop-rail__secondary">
          <p className="nav-caption">Espace secondaire</p>
          {secondaryNavigation.map((item) => (
            <NavigationLink item={item} key={item.href} pathname={pathname} />
          ))}
        </div>
        <div className="desktop-rail__footer">
          <Link className="portal-preview-link" href="/portal">
            <PanelLeftClose aria-hidden="true" size={18} />
            Aperçu portail locataire
          </Link>
          <PreferencesControls />
          <PinLockButton />
          <SecureSignOutButton userId={userId} />
          <DemoNotice compact />
        </div>
      </aside>

      <header className="mobile-header">
        <Link className="wordmark wordmark--mobile" href="/app">
          Kjora<span>.</span>
        </Link>
        <OrganizationSwitcher organizations={organizations} activeOrganization={activeOrganization} />
        <div className="mobile-header__actions">
          <button className="icon-button" disabled type="button" aria-label="Notifications à venir dans un prochain lot">
            <Bell aria-hidden="true" size={19} />
          </button>
          <button
            aria-expanded={menuOpen}
            className="icon-button"
            onClick={() => setMenuOpen(true)}
            type="button"
            aria-label="Ouvrir le menu secondaire"
          >
            <Menu aria-hidden="true" size={21} />
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu secondaire">
          <button className="mobile-drawer__backdrop" type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer" />
          <div className="mobile-drawer__panel">
            <div className="mobile-drawer__header">
              <div>
                <p className="eyebrow">Espace secondaire</p>
                <strong>{activeOrganization.name}</strong>
                <small>{userEmail}</small>
              </div>
              <button className="icon-button" type="button" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu">
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <nav>
              {secondaryNavigation.map((item) => (
                <NavigationLink item={item} key={item.href} pathname={pathname} onClick={() => setMenuOpen(false)} />
              ))}
            </nav>
            <Link className="portal-preview-link" href="/portal" onClick={() => setMenuOpen(false)}>
              <PanelLeftClose aria-hidden="true" size={18} />
              Aperçu portail locataire
            </Link>
            <PreferencesControls />
            <PinLockButton />
            <SecureSignOutButton userId={userId} />
            <DemoNotice compact />
          </div>
        </div>
      ) : null}

      <main className="shell-content">{children}</main>

      <nav className="mobile-bottom-nav" aria-label="Navigation interne principale">
        {primaryNavigation.map((item) => (
          <NavigationLink item={item} key={item.href} pathname={pathname} />
        ))}
      </nav>
    </div>
  );
}

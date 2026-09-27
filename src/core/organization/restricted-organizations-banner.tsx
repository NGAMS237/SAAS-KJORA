"use client";

// REVENUE-LAUNCH-01 v3 — Indication SÉPARÉE d'une Organization suspendue ou
// archivée pour un utilisateur qui dispose aussi d'une Organization active :
// l'Organization active reste sélectionnée normalement, et l'autre est
// signalée ici, avec un lien vers son contexte limité. Aucun motif interne.

import Link from "next/link";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { SUSPENDED_COPY } from "@/core/organization/suspended-copy";
import type { RestrictedOrganization } from "@/core/organization/restricted-organizations";

export function RestrictedOrganizationsBanner({ organizations }: { organizations: RestrictedOrganization[] }) {
  const { language } = usePreferences();
  if (organizations.length === 0) return null;
  const t = SUSPENDED_COPY[language === "EN" ? "en" : "fr"];
  return (
    <div className="restricted-org-banner" role="status">
      {organizations.map((organization) => (
        <p key={organization.id}>
          {organization.status === "suspended"
            ? t.bannerSuspended(organization.name)
            : t.bannerArchived(organization.name)}{" "}
          <Link href={`/organisation-suspendue?organization=${organization.id}`}>{t.bannerLink}</Link>
        </p>
      ))}
    </div>
  );
}

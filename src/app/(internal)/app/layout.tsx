import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { InternalShell } from "@/core/shell/internal-shell";
import { EmbeddedMarker } from "@/core/shell/embedded-marker";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { PinLockProvider } from "@/core/security/pin-lock-provider";
import { AuthCompletedTracker } from "@/core/analytics/auth-completed-tracker";
import { getNotifications } from "@/modules/documents/server";
import { getOperationalDashboard } from "@/modules/operations/server";
import { dashboardPeriod } from "@/modules/operations/model";
import { resolveUserContext, destinationFor } from "@/core/routing/context-resolver";
import { listMyRestrictedOrganizations } from "@/core/organization/restricted-organizations";
import { RestrictedOrganizationsBanner } from "@/core/organization/restricted-organizations-banner";

export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function InternalLayout({ children }: { children: ReactNode }) {
  const context = await loadOrganizationContext();
  if (!context.activeOrganization) {
    // ALIGN-02 — le contexte réel est résolu côté serveur uniquement.
    // Les invitations en attente priment sur toute création d'Organization (§15).
    const resolved = await resolveUserContext();
    redirect(destinationFor(resolved));
  }
  const canSeeFinance = context.activeOrganization.capabilities.includes("due.view")
    && context.activeOrganization.capabilities.includes("payment.view");
  // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE C : ces trois lectures sont
  // mutuellement indépendantes (aucune ne dépend du résultat d'une autre,
  // seulement de `context.activeOrganization` déjà résolu ci-dessus) mais
  // étaient auparavant enchaînées séquentiellement — trois allers-retours
  // Supabase l'un après l'autre à chaque montage de ce layout au lieu d'un
  // seul temps d'attente égal au plus lent des trois. Chaque branche
  // conserve exactement son comportement d'origine (même repli par défaut,
  // même `.catch`) : seul l'ordonnancement change.
  const [notifications, dashboard, restrictedOrganizations] = await Promise.all([
    context.activeOrganization.capabilities.includes("activity.view")
      ? getNotifications(context.activeOrganization.id)
      : Promise.resolve([]),
    canSeeFinance
      ? getOperationalDashboard(context.activeOrganization.id, dashboardPeriod(null)).catch(() => null)
      : Promise.resolve(null),
    // REVENUE-LAUNCH-01 v3 — Organizations suspendues/archivées signalées à
    // part, l'Organization active restant sélectionnée normalement.
    listMyRestrictedOrganizations(),
  ]);
  const paymentAttention = (dashboard?.overdueCount ?? 0) + (dashboard?.partialCount ?? 0);
  const navigationBadges = {
    ...(paymentAttention > 0 ? { "/app/finances": { count: paymentAttention, tone: "danger" as const } } : {}),
  };
  return (
    <PinLockProvider userId={context.user.id}>
      {/* ALIGN-02 §16 — auth_completed est émis une fois par session de navigateur */}
      <AuthCompletedTracker />
      <EmbeddedMarker />
      <InternalShell
        activeOrganization={context.activeOrganization}
        organizations={context.organizations}
        userEmail={context.user.email}
        userId={context.user.id}
        notifications={notifications}
        navigationBadges={navigationBadges}
      >
        <RestrictedOrganizationsBanner organizations={restrictedOrganizations} />
        {children}
      </InternalShell>
    </PinLockProvider>
  );
}

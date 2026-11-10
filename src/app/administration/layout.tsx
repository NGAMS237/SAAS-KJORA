import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { resolvePlatformAdmin } from "@/core/authorization/platform-admin";
import { AdminShell } from "@/modules/platform-admin/admin-shell";

// La console ne doit jamais être indexée ni suivie par un préchargeur.
export const metadata: Metadata = {
  title: "Administration KJORA",
  robots: { index: false, follow: false, nocache: true },
};

// Rendu strictement dynamique : une page d'administration ne doit pas être
// mise en cache statiquement, sous peine de servir à un visiteur le rendu
// produit pour un administrateur.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Garde de la console plateforme.
 *
 * Trois réponses distinctes, délibérément différenciées :
 *
 *   • pas de session      → redirection vers la connexion ;
 *   • session sans droit  → page de connexion administrateur dédiée
 *                           (/connexion/administration), sans aucun droit
 *                           accordé : l'utilisateur voit qu'il doit changer de
 *                           compte, au lieu d'un 404 déroutant ;
 *   • vérification en échec → 404 également. Un incident technique ne doit
 *                           jamais ouvrir l'accès par défaut.
 *
 * Cette garde protège l'affichage. Elle ne remplace pas les contrôles serveur :
 * chaque RPC vérifie l'autorisation de son côté (assert_platform_admin).
 */
export default async function AdministrationLayout({ children }: { children: ReactNode }) {
  const decision = await resolvePlatformAdmin();

  if (!decision.allowed) {
    if (decision.reason === "unauthenticated") {
      redirect("/connexion/administration?next=/administration");
    }
    // Session valide sans droit plateforme : page de connexion dédiée plutôt qu'un 404 muet.
    // Le droit n'est jamais accordé ici ; seule la console elle-même (et ses RPC) autorise.
    if (decision.reason === "not_platform_admin") {
      redirect("/connexion/administration?reason=not-admin");
    }
    // Vérification en échec : refus fermé (404), jamais d'accès par défaut.
    notFound();
  }

  // Vercel fournit VERCEL_ENV. Un serveur Node autonome (Hostinger) ne le
  // fournit pas : `next start` s'exécute alors avec NODE_ENV=production.
  // VERCEL_ENV garde la priorité afin qu'une Preview Vercel (dont NODE_ENV
  // vaut aussi production) demeure correctement étiquetée Preview.
  const vercelEnv = process.env.VERCEL_ENV === "preview"
    ? "preview"
    : process.env.VERCEL_ENV === "production"
      || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
      ? "production"
      : "development";

  return (
    <AdminShell environment={vercelEnv} userEmail={decision.userEmail} commercialSiteUrl={resolveCommercialSiteUrl()}>
      {children}
    </AdminShell>
  );
}

/**
 * ADMIN-01.1 (correctif) : l'URL du site commercial vient exclusivement de la
 * variable serveur `KJORA_COMMERCIAL_SITE_URL`, jamais d'une valeur codée en
 * dur dans le composant. `https://kjora-commercial-site.vercel.app/` a été
 * constaté hors service (DEPLOYMENT_NOT_FOUND) : il ne doit plus jamais
 * apparaître comme repli automatique.
 *
 * Absente ou invalide → `null`, et AdminShell affiche un état
 * "non connecté" sans aucun lien cliquable. Seule une URL http(s) bien
 * formée est acceptée.
 */
function resolveCommercialSiteUrl(): string | null {
  const raw = process.env.KJORA_COMMERCIAL_SITE_URL;
  if (!raw || !raw.trim()) {
    return null;
  }
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

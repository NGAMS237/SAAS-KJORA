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
 *   • session sans droit  → 404, et non 403 : un utilisateur légitime de
 *                           l'application n'a pas à apprendre qu'une console
 *                           d'administration existe à cette adresse ;
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
      redirect("/connexion?next=/administration");
    }
    notFound();
  }

  return <AdminShell>{children}</AdminShell>;
}

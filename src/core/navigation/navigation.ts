import type { LucideIcon } from "lucide-react";
import type { Capability } from "@/core/authorization/capabilities";
import {
  Activity,
  Building2,
  CircleUserRound,
  CreditCard,
  FileCheck2,
  House,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ReceiptText,
  Settings,
  MessagesSquare,
  Users,
  WalletCards,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  requiredCapability?: Capability;
  // Autres chemins qui allument cette entrée (ex. Finances regroupe Échéances et Paiements).
  alsoActive?: string[];
  // Présent dans la barre du bas sur mobile (5 entrées au maximum).
  mobile?: boolean;
};

// Refonte — menu en deux blocs : l'essentiel, puis « Plus ».
export const internalPrimaryNavigation: NavigationItem[] = [
  { href: "/app", label: "Accueil", icon: LayoutDashboard, exact: true, mobile: true },
  { href: "/app/locataires", label: "Locataires", icon: Users, requiredCapability: "tenant.view", mobile: true },
  { href: "/app/locations", label: "Locations", icon: KeyRound, requiredCapability: "lease.view", alsoActive: ["/app/baux"], mobile: true },
  { href: "/app/biens", label: "Biens", icon: Building2, requiredCapability: "property.view" },
  { href: "/app/finances", label: "Finances", icon: WalletCards, requiredCapability: "due.view", alsoActive: ["/app/echeances", "/app/paiements"], mobile: true },
  // D-142 — Documents est une vue transversale des documents déjà émis par les
  // modules existants. Aucun stockage ni moteur documentaire parallèle.
  { href: "/app/documents", label: "Documents", icon: FileCheck2 },
  { href: "/app/messages", label: "Messages", icon: MessagesSquare, requiredCapability: "tenant.view", mobile: true },
];

export const internalSecondaryNavigation: NavigationItem[] = [
  { href: "/app/activite", label: "Activité", icon: Activity, requiredCapability: "activity.view" },
  { href: "/app/equipe", label: "Équipe", icon: Users, requiredCapability: "member.view" },
  // ALIGN-03 — reste accessible même compte bloqué : c'est d'ici que ça se résout.
  { href: "/app/billing", label: "Abonnement", icon: CreditCard, requiredCapability: "billing.view" },
  { href: "/app/parametres", label: "Paramètres", icon: Settings, requiredCapability: "organization.profile.manage" },
  { href: "/app/profil", label: "Profil", icon: CircleUserRound },
  // Demander de l'aide ne dépend d'aucun rôle : aucune capability requise.
  { href: "/app/support", label: "Support", icon: LifeBuoy },
];

export const portalNavigation: NavigationItem[] = [
  { href: "/portal", label: "Accueil", icon: House, exact: true },
  { href: "/portal/loyers", label: "Loyers", icon: WalletCards },
  { href: "/portal/recus", label: "Reçus", icon: ReceiptText },
  { href: "/portal/contrats", label: "Contrats", icon: FileCheck2 },
  { href: "/portal/compte", label: "Compte", icon: CircleUserRound },
];

export const routeIcons = {
  receipt: FileCheck2,
};

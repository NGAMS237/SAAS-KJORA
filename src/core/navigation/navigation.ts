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
  Users,
  WalletCards,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  requiredCapability?: Capability;
};

export const internalPrimaryNavigation: NavigationItem[] = [
  { href: "/app", label: "Accueil", icon: LayoutDashboard, exact: true },
  { href: "/app/biens", label: "Biens", icon: Building2, requiredCapability: "property.view" },
  { href: "/app/locataires", label: "Locataires", icon: Users, requiredCapability: "tenant.view" },
  { href: "/app/locations", label: "Locations", icon: KeyRound, requiredCapability: "lease.view" },
  { href: "/app/paiements", label: "Paiements", icon: CreditCard, requiredCapability: "payment.view" },
  { href: "/app/activite", label: "Activité", icon: Activity, requiredCapability: "activity.view" },
];

export const internalSecondaryNavigation: NavigationItem[] = [
  // D-142 — Documents est une vue transversale des documents déjà émis par les
  // modules existants. Aucun stockage ni moteur documentaire parallèle.
  { href: "/app/documents", label: "Documents", icon: FileCheck2 },
  { href: "/app/equipe", label: "Équipe", icon: Users, requiredCapability: "member.view" },
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

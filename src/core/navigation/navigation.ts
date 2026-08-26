import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  CircleUserRound,
  CreditCard,
  FileCheck2,
  House,
  LayoutDashboard,
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
};

export const internalPrimaryNavigation: NavigationItem[] = [
  { href: "/app", label: "Accueil", icon: LayoutDashboard, exact: true },
  { href: "/app/biens", label: "Biens", icon: Building2 },
  { href: "/app/locataires", label: "Locataires", icon: Users },
  { href: "/app/paiements", label: "Paiements", icon: CreditCard },
  { href: "/app/activite", label: "Activité", icon: Activity },
];

export const internalSecondaryNavigation: NavigationItem[] = [
  { href: "/app/equipe", label: "Équipe", icon: Users },
  { href: "/app/parametres", label: "Paramètres", icon: Settings },
  { href: "/app/profil", label: "Profil", icon: CircleUserRound },
];

export const portalNavigation: NavigationItem[] = [
  { href: "/portal", label: "Accueil", icon: House, exact: true },
  { href: "/portal/loyers", label: "Loyers", icon: WalletCards },
  { href: "/portal/recus", label: "Reçus", icon: ReceiptText },
  { href: "/portal/compte", label: "Compte", icon: CircleUserRound },
];

export const routeIcons = {
  receipt: FileCheck2,
};

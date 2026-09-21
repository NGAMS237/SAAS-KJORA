// =============================================================================
// KJORA — ADMIN-01 — Contenu bilingue de la console
// =============================================================================
// Les deux dictionnaires implémentent le même type : TypeScript refuse de
// compiler si une clé manque dans une langue. Un écran à moitié traduit ne peut
// pas être livré.
//
// Aucun texte en dur dans les composants, aucun ternaire de langue disséminé.
// =============================================================================

export type AdminCopy = {
  consoleTitle: string;
  consoleSubtitle: string;
  navLabel: string;
  navOverview: string;
  navOrganizations: string;
  navSubscriptions: string;
  switchLanguage: string;
  switchTheme: string;
  readOnlyNotice: string;

  overviewTitle: string;
  overviewLead: string;
  countersTitle: string;
  organizationsTotal: string;
  organizationsActive: string;
  organizationsSuspended: string;
  byPlan: string;
  byStatus: string;

  monitoringTitle: string;
  monitoringLead: string;
  colIndicator: string;
  colState: string;
  colSource: string;
  colObserved: string;
  colDetail: string;
  neverObserved: string;

  organizationsTitle: string;
  organizationsLead: string;
  colName: string;
  colStatus: string;
  colCreated: string;
  colMembers: string;
  colPlan: string;
  colBilling: string;

  subscriptionsTitle: string;
  subscriptionsLead: string;
  colCycle: string;
  colCurrency: string;
  colPeriodEnd: string;
  colRenewal: string;
  colGraceEnds: string;
  colProvider: string;
  providerYes: string;
  providerNo: string;

  previous: string;
  next: string;
  pageInfo: (from: number, to: number, total: number) => string;
  emptyRows: string;

  errorDenied: string;
  errorFailed: string;
};

const fr: AdminCopy = {
  consoleTitle: "Administration KJORA",
  consoleSubtitle: "Console plateforme — lecture seule",
  navLabel: "Navigation administration",
  navOverview: "Vue d'ensemble",
  navOrganizations: "Organizations",
  navSubscriptions: "Abonnements",
  switchLanguage: "Changer de langue",
  switchTheme: "Changer de thème",
  readOnlyNotice:
    "Console en lecture seule. Aucune opération d'écriture n'est disponible dans cette version.",

  overviewTitle: "Vue d'ensemble",
  overviewLead:
    "Compteurs et état de la plateforme, calculés à partir des données réellement enregistrées.",
  countersTitle: "Compteurs",
  organizationsTotal: "Organizations au total",
  organizationsActive: "Actives",
  organizationsSuspended: "Suspendues",
  byPlan: "Abonnements par forfait",
  byStatus: "Abonnements par statut",

  monitoringTitle: "Tableau de suivi",
  monitoringLead:
    "Chaque indicateur affiche sa source. Un service sans source fiable intégrée est marqué « non connecté » — jamais « normal ».",
  colIndicator: "Indicateur",
  colState: "État",
  colSource: "Source",
  colObserved: "Dernière donnée",
  colDetail: "Détail",
  neverObserved: "aucune donnée observée",

  organizationsTitle: "Organizations",
  organizationsLead: "Liste paginée. Métadonnées uniquement : aucun contenu métier.",
  colName: "Nom",
  colStatus: "Statut",
  colCreated: "Créée le",
  colMembers: "Membres actifs",
  colPlan: "Forfait",
  colBilling: "Facturation",

  subscriptionsTitle: "Abonnements",
  subscriptionsLead:
    "Liste paginée. Les références fournisseur et les moyens de paiement ne sont pas exposés.",
  colCycle: "Cycle",
  colCurrency: "Devise",
  colPeriodEnd: "Fin de période",
  colRenewal: "Renouvellement",
  colGraceEnds: "Fin de tolérance",
  colProvider: "Fournisseur",
  providerYes: "Raccordé",
  providerNo: "Aucun",

  previous: "Précédent",
  next: "Suivant",
  pageInfo: (from, to, total) => `${from}–${to} sur ${total}`,
  emptyRows: "Aucune donnée.",

  errorDenied: "Accès refusé par le serveur.",
  errorFailed: "Lecture impossible. Réessayez plus tard.",
};

const en: AdminCopy = {
  consoleTitle: "KJORA Administration",
  consoleSubtitle: "Platform console — read only",
  navLabel: "Administration navigation",
  navOverview: "Overview",
  navOrganizations: "Organizations",
  navSubscriptions: "Subscriptions",
  switchLanguage: "Switch language",
  switchTheme: "Switch theme",
  readOnlyNotice:
    "Read-only console. No write operation is available in this version.",

  overviewTitle: "Overview",
  overviewLead:
    "Platform counters and status, computed from data actually recorded.",
  countersTitle: "Counters",
  organizationsTotal: "Organizations total",
  organizationsActive: "Active",
  organizationsSuspended: "Suspended",
  byPlan: "Subscriptions by plan",
  byStatus: "Subscriptions by status",

  monitoringTitle: "Status board",
  monitoringLead:
    "Each indicator shows its source. A service with no reliable source integrated is marked “not connected” — never “normal”.",
  colIndicator: "Indicator",
  colState: "State",
  colSource: "Source",
  colObserved: "Latest data",
  colDetail: "Detail",
  neverObserved: "no data observed",

  organizationsTitle: "Organizations",
  organizationsLead: "Paginated list. Metadata only: no business content.",
  colName: "Name",
  colStatus: "Status",
  colCreated: "Created",
  colMembers: "Active members",
  colPlan: "Plan",
  colBilling: "Billing",

  subscriptionsTitle: "Subscriptions",
  subscriptionsLead:
    "Paginated list. Provider references and payment methods are not exposed.",
  colCycle: "Cycle",
  colCurrency: "Currency",
  colPeriodEnd: "Period end",
  colRenewal: "Renewal",
  colGraceEnds: "Grace ends",
  colProvider: "Provider",
  providerYes: "Connected",
  providerNo: "None",

  previous: "Previous",
  next: "Next",
  pageInfo: (from, to, total) => `${from}–${to} of ${total}`,
  emptyRows: "No data.",

  errorDenied: "Access denied by the server.",
  errorFailed: "Unable to read. Try again later.",
};

export const ADMIN_COPY = { fr, en } as const;
export type AdminLanguage = keyof typeof ADMIN_COPY;

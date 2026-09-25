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

  // ADMIN-01.1 — en-tête
  envProduction: string;
  envPreview: string;
  envDev: string;
  envBadgeHint: string;
  backToApp: string;
  commercialSiteLink: string;
  commercialSiteNotConnected: string;
  opensInNewTab: string;
  loggedInAs: string;
  signOut: string;

  overviewTitle: string;
  overviewLead: string;
  countersTitle: string;
  organizationsTotal: string;
  organizationsActive: string;
  organizationsSuspended: string;
  subscriptionsFreeRegistered: string;
  subscriptionsPaidRegistered: string;
  organizationsWithoutSubscription: string;
  revenueTitle: string;
  supportRequestsTitle: string;
  lastRefreshed: string;
  refreshButton: string;
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
  searchByName: string;
  filterStatusAll: string;
  filterStatusActive: string;
  filterStatusSuspended: string;
  resultsCount: (count: number) => string;
  clearFilters: string;
  applyFilters: string;

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
  searchByOrganization: string;
  filterPlanAll: string;
  filterCurrencyAll: string;
  freePaidSummary: (free: number, paid: number) => string;

  previous: string;
  next: string;
  pageInfo: (from: number, to: number, total: number) => string;
  emptyRows: string;

  errorDenied: string;
  errorFailed: string;

  // ADMIN-02 — détail abonnement et actions contrôlées
  colActions: string;
  viewDetail: string;
  archivedBadge: string;
  archivedFilterLabel: string;
  archivedFilterActive: string;
  archivedFilterArchived: string;
  archivedFilterAll: string;
  subscriptionDetailTitle: string;
  subscriptionNotFound: string;
  periodStart: string;
  cancellationEffectiveOn: string;
  actionsTitle: string;
  actionChangePlan: string;
  actionSuspend: string;
  actionReactivate: string;
  actionScheduleCancellation: string;
  actionRevokeCancellation: string;
  actionArchive: string;
  confirmChangePlan: (from: string, to: string) => string;
  confirmSuspend: string;
  confirmReactivate: string;
  confirmScheduleCancellation: string;
  confirmRevokeCancellation: string;
  confirmArchive: string;
  confirm: string;
  cancel: string;
  reasonLabel: string;
  auditTitle: string;
  auditEvent: string;
  auditTransition: string;
  subscriptionOutcomeLabels: Record<string, string>;
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

  envProduction: "PRODUCTION",
  envPreview: "PREVIEW",
  envDev: "DEV",
  envBadgeHint: "Environnement d'exécution actuel, fourni par la plateforme d'hébergement.",
  backToApp: "Application KJORA",
  commercialSiteLink: "Site commercial",
  commercialSiteNotConnected: "Site commercial — non connecté",
  opensInNewTab: "(nouvel onglet)",
  loggedInAs: "Connecté en tant que",
  signOut: "Déconnexion",

  overviewTitle: "Vue d'ensemble",
  overviewLead:
    "Compteurs et état de la plateforme, calculés à partir des données réellement enregistrées.",
  countersTitle: "Compteurs",
  organizationsTotal: "Organizations au total",
  organizationsActive: "Actives",
  organizationsSuspended: "Suspendues",
  subscriptionsFreeRegistered: "Abonnements gratuits enregistrés",
  subscriptionsPaidRegistered: "Abonnements payants enregistrés",
  organizationsWithoutSubscription: "Sans abonnement enregistré",
  revenueTitle: "Revenus",
  supportRequestsTitle: "Demandes de support",
  lastRefreshed: "Dernière actualisation",
  refreshButton: "Actualiser",
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
  searchByName: "Rechercher par nom",
  filterStatusAll: "Tous les statuts",
  filterStatusActive: "Actif",
  filterStatusSuspended: "Suspendu",
  resultsCount: (count) => `${count} résultat${count === 1 ? "" : "s"}`,
  clearFilters: "Réinitialiser",
  applyFilters: "Filtrer",

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
  searchByOrganization: "Rechercher par Organization",
  filterPlanAll: "Tous les forfaits",
  filterCurrencyAll: "Toutes les devises",
  freePaidSummary: (free, paid) => `${free} gratuit${free === 1 ? "" : "s"} — ${paid} payant${paid === 1 ? "" : "s"}`,

  previous: "Précédent",
  next: "Suivant",
  pageInfo: (from, to, total) => `${from}–${to} sur ${total}`,
  emptyRows: "Aucune donnée.",

  errorDenied: "Accès refusé par le serveur.",
  errorFailed: "Lecture impossible. Réessayez plus tard.",

  colActions: "Actions",
  viewDetail: "Voir",
  archivedBadge: "Archivé",
  archivedFilterLabel: "Archivage",
  archivedFilterActive: "Actifs",
  archivedFilterArchived: "Archivés",
  archivedFilterAll: "Tous",
  subscriptionDetailTitle: "Détail de l'abonnement",
  subscriptionNotFound: "Abonnement introuvable.",
  periodStart: "Début de période",
  cancellationEffectiveOn: "Résiliation effective le",
  actionsTitle: "Actions administratives",
  actionChangePlan: "Changer de forfait",
  actionSuspend: "Suspendre",
  actionReactivate: "Réactiver",
  actionScheduleCancellation: "Résilier à la fin de la période",
  actionRevokeCancellation: "Annuler la résiliation",
  actionArchive: "Archiver",
  confirmChangePlan: (from, to) =>
    `Vous allez modifier le forfait de cette organisation : ${from} → ${to}.`,
  confirmSuspend: "Cette action suspendra l'abonnement. Les données seront conservées.",
  confirmReactivate: "Cette action réactivera l'abonnement selon son état actuel.",
  confirmScheduleCancellation: "L'abonnement restera actif jusqu'à la fin de la période actuelle.",
  confirmRevokeCancellation: "La résiliation programmée sera annulée et l'abonnement restera actif.",
  confirmArchive:
    "L'abonnement restera dans l'historique mais sera masqué des listes actives.",
  confirm: "Confirmer",
  cancel: "Annuler",
  reasonLabel: "Raison (optionnel)",
  auditTitle: "Historique d'audit",
  auditEvent: "Événement",
  auditTransition: "Transition",
  subscriptionOutcomeLabels: {
    plan_changed: "Forfait modifié.",
    unchanged: "Aucun changement : ce forfait est déjà actif.",
    invalid_plan: "Forfait ou cycle invalide.",
    plan_change_refused: "Changement refusé : quotas dépassés pour le nouveau forfait.",
    suspended: "Abonnement suspendu.",
    already_suspended: "Cet abonnement est déjà suspendu.",
    reactivated: "Abonnement réactivé.",
    not_suspended: "Cet abonnement n'est pas suspendu.",
    cancellation_scheduled: "Résiliation programmée.",
    nothing_to_cancel: "Aucun abonnement payant à résilier.",
    already_cancelled: "Une résiliation est déjà programmée.",
    cancellation_revoked: "Résiliation annulée.",
    not_scheduled: "Aucune résiliation programmée à annuler.",
    archived: "Abonnement archivé.",
    already_archived: "Cet abonnement est déjà archivé.",
    archive_refused: "Archivage refusé : résiliez ou suspendez l'abonnement avant de l'archiver.",
    not_found: "Abonnement introuvable.",
  },
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

  envProduction: "PRODUCTION",
  envPreview: "PREVIEW",
  envDev: "DEV",
  envBadgeHint: "Current runtime environment, provided by the hosting platform.",
  backToApp: "KJORA Application",
  commercialSiteLink: "Commercial site",
  commercialSiteNotConnected: "Commercial site — not connected",
  opensInNewTab: "(new tab)",
  loggedInAs: "Signed in as",
  signOut: "Sign out",

  overviewTitle: "Overview",
  overviewLead:
    "Platform counters and status, computed from data actually recorded.",
  countersTitle: "Counters",
  organizationsTotal: "Organizations total",
  organizationsActive: "Active",
  organizationsSuspended: "Suspended",
  subscriptionsFreeRegistered: "Registered free subscriptions",
  subscriptionsPaidRegistered: "Registered paid subscriptions",
  organizationsWithoutSubscription: "Without a registered subscription",
  revenueTitle: "Revenue",
  supportRequestsTitle: "Support requests",
  lastRefreshed: "Last refreshed",
  refreshButton: "Refresh",
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
  searchByName: "Search by name",
  filterStatusAll: "All statuses",
  filterStatusActive: "Active",
  filterStatusSuspended: "Suspended",
  resultsCount: (count) => `${count} result${count === 1 ? "" : "s"}`,
  clearFilters: "Clear filters",
  applyFilters: "Filter",

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
  searchByOrganization: "Search by Organization",
  filterPlanAll: "All plans",
  filterCurrencyAll: "All currencies",
  freePaidSummary: (free, paid) => `${free} free — ${paid} paid`,

  previous: "Previous",
  next: "Next",
  pageInfo: (from, to, total) => `${from}–${to} of ${total}`,
  emptyRows: "No data.",

  errorDenied: "Access denied by the server.",
  errorFailed: "Unable to read. Try again later.",

  colActions: "Actions",
  viewDetail: "View",
  archivedBadge: "Archived",
  archivedFilterLabel: "Archive status",
  archivedFilterActive: "Active",
  archivedFilterArchived: "Archived",
  archivedFilterAll: "All",
  subscriptionDetailTitle: "Subscription detail",
  subscriptionNotFound: "Subscription not found.",
  periodStart: "Period start",
  cancellationEffectiveOn: "Cancellation effective on",
  actionsTitle: "Administrative actions",
  actionChangePlan: "Change plan",
  actionSuspend: "Suspend",
  actionReactivate: "Reactivate",
  actionScheduleCancellation: "Cancel at period end",
  actionRevokeCancellation: "Revoke cancellation",
  actionArchive: "Archive",
  confirmChangePlan: (from, to) =>
    `You are about to change this organization's plan: ${from} → ${to}.`,
  confirmSuspend: "This will suspend the subscription. Data will be preserved.",
  confirmReactivate: "This will reactivate the subscription based on its current state.",
  confirmScheduleCancellation: "The subscription will remain active until the end of the current period.",
  confirmRevokeCancellation: "The scheduled cancellation will be revoked and the subscription will remain active.",
  confirmArchive:
    "The subscription will remain in history but will be hidden from active lists.",
  confirm: "Confirm",
  cancel: "Cancel",
  reasonLabel: "Reason (optional)",
  auditTitle: "Audit history",
  auditEvent: "Event",
  auditTransition: "Transition",
  subscriptionOutcomeLabels: {
    plan_changed: "Plan changed.",
    unchanged: "No change: this plan is already active.",
    invalid_plan: "Invalid plan or cycle.",
    plan_change_refused: "Change refused: quotas exceeded for the new plan.",
    suspended: "Subscription suspended.",
    already_suspended: "This subscription is already suspended.",
    reactivated: "Subscription reactivated.",
    not_suspended: "This subscription is not suspended.",
    cancellation_scheduled: "Cancellation scheduled.",
    nothing_to_cancel: "No paid subscription to cancel.",
    already_cancelled: "A cancellation is already scheduled.",
    cancellation_revoked: "Cancellation revoked.",
    not_scheduled: "No scheduled cancellation to revoke.",
    archived: "Subscription archived.",
    already_archived: "This subscription is already archived.",
    archive_refused: "Archive refused: cancel or suspend the subscription before archiving it.",
    not_found: "Subscription not found.",
  },
};

export const ADMIN_COPY = { fr, en } as const;
export type AdminLanguage = keyof typeof ADMIN_COPY;

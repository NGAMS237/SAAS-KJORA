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

  commercialCountersTitle: string;
  commercialCounterActive: string;
  commercialCounterComplimentary: string;
  commercialCounterOfflinePayments: string;
  commercialCounterExpiring30: string;
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
  // ADMIN-BILLING-OPS-01 — correctif UX : colonne d'action explicite, en plus
  // du nom cliquable, pour ouvrir la fiche Organization sans ambiguïté.
  colActions: string;
  viewManageLabel: string;
  viewManageAriaLabel: (name: string) => string;
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

  // ADMIN-BILLING-OPS-01 — fiche Organization
  viewDetail: string;
  orgDetailBackToList: string;
  orgDetailTitle: (name: string) => string;
  orgDetailOwnerEmail: string;
  orgDetailActiveMembers: string;
  orgDetailProperties: string;
  orgDetailUnits: string;
  orgDetailEffectivePlan: string;
  orgDetailSubscription: string;
  orgDetailBillingStatus: string;
  orgDetailCycle: string;
  orgDetailCurrency: string;
  orgDetailPeriodEnd: string;
  orgDetailProvider: string;
  orgDetailMismatchWarning: string;
  orgDetailNotFound: string;
  orgDetailActiveInterventionTitle: string;
  orgDetailNoActiveIntervention: string;
  orgDetailInterventionType: string;
  orgDetailInterventionReason: string;
  orgDetailInterventionNote: string;
  orgDetailInterventionPeriod: string;
  orgDetailInterventionAmount: string;
  orgDetailInterventionReference: string;
  orgDetailInterventionCreatedBy: string;
  orgDetailInterventionExpired: string;
  orgDetailInterventionActive: string;
  orgDetailHistoryTitle: string;
  orgDetailNoHistory: string;

  interventionTypeLabels: Record<string, string>;
  reasonCodeLabels: Record<string, string>;
  eventTypeLabels: Record<string, string>;

  actionsTitle: string;
  actionGrant: string;
  actionRevoke: string;
  actionExtend: string;

  formInterventionType: string;
  formGrantedPlan: string;
  formReasonCode: string;
  formAdminNote: string;
  formStartsOn: string;
  formEndsOn: string;
  formEndsOnRequired: string;
  formCurrency: string;
  formAmount: string;
  formManualReference: string;
  formReason: string;
  formNewEndsOn: string;
  formCancel: string;
  formConfirm: string;
  formConfirmCheckbox: string;

  grantSummaryTitle: string;
  grantSummaryOrganization: string;
  grantSummaryConsequence: string;

  revokeConfirmText: string;
  extendConfirmText: string;

  outcomeLabels: Record<string, string>;

  // ---------------------------------------------------------------------
  // FINANCE-ADMIN-01 — Finances (lecture seule)
  // ---------------------------------------------------------------------
  navFinances: string;
  financeTitle: string;
  financeSubtitle: string;

  financePeriodLabel: string;
  periodLast30Days: string;
  periodLast90Days: string;
  periodCurrentYear: string;
  periodAllTime: string;

  financeSectionCounters: string;
  financeCounterOrganizations: string;
  financeCounterFreeSubs: string;
  financeCounterPaidSubs: string;
  financeCounterWithoutSubscription: string;
  financeCounterMismatches: string;
  financeCounterActiveInterventions: string;
  financeCounterActiveComplimentary: string;
  financeCounterOfflinePayments: string;

  financeSectionCollected: string;
  financeCollectedOfflineCad: string;
  financeCollectedOfflineXaf: string;
  financeCollectedStripe: string;
  financeCollectedMobileMoney: string;
  notAvailable: string;
  notConnectedValue: string;

  financeSectionExpected: string;
  financeExpectedCad: string;
  financeExpectedXaf: string;
  financeExpectedBasisNote: string;

  financeSectionCharts: string;
  chartSubscriptionsByPlan: string;
  chartFreePaidBreakdown: string;
  chartExpectedRevenueByCurrency: string;
  chartNoSourceAvailable: string;
  chartTableCaption: string;

  financeSectionEvents: string;
  colEventDate: string;
  colEventOrganization: string;
  colEventCategory: string;
  colEventStatus: string;
  colEventCurrency: string;
  colEventAmount: string;
  colEventSource: string;
  financeEventSourceSubscription: string;
  financeEventSourceManualIntervention: string;
  financeEventSourceOfflinePayment: string;
  financeNoEvents: string;

  financeSectionConnectors: string;
  connectorSupabaseInternal: string;
  connectorStripe: string;
  connectorMobileMoney: string;
  connectorStateConnected: string;
  connectorStateNotConnected: string;

  financeApplyFilter: string;
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
    "Les opérations commerciales sont réservées aux administrateurs et consignées dans l'historique.",

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

  commercialCountersTitle: "Interventions commerciales",
  commercialCounterActive: "Interventions actives",
  commercialCounterComplimentary: "Gratuités actives",
  commercialCounterOfflinePayments: "Paiements hors-ligne actifs",
  commercialCounterExpiring30: "Expirent sous 30 jours",
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
  colActions: "Actions",
  viewManageLabel: "Voir / Gérer",
  viewManageAriaLabel: (name) => `Voir ou gérer ${name || "cette Organization"}`,
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

  viewDetail: "Voir",
  orgDetailBackToList: "← Retour à la liste",
  orgDetailTitle: (name) => `Organization — ${name}`,
  orgDetailOwnerEmail: "Courriel du propriétaire",
  orgDetailActiveMembers: "Membres actifs",
  orgDetailProperties: "Biens",
  orgDetailUnits: "Logements",
  orgDetailEffectivePlan: "Forfait effectif",
  orgDetailSubscription: "Abonnement enregistré",
  orgDetailBillingStatus: "Statut de facturation",
  orgDetailCycle: "Cycle",
  orgDetailCurrency: "Devise",
  orgDetailPeriodEnd: "Fin de période",
  orgDetailProvider: "Fournisseur",
  orgDetailMismatchWarning:
    "Le forfait effectif et l'abonnement enregistré sont en désaccord, sans intervention manuelle active pour l'expliquer.",
  orgDetailNotFound: "Cette Organization est introuvable.",
  orgDetailActiveInterventionTitle: "Intervention commerciale active",
  orgDetailNoActiveIntervention: "Aucune intervention commerciale active.",
  orgDetailInterventionType: "Type",
  orgDetailInterventionReason: "Motif",
  orgDetailInterventionNote: "Note",
  orgDetailInterventionPeriod: "Période",
  orgDetailInterventionAmount: "Montant",
  orgDetailInterventionReference: "Référence",
  orgDetailInterventionCreatedBy: "Accordée par",
  orgDetailInterventionExpired: "Expirée (en attente de réconciliation)",
  orgDetailInterventionActive: "Active",
  orgDetailHistoryTitle: "Historique administratif",
  orgDetailNoHistory: "Aucune action administrative enregistrée pour cette Organization.",

  interventionTypeLabels: {
    complimentary: "Forfait offert",
    offline_payment: "Paiement hors ligne",
    promotion: "Promotion",
    partnership: "Partenariat",
    support_adjustment: "Correction commerciale",
  },
  reasonCodeLabels: {
    sales_gift: "Cadeau commercial",
    partner_offer: "Offre partenaire",
    manual_payment_received: "Paiement reçu manuellement",
    promotional_campaign: "Campagne promotionnelle",
    support_goodwill: "Geste commercial support",
    other: "Autre",
  },
  eventTypeLabels: {
    admin_commercial_intervention_granted: "Intervention accordée",
    admin_commercial_intervention_revoked: "Intervention révoquée",
    admin_commercial_intervention_extended: "Intervention prolongée",
    admin_commercial_intervention_expired: "Intervention expirée",
  },

  actionsTitle: "Actions administratives",
  actionGrant: "Accorder un forfait",
  actionRevoke: "Révoquer l'avantage",
  actionExtend: "Prolonger",

  formInterventionType: "Type d'intervention",
  formGrantedPlan: "Forfait accordé",
  formReasonCode: "Motif normalisé",
  formAdminNote: "Note administrative (obligatoire)",
  formStartsOn: "Date de début",
  formEndsOn: "Date de fin",
  formEndsOnRequired: "Obligatoire pour ce type d'intervention.",
  formCurrency: "Devise",
  formAmount: "Montant",
  formManualReference: "Référence manuelle (facultatif)",
  formReason: "Motif (obligatoire)",
  formNewEndsOn: "Nouvelle date de fin",
  formCancel: "Annuler",
  formConfirm: "Confirmer",
  formConfirmCheckbox: "Je confirme cette action administrative.",

  grantSummaryTitle: "Résumé avant confirmation",
  grantSummaryOrganization: "Organization ciblée",
  grantSummaryConsequence: "Le forfait effectif de cette Organization sera immédiatement mis à jour.",

  revokeConfirmText: "Cette action révoquera l'avantage commercial actif. L'historique est conservé.",
  extendConfirmText: "Cette action prolonge l'intervention commerciale active jusqu'à la nouvelle date choisie.",

  outcomeLabels: {
    granted: "Intervention accordée avec succès.",
    already_recorded: "Cette intervention avait déjà été enregistrée (double soumission évitée).",
    intervention_already_active: "Une intervention est déjà active : révoquez-la ou prolongez-la d'abord.",
    revoked: "Avantage révoqué. Le forfait normal a été restauré.",
    not_active: "Cette intervention n'est plus active.",
    extended: "Intervention prolongée.",
    organization_not_found: "Organization introuvable.",
    invalid_type: "Type d'intervention invalide.",
    invalid_plan: "Forfait invalide.",
    invalid_reason: "Motif invalide.",
    note_required: "Une note administrative est obligatoire.",
    end_date_required: "Une date de fin est obligatoire pour ce type d'intervention.",
    invalid_period: "Période invalide.",
    invalid_currency: "Devise invalide pour un paiement hors ligne.",
    invalid_amount: "Montant invalide pour un paiement hors ligne.",
    invalid_idempotency_key: "Jeton de soumission invalide, réessayez.",
    reason_required: "Un motif est obligatoire.",
    not_found: "Intervention introuvable.",
  },

  navFinances: "Finances",
  financeTitle: "Finances",
  financeSubtitle:
    "Aperçu financier en lecture seule. Chaque montant est rattaché à sa devise et à sa source ; rien n'est jamais additionné entre le CAD et le XAF.",

  financePeriodLabel: "Période",
  periodLast30Days: "30 derniers jours",
  periodLast90Days: "90 derniers jours",
  periodCurrentYear: "Année en cours",
  periodAllTime: "Toute la période",

  financeSectionCounters: "Compteurs commerciaux",
  financeCounterOrganizations: "Organizations totales",
  financeCounterFreeSubs: "Abonnements gratuits enregistrés",
  financeCounterPaidSubs: "Abonnements payants enregistrés",
  financeCounterWithoutSubscription: "Organizations sans abonnement enregistré",
  financeCounterMismatches: "Incohérences forfait/facturation",
  financeCounterActiveInterventions: "Interventions commerciales actives",
  financeCounterActiveComplimentary: "Gratuités actives",
  financeCounterOfflinePayments: "Paiements hors ligne enregistrés",

  financeSectionCollected: "Revenus réellement encaissés",
  financeCollectedOfflineCad: "Encaissé hors ligne (CAD)",
  financeCollectedOfflineXaf: "Encaissé hors ligne (XAF)",
  financeCollectedStripe: "Encaissé Stripe",
  financeCollectedMobileMoney: "Encaissé Mobile Money",
  notAvailable: "NON DISPONIBLE",
  notConnectedValue: "NON CONNECTÉ",

  financeSectionExpected: "Revenus mensuels attendus",
  financeExpectedCad: "Revenu mensuel attendu (CAD)",
  financeExpectedXaf: "Revenu mensuel attendu (XAF)",
  financeExpectedBasisNote:
    "Calculé à partir des abonnements réellement enregistrés et du catalogue de prix ALIGN-03. État courant, indépendant de la période choisie ci-dessus — jamais une estimation présentée comme un encaissement.",

  financeSectionCharts: "Graphiques",
  chartSubscriptionsByPlan: "Abonnements par forfait",
  chartFreePaidBreakdown: "Gratuit / Payant / Sans abonnement",
  chartExpectedRevenueByCurrency: "Revenu attendu par devise",
  chartNoSourceAvailable: "Aucune source fiable disponible pour ce graphique.",
  chartTableCaption: "Valeurs détaillées",

  financeSectionEvents: "Événements financiers récents",
  colEventDate: "Date",
  colEventOrganization: "Organization",
  colEventCategory: "Catégorie",
  colEventStatus: "Statut",
  colEventCurrency: "Devise",
  colEventAmount: "Montant",
  colEventSource: "Source",
  financeEventSourceSubscription: "Abonnement",
  financeEventSourceManualIntervention: "Intervention manuelle",
  financeEventSourceOfflinePayment: "Paiement hors ligne",
  financeNoEvents: "Aucun événement financier sur cette période.",

  financeSectionConnectors: "État des connecteurs",
  connectorSupabaseInternal: "Supabase interne",
  connectorStripe: "Stripe",
  connectorMobileMoney: "Mobile Money",
  connectorStateConnected: "CONNECTÉ",
  connectorStateNotConnected: "NON CONNECTÉ",

  financeApplyFilter: "Appliquer",
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
    "Commercial operations are restricted to administrators and recorded in the audit history.",

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

  commercialCountersTitle: "Commercial interventions",
  commercialCounterActive: "Active interventions",
  commercialCounterComplimentary: "Active complimentary grants",
  commercialCounterOfflinePayments: "Active offline payments",
  commercialCounterExpiring30: "Expiring within 30 days",
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
  colActions: "Actions",
  viewManageLabel: "View / Manage",
  viewManageAriaLabel: (name) => `View or manage ${name || "this organization"}`,
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

  viewDetail: "View",
  orgDetailBackToList: "← Back to list",
  orgDetailTitle: (name) => `Organization — ${name}`,
  orgDetailOwnerEmail: "Owner email",
  orgDetailActiveMembers: "Active members",
  orgDetailProperties: "Properties",
  orgDetailUnits: "Units",
  orgDetailEffectivePlan: "Effective plan",
  orgDetailSubscription: "Registered subscription",
  orgDetailBillingStatus: "Billing status",
  orgDetailCycle: "Cycle",
  orgDetailCurrency: "Currency",
  orgDetailPeriodEnd: "Period end",
  orgDetailProvider: "Provider",
  orgDetailMismatchWarning:
    "The effective plan and the registered subscription disagree, with no active manual intervention to explain it.",
  orgDetailNotFound: "This Organization could not be found.",
  orgDetailActiveInterventionTitle: "Active commercial intervention",
  orgDetailNoActiveIntervention: "No active commercial intervention.",
  orgDetailInterventionType: "Type",
  orgDetailInterventionReason: "Reason",
  orgDetailInterventionNote: "Note",
  orgDetailInterventionPeriod: "Period",
  orgDetailInterventionAmount: "Amount",
  orgDetailInterventionReference: "Reference",
  orgDetailInterventionCreatedBy: "Granted by",
  orgDetailInterventionExpired: "Expired (awaiting reconciliation)",
  orgDetailInterventionActive: "Active",
  orgDetailHistoryTitle: "Administrative history",
  orgDetailNoHistory: "No administrative action recorded for this Organization.",

  interventionTypeLabels: {
    complimentary: "Complimentary plan",
    offline_payment: "Offline payment",
    promotion: "Promotion",
    partnership: "Partnership",
    support_adjustment: "Commercial correction",
  },
  reasonCodeLabels: {
    sales_gift: "Commercial gift",
    partner_offer: "Partner offer",
    manual_payment_received: "Payment received manually",
    promotional_campaign: "Promotional campaign",
    support_goodwill: "Support goodwill gesture",
    other: "Other",
  },
  eventTypeLabels: {
    admin_commercial_intervention_granted: "Intervention granted",
    admin_commercial_intervention_revoked: "Intervention revoked",
    admin_commercial_intervention_extended: "Intervention extended",
    admin_commercial_intervention_expired: "Intervention expired",
  },

  actionsTitle: "Administrative actions",
  actionGrant: "Grant a plan",
  actionRevoke: "Revoke the benefit",
  actionExtend: "Extend",

  formInterventionType: "Intervention type",
  formGrantedPlan: "Granted plan",
  formReasonCode: "Normalized reason",
  formAdminNote: "Administrative note (required)",
  formStartsOn: "Start date",
  formEndsOn: "End date",
  formEndsOnRequired: "Required for this intervention type.",
  formCurrency: "Currency",
  formAmount: "Amount",
  formManualReference: "Manual reference (optional)",
  formReason: "Reason (required)",
  formNewEndsOn: "New end date",
  formCancel: "Cancel",
  formConfirm: "Confirm",
  formConfirmCheckbox: "I confirm this administrative action.",

  grantSummaryTitle: "Summary before confirmation",
  grantSummaryOrganization: "Targeted Organization",
  grantSummaryConsequence: "This Organization's effective plan will be updated immediately.",

  revokeConfirmText: "This will revoke the active commercial benefit. History is preserved.",
  extendConfirmText: "This extends the active commercial intervention to the new chosen date.",

  outcomeLabels: {
    granted: "Intervention granted successfully.",
    already_recorded: "This intervention had already been recorded (double submission avoided).",
    intervention_already_active: "An intervention is already active: revoke or extend it first.",
    revoked: "Benefit revoked. The normal plan has been restored.",
    not_active: "This intervention is no longer active.",
    extended: "Intervention extended.",
    organization_not_found: "Organization not found.",
    invalid_type: "Invalid intervention type.",
    invalid_plan: "Invalid plan.",
    invalid_reason: "Invalid reason.",
    note_required: "An administrative note is required.",
    end_date_required: "An end date is required for this intervention type.",
    invalid_period: "Invalid period.",
    invalid_currency: "Invalid currency for an offline payment.",
    invalid_amount: "Invalid amount for an offline payment.",
    invalid_idempotency_key: "Invalid submission token, please retry.",
    reason_required: "A reason is required.",
    not_found: "Intervention not found.",
  },

  navFinances: "Finances",
  financeTitle: "Finances",
  financeSubtitle:
    "Read-only financial overview. Every amount stays tied to its currency and its source; CAD and XAF are never added together.",

  financePeriodLabel: "Period",
  periodLast30Days: "Last 30 days",
  periodLast90Days: "Last 90 days",
  periodCurrentYear: "Current year",
  periodAllTime: "All time",

  financeSectionCounters: "Commercial counters",
  financeCounterOrganizations: "Total organizations",
  financeCounterFreeSubs: "Registered free subscriptions",
  financeCounterPaidSubs: "Registered paid subscriptions",
  financeCounterWithoutSubscription: "Organizations without a registered subscription",
  financeCounterMismatches: "Plan/billing mismatches",
  financeCounterActiveInterventions: "Active commercial interventions",
  financeCounterActiveComplimentary: "Active complimentary grants",
  financeCounterOfflinePayments: "Registered offline payments",

  financeSectionCollected: "Revenue actually collected",
  financeCollectedOfflineCad: "Collected offline (CAD)",
  financeCollectedOfflineXaf: "Collected offline (XAF)",
  financeCollectedStripe: "Collected via Stripe",
  financeCollectedMobileMoney: "Collected via Mobile Money",
  notAvailable: "NOT AVAILABLE",
  notConnectedValue: "NOT CONNECTED",

  financeSectionExpected: "Expected monthly revenue",
  financeExpectedCad: "Expected monthly revenue (CAD)",
  financeExpectedXaf: "Expected monthly revenue (XAF)",
  financeExpectedBasisNote:
    "Computed from really-registered subscriptions and the ALIGN-03 price catalog. Current-state figure, independent of the period selected above — never an estimate presented as a collection.",

  financeSectionCharts: "Charts",
  chartSubscriptionsByPlan: "Subscriptions by plan",
  chartFreePaidBreakdown: "Free / Paid / No subscription",
  chartExpectedRevenueByCurrency: "Expected revenue by currency",
  chartNoSourceAvailable: "No reliable source available for this chart.",
  chartTableCaption: "Detailed values",

  financeSectionEvents: "Recent financial events",
  colEventDate: "Date",
  colEventOrganization: "Organization",
  colEventCategory: "Category",
  colEventStatus: "Status",
  colEventCurrency: "Currency",
  colEventAmount: "Amount",
  colEventSource: "Source",
  financeEventSourceSubscription: "Subscription",
  financeEventSourceManualIntervention: "Manual intervention",
  financeEventSourceOfflinePayment: "Offline payment",
  financeNoEvents: "No financial event in this period.",

  financeSectionConnectors: "Connector status",
  connectorSupabaseInternal: "Internal Supabase",
  connectorStripe: "Stripe",
  connectorMobileMoney: "Mobile Money",
  connectorStateConnected: "CONNECTED",
  connectorStateNotConnected: "NOT CONNECTED",

  financeApplyFilter: "Apply",
};

export const ADMIN_COPY = { fr, en } as const;
export type AdminLanguage = keyof typeof ADMIN_COPY;

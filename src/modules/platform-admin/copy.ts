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
  // Complément REVENUE-LAUNCH-01 §1/§2
  organizationsArchived: string;
  organizationsRequiringProviderAction: (count: number) => string;
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
  // Complément REVENUE-LAUNCH-01 §1
  filterStatusArchived: string;
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
  // Complément REVENUE-LAUNCH-01 §3
  orgDetailProviderActionRequired: string;
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

  // REVENUE-01E — Extension Admin Finances (facturation manuelle Afrique,
  // rappels automatiques, échecs de paiement). Section distincte de B/C/D.
  financeSectionManualInvoicing: string;
  financeManualInvoicesDueXaf: string;
  financeManualInvoicesOverdueXaf: string;
  financeArchivedOpenInvoicesXaf: string;
  financeExcludedArchivedSubscriptions: string;
  financeManualPaymentsConfirmed: string;
  financeManualPaymentsCollectedXaf: string;
  financeManualPaymentsCollectedCad: string;
  financeRemindersSent: string;
  financeRemindersDueNow: string;
  financePaymentFailures: string;

  // REVENUE-01H — Cycle de vie Admin (Organization / membres / notes internes).
  lifecycleSectionTitle: string;
  lifecycleCurrentStatus: string;
  lifecycleActionSuspend: string;
  lifecycleActionReactivate: string;
  lifecycleActionArchive: string;
  lifecycleActionRestore: string;
  lifecycleSuspendConfirmText: string;
  lifecycleReactivateConfirmText: string;
  lifecycleArchiveConfirmText: string;
  lifecycleRestoreConfirmText: string;
  lifecycleArchiveNameLabel: string;

  membersSectionTitle: string;
  colEmail: string;
  colRole: string;
  noMembers: string;
  actionDisableMember: string;
  actionReactivateMember: string;
  actionTransferOwnership: string;
  memberDisableConfirmText: string;
  memberReactivateConfirmText: string;
  transferOwnershipConfirmText: string;

  notesSectionTitle: string;
  actionAddNote: string;
  noNotes: string;
  formNoteLabel: string;

  lifecycleHistoryTitle: string;
  noLifecycleHistory: string;
  colActor: string;
  colTarget: string;
  lifecycleActionLabels: Record<string, string>;

  // NOTIFICATIONS-COMMUNICATIONS-E2E-01 — Supervision des opérations.
  navOperations: string;
  navPartners: string;

  // REVENUE-01I — Contacts commerciaux.
  navContacts: string;
  contactsTitle: string;
  contactsLead: string;
  searchByNameOrEmail: string;
  colPhone: string;
  colCountry: string;
  colLanguage: string;
  colConsent: string;
  consentYes: string;
  consentNo: string;
  consentUnsubscribed: string;
  noContactRecorded: string;
  // Complément REVENUE-LAUNCH-01 §4
  colMarketingEligible: string;
  marketingEligibleYes: string;
  marketingEligibleNo: string;
  // REVENUE-LAUNCH-01 v3 — consentement versionné et prouvé
  consentVersionLabel: (version: string) => string;
  consentEvidenceLabel: string;
  consentEvidenceOptionalLabel: string;
  consentEvidenceRequired: string;
  actionEditContact: string;
  actionGrantConsent: string;
  actionUnsubscribe: string;
  exportCsv: string;
  formPhoneOptional: string;
  formCountry: string;
  formLanguage: string;
  editContactConfirmText: string;
  grantConsentConfirmText: string;
  unsubscribeConfirmText: string;
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
  organizationsArchived: "Archivées",
  organizationsRequiringProviderAction: (count) =>
    `${count} Organization(s) suspendue(s)/archivée(s) avec un abonnement fournisseur encore actif : action manuelle requise (jamais annulé automatiquement).`,
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
  filterStatusArchived: "Archivé",
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
  orgDetailProviderActionRequired:
    "Cette Organization est suspendue ou archivée, mais son abonnement reste lié à un fournisseur réel non annulé. Aucune annulation automatique n'est effectuée : une action manuelle est requise.",
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

    // REVENUE-01H — Cycle de vie Admin.
    suspended: "Organization suspendue.",
    already_suspended: "Cette Organization était déjà suspendue.",
    organization_archived: "Cette Organization est archivée : restaurez-la d'abord.",
    already_active: "Cette Organization est déjà active.",
    reactivated: "Organization réactivée.",
    already_archived: "Cette Organization était déjà archivée.",
    name_confirmation_mismatch: "Le nom saisi ne correspond pas exactement au nom de l'Organization.",
    archived: "Organization archivée.",
    not_archived: "Cette Organization n'est pas archivée.",
    restored: "Organization restaurée.",
    membership_not_found: "Membre introuvable.",
    already_disabled: "Ce membre était déjà désactivé.",
    owner_transfer_required: "Un propriétaire ne peut pas être désactivé directement : transférez d'abord la propriété.",
    disabled: "Membre désactivé.",
    no_active_owner: "Aucun propriétaire actif trouvé pour cette Organization.",
    already_owner: "Ce membre est déjà propriétaire.",
    verified_target_required: "Le membre ciblé doit d'abord confirmer son courriel.",
    transferred: "Propriété transférée.",
    note_added: "Note interne ajoutée.",

    // REVENUE-01I — Contacts commerciaux.
    invalid_phone: "Numéro de téléphone invalide.",
    country_required: "Le pays est obligatoire.",
    invalid_language: "Langue invalide.",
    saved: "Fiche contact enregistrée.",
    contact_not_found: "Enregistrez d'abord une fiche contact pour cette Organization.",
    invalid_consent: "Valeur de consentement invalide.",
    invalid_source: "Source de consentement invalide.",
    consent_updated: "Consentement marketing mis à jour.",
    invalid_consent_version: "Version du texte de consentement inconnue.",
    consent_evidence_required: "Un accord exige une preuve décrite.",
    invalid_consent_evidence: "Preuve trop longue (500 caractères maximum).",
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

  financeSectionManualInvoicing: "Facturation manuelle Afrique & rappels",
  financeManualInvoicesDueXaf: "Factures dues (XAF)",
  financeManualInvoicesOverdueXaf: "Factures en retard (XAF)",
  financeArchivedOpenInvoicesXaf: "Factures ouvertes d'Organizations archivées (XAF, hors encours)",
  financeExcludedArchivedSubscriptions: "Abonnements d'Organizations archivées exclus du revenu attendu",
  financeManualPaymentsConfirmed: "Paiements manuels confirmés (période)",
  financeManualPaymentsCollectedXaf: "Encaissé facturation manuelle (XAF)",
  financeManualPaymentsCollectedCad: "Encaissé facturation manuelle (CAD)",
  financeRemindersSent: "Rappels envoyés (période)",
  financeRemindersDueNow: "Rappels à envoyer (aujourd'hui)",
  financePaymentFailures: "Échecs de paiement (période)",

  lifecycleSectionTitle: "Cycle de vie de l'Organization",
  lifecycleCurrentStatus: "Statut actuel",
  lifecycleActionSuspend: "Suspendre",
  lifecycleActionReactivate: "Réactiver",
  lifecycleActionArchive: "Archiver",
  lifecycleActionRestore: "Restaurer",
  lifecycleSuspendConfirmText:
    "Cette Organization sera suspendue : ses membres perdront tout accès aux fonctionnalités métier jusqu'à réactivation. Aucune donnée n'est supprimée.",
  lifecycleReactivateConfirmText:
    "Cette Organization redevient active : ses membres retrouvent immédiatement leurs accès habituels.",
  lifecycleArchiveConfirmText:
    "Cette Organization sera archivée : ses membres perdront tout accès jusqu'à restauration. Aucune donnée n'est supprimée — l'archivage reste réversible.",
  lifecycleRestoreConfirmText: "Cette Organization redevient active et ses membres retrouvent leurs accès.",
  lifecycleArchiveNameLabel: "Tapez le nom exact de l'Organization pour confirmer",

  membersSectionTitle: "Membres",
  colEmail: "Courriel",
  colRole: "Rôle",
  noMembers: "Aucun membre.",
  actionDisableMember: "Désactiver",
  actionReactivateMember: "Réactiver",
  actionTransferOwnership: "Transférer la propriété",
  memberDisableConfirmText:
    "Ce membre sera désactivé dans cette Organization uniquement : il perd immédiatement tout accès à celle-ci. Son compte et ses accès aux autres Organizations ne sont pas modifiés.",
  memberReactivateConfirmText: "Ce membre redevient actif et retrouve ses accès habituels.",
  transferOwnershipConfirmText:
    "La propriété de cette Organization sera transférée à ce membre. Le propriétaire actuel devient gestionnaire.",

  notesSectionTitle: "Notes internes Admin",
  actionAddNote: "Ajouter une note",
  noNotes: "Aucune note interne.",
  formNoteLabel: "Note interne (obligatoire, jamais visible de l'Organization)",

  lifecycleHistoryTitle: "Journal d'audit — Organization & membres",
  noLifecycleHistory: "Aucune action enregistrée pour cette Organization.",
  colActor: "Auteur",
  colTarget: "Cible",
  lifecycleActionLabels: {
    "member.invited": "Membre invité",
    "member.invitation_resent": "Invitation renvoyée",
    "member.invitation_revoked": "Invitation révoquée",
    "member.invitation_accepted": "Invitation acceptée",
    "member.role_changed": "Rôle modifié",
    "member.revoked": "Membre révoqué (self-service)",
    "owner.transferred": "Propriété transférée (self-service)",
    "payment.reversed": "Paiement annulé",
    "document.invalidated": "Document invalidé",
    "tenant_portal.invited": "Portail locataire — invité",
    "tenant_portal.invitation_resent": "Portail locataire — invitation renvoyée",
    "tenant_portal.invitation_accepted": "Portail locataire — invitation acceptée",
    "tenant_portal.revoked": "Portail locataire — révoqué",
    "tenant_portal.reactivated": "Portail locataire — réactivé",
    "contract.generated": "Contrat généré",
    "contract.validated": "Contrat validé",
    "contract.owner_signed": "Contrat signé (propriétaire)",
    "contract.sent": "Contrat envoyé",
    "contract.tenant_viewed": "Contrat consulté (locataire)",
    "contract.tenant_signed": "Contrat signé (locataire)",
    "contract.finalized": "Contrat finalisé",
    "contract.cancelled": "Contrat annulé",
    "organization.suspended": "Organization suspendue",
    "organization.reactivated": "Organization réactivée",
    "organization.archived": "Organization archivée",
    "organization.restored": "Organization restaurée",
    "member.disabled_by_admin": "Membre désactivé par un Admin",
    "member.reactivated_by_admin": "Membre réactivé par un Admin",
    "owner.transferred_by_admin": "Propriété transférée par un Admin",
    "admin.note_added": "Note interne ajoutée",
  },

  navOperations: "Opérations",
  navPartners: "Partenaires",
  navContacts: "Contacts",
  contactsTitle: "Contacts commerciaux",
  contactsLead:
    "Coordonnées et consentement marketing par Organization. Aucune inscription automatique à une newsletter — saisie manuelle uniquement, jamais d'envoi de campagne depuis cette console.",
  searchByNameOrEmail: "Rechercher par Organization ou courriel",
  colPhone: "Téléphone",
  colCountry: "Pays",
  colLanguage: "Langue",
  colConsent: "Consentement marketing",
  consentYes: "Consentant",
  consentNo: "Non consentant",
  consentUnsubscribed: "Désabonné",
  noContactRecorded: "Aucune fiche contact enregistrée.",
  colMarketingEligible: "Éligible marketing",
  marketingEligibleYes: "Éligible",
  marketingEligibleNo: "Non éligible",
  consentVersionLabel: (version) => `Version du texte de consentement : ${version}`,
  consentEvidenceLabel: "Preuve du consentement (obligatoire) — canal, date, référence du formulaire signé…",
  consentEvidenceOptionalLabel: "Précision sur le retrait (facultatif)",
  consentEvidenceRequired: "Décrivez la preuve du consentement (au moins 3 caractères).",
  actionEditContact: "Modifier la fiche",
  actionGrantConsent: "Marquer consentant",
  actionUnsubscribe: "Désabonner",
  exportCsv: "Exporter en CSV",
  formPhoneOptional: "Téléphone (facultatif)",
  formCountry: "Pays",
  formLanguage: "Langue de communication",
  editContactConfirmText: "Ces coordonnées seront enregistrées pour cette Organization.",
  grantConsentConfirmText:
    "Cette Organization sera marquée comme ayant consenti à recevoir des communications marketing, à la date d'aujourd'hui.",
  unsubscribeConfirmText: "Cette Organization sera marquée comme désabonnée des communications marketing.",
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
  organizationsArchived: "Archived",
  organizationsRequiringProviderAction: (count) =>
    `${count} suspended/archived Organization(s) still have an active provider subscription: manual action required (never cancelled automatically).`,
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
  filterStatusArchived: "Archived",
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
  orgDetailProviderActionRequired:
    "This Organization is suspended or archived, but its subscription is still linked to an active, non-cancelled provider. No automatic cancellation is performed: manual action is required.",
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

    // REVENUE-01H — Admin lifecycle.
    suspended: "Organization suspended.",
    already_suspended: "This Organization was already suspended.",
    organization_archived: "This Organization is archived: restore it first.",
    already_active: "This Organization is already active.",
    reactivated: "Organization reactivated.",
    already_archived: "This Organization was already archived.",
    name_confirmation_mismatch: "The name entered does not exactly match the Organization's name.",
    archived: "Organization archived.",
    not_archived: "This Organization is not archived.",
    restored: "Organization restored.",
    membership_not_found: "Member not found.",
    already_disabled: "This member was already disabled.",
    owner_transfer_required: "An owner cannot be disabled directly: transfer ownership first.",
    disabled: "Member disabled.",
    no_active_owner: "No active owner found for this Organization.",
    already_owner: "This member is already the owner.",
    verified_target_required: "The targeted member must confirm their email first.",
    transferred: "Ownership transferred.",
    note_added: "Internal note added.",

    // REVENUE-01I — Commercial contacts.
    invalid_phone: "Invalid phone number.",
    country_required: "Country is required.",
    invalid_language: "Invalid language.",
    saved: "Contact record saved.",
    contact_not_found: "Save a contact record for this Organization first.",
    invalid_consent: "Invalid consent value.",
    invalid_source: "Invalid consent source.",
    consent_updated: "Marketing consent updated.",
    invalid_consent_version: "Unknown consent wording version.",
    consent_evidence_required: "An opt-in requires a described proof.",
    invalid_consent_evidence: "Proof too long (500 characters maximum).",
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

  financeSectionManualInvoicing: "Manual Africa invoicing & reminders",
  financeManualInvoicesDueXaf: "Invoices due (XAF)",
  financeManualInvoicesOverdueXaf: "Overdue invoices (XAF)",
  financeArchivedOpenInvoicesXaf: "Open invoices of archived Organizations (XAF, excluded)",
  financeExcludedArchivedSubscriptions: "Archived Organizations' subscriptions excluded from expected revenue",
  financeManualPaymentsConfirmed: "Manual payments confirmed (period)",
  financeManualPaymentsCollectedXaf: "Collected via manual invoicing (XAF)",
  financeManualPaymentsCollectedCad: "Collected via manual invoicing (CAD)",
  financeRemindersSent: "Reminders sent (period)",
  financeRemindersDueNow: "Reminders due (today)",
  financePaymentFailures: "Payment failures (period)",

  lifecycleSectionTitle: "Organization lifecycle",
  lifecycleCurrentStatus: "Current status",
  lifecycleActionSuspend: "Suspend",
  lifecycleActionReactivate: "Reactivate",
  lifecycleActionArchive: "Archive",
  lifecycleActionRestore: "Restore",
  lifecycleSuspendConfirmText:
    "This Organization will be suspended: its members will lose all access to business features until reactivated. No data is deleted.",
  lifecycleReactivateConfirmText:
    "This Organization becomes active again: its members immediately regain their usual access.",
  lifecycleArchiveConfirmText:
    "This Organization will be archived: its members will lose all access until restored. No data is deleted — archiving remains reversible.",
  lifecycleRestoreConfirmText: "This Organization becomes active again and its members regain their access.",
  lifecycleArchiveNameLabel: "Type the Organization's exact name to confirm",

  membersSectionTitle: "Members",
  colEmail: "Email",
  colRole: "Role",
  noMembers: "No members.",
  actionDisableMember: "Disable",
  actionReactivateMember: "Reactivate",
  actionTransferOwnership: "Transfer ownership",
  memberDisableConfirmText:
    "This member will be disabled in this Organization only: they immediately lose all access to it. Their account and access to other Organizations are unchanged.",
  memberReactivateConfirmText: "This member becomes active again and regains their usual access.",
  transferOwnershipConfirmText:
    "Ownership of this Organization will be transferred to this member. The current owner becomes a manager.",

  notesSectionTitle: "Internal admin notes",
  actionAddNote: "Add a note",
  noNotes: "No internal notes.",
  formNoteLabel: "Internal note (required, never visible to the Organization)",

  lifecycleHistoryTitle: "Audit log — Organization & members",
  noLifecycleHistory: "No action recorded for this Organization.",
  colActor: "Actor",
  colTarget: "Target",
  lifecycleActionLabels: {
    "member.invited": "Member invited",
    "member.invitation_resent": "Invitation resent",
    "member.invitation_revoked": "Invitation revoked",
    "member.invitation_accepted": "Invitation accepted",
    "member.role_changed": "Role changed",
    "member.revoked": "Member revoked (self-service)",
    "owner.transferred": "Ownership transferred (self-service)",
    "payment.reversed": "Payment reversed",
    "document.invalidated": "Document invalidated",
    "tenant_portal.invited": "Tenant portal — invited",
    "tenant_portal.invitation_resent": "Tenant portal — invitation resent",
    "tenant_portal.invitation_accepted": "Tenant portal — invitation accepted",
    "tenant_portal.revoked": "Tenant portal — revoked",
    "tenant_portal.reactivated": "Tenant portal — reactivated",
    "contract.generated": "Contract generated",
    "contract.validated": "Contract validated",
    "contract.owner_signed": "Contract signed (owner)",
    "contract.sent": "Contract sent",
    "contract.tenant_viewed": "Contract viewed (tenant)",
    "contract.tenant_signed": "Contract signed (tenant)",
    "contract.finalized": "Contract finalized",
    "contract.cancelled": "Contract cancelled",
    "organization.suspended": "Organization suspended",
    "organization.reactivated": "Organization reactivated",
    "organization.archived": "Organization archived",
    "organization.restored": "Organization restored",
    "member.disabled_by_admin": "Member disabled by an Admin",
    "member.reactivated_by_admin": "Member reactivated by an Admin",
    "owner.transferred_by_admin": "Ownership transferred by an Admin",
    "admin.note_added": "Internal note added",
  },

  navOperations: "Operations",
  navPartners: "Partners",
  navContacts: "Contacts",
  contactsTitle: "Commercial contacts",
  contactsLead:
    "Contact details and marketing consent by Organization. No automatic newsletter sign-up — manual entry only, and this console never sends any campaign.",
  searchByNameOrEmail: "Search by Organization or email",
  colPhone: "Phone",
  colCountry: "Country",
  colLanguage: "Language",
  colConsent: "Marketing consent",
  consentYes: "Opted in",
  consentNo: "Not opted in",
  consentUnsubscribed: "Unsubscribed",
  noContactRecorded: "No contact record saved.",
  colMarketingEligible: "Marketing eligible",
  marketingEligibleYes: "Eligible",
  marketingEligibleNo: "Not eligible",
  consentVersionLabel: (version) => `Consent wording version: ${version}`,
  consentEvidenceLabel: "Proof of consent (required) — channel, date, signed form reference…",
  consentEvidenceOptionalLabel: "Note about the withdrawal (optional)",
  consentEvidenceRequired: "Describe the proof of consent (at least 3 characters).",
  actionEditContact: "Edit record",
  actionGrantConsent: "Mark as opted in",
  actionUnsubscribe: "Unsubscribe",
  exportCsv: "Export as CSV",
  formPhoneOptional: "Phone (optional)",
  formCountry: "Country",
  formLanguage: "Communication language",
  editContactConfirmText: "This contact information will be saved for this Organization.",
  grantConsentConfirmText:
    "This Organization will be marked as having consented to receive marketing communications, as of today.",
  unsubscribeConfirmText: "This Organization will be marked as unsubscribed from marketing communications.",
};

export const ADMIN_COPY = { fr, en } as const;
export type AdminLanguage = keyof typeof ADMIN_COPY;

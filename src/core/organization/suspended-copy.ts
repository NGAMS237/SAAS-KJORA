// =============================================================================
// KJORA — Textes FR/EN du contexte limité « Organization suspendue/archivée »
// =============================================================================
// Module PUR (testable sans Next.js). Les deux dictionnaires implémentent le
// même type : une clé manquante dans une langue ne compile pas.
//
// Règle de contenu : jamais le motif interne d'une suspension, jamais une note
// Admin, jamais le nom de l'administrateur — uniquement l'état, ce qui reste
// possible et comment obtenir de l'aide.
// =============================================================================

export type SuspendedLanguage = "fr" | "en";

export type SuspendedCopy = {
  eyebrow: string;
  titleSuspended: (name: string) => string;
  titleArchived: (name: string) => string;
  leadSuspended: string;
  leadArchived: string;
  unavailableTitle: string;
  unavailableItems: string[];
  noAutomaticReactivation: string;
  switcherLabel: string;
  statusSuspended: string;
  statusArchived: string;
  supportTitle: string;
  supportLead: string;
  billingTitle: string;
  billingLead: string;
  billingStatus: string;
  billingPlan: string;
  billingNoInvoices: string;
  invoiceNumber: string;
  invoiceStatus: string;
  invoiceAmount: string;
  invoiceDueOn: string;
  invoiceDownload: string;
  exportTitle: string;
  exportLead: string;
  exportXlsx: string;
  exportCsvProperties: string;
  exportOwnerOnly: string;
  archivedNoAccess: string;
  portalLink: string;
  activeOrganizationsLink: string;
  bannerSuspended: (name: string) => string;
  bannerArchived: (name: string) => string;
  bannerLink: string;
};

const fr: SuspendedCopy = {
  eyebrow: "Accès limité",
  titleSuspended: (name) => `L'Organization ${name || "sélectionnée"} est suspendue`,
  titleArchived: (name) => `L'Organization ${name || "sélectionnée"} est archivée`,
  leadSuspended:
    "Les fonctions de gestion sont temporairement indisponibles. Vos données sont conservées : rien n'a été supprimé.",
  leadArchived:
    "Cette Organization a été archivée. Ses données sont conservées, mais aucune action n'est possible avant sa restauration par l'équipe KJORA.",
  unavailableTitle: "Temporairement indisponible",
  unavailableItems: [
    "Biens, logements, locataires et baux",
    "Loyers, paiements, reçus et documents",
    "Contrats, équipe et paramètres",
  ],
  noAutomaticReactivation:
    "L'accès complet sera rétabli uniquement par l'équipe KJORA. Contactez le support pour toute question.",
  switcherLabel: "Organization",
  statusSuspended: "Suspendue",
  statusArchived: "Archivée",
  supportTitle: "Aide et support",
  supportLead: "Écrivez-nous : votre demande est rattachée à cette Organization.",
  billingTitle: "Facturation et régularisation",
  billingLead: "Consultez l'état de votre abonnement et téléchargez vos factures pour régulariser votre situation.",
  billingStatus: "Statut de l'abonnement",
  billingPlan: "Forfait",
  billingNoInvoices: "Aucune facture pour le moment.",
  invoiceNumber: "Facture",
  invoiceStatus: "Statut",
  invoiceAmount: "Montant",
  invoiceDueOn: "Échéance",
  invoiceDownload: "Télécharger (PDF)",
  exportTitle: "Exporter vos données",
  exportLead: "Export en lecture seule, réservé au propriétaire. Aucune donnée n'est modifiée.",
  exportXlsx: "Exporter le classeur complet (XLSX)",
  exportCsvProperties: "Exporter les biens (CSV)",
  exportOwnerOnly: "Seul le propriétaire de l'Organization peut exporter ses données pendant la suspension.",
  archivedNoAccess:
    "Facturation et export ne sont pas disponibles pour une Organization archivée : demandez sa restauration au support.",
  portalLink: "Accéder à mon espace locataire",
  activeOrganizationsLink: "Retour à mes Organizations actives",
  bannerSuspended: (name) => `L'Organization ${name} est suspendue : fonctions de gestion indisponibles.`,
  bannerArchived: (name) => `L'Organization ${name} est archivée.`,
  bannerLink: "Voir les accès disponibles",
};

const en: SuspendedCopy = {
  eyebrow: "Limited access",
  titleSuspended: (name) => `The Organization ${name || "selected"} is suspended`,
  titleArchived: (name) => `The Organization ${name || "selected"} is archived`,
  leadSuspended:
    "Management features are temporarily unavailable. Your data is kept: nothing has been deleted.",
  leadArchived:
    "This Organization has been archived. Its data is kept, but no action is possible until the KJORA team restores it.",
  unavailableTitle: "Temporarily unavailable",
  unavailableItems: [
    "Properties, units, tenants and leases",
    "Rent, payments, receipts and documents",
    "Contracts, team and settings",
  ],
  noAutomaticReactivation:
    "Full access will only be restored by the KJORA team. Contact support with any question.",
  switcherLabel: "Organization",
  statusSuspended: "Suspended",
  statusArchived: "Archived",
  supportTitle: "Help and support",
  supportLead: "Write to us: your request is linked to this Organization.",
  billingTitle: "Billing and settlement",
  billingLead: "Check your subscription status and download your invoices to settle your account.",
  billingStatus: "Subscription status",
  billingPlan: "Plan",
  billingNoInvoices: "No invoices yet.",
  invoiceNumber: "Invoice",
  invoiceStatus: "Status",
  invoiceAmount: "Amount",
  invoiceDueOn: "Due on",
  invoiceDownload: "Download (PDF)",
  exportTitle: "Export your data",
  exportLead: "Read-only export, reserved for the owner. No data is modified.",
  exportXlsx: "Export the full workbook (XLSX)",
  exportCsvProperties: "Export properties (CSV)",
  exportOwnerOnly: "Only the Organization owner can export its data during the suspension.",
  archivedNoAccess:
    "Billing and export are not available for an archived Organization: ask support to restore it.",
  portalLink: "Go to my tenant space",
  activeOrganizationsLink: "Back to my active Organizations",
  bannerSuspended: (name) => `The Organization ${name} is suspended: management features are unavailable.`,
  bannerArchived: (name) => `The Organization ${name} is archived.`,
  bannerLink: "See available access",
};

export const SUSPENDED_COPY: Record<SuspendedLanguage, SuspendedCopy> = { fr, en };

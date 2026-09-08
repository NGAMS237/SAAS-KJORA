// =============================================================================
// Faits légaux — source unique, séparation stricte entre établi et non établi
// =============================================================================
// Hiérarchie canonique (D-143) :
//   • VERALUZ SARL  = entité juridique, éditeur du service
//   • KJEMO Studios = activité / marque numérique et SaaS de VERALUZ SARL
//   • KJORA         = produit SaaS développé et exploité par KJEMO Studios
//
// KJEMO Studios n'a ni personnalité morale distincte, ni RCCM, ni NIU, ni
// capital, ni siège propres. Il ne doit jamais être écrit « KJEMO Studios SARL »,
// ni présenté comme filiale, sous-entreprise ou groupe.
//
// Ce module ne contient que des informations établies. Ce qui relève encore
// d'une revue juridique est marqué LEGAL_REVIEW_REQUIRED et affiché comme tel.
// =============================================================================

export const LEGAL_REVIEW_REQUIRED = "LEGAL REVIEW REQUIRED" as const;
export const LEGAL_REVIEW_BEFORE_LAUNCH =
  "LEGAL REVIEW REQUIRED BEFORE PUBLIC COMMERCIAL LAUNCH" as const;

// ---------------------------------------------------------------------------
// Identité canonique
// ---------------------------------------------------------------------------

export const EDITEUR_NOM = "STE VERALUZ SARL" as const;
export const MARQUE_NOM = "KJEMO Studios" as const;
export const PRODUIT_NOM = "KJORA" as const;

/** Formulation de référence, à réutiliser telle quelle. */
export const FORMULATION_CANONIQUE =
  "KJORA est un logiciel SaaS développé et exploité par KJEMO Studios, activité numérique et SaaS de VERALUZ SARL." as const;

export const MARQUE_DESCRIPTION =
  "Activité et marque de VERALUZ SARL dédiée au développement logiciel, aux solutions SaaS, aux services numériques et à l’accompagnement informatique." as const;

export type LegalField = { libelle: string; valeur: string | null };

/** Identification de l'éditeur. `null` = encore soumis à revue juridique. */
export const EDITEUR_FIELDS: LegalField[] = [
  { libelle: "Dénomination sociale", valeur: EDITEUR_NOM },
  { libelle: "Forme juridique", valeur: "Société à responsabilité limitée pluripersonnelle (SARL)" },
  { libelle: "Capital social", valeur: "900 000 FCFA" },
  { libelle: "Numéro d’identifiant unique (NIU)", valeur: "M062618820539S" },
  { libelle: "RCCM", valeur: "CM-NSI-02-2026-B12-00615" },
  { libelle: "Date d’immatriculation", valeur: "29/06/2026" },
  { libelle: "Durée de la société", valeur: "99 ans" },
  { libelle: "Siège social", valeur: "Yaoundé, AWAE – ESCALIER, Cameroun" },
  // Non encore arrêtés : affichés comme tels, jamais devinés.
  { libelle: "Directeur de la publication", valeur: null },
  { libelle: "Délégué à la protection des données", valeur: null },
];

/** Champs encore soumis à revue juridique, hors identification de l'éditeur. */
export const LEGAL_OPEN_ITEMS: string[] = [
  "Droits des personnes selon les juridictions concernées (Cameroun et diaspora)",
  "Matrice de conservation légale par type de document et par juridiction",
  "Clauses contractuelles applicables au service",
  "Politique de confidentialité définitive",
  "Conditions générales d’utilisation",
  "Conditions générales de vente",
];

// ---------------------------------------------------------------------------
// Sous-traitants techniques réellement utilisés
// ---------------------------------------------------------------------------

export type Processor = { nom: string; role: string; localisation: string | null };

export const PROCESSORS: Processor[] = [
  { nom: "Vercel", role: "Hébergement de l’application web", localisation: null },
  {
    nom: "Supabase",
    role: "Base de données PostgreSQL, authentification et stockage de fichiers",
    localisation: "Paris",
  },
  {
    nom: "Resend",
    role: "Envoi des emails d’authentification et des emails transactionnels",
    localisation: null,
  },
];

// ---------------------------------------------------------------------------
// Données traitées
// ---------------------------------------------------------------------------

export type DataCategory = { categorie: string; contenu: string; finalite: string };

export const DATA_CATEGORIES: DataCategory[] = [
  {
    categorie: "Compte et identité",
    contenu: "Adresse email, identifiant technique, date de création, dernière connexion.",
    finalite: "Vous authentifier sans mot de passe et rattacher vos actions à votre compte.",
  },
  {
    categorie: "Organisation",
    contenu: "Nom, pays, devise, langue, fuseau horaire, moyen déclaré de réception des loyers.",
    finalite: "Isoler vos données de celles des autres organisations et configurer votre espace.",
  },
  {
    categorie: "Biens et logements",
    contenu: "Nom, localité, type, loyer de référence, état d’archivage.",
    finalite: "Constituer votre portefeuille locatif.",
  },
  {
    categorie: "Locataires",
    contenu: "Nom, téléphone et email lorsqu’ils sont renseignés par vous.",
    finalite: "Rattacher un bail à une personne et, si vous l’activez, ouvrir un accès portail.",
  },
  {
    categorie: "Baux, échéances et paiements",
    contenu: "Conditions financières, échéances générées, paiements que vous enregistrez, allocations, écritures comptables.",
    finalite: "Produire la situation locative réelle : ce qui est dû, encaissé, en retard.",
  },
  {
    categorie: "Documents",
    contenu: "Reçus, quittances, avis, états de compte et contrats, stockés en PDF privés.",
    finalite: "Vous fournir des justificatifs opposables et les mettre à disposition du locataire concerné.",
  },
  {
    categorie: "Signatures de contrat",
    contenu: "Identifiant du signataire, horodatage, méthode, empreinte du document signé.",
    finalite: "Attester qu’un contrat donné a été signé par une partie donnée, à une date donnée.",
  },
  {
    categorie: "Journal d’activité et audit",
    contenu: "Événements métier, actions sensibles, accès au portail locataire.",
    finalite: "Sécurité, traçabilité et résolution des litiges.",
  },
  {
    categorie: "Support",
    contenu: "Votre message, votre organisation, votre rôle et votre email de contact.",
    finalite: "Traiter votre demande d’aide.",
  },
];

// ---------------------------------------------------------------------------
// Conservation
// ---------------------------------------------------------------------------

export type RetentionRule = { objet: string; duree: string; source: string };

export const RETENTION_RULES: RetentionRule[] = [
  { objet: "Données opérationnelles après résiliation ou blocage du compte", duree: "12 mois", source: "D-140" },
  { objet: "Journal d’accès au portail locataire", duree: "12 mois", source: "D-065" },
  { objet: "Invitation à rejoindre une organisation", duree: "7 jours", source: "D-041" },
  { objet: "Invitation au portail locataire", duree: "7 jours", source: "D-053" },
  { objet: "Code à usage unique reçu par email", duree: "10 minutes", source: "D-053" },
  { objet: "Lien de connexion sécurisé", duree: "15 minutes", source: "D-053" },
  { objet: "Session du portail locataire", duree: "30 jours maximum", source: "D-054" },
  { objet: "Lien de téléchargement d’un document", duree: "120 secondes", source: "D-111, D-138" },
];

// ---------------------------------------------------------------------------
// Sécurité
// ---------------------------------------------------------------------------

export type SecurityMeasure = { titre: string; description: string };

export const SECURITY_MEASURES: SecurityMeasure[] = [
  {
    titre: "Authentification sans mot de passe",
    description:
      "L’accès repose sur un lien sécurisé ou un code à usage unique envoyé par email. Aucun mot de passe n’est créé, stocké ni transmis. Les liens et codes expirent et ne servent qu’une fois.",
  },
  {
    titre: "Isolation entre organisations",
    description:
      "Chaque organisation est un espace autonome. Les règles d’isolation sont appliquées dans la base de données elle-même, et non seulement dans l’interface : une requête portant sur une organisation dont vous n’êtes pas membre ne renvoie rien.",
  },
  {
    titre: "Refus par défaut",
    description:
      "Aucune permission n’est implicite. Chaque rôle donne accès à un ensemble explicite d’actions, revérifié côté serveur à chaque opération sensible.",
  },
  {
    titre: "Aucune clé d’administration dans le navigateur",
    description:
      "La clé d’accès privilégiée à la base de données n’est jamais envoyée au navigateur. Les opérations sensibles passent par une frontière serveur.",
  },
  {
    titre: "Documents privés",
    description:
      "Les reçus, quittances et contrats sont stockés dans des espaces privés. Aucun lien public permanent n’existe : chaque téléchargement passe par un lien signé valable 120 secondes, délivré après vérification de vos droits.",
  },
  {
    titre: "Intégrité des contrats signés",
    description:
      "Un contrat finalisé est figé et accompagné d’une empreinte cryptographique. Toute modification ultérieure passe par un avenant distinct, jamais par une réécriture silencieuse.",
  },
  {
    titre: "Historique financier non réinscriptible",
    description:
      "Les paiements confirmés et les écritures comptables ne sont jamais modifiés ni supprimés. Une correction produit une écriture compensatoire motivée et tracée.",
  },
  {
    titre: "Accès du locataire strictement délimité",
    description:
      "L’accès au portail est distinct des comptes internes. Il est limité aux baux explicitement autorisés et sa révocation est immédiate.",
  },
  {
    titre: "Journal d’audit",
    description:
      "Les actions sensibles — gestion des membres, corrections financières, cycle de vie des contrats — sont journalisées et consultables par le propriétaire du compte.",
  },
  {
    titre: "Séparation des environnements",
    description:
      "L’environnement de production ne partage ni base de données, ni authentification, ni stockage, ni secrets avec les environnements de développement.",
  },
];

/** Aucune certification n'est détenue : la page Sécurité doit le dire. */
export const CERTIFICATIONS_NON_DETENUES = ["SOC 2", "ISO 27001", "HDS"] as const;

// =============================================================================
// Faits légaux — source unique, séparation stricte entre vérifiable et inconnu
// =============================================================================
// Règle absolue : ce module ne contient que des informations réellement
// établies dans le dépôt canonique ou observables sur le déploiement.
//
// Tout ce qui relève de l'identité juridique de l'éditeur — raison sociale,
// forme, immatriculation, siège, directeur de publication, DPO — n'est PAS
// canonisé dans ce dépôt et n'est donc PAS écrit ici. Ces champs sont marqués
// LEGAL_REVIEW_REQUIRED et affichés comme tels, jamais devinés.
//
// Note : « VERALUZ » n'apparaît dans le dépôt que comme projet Supabase
// distinct dont KJORA doit rester isolé (D-011, D-074). Ce n'est pas une
// désignation d'éditeur et ne doit pas être utilisée comme telle.
// =============================================================================

export const LEGAL_REVIEW_REQUIRED = "LEGAL REVIEW REQUIRED" as const;

export type LegalField = { libelle: string; valeur: string | null };

/** Champs d'identification obligatoires non établis dans le dépôt canonique. */
export const EDITEUR_FIELDS: LegalField[] = [
  { libelle: "Dénomination sociale de l’éditeur", valeur: null },
  { libelle: "Forme juridique", valeur: null },
  { libelle: "Numéro d’immatriculation", valeur: null },
  { libelle: "Siège social", valeur: null },
  { libelle: "Directeur de la publication", valeur: null },
  { libelle: "Délégué à la protection des données", valeur: null },
];

/** Sous-traitants techniques réellement utilisés, vérifiables dans le dépôt. */
export type Processor = { nom: string; role: string; localisation: string | null };

export const PROCESSORS: Processor[] = [
  {
    nom: "Vercel",
    role: "Hébergement de l’application web",
    localisation: null,
  },
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

/** Catégories de données réellement traitées par le produit. */
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

/** Durées de conservation déjà arbitrées dans le dépôt canonique. */
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

/** Mesures de sécurité réellement implémentées et vérifiables dans le dépôt. */
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
export const CERTIFICATIONS_NON_DETENUES = [
  "SOC 2",
  "ISO 27001",
  "HDS",
] as const;

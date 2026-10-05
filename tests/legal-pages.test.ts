// =============================================================================
// Node tests — Pages légales bêta : aucune conformité inventée
// =============================================================================

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  EDITEUR_FIELDS,
  EDITEUR_NOM,
  MARQUE_NOM,
  PRODUIT_NOM,
  MARQUE_DESCRIPTION,
  FORMULATION_CANONIQUE,
  LEGAL_OPEN_ITEMS,
  PROCESSORS,
  DATA_CATEGORIES,
  RETENTION_RULES,
  SECURITY_MEASURES,
  CERTIFICATIONS_NON_DETENUES,
  LEGAL_REVIEW_REQUIRED,
  LEGAL_REVIEW_BEFORE_LAUNCH,
} from "../src/core/legal/legal-facts.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const mentions = read("../src/app/mentions-legales/page.tsx");
const confidentialite = read("../src/app/confidentialite/page.tsx");
const securite = read("../src/app/securite/page.tsx");
const footer = read("../src/core/ui/public-footer.tsx");
const envExample = read("../.env.example");
const supportApi = read("../src/app/api/support/route.ts");
const supportForm = read("../src/core/support/support-form.tsx");

const PAGES_LEGALES = [mentions, confidentialite, securite];

// ---------------------------------------------------------------------------
// Routes accessibles
// ---------------------------------------------------------------------------

test("les trois pages légales existent", () => {
  for (const route of ["mentions-legales", "confidentialite", "securite"]) {
    assert.ok(
      existsSync(new URL(`../src/app/${route}/page.tsx`, import.meta.url)),
      `page manquante : /${route}`,
    );
  }
});

test("les pages légales sont publiques : aucune session requise", () => {
  for (const page of PAGES_LEGALES) {
    assert.doesNotMatch(page, /requireUser|getActiveAuthorization|loadOrganizationContext/);
    assert.doesNotMatch(page, /redirect\(/);
  }
});

test("chaque page légale déclare un titre de métadonnées", () => {
  for (const page of PAGES_LEGALES) {
    assert.match(page, /export const metadata/);
    assert.match(page, /title:/);
  }
});

// ---------------------------------------------------------------------------
// Aucune conformité ni certification inventée
// ---------------------------------------------------------------------------

test("aucune revendication de conformité réglementaire", () => {
  const interdits = [
    "conforme au RGPD", "conforme RGPD", "RGPD-compliant", "GDPR compliant",
    "nous sommes conformes", "certifié", "certifiée", "certification obtenue",
    "agréé", "homologué",
  ];
  for (const page of PAGES_LEGALES.map(sansCommentaires)) {
    for (const mot of interdits) {
      assert.ok(!page.toLowerCase().includes(mot.toLowerCase()), `revendication interdite : ${mot}`);
    }
  }
});

test("aucune certification n'est revendiquée comme détenue", () => {
  // Les normes ne peuvent apparaître que dans la liste explicite de ce qui
  // n'est PAS détenu, jamais comme une possession.
  for (const norme of CERTIFICATIONS_NON_DETENUES) {
    assert.ok(!mentions.includes(norme), `${norme} ne doit pas figurer dans les mentions légales`);
    assert.ok(!confidentialite.includes(norme), `${norme} ne doit pas figurer dans la confidentialité`);
  }
  assert.match(securite, /ne détient aujourd’hui aucune certification/);
  assert.match(securite, /CERTIFICATIONS_NON_DETENUES/);
});

test("les pages portent l'avertissement de revue juridique", () => {
  assert.match(mentions, /LEGAL_REVIEW_REQUIRED|LEGAL REVIEW REQUIRED/);
  // La page référence la constante ; c'est elle qui porte le texte exact.
  assert.match(confidentialite, /LEGAL_REVIEW_BEFORE_LAUNCH|LEGAL REVIEW REQUIRED BEFORE PUBLIC COMMERCIAL LAUNCH/);
  assert.equal(LEGAL_REVIEW_REQUIRED, "LEGAL REVIEW REQUIRED");
  assert.equal(LEGAL_REVIEW_BEFORE_LAUNCH, "LEGAL REVIEW REQUIRED BEFORE PUBLIC COMMERCIAL LAUNCH");
});

// ---------------------------------------------------------------------------
// Aucune donnée d'identification inventée
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Identité canonique (D-143)
// ---------------------------------------------------------------------------

test("les champs d'identification établis sont renseignés, sans placeholder", () => {
  const attendus: Record<string, string> = {
    "Dénomination sociale": "STE VERALUZ SARL",
    "Forme juridique": "Société à responsabilité limitée pluripersonnelle (SARL)",
    "Capital social": "900 000 FCFA",
    "Numéro d’identifiant unique (NIU)": "M062618820539S",
    RCCM: "CM-NSI-02-2026-B12-00615",
    "Date d’immatriculation": "29/06/2026",
    "Durée de la société": "99 ans",
    "Siège social": "Yaoundé, AWAE – ESCALIER, Cameroun",
  };
  for (const [libelle, valeur] of Object.entries(attendus)) {
    const champ = EDITEUR_FIELDS.find((c) => c.libelle === libelle);
    assert.ok(champ, `champ absent : ${libelle}`);
    assert.equal(champ?.valeur, valeur, `valeur incorrecte pour ${libelle}`);
  }
});

test("seuls les champs non arrêtés restent en revue juridique", () => {
  const enRevue = EDITEUR_FIELDS.filter((c) => c.valeur === null).map((c) => c.libelle);
  assert.deepEqual(enRevue, [
    "Directeur de la publication",
    "Délégué à la protection des données",
  ]);
});

test("le siège publié est celui du RCCM, pas une adresse bancaire ou fiscale", () => {
  const siege = EDITEUR_FIELDS.find((c) => c.libelle === "Siège social")?.valeur ?? "";
  assert.match(siege, /Yaoundé/);
  assert.match(siege, /AWAE/);
  assert.match(siege, /Cameroun/);
  assert.doesNotMatch(siege, /banque|bancaire|agence|BP\s*\d/i);
});

test("VERALUZ SARL est présenté comme éditeur sur les pages légales", () => {
  assert.ok(mentions.includes("EDITEUR_NOM") || mentions.includes(EDITEUR_NOM));
  assert.match(mentions, /Éditeur du service/);
  assert.equal(EDITEUR_NOM, "STE VERALUZ SARL");
});

test("KJEMO Studios est une activité/marque, jamais une société autonome", () => {
  assert.equal(MARQUE_NOM, "KJEMO Studios");
  assert.match(MARQUE_DESCRIPTION, /[Aa]ctivité et marque de VERALUZ SARL/);

  // Scan de ce que voit l'utilisateur. Le document canonique est exclu : il
  // LISTE ces formulations comme proscrites, ce qu'un autre test vérifie.
  const visibles = [
    mentions, confidentialite, securite, footer, read("../src/app/contact/page.tsx"),
    read("../src/core/legal/legal-facts.ts"),
  ].map(sansCommentaires);
  for (const source of visibles) {
    assert.doesNotMatch(source, /KJEMO Studios SARL/i, "KJEMO ne doit jamais porter une forme juridique");
    assert.doesNotMatch(source, /KJEMO[^.]{0,60}\bfiliale\b/i, "KJEMO ne doit pas être qualifié de filiale");
    assert.doesNotMatch(source, /sous-entreprise/i, "terme « sous-entreprise » interdit");
  }
  // Le lien de subordination est explicite
  assert.match(mentions, /ne dispose pas d’une personnalité\s+juridique distincte/);
});

test("KJORA est présenté comme produit, et la formulation canonique est utilisée", () => {
  assert.equal(PRODUIT_NOM, "KJORA");
  assert.equal(
    FORMULATION_CANONIQUE,
    "KJORA est un logiciel SaaS développé et exploité par KJEMO Studios, activité numérique et SaaS de VERALUZ SARL.",
  );
  assert.match(mentions, /FORMULATION_CANONIQUE/);
});

test("aucune donnée bancaire ni personnelle d'associé n'est exposée", () => {
  // Le document canonique est exclu : sa section « données à ne jamais publier »
  // nomme précisément ces éléments pour les interdire.
  const sources = [...PAGES_LEGALES, footer, read("../src/core/legal/legal-facts.ts")]
    .map(sansCommentaires);
  for (const source of sources) {
    // IBAN, RIB, SWIFT/BIC, numéro de compte
    assert.doesNotMatch(source, /\bIBAN\b|\bRIB\b|\bSWIFT\b|\bBIC\b/i, "donnée bancaire exposée");
    assert.doesNotMatch(source, /CM\d{2}\s?\d{4}/, "IBAN camerounais exposé");
    assert.doesNotMatch(source, /num[ée]ro de compte|coordonn[ée]es bancaires\s*:/i);
    // Données personnelles d'associés
    assert.doesNotMatch(source, /date de naissance|né\(?e\)? le|pièce d’identité|passeport n/i);
  }
});

test("le document canonique d'identité existe et fixe la hiérarchie", () => {
  const doc = read("../docs/product/KJORA-LEGAL-IDENTITY-v0.1.md");
  assert.match(doc, /VERALUZ SARL/);
  assert.match(doc, /KJEMO Studios/);
  assert.match(doc, /KJORA/);
  assert.match(doc, /CM-NSI-02-2026-B12-00615/);
  assert.match(doc, /M062618820539S/);
  assert.match(doc, /900 000 FCFA/);
  // Le vocabulaire proscrit est explicitement listé
  for (const interdit of ["KJEMO Studios SARL", "filiale", "sous-entreprise", "groupe"]) {
    assert.ok(doc.includes(interdit), `vocabulaire proscrit non documenté : ${interdit}`);
  }
  // Ces mentions n'apparaissent que dans le tableau des interdits, jamais comme
  // affirmation — c'est ce qui justifie d'exclure ce document des scans.
  assert.match(doc, /## 5\. Vocabulaire imposé/);
  assert.match(doc, /\|\s*«?\s*KJEMO Studios SARL\s*»?\s*\|/);
  assert.match(doc, /## 6\. Données à ne jamais publier/);
  assert.doesNotMatch(doc, /Éditeur\s*:\s*KJEMO/i);
});

test("les points encore ouverts restent signalés", () => {
  assert.ok(LEGAL_OPEN_ITEMS.length >= 6);
  const joints = LEGAL_OPEN_ITEMS.join(" | ").toLowerCase();
  for (const attendu of ["droits des personnes", "conservation", "clauses", "confidentialité", "utilisation", "vente"]) {
    assert.ok(joints.includes(attendu), `point ouvert non listé : ${attendu}`);
  }
  assert.equal(LEGAL_REVIEW_BEFORE_LAUNCH, "LEGAL REVIEW REQUIRED BEFORE PUBLIC COMMERCIAL LAUNCH");
});

// ---------------------------------------------------------------------------
// Contenu factuel
// ---------------------------------------------------------------------------

test("les sous-traitants listés sont ceux réellement utilisés", () => {
  const noms = PROCESSORS.map((p) => p.nom);
  assert.deepEqual(noms, ["Vercel", "Supabase", "Resend"]);
  const supabase = PROCESSORS.find((p) => p.nom === "Supabase");
  assert.equal(supabase?.localisation, "Paris", "la région Supabase est canonisée");
});

test("la politique couvre toutes les catégories de données du produit", () => {
  const categories = DATA_CATEGORIES.map((c) => c.categorie.toLowerCase()).join(" | ");
  for (const attendu of ["compte", "organisation", "biens", "locataires", "paiements", "documents", "audit", "support"]) {
    assert.ok(categories.includes(attendu), `catégorie non couverte : ${attendu}`);
  }
  for (const c of DATA_CATEGORIES) {
    assert.ok(c.finalite.length > 10, `finalité manquante pour ${c.categorie}`);
  }
});

test("les durées de conservation citées sont rattachées à une décision", () => {
  assert.ok(RETENTION_RULES.length >= 6);
  for (const regle of RETENTION_RULES) {
    assert.match(regle.source, /D-\d{3}/, `durée sans décision source : ${regle.objet}`);
  }
});

test("les mesures de sécurité annoncées correspondent à l'implémentation", () => {
  const titres = SECURITY_MEASURES.map((m) => m.titre.toLowerCase()).join(" | ");
  for (const attendu of ["mot de passe", "isolation", "refus par défaut", "navigateur", "documents privés", "audit"]) {
    assert.ok(titres.includes(attendu), `mesure non décrite : ${attendu}`);
  }
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

test("le footer contient les liens légaux et d'aide", () => {
  for (const href of ["/aide", "/contact", "/securite", "/confidentialite", "/mentions-legales"]) {
    assert.ok(footer.includes(`href={\`${href}?locale=\${locale}\`}`), `lien manquant dans le footer : ${href}`);
  }
});

test("le footer est monté sur les surfaces publiques", () => {
  for (const page of [
    "../src/app/connexion/page.tsx",
    "../src/app/aide/page.tsx",
    "../src/app/contact/page.tsx",
    "../src/app/mentions-legales/page.tsx",
    "../src/app/confidentialite/page.tsx",
    "../src/app/securite/page.tsx",
  ]) {
    assert.match(read(page), /<PublicFooter \/>/, `footer absent de ${page}`);
  }
});

test("le footer n'alourdit pas la navigation principale", () => {
  const navigation = read("../src/core/navigation/navigation.ts");
  for (const href of ["/securite", "/confidentialite", "/mentions-legales"]) {
    assert.ok(!navigation.includes(href), `lien légal ajouté à tort dans la navigation : ${href}`);
  }
});

// ---------------------------------------------------------------------------
// Variables d'environnement
// ---------------------------------------------------------------------------

test("les variables du support sont documentées dans .env.example", () => {
  assert.match(envExample, /^KJORA_SUPPORT_EMAIL_TO=$/m);
  assert.match(envExample, /^NEXT_PUBLIC_KJORA_CONTACT_EMAIL=$/m);
});

test("aucune adresse email n'est codée en dur dans le code applicatif", () => {
  const racine = new URL("../src/", import.meta.url);
  const fichiers = readdirSync(racine, { recursive: true, encoding: "utf8" })
    .filter((c) => (c.endsWith(".ts") || c.endsWith(".tsx")) && !c.includes("rental-demo"));
  const fautifs: string[] = [];
  for (const chemin of fichiers) {
    const source = sansCommentaires(readFileSync(new URL(chemin, racine), "utf8"));
    // Tolère les placeholders d'interface et les TLD réservés aux exemples/tests
    // (RFC 2606 : .example, .test, .invalid ; example.com / exemple.com).
    const emails = source.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [];
    // NCE-01 : delivered@resend.dev est l'adresse de SIMULATION documentée par
    // Resend (aucune boîte réelle) — seule cible possible du test d'envoi.
    const suspects = emails.filter((e) => !/(exemple|example)\.com$|\.(test|example|invalid)$/.test(e) && e !== "delivered@resend.dev");
    if (suspects.length) fautifs.push(`${chemin} → ${suspects.join(", ")}`);
  }
  assert.deepEqual(fautifs, [], `email en dur : ${fautifs.join(" | ")}`);
});

test("le support se comporte proprement si la configuration email est absente", () => {
  assert.match(supportApi, /isSupportEmailConfigured/);
  assert.match(supportApi, /support_email_not_configured/);
  assert.match(supportApi, /status: 503/);
  // L'utilisateur reçoit un message compréhensible, pas une erreur brute
  assert.match(supportForm, /support_email_not_configured/);
  assert.match(supportForm, /n’est pas encore activé/);
});

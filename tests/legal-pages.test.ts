// =============================================================================
// Node tests — Pages légales bêta : aucune conformité inventée
// =============================================================================

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  EDITEUR_FIELDS,
  PROCESSORS,
  DATA_CATEGORIES,
  RETENTION_RULES,
  SECURITY_MEASURES,
  CERTIFICATIONS_NON_DETENUES,
  LEGAL_REVIEW_REQUIRED,
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
  assert.match(confidentialite, /LEGAL REVIEW REQUIRED BEFORE PUBLIC COMMERCIAL LAUNCH/);
  assert.equal(LEGAL_REVIEW_REQUIRED, "LEGAL REVIEW REQUIRED");
});

// ---------------------------------------------------------------------------
// Aucune donnée d'identification inventée
// ---------------------------------------------------------------------------

test("aucun champ d'identification de l'éditeur n'est renseigné", () => {
  for (const champ of EDITEUR_FIELDS) {
    assert.equal(champ.valeur, null, `champ inventé : ${champ.libelle}`);
  }
  // Les six champs obligatoires sont bien présents et affichés comme manquants
  const libelles = EDITEUR_FIELDS.map((c) => c.libelle.toLowerCase()).join(" ");
  for (const attendu of ["dénomination", "forme juridique", "immatriculation", "siège", "publication", "données"]) {
    assert.ok(libelles.includes(attendu), `champ obligatoire absent : ${attendu}`);
  }
});

test("aucun numéro d'immatriculation ni adresse ne figure dans les pages", () => {
  for (const page of PAGES_LEGALES.map(sansCommentaires)) {
    // SIRET (14 chiffres), SIREN (9), RCCM, numéro de TVA
    assert.doesNotMatch(page, /\b\d{9,14}\b/, "suite de chiffres évoquant une immatriculation");
    assert.doesNotMatch(page, /\bRCCM\b|\bSIRET\b|\bSIREN\b|\bTVA\s*:/i);
  }
});

test("VERALUZ n'est jamais présenté comme éditeur", () => {
  // Dans le dépôt, VERALUZ désigne uniquement un projet Supabase distinct
  // dont KJORA doit rester isolé (D-011, D-074).
  const facts = read("../src/core/legal/legal-facts.ts");
  for (const page of [...PAGES_LEGALES, footer]) {
    assert.doesNotMatch(page, /VERALUZ/i, "VERALUZ ne doit pas apparaître sur une page publique");
  }
  // Le module de faits documente explicitement pourquoi VERALUZ n'est pas l'éditeur.
  assert.match(facts, /VERALUZ/);
  assert.match(facts, /projet Supabase/);
  assert.match(facts, /pas une\s+\/\/ désignation d.éditeur|pas une désignation d.éditeur/);
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
    assert.ok(footer.includes(`href="${href}"`), `lien manquant dans le footer : ${href}`);
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
    const suspects = emails.filter((e) => !/(exemple|example)\.com$|\.(test|example|invalid)$/.test(e));
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

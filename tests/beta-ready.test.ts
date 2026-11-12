// =============================================================================
// Node tests — Bêta Découverte : support, aide, documents, analytics, UX
// =============================================================================

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  isSupportCategory,
  isValidSupportMessage,
} from "../src/core/support/model.ts";
import { internalPrimaryNavigation, internalSecondaryNavigation } from "../src/core/navigation/navigation.ts";
import { ANALYTICS_EVENTS } from "../src/core/analytics/events.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/**
 * Retire commentaires de ligne et de bloc.
 * Les commentaires expliquent souvent ce qu'on refuse d'exposer (« ni token, ni
 * PKCE ») : les scanner produirait des faux positifs. Seul le code compte.
 */
const sansCommentaires = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const supportApi = read("../src/app/api/support/route.ts");
const supportEmail = read("../src/core/support/support-email.ts");
const supportPage = read("../src/app/(internal)/app/support/page.tsx");
const documentsPage = read("../src/app/(internal)/app/documents/page.tsx");
const aidePage = read("../src/app/aide/page.tsx");
const contactPage = read("../src/app/contact/page.tsx");
const internalLayout = read("../src/app/(internal)/app/layout.tsx");
const tracker = read("../src/core/analytics/auth-completed-tracker.tsx");
const connexionPage = read("../src/app/connexion/page.tsx");

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

test("les catégories de support sont définies et validées", () => {
  assert.equal(SUPPORT_CATEGORIES.length, 6);
  assert.equal(isSupportCategory("connexion"), true);
  assert.equal(isSupportCategory("n_importe_quoi"), false);
  assert.equal(isSupportCategory(null), false);
  for (const c of SUPPORT_CATEGORIES) {
    assert.ok(SUPPORT_CATEGORY_LABELS[c]?.length > 0, `libellé manquant pour ${c}`);
  }
});

test("l'API support exige une session et une Organization active", () => {
  assert.match(supportApi, /getActiveAuthorization/);
  assert.match(supportApi, /unauthenticated/);
  assert.match(supportApi, /status: 401/);
});

test("l'API support ne fait jamais confiance à l'organisation déclarée par le client", () => {
  // REVENUE-LAUNCH-01 v3 : l'Organization est résolue par
  // loadAnyMembershipOrganization (aussi pour une Organization suspendue ou
  // archivée, afin que l'aide reste joignable). Un identifiant fourni par le
  // contexte limité n'est qu'une PRÉFÉRENCE : il n'est retenu que s'il figure
  // parmi les appartenances actives de l'utilisateur, lues en base. Le rôle,
  // le nom et l'identifiant transmis au support viennent toujours du serveur.
  assert.match(supportApi, /loadAnyMembershipOrganization\(requestedOrganizationId\)/);
  assert.doesNotMatch(supportApi, /body\.organization_id/);
  assert.doesNotMatch(supportApi, /body\.role/);
  assert.match(supportApi, /organizationId: active\.id/);
  assert.match(supportApi, /role: active\.role/);
  const loader = readFileSync(new URL("../src/core/organization/load-organization-context.ts", import.meta.url), "utf8");
  const body = loader.slice(loader.indexOf("export async function loadAnyMembershipOrganization"));
  assert.match(body, /requestedOrganizationId && membershipByOrganization\.has\(requestedOrganizationId\)/);
  assert.match(body, /\.eq\("status", "active"\)/, "seules les appartenances actives comptent");
});

test("l'API support est protégée contre le CSRF et valide le message", () => {
  assert.match(supportApi, /sameOrigin/);
  assert.match(supportApi, /invalid_message/);
  assert.match(supportApi, /isValidSupportMessage/);
});

test("les bornes du message de support sont appliquées", () => {
  assert.equal(isValidSupportMessage("court"), false, "trop court");
  assert.equal(isValidSupportMessage("   "), false, "espaces seuls");
  assert.equal(isValidSupportMessage(null), false);
  assert.equal(isValidSupportMessage("Je ne parviens pas à générer un reçu."), true);
  assert.equal(isValidSupportMessage("x".repeat(4001)), false, "trop long");
});

test("le support ne crée aucune table ni migration", () => {
  assert.doesNotMatch(supportApi, /create table|insert into|\.from\(/i);
  assert.doesNotMatch(supportEmail, /create table|insert into/i);
});

test("l'email de support échappe le HTML et ne transporte aucun secret", () => {
  assert.match(supportEmail, /escapeHtml/);
  assert.doesNotMatch(supportEmail, /password|token|verifier|secret_key/i);
});

test("demander de l'aide ne dépend d'aucune capability", () => {
  const support = internalSecondaryNavigation.find((e) => e.href === "/app/support");
  assert.ok(support, "entrée Support absente de la navigation");
  assert.equal(support?.requiredCapability, undefined, "le support ne doit exiger aucun rôle");
  assert.doesNotMatch(supportPage, /requiredCapability|notFound\(\)/);
});

// ---------------------------------------------------------------------------
// Documents — agrégation, jamais un moteur parallèle (D-142)
// ---------------------------------------------------------------------------

test("Documents est présent dans la navigation principale", () => {
  const docs = internalPrimaryNavigation.find((e) => e.href === "/app/documents");
  assert.ok(docs, "entrée Documents absente");
  assert.equal(docs?.label, "Documents");
});

test("Documents lit les modules existants et ne crée aucun stockage propre", () => {
  assert.match(documentsPage, /getFinancialDocuments/);
  assert.match(documentsPage, /FinancialDocumentsPanel/);
  assert.match(documentsPage, /getLeaseContracts/);
  // Aucune écriture, aucune table propre, aucun bucket
  assert.doesNotMatch(documentsPage, /insert|upsert|createBucket|\.storage\./i);
});

test("Documents revérifie RBAC puis entitlement de plan", () => {
  assert.match(documentsPage, /capabilities\.includes\("contract\.manage"\)/);
  assert.match(documentsPage, /requirePlanFeature/);
  // On compare dans le corps de la fonction : l'import de requirePlanFeature
  // se trouve en tête de fichier et fausserait la comparaison de position.
  const corps = documentsPage.slice(documentsPage.indexOf("export default"));
  const rbac = corps.indexOf('capabilities.includes("contract.manage")');
  const feature = corps.indexOf("requirePlanFeature");
  assert.ok(rbac > -1 && feature > -1);
  assert.ok(rbac < feature, "le RBAC doit précéder le contrôle d'entitlement");
});

test("Documents borne le parcours des baux", () => {
  assert.match(documentsPage, /MAX_LEASES_SCANNED/);
  assert.match(documentsPage, /contractsTruncated/);
});

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

test("auth_completed est réellement émis", () => {
  assert.ok((ANALYTICS_EVENTS as readonly string[]).includes("auth_completed"));
  assert.match(tracker, /trackEvent\("auth_completed"/);
  assert.match(internalLayout, /AuthCompletedTracker/);
});

test("le tracker auth_completed ne manipule aucune donnée sensible", () => {
  assert.doesNotMatch(sansCommentaires(tracker), /token|email|user_id|organization_id/i);
});

test("les 9 événements du funnel applicatif sont déclenchés dans le code", () => {
  // site_cta_clicked est émis par le site commercial, hors de ce dépôt.
  const appEvents = [
    "auth_started", "magic_link_sent", "auth_completed", "onboarding_started",
    "organization_created", "first_property_created", "first_unit_created",
    "onboarding_completed",
  ];
  const sources = [
    read("../src/core/auth/login-form.tsx"),
    read("../src/core/organization/organization-onboarding-form.tsx"),
    tracker,
  ].join("\n");
  for (const event of appEvents) {
    assert.match(sources, new RegExp(`trackEvent\\("${event}"`), `événement non émis : ${event}`);
  }
});

// ---------------------------------------------------------------------------
// Aide / connexion — aucun jargon technique
// ---------------------------------------------------------------------------

test("la page Aide couvre les cas de lien de connexion", () => {
  for (const sujet of ["pas reçu", "plus valable", "code à usage unique", "locataire"]) {
    assert.ok(aidePage.includes(sujet), `cas non couvert : ${sujet}`);
  }
  assert.match(aidePage, /\/connexion/);
  assert.match(aidePage, /\/app\/support/);
});

test("aucun jargon technique n'est exposé dans les pages publiques", () => {
  for (const source of [aidePage, contactPage].map(sansCommentaires)) {
    for (const jargon of ["PKCE", "token", "verifier", "OTP", "JWT", "RLS", "Supabase", "500"]) {
      assert.ok(!source.includes(jargon), `jargon exposé : ${jargon}`);
    }
  }
});

test("la page de connexion renvoie vers l'aide", () => {
  assert.match(connexionPage, /href="\/aide"/);
});

test("la page Contact ne fabrique aucune conformité juridique", () => {
  const visible = sansCommentaires(contactPage);
  for (const mot of ["RGPD", "conforme", "conformité", "certifié", "ISO", "SOC 2"]) {
    assert.ok(!visible.includes(mot), `allégation juridique non relue : ${mot}`);
  }
});

// ---------------------------------------------------------------------------
// Nettoyage UX bêta
// ---------------------------------------------------------------------------

test("aucun code d'écran interne n'est affiché à l'utilisateur", () => {
  // Balayage exhaustif des modules et surfaces vivants : une liste figée
  // laisserait passer les fichiers oubliés. rental-demo est du code mort non monté.
  const racine = new URL("../src/", import.meta.url);
  const fichiers = readdirSync(racine, { recursive: true, encoding: "utf8" })
    .filter((chemin) => chemin.endsWith(".tsx") && !chemin.includes("rental-demo"));

  assert.ok(fichiers.length > 20, "le balayage doit couvrir de nombreux fichiers");

  const fautifs: string[] = [];
  for (const chemin of fichiers) {
    const source = readFileSync(new URL(chemin, racine), "utf8");
    // eyebrow="SCR-XXX" / eyebrow="6C2" / <p className="eyebrow">6D</p>
    if (/eyebrow=\{?"(SCR-[A-Z0-9-]+|6[A-F]\d?|5[A-C])"/.test(source)
      || /className="eyebrow">\s*(SCR-[A-Z0-9-]+|6[A-F]\d?|5[A-C])\s*</.test(source)) {
      fautifs.push(chemin);
    }
  }
  assert.deepEqual(fautifs, [], `codes internes exposés dans : ${fautifs.join(", ")}`);
});

test("le provider de démonstration mort n'est plus monté dans l'app interne", () => {
  assert.doesNotMatch(internalLayout, /DemoRentalProvider/);
  assert.doesNotMatch(internalLayout, /rental-demo/);
});

test("aucun prix ni nomenclature de plan n'est codé en dur dans les surfaces bêta", () => {
  for (const source of [supportPage, documentsPage, aidePage, contactPage]) {
    for (const motif of ["5 900", "5900", "12 900", "14.99", "9.99", "essai gratuit", "14 jours"]) {
      assert.ok(!source.includes(motif), `prix ou offre en dur : ${motif}`);
    }
  }
});

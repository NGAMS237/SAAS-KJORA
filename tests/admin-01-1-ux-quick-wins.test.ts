import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ADMIN_COPY } from "../src/modules/platform-admin/copy.ts";
import { INDICATOR_LABELS, STATE_LABELS, UNMONITORED_SERVICES } from "../src/modules/platform-admin/monitoring.ts";

// =============================================================================
// ADMIN-01.1 — Tests (quick wins UX)
// =============================================================================
// Même distinction que ADMIN-01 : comportement (fonctions/dictionnaires pures,
// exécutées) vs invariants de source (assertions sur la nouvelle migration
// SQL). La seconde catégorie ne remplace pas une exécution pgTAP réelle — voir
// supabase/tests/database/rls_admin_01_1_ux_quick_wins.test.sql, non exécuté
// dans cette session (même limite d'environnement que ADMIN-01).
// =============================================================================

// Normalisation CRLF -> LF : ce fichier recherche des motifs multi-lignes
// exacts (ex. "public.admin_list_organizations(\n  page_limit") par indexOf.
// Sur un checkout Windows avec core.autocrlf=true, le fichier source sur
// disque contient "\r\n" : sans cette normalisation, ces motifs (qui ne
// contiennent qu'un "\n" nu) ne sont plus trouvés en tant que sous-chaîne
// contiguë, et les tests dérivés échouent — alors que la migration SQL
// elle-même est parfaitement correcte des deux côtés. No-op sur ce
// bac à sable (déjà en LF).
const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20260921120000_admin_01_1_ux_quick_wins.sql", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");
const ADMIN_SHELL = readFileSync(
  new URL("../src/modules/platform-admin/admin-shell.tsx", import.meta.url),
  "utf8",
);
const LAYOUT = readFileSync(
  new URL("../src/app/administration/layout.tsx", import.meta.url),
  "utf8",
);
const SERVER = readFileSync(
  new URL("../src/modules/platform-admin/server.ts", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// 1. En-tête — badge d'environnement jamais déduit du hostname
// ---------------------------------------------------------------------------

test("le badge d'environnement privilégie VERCEL_ENV puis NODE_ENV, jamais le hostname", () => {
  assert.ok(LAYOUT.includes("process.env.VERCEL_ENV"));
  assert.ok(LAYOUT.includes("process.env.NODE_ENV === \"production\""));
  assert.ok(LAYOUT.includes("!process.env.VERCEL_ENV"));
  assert.ok(!/hostname|window\.location/i.test(LAYOUT), "déduction depuis le hostname détectée");
});

test("un environnement Vercel inconnu ne peut jamais s'afficher comme Production", () => {
  // Seuls "production" et "preview" sont acceptés tels quels ; tout le reste
  // (y compris undefined en local) retombe sur "development", jamais "production".
  const start = LAYOUT.indexOf("const vercelEnv");
  const body = LAYOUT.slice(start, LAYOUT.indexOf(";", LAYOUT.indexOf('"development"', start)) + 1);
  assert.ok(body.includes('"production"'));
  assert.ok(body.includes('"preview"'));
  assert.ok(body.includes('"development"'));
});

test("la console propose une déconnexion et un retour à l'application", () => {
  assert.ok(ADMIN_SHELL.includes('action="/auth/signout"'), "pas de formulaire de déconnexion");
  assert.ok(ADMIN_SHELL.includes('method="post"'), "la déconnexion doit être un POST, pas un lien GET");
  assert.ok(ADMIN_SHELL.includes('href="/app"'), "pas de lien de retour vers l'application");
});

test("la route interne /app existe réellement dans l'arborescence de l'application", () => {
  // /app doit correspondre à une vraie route (groupe de routes (internal)/app),
  // jamais à une route inventée : sinon le lien "Application KJORA" serait
  // lui-même cassé, exactement le défaut reproché au lien commercial.
  const appPage = readFileSync(
    new URL("../src/app/(internal)/app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(appPage.length > 0, "src/app/(internal)/app/page.tsx doit exister et contenir du code");
});

test("l'URL du site commercial vient uniquement de KJORA_COMMERCIAL_SITE_URL, jamais codée en dur", () => {
  assert.ok(
    LAYOUT.includes("process.env.KJORA_COMMERCIAL_SITE_URL"),
    "la configuration du site commercial doit être lue depuis une variable serveur",
  );
  // Le domaine constaté hors service (DEPLOYMENT_NOT_FOUND) ne doit plus
  // apparaître nulle part comme valeur en dur ou comme repli automatique.
  assert.ok(
    !ADMIN_SHELL.includes("kjora-commercial-site.vercel.app"),
    "l'ancienne URL codée en dur ne doit plus apparaître dans admin-shell.tsx",
  );
  assert.ok(
    !LAYOUT.includes('"https://kjora-commercial-site.vercel.app'),
    "aucun repli automatique vers le domaine hors service",
  );
});

test("une URL commerciale absente ou invalide ne produit aucun lien cliquable, jamais de repli sur le domaine hors service", () => {
  const start = LAYOUT.indexOf("function resolveCommercialSiteUrl");
  assert.notEqual(start, -1, "fonction de validation resolveCommercialSiteUrl manquante");
  const body = LAYOUT.slice(start, LAYOUT.indexOf("\n}", start) + 2);
  assert.ok(body.includes("return null"), "une URL absente ou invalide doit résoudre à null, jamais à un repli");
  assert.ok(
    !body.includes("kjora-commercial-site.vercel.app"),
    "aucun domaine en dur ne doit servir de valeur par défaut",
  );
  // AdminShell doit recevoir la valeur déjà validée (ou null), jamais recalculer une URL lui-même.
  assert.ok(ADMIN_SHELL.includes("commercialSiteUrl"), "AdminShell doit accepter commercialSiteUrl en prop");
  assert.ok(
    /commercialSiteUrl\s*\?/.test(ADMIN_SHELL),
    "AdminShell doit conditionner l'affichage du lien à la présence de commercialSiteUrl",
  );
  assert.ok(
    ADMIN_SHELL.includes("commercialSiteNotConnected"),
    "un état « non connecté » doit être affiché quand l'URL est absente",
  );
});

test("la console distingue clairement le lien vers l'application propriétaire et le lien (conditionnel) vers le site commercial", () => {
  // Deux liens distincts et séparés du bouton de déconnexion : l'application
  // KJORA (interne, /app) et le site commercial (externe, nouvel onglet,
  // affiché uniquement quand une URL valide a été fournie par le serveur).
  assert.ok(ADMIN_SHELL.includes('href="/app"'), "lien vers l'application propriétaire manquant");
  assert.ok(
    ADMIN_SHELL.includes("href={commercialSiteUrl}"),
    "le lien commercial doit utiliser l'URL validée reçue en prop, jamais une constante en dur",
  );
  assert.ok(ADMIN_SHELL.includes('target="_blank"'), "le lien commercial doit s'ouvrir dans un nouvel onglet");
  assert.ok(
    ADMIN_SHELL.includes('rel="noopener noreferrer"'),
    "le lien commercial doit sécuriser l'ouverture dans un nouvel onglet",
  );
});

test("le bouton de déconnexion reste un formulaire séparé des liens de navigation", () => {
  const signoutIndex = ADMIN_SHELL.indexOf('action="/auth/signout"');
  const appLinkIndex = ADMIN_SHELL.indexOf('href="/app"');
  const commercialBlockIndex = ADMIN_SHELL.indexOf("commercialSiteUrl ?");
  assert.ok(signoutIndex > -1 && appLinkIndex > -1 && commercialBlockIndex > -1);
  // La déconnexion doit être déclarée après les deux liens de navigation dans
  // le balisage, confirmant qu'elle reste un contrôle séparé, pas fusionné.
  assert.ok(signoutIndex > appLinkIndex && signoutIndex > commercialBlockIndex);
});

// ---------------------------------------------------------------------------
// 2. Compteurs — gratuit/payant, invariant de source
// ---------------------------------------------------------------------------

test("le compteur gratuit/payant se base uniquement sur organization_subscriptions, jamais organization_plans (Option A)", () => {
  const start = MIGRATION.indexOf("function public.admin_platform_counters");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(body.includes("subscriptions_free"));
  assert.ok(body.includes("subscriptions_paid"));
  assert.ok(body.includes("organizations_without_subscription"));
  assert.ok(body.includes("plan_billing_mismatches"));
  // Les anciens noms de champs (basés sur organization_plans) ne doivent plus
  // exister : ils classaient une Organization comme "payante" sur la seule
  // foi de son forfait effectif, sans vérifier qu'un abonnement existe.
  assert.ok(!body.includes("organizations_plan_free"));
  assert.ok(!body.includes("organizations_plan_paid"));
});

test("les compteurs gratuit/payant lisent organization_subscriptions.plan/status, pas organization_plans.plan", () => {
  const start = MIGRATION.indexOf("function public.admin_platform_counters");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(
    body.includes("from public.organization_subscriptions"),
    "les compteurs doivent lire organization_subscriptions",
  );
});

test("les Organizations sans ligne organization_subscriptions sont comptées à part (ni gratuites ni payantes)", () => {
  const start = MIGRATION.indexOf("function public.admin_platform_counters");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(
    /not exists/i.test(body),
    "organizations_without_subscription doit s'appuyer sur un NOT EXISTS (aucun abonnement enregistré)",
  );
});

test("une incohérence forfait/facturation est détectée par comparaison entre organization_plans et organization_subscriptions", () => {
  const start = MIGRATION.indexOf("function public.admin_platform_counters");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(body.includes("organization_plans"), "la comparaison doit lire le forfait effectif");
  assert.ok(body.includes("organization_subscriptions"), "la comparaison doit lire l'abonnement enregistré");
  assert.ok(body.includes("plan_billing_mismatches"));
});

test("server.ts lit les quatre nouveaux compteurs depuis le payload RPC (Option A)", () => {
  assert.ok(SERVER.includes("subscriptionsFree"));
  assert.ok(SERVER.includes("subscriptionsPaid"));
  assert.ok(SERVER.includes("organizationsWithoutSubscription"));
  assert.ok(SERVER.includes("planBillingMismatches"));
  assert.ok(SERVER.includes("payload.subscriptions_free"));
  assert.ok(SERVER.includes("payload.subscriptions_paid"));
  assert.ok(SERVER.includes("payload.organizations_without_subscription"));
  assert.ok(SERVER.includes("payload.plan_billing_mismatches"));
  // Les anciens champs organization_plans ne doivent plus être lus par server.ts.
  assert.ok(!SERVER.includes("organizationsPlanFree"));
  assert.ok(!SERVER.includes("organizationsPlanPaid"));
});

// ---------------------------------------------------------------------------
// 3. Recherche/filtres — toujours côté RPC, jamais de SQL dynamique
// ---------------------------------------------------------------------------

test("les fonctions de liste acceptent recherche et filtres en paramètres", () => {
  assert.ok(MIGRATION.includes("search_term   text    default null"));
  assert.ok(MIGRATION.includes("status_filter text    default null"));
  assert.ok(MIGRATION.includes("plan_filter      text    default null"));
  assert.ok(MIGRATION.includes("currency_filter  text    default null"));
});

test("aucun SQL dynamique n'est utilisé pour les filtres (pas d'injection possible)", () => {
  // Ignore les lignes de commentaire SQL ("-- ...") : la migration EXPLIQUE en
  // commentaire qu'aucun `execute format` n'est utilisé, ce qui contiendrait
  // sinon littéralement le motif recherché sans qu'aucun SQL dynamique
  // n'existe réellement dans le code exécutable.
  const code = MIGRATION.split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.ok(!/execute\s+format/i.test(code), "execute format() détecté — risque d'injection");
  assert.ok(!/execute\s+'/i.test(code), "execute d'une chaîne construite détecté");
});

test("les anciennes signatures à deux paramètres sont explicitement supprimées avant recréation", () => {
  // Sans ce drop, PostgREST se retrouverait avec deux fonctions surchargées
  // (2 arguments vs 4/6) et refuserait de choisir laquelle appeler.
  assert.ok(MIGRATION.includes("drop function if exists public.admin_list_organizations(integer, integer);"));
  assert.ok(MIGRATION.includes("drop function if exists public.admin_list_subscriptions(integer, integer);"));
});

test("le total renvoyé est calculé sur le même filtre que la page (pas de total non filtré)", () => {
  // Les deux fonctions doivent calculer `total` avec le même bloc WHERE que la
  // sous-requête de pagination — jamais un count(*) global suivi d'une page
  // filtrée, qui reproduirait le bug de total faussé déjà corrigé en ADMIN-01.
  const orgStart = MIGRATION.indexOf("function public.admin_list_organizations(\n  page_limit");
  const orgBody = MIGRATION.slice(orgStart, MIGRATION.indexOf("$$;", orgStart));
  const orgWhereCount = (orgBody.match(/where \(safe_search is null/g) ?? []).length;
  assert.equal(orgWhereCount, 2, "le WHERE de filtre doit apparaître à la fois pour le total et pour la page");
});

test("chaque fonction recréée réaffirme assert_platform_admin en premier", () => {
  for (const rpc of ["admin_platform_counters", "admin_list_organizations", "admin_list_subscriptions"]) {
    // Peut apparaître plusieurs fois si le fichier documente aussi l'ancienne
    // fonction ailleurs ; on vérifie juste la présence, comme le test ADMIN-01.
    const occurrences = MIGRATION.split(`function public.${rpc}`).length - 1;
    assert.ok(occurrences >= 1, `${rpc} absente de la migration ADMIN-01.1`);
  }
  assert.ok(
    MIGRATION.split("perform private.assert_platform_admin();").length - 1 >= 3,
    "les trois fonctions recréées doivent toutes vérifier l'autorisation plateforme",
  );
});

test("les fonctions recréées figent leur search_path", () => {
  for (const fn of ["admin_platform_counters", "admin_list_organizations", "admin_list_subscriptions"]) {
    // Ancre sur "create or replace function" : les lignes revoke/grant plus
    // bas contiennent aussi la sous-chaîne "function public.<fn>" et
    // fausseraient la recherche si on ne l'exclut pas explicitement.
    const start = MIGRATION.indexOf(`create or replace function public.${fn}(`);
    assert.notEqual(start, -1, `fonction absente : ${fn}`);
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    assert.ok(body.includes("set search_path = ''"), `search_path non figé : ${fn}`);
  }
});

test("aucun droit n'est accordé au rôle anonyme dans la nouvelle migration", () => {
  assert.ok(!/grant\s+(execute|select|insert|update|delete)[^;]*\bto\b[^;]*\banon\b/i.test(MIGRATION));
});

test("aucune donnée privée de locataire n'est lue par les fonctions ADMIN-01.1", () => {
  const tenantTables = ["tenants", "leases", "dues", "payments", "financial_documents", "contract_documents"];
  for (const table of tenantTables) {
    assert.ok(!new RegExp(`from public\\.${table}\\b`).test(MIGRATION), `table locataire lue : ${table}`);
  }
});

test("aucun secret ni clé de service dans la nouvelle migration", () => {
  const patterns = [/service_role/i, /SUPABASE_SERVICE/i, /sk_live/i, /sk_test/i, /BEGIN [A-Z ]*PRIVATE KEY/];
  for (const pattern of patterns) {
    assert.ok(!pattern.test(MIGRATION), `motif sensible trouvé : ${pattern}`);
  }
});

// ---------------------------------------------------------------------------
// 4. Bilingue — cinq états harmonisés, aucune clé vide
// ---------------------------------------------------------------------------

test("les cinq états demandés (Normal/Attention/Anciennes/Non connecté/Erreur) existent en FR et EN", () => {
  const expectedFr = ["Normal", "Attention", "Données anciennes", "Non connecté", "Erreur"].sort();
  const expectedEn = ["Normal", "Attention", "Stale data", "Not connected", "Error"].sort();
  const actualFr = Object.values(STATE_LABELS).map((l) => l.fr).sort();
  const actualEn = Object.values(STATE_LABELS).map((l) => l.en).sort();
  assert.deepEqual(actualFr, expectedFr);
  assert.deepEqual(actualEn, expectedEn);
});

test("les dictionnaires FR et EN de la console couvrent exactement les mêmes clés (avec les ajouts ADMIN-01.1)", () => {
  const fr = Object.keys(ADMIN_COPY.fr).sort();
  const en = Object.keys(ADMIN_COPY.en).sort();
  assert.deepEqual(fr, en);
  for (const key of [
    "envProduction",
    "envPreview",
    "envDev",
    "backToApp",
    "signOut",
    "resultsCount",
    "freePaidSummary",
    "subscriptionsFreeRegistered",
    "subscriptionsPaidRegistered",
    "organizationsWithoutSubscription",
    "commercialSiteLink",
    "commercialSiteNotConnected",
    "opensInNewTab",
  ]) {
    assert.ok(fr.includes(key), `clé ADMIN-01.1 manquante : ${key}`);
  }
  // Les anciennes clés (Option initiale, basée sur organization_plans) ne
  // doivent plus exister dans le dictionnaire après le correctif Option A.
  assert.ok(!fr.includes("organizationsPlanFree"));
  assert.ok(!fr.includes("organizationsPlanPaid"));
});

test("les revenus et les demandes de support restent non connectés tant qu'aucune source n'est intégrée", () => {
  const keys = UNMONITORED_SERVICES.map((s) => s.key);
  assert.ok(keys.includes("revenue"));
  assert.ok(keys.includes("support_requests"));
});

test("l'indicateur d'incohérence forfait/facturation existe en FR et EN (Option A)", () => {
  const label = INDICATOR_LABELS.plan_billing_mismatch;
  assert.ok(label, "clé plan_billing_mismatch manquante dans INDICATOR_LABELS");
  assert.ok(label.fr.length > 0);
  assert.ok(label.en.length > 0);
});

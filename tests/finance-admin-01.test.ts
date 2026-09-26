import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ADMIN_COPY } from "../src/modules/platform-admin/copy.ts";

// =============================================================================
// FINANCE-ADMIN-01 — Tests
// =============================================================================
// Même distinction méthodologique que le reste de cette console : invariants
// de source sur le SQL/TS réellement livré (aucun Supabase éphémère
// disponible dans ce bac à sable pour exécuter les RPC), et tests exécutés
// sur les fonctions pures atteignables sans "server-only" ni session.
// =============================================================================

const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20260927090000_finance_admin_01_read_model.sql", import.meta.url),
  "utf8",
);
const SERVER = readFileSync(
  new URL("../src/modules/platform-admin/server.ts", import.meta.url),
  "utf8",
);
const VIEWS = readFileSync(
  new URL("../src/modules/platform-admin/views.tsx", import.meta.url),
  "utf8",
);
const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const SHELL = readFileSync(
  new URL("../src/modules/platform-admin/admin-shell.tsx", import.meta.url),
  "utf8",
);
const LAYOUT = readFileSync(
  new URL("../src/app/administration/layout.tsx", import.meta.url),
  "utf8",
);
const PAGE = readFileSync(
  new URL("../src/app/administration/finances/page.tsx", import.meta.url),
  "utf8",
);

const FINANCE_SECTION_START = VIEWS.indexOf("function BarChart");
assert.notEqual(FINANCE_SECTION_START, -1, "BarChart introuvable");
// Englobe BarChart, ConnectorRow et FinancesView : les trois ont été ajoutés
// ensemble pour ce lot, dans cet ordre, jusqu'à la fin du fichier.
const FINANCE_VIEW = VIEWS.slice(FINANCE_SECTION_START);

// ---------------------------------------------------------------------------
// 1. Route et navigation
// ---------------------------------------------------------------------------

test("la route /administration/finances existe et exporte un composant page", () => {
  assert.ok(PAGE.includes("export default async function AdministrationFinancesPage"));
  assert.ok(PAGE.includes('dynamic = "force-dynamic"'));
});

test("un onglet Finances est ajouté à la navigation, après Abonnements", () => {
  const navBlockStart = SHELL.indexOf("const NAV = [");
  const navBlockEnd = SHELL.indexOf("];", navBlockStart);
  const navBlock = SHELL.slice(navBlockStart, navBlockEnd);
  const overviewIdx = navBlock.indexOf("/administration\"");
  const orgIdx = navBlock.indexOf("/administration/organizations");
  const subIdx = navBlock.indexOf("/administration/abonnements");
  const finIdx = navBlock.indexOf("/administration/finances");
  assert.ok(finIdx > -1, "onglet Finances absent de la navigation");
  assert.ok(overviewIdx < orgIdx && orgIdx < subIdx && subIdx < finIdx, "ordre de navigation incorrect");
});

test("la page Finances ne fait aucune vérification d'autorisation locale (garde déjà posée par le layout)", () => {
  assert.ok(!PAGE.includes("resolvePlatformAdmin"), "une deuxième copie de la garde a été ajoutée");
  assert.ok(!PAGE.includes("is_platform_admin"), "une deuxième copie de la garde a été ajoutée");
});

test("le layout continue de refuser toute session non platform_admin (non-régression)", () => {
  assert.ok(LAYOUT.includes("resolvePlatformAdmin"));
  assert.ok(LAYOUT.includes("if (!decision.allowed)"));
  for (const role of ["organization_owner", "manager", "collector", "caretaker", "accountant", "viewer"]) {
    assert.ok(!LAYOUT.includes(role), `le layout ne doit accorder aucun rôle d'Organization : ${role}`);
  }
});

// ---------------------------------------------------------------------------
// 2. Bilinguisme FR/EN
// ---------------------------------------------------------------------------

test("les dictionnaires FR et EN restent alignés après l'ajout des clés Finances", () => {
  const fr = Object.keys(ADMIN_COPY.fr).sort();
  const en = Object.keys(ADMIN_COPY.en).sort();
  assert.deepEqual(fr, en);
  assert.ok(fr.includes("navFinances") && fr.includes("financeTitle") && fr.includes("financeSectionCharts"));
});

test("aucune valeur de copie Finances n'est une chaîne vide", () => {
  const keys = [
    "navFinances", "financeTitle", "financeSubtitle", "financePeriodLabel",
    "periodLast30Days", "periodLast90Days", "periodCurrentYear", "periodAllTime",
    "financeSectionCounters", "financeSectionCollected", "financeSectionExpected",
    "financeSectionCharts", "financeSectionEvents", "financeSectionConnectors",
    "notAvailable", "notConnectedValue",
  ] as const;
  for (const lang of ["fr", "en"] as const) {
    for (const key of keys) {
      const value = ADMIN_COPY[lang][key];
      assert.ok(typeof value === "string" && value.trim().length > 0, `${lang}.${key} est vide`);
    }
  }
});

test("les libellés NON DISPONIBLE / NON CONNECTÉ sont exacts (FR)", () => {
  assert.equal(ADMIN_COPY.fr.notAvailable, "NON DISPONIBLE");
  assert.equal(ADMIN_COPY.fr.notConnectedValue, "NON CONNECTÉ");
});

test("les libellés NOT AVAILABLE / NOT CONNECTED sont exacts (EN)", () => {
  assert.equal(ADMIN_COPY.en.notAvailable, "NOT AVAILABLE");
  assert.equal(ADMIN_COPY.en.notConnectedValue, "NOT CONNECTED");
});

// ---------------------------------------------------------------------------
// 3. Séparation CAD / XAF — jamais additionnées
// ---------------------------------------------------------------------------

test("le résumé serveur distingue collectedOfflineByCurrency et expectedRevenueByCurrency par devise, jamais fusionnés", () => {
  assert.ok(SERVER.includes("collectedOfflineByCurrency: Record<string, number>"));
  assert.ok(SERVER.includes("expectedRevenueByCurrency: Record<string, number>"));
});

test("la migration agrège les montants hors ligne et attendus PAR devise (group by currency), jamais toutes devises confondues", () => {
  const offlineBlock = MIGRATION.slice(
    MIGRATION.indexOf("into offline_by_currency"),
    MIGRATION.indexOf("into offline_by_currency") + 400,
  );
  assert.ok(offlineBlock.includes("group by currency") || offlineBlock.includes("group by ci.currency"));

  const expectedBlock = MIGRATION.slice(
    MIGRATION.indexOf("into expected_by_currency"),
    MIGRATION.indexOf("into expected_by_currency") + 800,
  );
  assert.ok(expectedBlock.includes("group by currency") || expectedBlock.includes("group by s.currency"));
});

test("la vue Finances n'additionne jamais un montant CAD et un montant XAF dans une même expression", () => {
  // Détecte le motif dangereux le plus direct : additionner deux clés de
  // devises différentes du même Record. Aucune occurrence de ce motif ne
  // doit apparaître dans le fichier de vues.
  assert.ok(!/CAD\s*\+\s*.*XAF/.test(FINANCE_VIEW));
  assert.ok(!/XAF\s*\+\s*.*CAD/.test(FINANCE_VIEW));
});

test("chaque compteur de revenu (attendu/encaissé) est affiché avec sa devise CAD et XAF séparément, jamais un total unique", () => {
  assert.ok(FINANCE_VIEW.includes("financeCollectedOfflineCad") && FINANCE_VIEW.includes("financeCollectedOfflineXaf"));
  assert.ok(FINANCE_VIEW.includes("financeExpectedCad") && FINANCE_VIEW.includes("financeExpectedXaf"));
});

// ---------------------------------------------------------------------------
// 4. Distinction attendu / encaissé — jamais confondus
// ---------------------------------------------------------------------------

test("la migration retourne 'expected_revenue' et 'collected_revenue' comme deux blocs jsonb distincts", () => {
  assert.ok(MIGRATION.includes("'expected_revenue', jsonb_build_object"));
  assert.ok(MIGRATION.includes("'collected_revenue', jsonb_build_object"));
});

test("le revenu attendu est calculé UNIQUEMENT depuis billing_prices + organization_subscriptions, jamais organization_plans seul", () => {
  const expectedBlockStart = MIGRATION.indexOf("into expected_by_currency");
  const expectedBlock = MIGRATION.slice(expectedBlockStart - 900, expectedBlockStart + 900);
  assert.ok(expectedBlock.includes("public.organization_subscriptions"));
  assert.ok(expectedBlock.includes("public.billing_prices"));
  assert.ok(!expectedBlock.includes("organization_plans"), "organization_plans ne doit jamais servir de preuve de facturation");
});

test("un abonnement 'sur_mesure' est structurellement exclu du revenu attendu (prix catalogue NULL, jointure sur amount_minor non nul)", () => {
  const expectedBlockStart = MIGRATION.indexOf("into expected_by_currency");
  const expectedBlock = MIGRATION.slice(expectedBlockStart - 900, expectedBlockStart + 900);
  assert.ok(expectedBlock.includes("bp.amount_minor is not null"));
});

test("une intervention offerte (complimentary/promotion/partnership/support_adjustment) n'alimente jamais l'encaissé", () => {
  const offlineBlockStart = MIGRATION.indexOf("into offline_by_currency");
  const offlineBlock = MIGRATION.slice(offlineBlockStart - 700, offlineBlockStart + 700);
  assert.ok(offlineBlock.includes("intervention_type = 'offline_payment'"));
});

// ---------------------------------------------------------------------------
// 5. NON CONNECTÉ / NON DISPONIBLE — jamais présenté comme "Normal"
// ---------------------------------------------------------------------------

test("Stripe et Mobile Money sont toujours renvoyés NON CONNECTÉ par la RPC, jamais interrogés en réseau", () => {
  assert.ok(MIGRATION.includes("'stripe', jsonb_build_object('state', 'not_connected')"));
  assert.ok(MIGRATION.includes("'mobile_money', jsonb_build_object('state', 'not_connected')"));
  for (const forbidden of ["fetch(", "http.get", "axios", "stripe.com/v1"]) {
    assert.ok(!MIGRATION.includes(forbidden));
  }
});

test("la vue affiche explicitement NON CONNECTÉ pour Stripe et Mobile Money encaissés, jamais un montant inventé", () => {
  const collectedSection = FINANCE_VIEW.slice(
    FINANCE_VIEW.indexOf("financeSectionCollected"),
    FINANCE_VIEW.indexOf("financeSectionExpected"),
  );
  assert.ok(collectedSection.includes("t.notConnectedValue"));
  assert.ok(collectedSection.includes("financeCollectedStripe"));
  assert.ok(collectedSection.includes("financeCollectedMobileMoney"));
});

test("l'état des connecteurs ne présente jamais l'absence d'intégration comme 'Normal' (réutilise admin-state--not-connected)", () => {
  assert.ok(FINANCE_VIEW.includes("ConnectorRow"));
  assert.ok(FINANCE_VIEW.includes('"admin-state admin-state--not-connected"'));
});

test("un montant absent/non fiable dans le tableau d'événements affiche NON DISPONIBLE, jamais 0 par défaut", () => {
  assert.ok(FINANCE_VIEW.includes("t.notAvailable"));
});

// ---------------------------------------------------------------------------
// 6. Aucune donnée sensible exposée
// ---------------------------------------------------------------------------

test("la RPC des événements récents ne sélectionne jamais de colonne sensible", () => {
  const forbidden = [
    "provider_event_id", "actor_user_id", "e.payload", "ci.payload",
    "admin_note", "manual_reference", "idempotency_key", "revoke_reason",
    "provider_customer_ref", "provider_subscription_ref",
    "payment_method_brand", "payment_method_last4",
  ];
  const rpcStart = MIGRATION.indexOf("create or replace function public.admin_finance_recent_events(");
  const rpcEnd = MIGRATION.indexOf("$$;", rpcStart);
  assert.notEqual(rpcStart, -1);
  assert.notEqual(rpcEnd, -1);
  const rpcBody = MIGRATION.slice(rpcStart, rpcEnd + 3);
  for (const column of forbidden) {
    assert.ok(!rpcBody.includes(column), `colonne sensible exposée : ${column}`);
  }
});

test("aucun secret ni clé de service dans les fichiers Finances", () => {
  const patterns = [/service_role/i, /SUPABASE_SERVICE/i, /sk_live/i, /sk_test/i, /BEGIN [A-Z ]*PRIVATE KEY/];
  for (const source of [MIGRATION, SERVER, VIEWS, CSS, PAGE]) {
    for (const pattern of patterns) {
      assert.ok(!pattern.test(source), `motif sensible trouvé : ${pattern}`);
    }
  }
});

test("cette console n'effectue aucune écriture (Finances comprise)", () => {
  for (const method of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!SERVER.includes(method), `écriture détectée : ${method}`);
  }
  assert.ok(!PAGE.includes(".insert(") && !PAGE.includes(".update("));
});

test("la page Finances ne rend aucune action d'écriture (aucun bouton de soumission hors le filtre de période)", () => {
  const submitButtons = (FINANCE_VIEW.match(/type="submit"/g) ?? []).length;
  assert.equal(submitButtons, 1, "un seul bouton submit attendu (appliquer le filtre de période)");
});

// ---------------------------------------------------------------------------
// 7. Sécurité RPC (invariants de migration)
// ---------------------------------------------------------------------------

test("les deux RPC Finances sont security definer, avec search_path vide et garde platform_admin", () => {
  for (const fn of ["admin_finance_summary(", "admin_finance_recent_events("]) {
    const start = MIGRATION.indexOf(`create or replace function public.${fn}`);
    assert.notEqual(start, -1, `RPC introuvable : ${fn}`);
    const end = MIGRATION.indexOf("$$;", start);
    assert.notEqual(end, -1, `fin de corps introuvable pour ${fn}`);
    const body = MIGRATION.slice(start, end + 3);
    assert.ok(body.includes("security definer"), `${fn} doit être security definer`);
    assert.ok(body.includes("set search_path = ''"), `${fn} doit fixer search_path = ''`);
    assert.ok(body.includes("private.assert_platform_admin()"), `${fn} doit appeler assert_platform_admin`);
  }
});

test("les deux RPC Finances révoquent l'accès anon/public et n'accordent qu'à authenticated", () => {
  assert.ok(MIGRATION.includes("revoke all on function public.admin_finance_summary(text) from public, anon;"));
  assert.ok(MIGRATION.includes("grant execute on function public.admin_finance_summary(text) to authenticated;"));
  assert.ok(
    MIGRATION.includes(
      "revoke all on function public.admin_finance_recent_events(integer, integer, text) from public, anon;",
    ),
  );
  assert.ok(
    MIGRATION.includes(
      "grant execute on function public.admin_finance_recent_events(integer, integer, text) to authenticated;",
    ),
  );
});

test("la période est une énumération fermée résolue sans SQL dynamique (aucun EXECUTE / format())", () => {
  // "grant execute on function ..." est un DDL légitime, distinct de l'instruction
  // PL/pgSQL "execute '...'"/"execute format(...)" (SQL dynamique) : seule cette
  // deuxième forme est interdite ici.
  assert.ok(!/\bexecute\s+format\s*\(/i.test(MIGRATION));
  assert.ok(!/\bexecute\s+'/i.test(MIGRATION));
  assert.ok(MIGRATION.includes("raise exception 'FINANCE-ADMIN-01: invalid period_filter"));
});

test("les limites de pagination sont bornées (least/greatest), comme le reste de la console", () => {
  const rpcStart = MIGRATION.indexOf("admin_finance_recent_events(");
  const rpcBody = MIGRATION.slice(rpcStart, rpcStart + 3000);
  assert.ok(rpcBody.includes("least(greatest(coalesce(page_limit, 25), 1), 100)"));
  assert.ok(rpcBody.includes("greatest(coalesce(page_offset, 0), 0)"));
});

test("la migration est additive (begin/commit, aucun DROP TABLE ni ALTER destructif)", () => {
  assert.ok(MIGRATION.trim().startsWith("begin;"));
  assert.ok(MIGRATION.trim().endsWith("commit;"));
  assert.ok(!/drop table/i.test(MIGRATION));
  assert.ok(!/truncate/i.test(MIGRATION));
  assert.ok(!/delete from/i.test(MIGRATION));
});

// ---------------------------------------------------------------------------
// 8. Graphiques accompagnés de leur table de valeurs
// ---------------------------------------------------------------------------

test("chacun des trois graphiques a une table de valeurs textuelle associée (BarChart + <details><summary>)", () => {
  const occurrences = (FINANCE_VIEW.match(/<BarChart/g) ?? []).length;
  assert.ok(occurrences >= 4, `attendu au moins 4 usages de BarChart (plan, répartition, CAD, XAF), trouvé ${occurrences}`);
  assert.ok(FINANCE_VIEW.includes('<details className="admin-chart__table">'));
  assert.ok(FINANCE_VIEW.includes("role=\"img\""), "le graphique doit porter un résumé accessible");
});

test("aucune bibliothèque de graphiques lourde n'est importée (SVG/HTML interne uniquement)", () => {
  for (const lib of ["recharts", "chart.js", "d3", "victory", "nivo"]) {
    assert.ok(!VIEWS.toLowerCase().includes(lib), `bibliothèque de graphiques interdite détectée : ${lib}`);
  }
});

// ---------------------------------------------------------------------------
// 9. Filtres et pagination
// ---------------------------------------------------------------------------

test("le filtre de période est une liste fermée exportée et validée côté page (jamais transmise brute)", () => {
  const financePeriods = readFileSync(
    new URL("../src/modules/platform-admin/finance-periods.ts", import.meta.url),
    "utf8",
  );
  assert.ok(financePeriods.includes('export const FINANCE_PERIOD_FILTERS = ['));
  assert.ok(financePeriods.includes("isFinancePeriodFilter"));
  assert.ok(SERVER.includes("isFinancePeriodFilter"), "server.ts doit ré-exporter isFinancePeriodFilter");
  assert.ok(PAGE.includes("isFinancePeriodFilter(raw) ? raw : \"last_30_days\""));
});

test("finance-periods.ts est un module pur, importable depuis un composant client (aucun 'server-only')", () => {
  const financePeriods = readFileSync(
    new URL("../src/modules/platform-admin/finance-periods.ts", import.meta.url),
    "utf8",
  );
  assert.ok(!financePeriods.includes('import "server-only"'));
  assert.ok(!financePeriods.includes("createSupabaseServerClient"));
});

test("la pagination des événements réutilise le composant Pagination existant, avec le filtre de période préservé", () => {
  assert.ok(FINANCE_VIEW.includes('<Pagination page={events} basePath="/administration/finances" extraParams={{ period }} />'));
});

// ---------------------------------------------------------------------------
// 10. Aucune deuxième machine de facturation
// ---------------------------------------------------------------------------

test("la migration ne crée aucune nouvelle table de prix, d'abonnement ou d'événement", () => {
  assert.ok(!/create table/i.test(MIGRATION), "aucune nouvelle table attendue dans ce lot (lecture seule)");
});

// ---------------------------------------------------------------------------
// 11. Cohérence du plan pgTAP (plan(N) == nombre réel d'assertions)
// ---------------------------------------------------------------------------

test("le fichier pgTAP FINANCE-ADMIN-01 déclare un plan(N) qui correspond exactement au nombre d'assertions", () => {
  const pgtap = readFileSync(
    new URL("../supabase/tests/database/rls_finance_admin_01_read_model.test.sql", import.meta.url),
    "utf8",
  );
  const planMatch = pgtap.match(/select plan\((\d+)\);/);
  assert.ok(planMatch, "select plan(N); introuvable");
  const declared = Number(planMatch![1]);
  const actual = (pgtap.match(/select (throws_ok|lives_ok|ok|is|isnt|results_eq)\(/g) ?? []).length;
  assert.equal(declared, actual, `plan(${declared}) ne correspond pas aux ${actual} assertions réellement présentes`);
});

// ---------------------------------------------------------------------------
// 12. Non-régression du correctif XAF (v2) — invariant de source
// ---------------------------------------------------------------------------
// Complète les tests comportementaux de finance-admin-01-money.test.ts (qui
// exécutent réellement money.ts) par un garde-fou textuel : aucune division
// manuelle par 100 ne doit réapparaître dans la vue Finances pour les
// montants collectés/attendus — toute conversion passe par money.ts.

test("la vue Finances ne divise plus jamais manuellement par 100 un montant collecté/attendu (délègue à money.ts)", () => {
  assert.ok(!/collectedOfflineByCurrency\.\w+\s*\?\?\s*0\)\s*\/\s*100/.test(FINANCE_VIEW));
  assert.ok(!/expectedRevenueByCurrency\.\w+\s*\?\?\s*0\)\s*\/\s*100/.test(FINANCE_VIEW));
});

test("la vue Finances importe minorToMajor/formatMinorAmount depuis le module pur money.ts (conversion centralisée)", () => {
  assert.ok(VIEWS.includes('from "./money"'));
  assert.ok(FINANCE_VIEW.includes("minorToMajor(") || FINANCE_VIEW.includes("formatMoneyMinorAmount("));
});

test("money.ts est un module pur (aucun import), donc testable sans environnement ni server-only", () => {
  const money = readFileSync(
    new URL("../src/modules/platform-admin/money.ts", import.meta.url),
    "utf8",
  );
  assert.ok(!/^import /m.test(money), "money.ts ne devrait avoir aucun import (module pur)");
});

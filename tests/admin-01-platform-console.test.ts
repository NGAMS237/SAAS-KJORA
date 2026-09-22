import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  MONITORING_STATES,
  STALE_AFTER_MS,
  STATE_LABELS,
  UNMONITORED_SERVICES,
  assertsHealthy,
  deriveState,
  notConnectedIndicator,
  type ProbeResult,
} from "../src/modules/platform-admin/monitoring.ts";
import { ADMIN_COPY } from "../src/modules/platform-admin/copy.ts";
import { parsePagedPayload } from "../src/modules/platform-admin/pagination.ts";

// =============================================================================
// ADMIN-01 — Tests
// =============================================================================
// Deux natures de tests, volontairement distinguées :
//
//   • comportement  — fonctions pures du tableau de suivi, exécutées ;
//   • invariants de source — assertions sur le CODE et le SQL livrés, qui
//     vérifient que les contrôles d'accès et les exclusions de données sont
//     réellement écrits.
//
// Les tests de la seconde catégorie ne remplacent PAS une exécution contre une
// base réelle. Cette limite est documentée dans ADMIN-01-REPORT.md.
// =============================================================================

const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20260918120000_admin_01_platform_admin.sql", import.meta.url),
  "utf8",
);
const GUARD = readFileSync(
  new URL("../src/core/authorization/platform-admin.ts", import.meta.url),
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

const NOW = new Date("2026-09-18T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000);

// ---------------------------------------------------------------------------
// 1. États du tableau de suivi — comportement
// ---------------------------------------------------------------------------

test("une source fraîche sans anomalie est normale", () => {
  assert.equal(deriveState({ ok: true, latest: minutesAgo(5) }, NOW), "normal");
});

test("une anomalie constatée produit un incident", () => {
  assert.equal(deriveState({ ok: true, latest: minutesAgo(5), anomalies: 1 }, NOW), "incident");
});

test("une donnée plus ancienne que le seuil est marquée ancienne", () => {
  const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000);
  assert.equal(deriveState({ ok: true, latest: old }, NOW), "stale");
});

test("une donnée juste sous le seuil reste normale", () => {
  const fresh = new Date(NOW.getTime() - STALE_AFTER_MS + 1000);
  assert.equal(deriveState({ ok: true, latest: fresh }, NOW), "normal");
});

test("une lecture échouée est indisponible, pas un incident", () => {
  // Distinction délibérée : « je ne sais pas » n'est pas « c'est cassé ».
  assert.equal(deriveState({ ok: false }, NOW), "unavailable");
});

test("une source qui n'a jamais rien produit n'est pas déclarée saine", () => {
  const state = deriveState({ ok: true, latest: null }, NOW);
  assert.equal(state, "not_connected");
  assert.equal(assertsHealthy(state), false);
});

test("l'échec de lecture prime sur les anomalies", () => {
  assert.equal(deriveState({ ok: false } as ProbeResult, NOW), "unavailable");
});

test("l'incident prime sur l'ancienneté", () => {
  const old = new Date(NOW.getTime() - STALE_AFTER_MS - 1000);
  assert.equal(deriveState({ ok: true, latest: old, anomalies: 3 }, NOW), "incident");
});

// ---------------------------------------------------------------------------
// 2. Services non intégrés — jamais présentés comme sains
// ---------------------------------------------------------------------------

test("Supabase, Vercel, Resend, les paiements, les revenus et le support sont tous non connectés", () => {
  // ADMIN-01.1 : "revenue" et "support_requests" ajoutés à la vue d'ensemble —
  // même garde que les quatre services ADMIN-01 d'origine.
  const keys = UNMONITORED_SERVICES.map((s) => s.key).sort();
  assert.deepEqual(keys, ["payments", "resend", "revenue", "supabase", "support_requests", "vercel"]);
});

test("aucun service non intégré ne peut produire un état affirmatif", () => {
  for (const service of UNMONITORED_SERVICES) {
    const indicator = notConnectedIndicator(service.key, service.source);
    assert.equal(indicator.state, "not_connected");
    assert.equal(assertsHealthy(indicator.state), false);
    // Sans source, aucune date ne doit être affichée : elle suggérerait une mesure.
    assert.equal(indicator.observedAt, null);
  }
});

test("l'état non connecté est distinct de tous les autres", () => {
  assert.equal(new Set(MONITORING_STATES).size, MONITORING_STATES.length);
  assert.ok(MONITORING_STATES.includes("not_connected"));
});

test("chaque état porte un libellé dans les deux langues", () => {
  for (const state of MONITORING_STATES) {
    assert.ok(STATE_LABELS[state].fr.length > 0, `fr manquant : ${state}`);
    assert.ok(STATE_LABELS[state].en.length > 0, `en manquant : ${state}`);
  }
});

// ---------------------------------------------------------------------------
// 3. Contrôles d'accès — invariants de source
// ---------------------------------------------------------------------------

/** Toutes les RPC exposées par la migration. */
const RPCS = [
  "admin_platform_counters",
  "admin_list_organizations",
  "admin_list_subscriptions",
  "admin_recent_events",
  "admin_events_freshness",
];

test("chaque RPC vérifie l'autorisation plateforme avant toute lecture", () => {
  for (const rpc of RPCS) {
    const start = MIGRATION.indexOf(`function public.${rpc}`);
    assert.notEqual(start, -1, `RPC absente : ${rpc}`);
    const end = MIGRATION.indexOf("$$;", start);
    const body = MIGRATION.slice(start, end);
    assert.ok(
      body.includes("private.assert_platform_admin()"),
      `${rpc} n'appelle pas assert_platform_admin`,
    );
  }
});

test("la garde SQL refuse par exception, pas par jeu de résultats vide", () => {
  // Un jeu vide serait indistinguable d'une plateforme sans données :
  // l'appelant doit pouvoir différencier « refusé » de « rien à afficher ».
  const start = MIGRATION.indexOf("function private.assert_platform_admin");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(body.includes("raise exception"));
  assert.ok(body.includes("42501"), "le code insufficient_privilege doit être utilisé");
});

test("les fonctions d'autorisation figent leur search_path", () => {
  // Sans cela, un schéma temporaire contrôlé par l'appelant pourrait masquer
  // les tables réellement interrogées.
  for (const fn of ["private.is_platform_admin", "private.assert_platform_admin", ...RPCS.map((r) => `public.${r}`)]) {
    const start = MIGRATION.indexOf(`function ${fn}`);
    assert.notEqual(start, -1, `fonction absente : ${fn}`);
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    assert.ok(body.includes("set search_path = ''"), `search_path non figé : ${fn}`);
  }
});

test("aucun droit n'est accordé au rôle anonyme", () => {
  assert.ok(!/grant\s+(execute|select|insert|update|delete)[^;]*\bto\b[^;]*\banon\b/i.test(MIGRATION));
  // Et les révocations explicites sont présentes.
  assert.ok(MIGRATION.includes("from public, anon"));
});

test("la table platform_admins n'accepte aucune écriture depuis l'application", () => {
  const forWrites = /create policy[^;]*on public\.platform_admins[^;]*for\s+(insert|update|delete|all)/i;
  assert.ok(!forWrites.test(MIGRATION), "une policy d'écriture existe sur platform_admins");
  assert.ok(MIGRATION.includes("alter table public.platform_admins enable row level security"));
});

test("aucune adresse e-mail n'est codée en dur dans la migration", () => {
  // L'octroi du rôle doit rester une opération délibérée, hors du code versionné.
  const emails = MIGRATION.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [];
  const real = emails.filter((e) => !e.includes("REMPLACER"));
  assert.deepEqual(real, [], `adresses trouvées : ${real.join(", ")}`);
});

test("la garde applicative refuse par défaut", () => {
  // Session absente, RPC en erreur et valeur inattendue sont tous des refus.
  assert.ok(GUARD.includes('reason: "unauthenticated"'));
  assert.ok(GUARD.includes('reason: "check_failed"'));
  assert.ok(GUARD.includes('reason: "not_platform_admin"'));
  // Comparaison stricte à true : une valeur truthy ne doit pas autoriser.
  assert.ok(GUARD.includes("data !== true"));
});

test("le layout refuse Owner, collaborateur, locataire et anonyme", () => {
  // Une seule décision autorise : decision.allowed. Tout le reste est refusé,
  // quel que soit le rôle d'Organization — aucun n'est mentionné comme exception.
  assert.ok(LAYOUT.includes("resolvePlatformAdmin"));
  assert.ok(LAYOUT.includes("if (!decision.allowed)"));
  assert.ok(LAYOUT.includes("notFound()"));
  assert.ok(LAYOUT.includes("redirect(\"/connexion"));
  for (const role of ["organization_owner", "manager", "collector", "caretaker", "accountant", "viewer"]) {
    assert.ok(!LAYOUT.includes(role), `le layout ne doit accorder aucun rôle d'Organization : ${role}`);
  }
});

test("la console n'est pas indexable et n'est pas mise en cache", () => {
  assert.ok(LAYOUT.includes("index: false"));
  assert.ok(LAYOUT.includes('dynamic = "force-dynamic"'));
});

// ---------------------------------------------------------------------------
// 4. Isolation des données — invariants de source
// ---------------------------------------------------------------------------

test("aucune RPC n'expose de référence fournisseur ni de moyen de paiement", () => {
  // Ces colonnes existent sur organization_subscriptions ; elles ne doivent
  // apparaître dans aucune clause select des RPC de la console.
  const forbidden = [
    "provider_customer_ref",
    "provider_subscription_ref",
    "payment_method_brand",
    "payment_method_last4",
    "payment_method_expires_on",
  ];
  for (const column of forbidden) {
    const selected = new RegExp(`select[^;]*\\bs\\.${column}\\b`, "is");
    assert.ok(!selected.test(MIGRATION), `colonne exposée : ${column}`);
  }
  // Seul un booléen indique la présence d'un fournisseur.
  assert.ok(MIGRATION.includes("(s.provider is not null)"));
});

test("le payload des événements n'est jamais exposé", () => {
  const start = MIGRATION.indexOf("function public.admin_recent_events");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(!/\be\.payload\b/.test(body), "le payload des événements est exposé");
});

test("aucune donnée privée de locataire n'est lue par la console", () => {
  const tenantTables = ["tenants", "leases", "dues", "payments", "financial_documents", "contract_documents"];
  for (const table of tenantTables) {
    assert.ok(
      !new RegExp(`from public\\.${table}\\b`).test(MIGRATION),
      `la console lit une table locataire : ${table}`,
    );
  }
});

test("la pagination est bornée côté serveur", () => {
  // Une limite non contrainte permettrait d'extraire la base en une requête.
  const paginated = ["admin_list_organizations", "admin_list_subscriptions"];
  for (const rpc of paginated) {
    const start = MIGRATION.indexOf(`function public.${rpc}`);
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    assert.ok(body.includes("least(greatest("), `${rpc} ne borne pas sa limite`);
    assert.ok(body.includes("100"), `${rpc} n'a pas de plafond`);
  }
});

test("aucun secret ni clé de service dans le code de la console", () => {
  const sources = [MIGRATION, GUARD, LAYOUT, SERVER];
  const patterns = [
    /service_role/i,
    /SUPABASE_SERVICE/i,
    /sk_live/i,
    /sk_test/i,
    /BEGIN [A-Z ]*PRIVATE KEY/,
  ];
  for (const source of sources) {
    for (const pattern of patterns) {
      assert.ok(!pattern.test(source), `motif sensible trouvé : ${pattern}`);
    }
  }
});

test("la console n'effectue aucune écriture", () => {
  // Aucune mutation Supabase côté application.
  for (const method of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!SERVER.includes(method), `écriture détectée : ${method}`);
  }
  // Et aucune RPC d'écriture dans la migration.
  assert.ok(!/function public\.admin_(create|update|delete|set|grant|revoke)/i.test(MIGRATION));
});

test("un refus serveur est distingué d'une panne", () => {
  // Afficher « incident » sur un simple refus induirait en erreur.
  assert.ok(SERVER.includes('"42501"'));
  assert.ok(SERVER.includes('"denied"'));
  assert.ok(SERVER.includes('"failed"'));
});

// ---------------------------------------------------------------------------
// 5. Bilingue
// ---------------------------------------------------------------------------

test("les dictionnaires FR et EN couvrent exactement les mêmes clés", () => {
  const fr = Object.keys(ADMIN_COPY.fr).sort();
  const en = Object.keys(ADMIN_COPY.en).sort();
  assert.deepEqual(fr, en);
});

test("aucune valeur de contenu n'est vide", () => {
  for (const [lang, dict] of Object.entries(ADMIN_COPY)) {
    for (const [key, value] of Object.entries(dict)) {
      if (typeof value === "string") {
        assert.ok(value.trim().length > 0, `${lang}.${key} est vide`);
      }
    }
  }
});

test("les deux langues produisent une information de page cohérente", () => {
  assert.equal(ADMIN_COPY.fr.pageInfo(1, 25, 130), "1–25 sur 130");
  assert.equal(ADMIN_COPY.en.pageInfo(1, 25, 130), "1–25 of 130");
});

// ---------------------------------------------------------------------------
// 6. Pagination — comportement exécuté, pas seulement invariants de source
// ---------------------------------------------------------------------------
// Régression du correctif de cette revue : avec l'ancienne forme
// (`returns table (...)`, total_count porté par chaque ligne), un offset au
// delà de la dernière ligne renvoyait un jeu de lignes vide — donc aucun
// porteur pour total_count, lu comme 0 par le client. La RPC renvoie
// désormais un objet jsonb `{ rows, total_count, limit, offset }`, toujours
// présent. Ces tests exercent le code réel de parsePagedPayload, pas une
// relecture du SQL.

test("le total reste exact quand la page est vide (offset au-delà de la dernière ligne)", () => {
  // Reproduit exactement la forme renvoyée par admin_list_organizations /
  // admin_list_subscriptions pour un offset hors limites : rows vide, mais
  // total_count porte le vrai total.
  const payload = { rows: [], total_count: 137, limit: 25, offset: 1000 };
  const page = parsePagedPayload(payload, (r) => r, 25, 1000);
  assert.equal(page.total, 137, "le total ne doit pas retomber à 0");
  assert.deepEqual(page.rows, []);
  assert.equal(page.limit, 25);
  assert.equal(page.offset, 1000);
});

test("une page normale (non vide) reste correctement analysée", () => {
  const payload = {
    rows: [{ a: 1 }, { a: 2 }],
    total_count: 137,
    limit: 2,
    offset: 4,
  };
  const page = parsePagedPayload(payload, (r) => r.a, 2, 4);
  assert.deepEqual(page.rows, [1, 2]);
  assert.equal(page.total, 137);
});

test("une réponse RPC malformée ne fait pas planter l'analyse (page vide, total 0)", () => {
  const page = parsePagedPayload(null, (r) => r, 25, 0);
  assert.deepEqual(page.rows, []);
  assert.equal(page.total, 0);
  // Repli sur les valeurs demandées quand la RPC ne les renvoie pas.
  assert.equal(page.limit, 25);
  assert.equal(page.offset, 0);
});

test("total_count est indépendant du nombre de lignes réellement renvoyées", () => {
  // Le total doit rester juste même quand `rows` est tronqué par la limite —
  // les deux valeurs ne doivent jamais être confondues l'une avec l'autre.
  const payload = { rows: [{ a: 1 }], total_count: 9000, limit: 1, offset: 0 };
  const page = parsePagedPayload(payload, (r) => r.a, 1, 0);
  assert.equal(page.rows.length, 1);
  assert.equal(page.total, 9000);
});

// ---------------------------------------------------------------------------
// 7. Accès direct à platform_admins — invariants de source (revue ADMIN-01)
// ---------------------------------------------------------------------------
// Aucune fonctionnalité de cette version n'a besoin de lire platform_admins
// depuis l'application (même les RPC SECURITY DEFINER n'en ont pas besoin :
// elles s'exécutent avec les privilèges du propriétaire de la table, qui
// n'est pas soumis à sa RLS). Un accès direct via PostgREST aurait permis à
// n'importe quel admin de lire user_id/granted_by/note de tous les autres —
// ce test verrouille son retrait.

test("aucun accès SELECT direct n'est accordé sur platform_admins", () => {
  assert.ok(
    !/grant\s+select[^;]*\bon\s+public\.platform_admins\b/i.test(MIGRATION),
    "un grant SELECT sur platform_admins a été trouvé — il ne devrait plus exister",
  );
  assert.ok(
    !/create policy[^;]*\bon\s+public\.platform_admins\b[^;]*for\s+select/i.test(MIGRATION),
    "une policy SELECT sur platform_admins a été trouvée — elle ne devrait plus exister",
  );
});

test("la RLS de platform_admins reste activée malgré l'absence de policy (défense en profondeur)", () => {
  assert.ok(MIGRATION.includes("alter table public.platform_admins enable row level security"));
});

test("les RPC de la console n'utilisent jamais platform_admins que via les fonctions private.*", () => {
  // Toute lecture de platform_admins doit passer par private.is_platform_admin(),
  // jamais par une RPC publique qui interrogerait la table elle-même.
  for (const rpc of RPCS) {
    const start = MIGRATION.indexOf(`function public.${rpc}`);
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    assert.ok(
      !/from\s+public\.platform_admins/i.test(body),
      `${rpc} lit platform_admins directement au lieu de passer par private.is_platform_admin()`,
    );
  }
});

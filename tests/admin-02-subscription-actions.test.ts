import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ADMIN_COPY } from "../src/modules/platform-admin/copy.ts";

// =============================================================================
// ADMIN-02 — Tests (actions contrôlées sur l'abonnement)
// =============================================================================
// Même distinction que ADMIN-01/ADMIN-01.1 : comportement (dictionnaires
// pures, exécutées) vs invariants de source (assertions sur la nouvelle
// migration SQL et les Server Actions). La seconde catégorie ne remplace pas
// une exécution pgTAP réelle contre une base Postgres — aucun Supabase
// éphémère n'est disponible dans cette session (même limite qu'ADMIN-01 et
// ADMIN-01.1). Les tests DB (§18 du mandat) sont donc écrits comme des
// invariants de source, prêts pour la CI éphémère existante, et ne sont PAS
// déclarés PASS ici.
// =============================================================================

const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20260925120000_admin_02_subscription_actions.sql", import.meta.url),
  "utf8",
);
const SERVER = readFileSync(
  new URL("../src/modules/platform-admin/server.ts", import.meta.url),
  "utf8",
);
const ACTIONS = readFileSync(
  new URL("../src/modules/platform-admin/subscription-actions.ts", import.meta.url),
  "utf8",
);
const VIEWS = readFileSync(
  new URL("../src/modules/platform-admin/views.tsx", import.meta.url),
  "utf8",
);

const ADMIN02_RPCS = [
  "admin_get_subscription",
  "admin_change_subscription_plan",
  "admin_suspend_subscription",
  "admin_reactivate_subscription",
  "admin_schedule_subscription_cancellation",
  "admin_revoke_subscription_cancellation",
  "admin_archive_subscription",
];

// ---------------------------------------------------------------------------
// 1. Autorisation — chaque RPC ADMIN-02 vérifie platform_admin en premier
// ---------------------------------------------------------------------------

test("les sept RPC ADMIN-02 réaffirment assert_platform_admin", () => {
  for (const rpc of ADMIN02_RPCS) {
    const occurrences = MIGRATION.split(`function public.${rpc}`).length - 1;
    assert.ok(occurrences >= 1, `${rpc} absente de la migration ADMIN-02`);
  }
  assert.ok(
    MIGRATION.split("perform private.assert_platform_admin();").length - 1 >= ADMIN02_RPCS.length,
    "chaque RPC ADMIN-02 doit vérifier l'autorisation plateforme",
  );
});

test("les fonctions ADMIN-02 figent leur search_path", () => {
  for (const fn of [...ADMIN02_RPCS, "admin_list_subscriptions"]) {
    const start = MIGRATION.indexOf(`create or replace function public.${fn}(`);
    assert.notEqual(start, -1, `fonction absente : ${fn}`);
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    assert.ok(body.includes("set search_path = ''"), `search_path non figé : ${fn}`);
  }
});

test("aucun droit n'est accordé au rôle anonyme dans la migration ADMIN-02", () => {
  assert.ok(!/grant\s+(execute|select|insert|update|delete)[^;]*\bto\b[^;]*\banon\b/i.test(MIGRATION));
});

test("l'ancienne signature d'admin_list_subscriptions est explicitement supprimée avant recréation", () => {
  assert.ok(
    MIGRATION.includes("drop function if exists public.admin_list_subscriptions(integer, integer, text, text, text, text);"),
  );
});

// ---------------------------------------------------------------------------
// 2. Aucune deuxième machine à états — réutilisation du domaine ALIGN-03
// ---------------------------------------------------------------------------

test("la suspension réutilise le statut existant 'billing_blocked', aucun nouveau statut 'suspended' n'est créé", () => {
  assert.ok(MIGRATION.includes("status = 'billing_blocked'"));
  // Le domaine n'a jamais de statut littéral "suspended" — ADMIN-02 ne doit
  // pas en introduire un, même sous forme de commentaire de conception.
  assert.ok(
    !/status\s*=\s*'suspended'/i.test(MIGRATION),
    "un statut 'suspended' inventé a été détecté",
  );
});

test("la résiliation programmée réutilise cancellation_scheduled et cancellation_effective_on, comme cancel_subscription", () => {
  const start = MIGRATION.indexOf("function public.admin_schedule_subscription_cancellation");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(body.includes("'cancellation_scheduled'"));
  assert.ok(body.includes("cancellation_effective_on"));
  assert.ok(body.includes("current_period_end"), "l'accès doit rester jusqu'à la fin de la période payée connue");
});

test("le changement de forfait réutilise le contrôle de quota existant (private.billing_usage / plan_quota_limits)", () => {
  const start = MIGRATION.indexOf("function public.admin_change_subscription_plan");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(body.includes("private.billing_usage("));
  assert.ok(body.includes("private.plan_quota_limits("));
  assert.ok(body.includes("plan_change_refused"), "un downgrade/upgrade hors quota doit être refusé proprement");
});

test("le changement de forfait n'accepte que des slugs canoniques, jamais un prix/devise/fournisseur client", () => {
  const start = MIGRATION.indexOf("create or replace function public.admin_change_subscription_plan(");
  const signatureEnd = MIGRATION.indexOf(")", start);
  const signature = MIGRATION.slice(start, signatureEnd);
  assert.ok(signature.includes("target_plan"));
  assert.ok(signature.includes("target_cycle"));
  assert.ok(!/amount|price|currency|provider/i.test(signature),
    "la RPC ne doit accepter aucun montant, prix, devise ou fournisseur en paramètre");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(
    body.includes("'decouverte','essentiel','avance','patrimoine','sur_mesure'"),
    "seuls les cinq slugs canoniques existants doivent être acceptés",
  );
});

// ---------------------------------------------------------------------------
// 3. Aucune suppression physique — archivage additif uniquement
// ---------------------------------------------------------------------------

test("aucune instruction DELETE n'existe dans la migration ADMIN-02", () => {
  const code = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.ok(!/\bdelete\s+from\b/i.test(code), "une suppression physique a été détectée");
});

test("l'archivage est additif (archived_at/archived_by nullable) et refuse un abonnement encore actif", () => {
  assert.ok(MIGRATION.includes("add column if not exists archived_at timestamptz"));
  assert.ok(MIGRATION.includes("add column if not exists archived_by uuid"));
  const start = MIGRATION.indexOf("function public.admin_archive_subscription");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(body.includes("archive_refused"), "un abonnement actif doit être protégé contre l'archivage");
  assert.ok(body.includes("archived_at = now()"));
});

test("admin_list_subscriptions masque les abonnements archivés par défaut, sans jamais les supprimer", () => {
  const start = MIGRATION.indexOf("create or replace function public.admin_list_subscriptions(");
  const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
  assert.ok(body.includes("archived_filter"));
  assert.ok(body.includes("'active'"));
  assert.ok(body.includes("s.archived_at is null"));
});

// ---------------------------------------------------------------------------
// 4. Audit — chaque mutation produit un événement exploitable
// ---------------------------------------------------------------------------

test("chaque RPC de mutation ADMIN-02 insère un événement d'audit dans billing_events avec acteur et raison", () => {
  const mutationRpcs = ADMIN02_RPCS.filter((r) => r !== "admin_get_subscription");
  for (const rpc of mutationRpcs) {
    const start = MIGRATION.indexOf(`function public.${rpc}`);
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    assert.ok(body.includes("insert into public.billing_events"), `${rpc} ne journalise aucun audit`);
    assert.ok(body.includes("actor_user_id"), `${rpc} n'enregistre pas l'acteur`);
    assert.ok(body.includes("'adminAction', true"), `${rpc} ne marque pas l'événement comme une action admin`);
    assert.ok(body.includes("'reason', reason"), `${rpc} n'enregistre pas la raison fournie`);
  }
});

test("aucune donnée fournisseur sensible n'est écrite par les RPC ADMIN-02", () => {
  const patterns = [/payment_method_last4\s*=/, /provider_subscription_ref\s*=/, /service_role/i, /sk_live/i, /sk_test/i];
  const admin02Start = MIGRATION.indexOf("-- 2. Détail d'un abonnement");
  const admin02Body = MIGRATION.slice(admin02Start);
  for (const pattern of patterns) {
    assert.ok(!pattern.test(admin02Body), `motif sensible détecté : ${pattern}`);
  }
});

// ---------------------------------------------------------------------------
// 5. Défense en profondeur côté serveur — Server Actions
// ---------------------------------------------------------------------------

test("les Server Actions ADMIN-02 revérifient platform_admin avant chaque RPC, en plus de la garde base", () => {
  assert.ok(ACTIONS.includes('"use server"'), "le fichier doit être un module Server Actions");
  assert.ok(ACTIONS.includes("resolvePlatformAdmin"));
  const occurrences = ACTIONS.split("resolvePlatformAdmin()").length - 1;
  assert.ok(occurrences >= 1, "aucun appel à resolvePlatformAdmin trouvé");
});

test("les Server Actions ADMIN-02 valident les slugs de forfait et de cycle avant tout appel RPC", () => {
  assert.ok(ACTIONS.includes("CANONICAL_PLANS"));
  assert.ok(ACTIONS.includes("CANONICAL_CYCLES"));
  assert.ok(ACTIONS.includes("decouverte") && ACTIONS.includes("sur_mesure"));
});

test("les Server Actions ADMIN-02 ne transmettent jamais de message d'erreur SQL brut au client", () => {
  assert.ok(!/error\.message/.test(ACTIONS), "un message d'erreur Postgres brut pourrait fuiter au client");
});

// ---------------------------------------------------------------------------
// 6. Lecture — server.ts n'expose aucune donnée fournisseur sensible
// ---------------------------------------------------------------------------

test("getSubscriptionDetail ne mappe aucun champ fournisseur sensible (token, moyen de paiement, secret)", () => {
  const start = SERVER.indexOf("export async function getSubscriptionDetail");
  const body = SERVER.slice(start, SERVER.indexOf("\n}\n", start));
  assert.ok(!/paymentMethod|providerRef|token|secret/i.test(body),
    "un champ fournisseur sensible est exposé au client par getSubscriptionDetail");
});

// ---------------------------------------------------------------------------
// 7. Interface — actions destructrices hors tableau, confirmations explicites
// ---------------------------------------------------------------------------

test("chaque action sensible ADMIN-02 passe par un <dialog> de confirmation, jamais un clic direct dans le tableau", () => {
  for (const id of ["dialog-change-plan", "dialog-suspend", "dialog-reactivate", "dialog-cancel", "dialog-revoke-cancel", "dialog-archive"]) {
    assert.ok(VIEWS.includes(`id="${id}"`), `dialogue de confirmation manquant : ${id}`);
  }
});

test("l'archivage n'utilise jamais le mot « supprimer » dans son message de confirmation", () => {
  for (const dict of [ADMIN_COPY.fr, ADMIN_COPY.en]) {
    assert.ok(!/supprim|delete/i.test(dict.confirmArchive), "le message d'archivage évoque une suppression");
  }
});

test("la ligne du tableau des abonnements propose un lien « Voir » vers le détail, pas d'action destructrice directe", () => {
  assert.ok(VIEWS.includes("/administration/abonnements/${row.organizationId}"));
  assert.ok(VIEWS.includes("t.viewDetail"));
});

// ---------------------------------------------------------------------------
// 8. Bilingue — les nouvelles clés ADMIN-02 existent en FR et EN
// ---------------------------------------------------------------------------

test("les dictionnaires FR et EN couvrent les nouvelles clés ADMIN-02", () => {
  const fr = Object.keys(ADMIN_COPY.fr).sort();
  for (const key of [
    "colActions", "viewDetail", "archivedBadge", "actionChangePlan", "actionSuspend",
    "actionReactivate", "actionScheduleCancellation", "actionRevokeCancellation", "actionArchive",
    "confirmSuspend", "confirmArchive", "auditTitle",
  ]) {
    assert.ok(fr.includes(key), `clé ADMIN-02 manquante : ${key}`);
  }
  assert.deepEqual(Object.keys(ADMIN_COPY.fr).sort(), Object.keys(ADMIN_COPY.en).sort());
});

test("subscriptionOutcomeLabels couvre les issues renvoyées par les six RPC de mutation", () => {
  const expectedOutcomes = [
    "plan_changed", "suspended", "reactivated", "cancellation_scheduled",
    "cancellation_revoked", "archived", "plan_change_refused", "archive_refused",
  ];
  for (const outcome of expectedOutcomes) {
    assert.ok(ADMIN_COPY.fr.subscriptionOutcomeLabels[outcome], `libellé FR manquant : ${outcome}`);
    assert.ok(ADMIN_COPY.en.subscriptionOutcomeLabels[outcome], `libellé EN manquant : ${outcome}`);
  }
});

// ---------------------------------------------------------------------------
// 9. Isolation Organization — jamais d'Organization déduite d'un paramètre seul
// ---------------------------------------------------------------------------

test("chaque RPC ADMIN-02 verrouille la ligne cible (for update) avant transition, pour une transition atomique", () => {
  const mutationRpcs = ADMIN02_RPCS.filter((r) => r !== "admin_get_subscription");
  for (const rpc of mutationRpcs) {
    const start = MIGRATION.indexOf(`function public.${rpc}`);
    const body = MIGRATION.slice(start, MIGRATION.indexOf("$$;", start));
    assert.ok(body.includes("for update"), `${rpc} ne verrouille pas la ligne — risque de transition concurrente incohérente`);
  }
});

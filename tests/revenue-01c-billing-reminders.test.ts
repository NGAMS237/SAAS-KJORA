import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  RENEWAL_REMINDER_OFFSETS,
  GRACE_REMINDER_OFFSETS,
  PAYMENT_METHOD_EXPIRY_OFFSETS,
  INVOICE_DUE_SOON_OFFSET_DAYS,
} from "../src/core/billing/model.ts";
import { BILLING_EVENTS, isBillingEventType } from "../src/core/billing/events.ts";
import { REMINDER_TYPES, REMINDER_COPY, REMINDER_EVENT_TYPE, isReminderType } from "../src/core/billing/reminder-copy.ts";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01C — Tests
// =============================================================================
// Même distinction méthodologique que les lots précédents : invariants de
// source sur le SQL réellement livré (aucun Supabase éphémère dans ce bac à
// sable — voir supabase/tests/database/rls_revenue_01c_billing_reminders
// .test.sql, NON EXÉCUTÉ, plan(17) vérifié statiquement seulement) et tests
// unitaires réels pour tout ce qui est pur.
// =============================================================================

const MIGRATION = readFileSync(
  new URL("../supabase/migrations/20260927160000_revenue_01c_billing_reminders.sql", import.meta.url),
  "utf8",
);
const PGTAP = readFileSync(
  new URL("../supabase/tests/database/rls_revenue_01c_billing_reminders.test.sql", import.meta.url),
  "utf8",
);
const ACTIONS = readFileSync(
  new URL("../src/modules/platform-admin/billing-reminders-actions.ts", import.meta.url),
  "utf8",
);
const VERCEL_CONFIG = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");

function sansCommentaires(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function sqlFunctionBody(name: string): string {
  const start = MIGRATION.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `fonction absente de la migration : ${name}`);
  const end = MIGRATION.indexOf("$$;", start);
  assert.notEqual(end, -1, `fin de fonction introuvable : ${name}`);
  return MIGRATION.slice(start, end);
}

// ---------------------------------------------------------------------------
// 1. Les décalages canoniques (TypeScript) et le SQL restent en accord
// ---------------------------------------------------------------------------

test("les décalages de rappel canoniques (model.ts) correspondent exactement aux littéraux SQL", () => {
  assert.deepEqual(RENEWAL_REMINDER_OFFSETS, [7, 3, 1]);
  assert.deepEqual(GRACE_REMINDER_OFFSETS, [1, 3, 6]);
  assert.deepEqual(PAYMENT_METHOD_EXPIRY_OFFSETS, [30, 7]);
  assert.equal(INVOICE_DUE_SOON_OFFSET_DAYS, 3);

  const compute = sqlFunctionBody("private.compute_due_billing_reminders");
  assert.match(compute, /values \(7\),\(3\),\(1\)/);
  assert.match(compute, /values \(1\),\(3\),\(6\)/);
  assert.match(compute, /values \(30\),\(7\)/);
  // v3 : l'échéance est billing_invoices.due_on (repli period_end pour une
  // facture antérieure à REVENUE-01B).
  assert.match(compute, /coalesce\(i\.due_on, i\.period_end\) - p_as_of = 3/);
  assert.match(compute, /coalesce\(i\.due_on, i\.period_end\) < p_as_of/);
});

// ---------------------------------------------------------------------------
// 2. Modèles FR/EN — complets, sans donnée sensible ni provider
// ---------------------------------------------------------------------------

test("chaque type de rappel planifié a un modèle FR et EN non vide", () => {
  for (const type of REMINDER_TYPES) {
    const copy = REMINDER_COPY[type];
    assert.ok(copy, `modèle absent pour ${type}`);
    for (const lang of ["fr", "en"] as const) {
      assert.ok(copy[lang].subject.length > 0, `${type}/${lang} : sujet vide`);
      assert.ok(copy[lang].body.length > 0, `${type}/${lang} : corps vide`);
    }
  }
});

test("chaque type de rappel planifié correspond à un événement billing réellement défini", () => {
  for (const type of REMINDER_TYPES) {
    const eventType = REMINDER_EVENT_TYPE[type];
    assert.ok(isBillingEventType(eventType), `${type} pointe vers un événement inconnu : ${eventType}`);
    assert.ok((BILLING_EVENTS as readonly string[]).includes(eventType));
  }
});

test("aucun modèle de rappel ne mentionne un fournisseur de paiement ni un montant précis", () => {
  for (const type of REMINDER_TYPES) {
    const copy = REMINDER_COPY[type];
    for (const lang of ["fr", "en"] as const) {
      const value = `${copy[lang].subject} ${copy[lang].body}`;
      assert.doesNotMatch(value, /stripe|flutterwave|campay|elyonpay|notchpay|payunit/i);
      // Le décalage fixe (J-7, J+30...) fait partie du modèle lui-même, comme
      // BILLING_EVENT_LABELS ; seul un MONTANT (XAF/CAD) est interdit ici.
      assert.doesNotMatch(value, /\bXAF\b|\bCAD\b/, `${type}/${lang} ne doit jamais fixer un montant en dur`);
    }
  }
});

test("isReminderType distingue correctement les 10 types planifiés du reste du catalogue", () => {
  assert.equal(REMINDER_TYPES.length, 10);
  for (const type of REMINDER_TYPES) assert.equal(isReminderType(type), true);
  for (const other of ["payment_succeeded", "billing_blocked", "cancellation_scheduled", "not_a_real_type"]) {
    assert.equal(isReminderType(other), false, `${other} ne doit pas être traité comme un rappel planifié`);
  }
});

// ---------------------------------------------------------------------------
// 3. Sécurité et idempotence de la RPC
// ---------------------------------------------------------------------------

test("le calcul pur des rappels dus n'est exécutable par aucun rôle client direct", () => {
  assert.match(MIGRATION, /revoke all on function private\.compute_due_billing_reminders\(date\) from public, anon, authenticated;/);
});

test("admin_run_billing_reminders vérifie l'autorisation plateforme et fige son search_path", () => {
  const body = sqlFunctionBody("public.admin_run_billing_reminders");
  assert.ok(body.includes("private.assert_platform_admin();"));
  assert.ok(body.includes("set search_path = ''"));
});

test("le dry-run est le comportement par défaut de la RPC (p_dry_run boolean default true)", () => {
  assert.match(MIGRATION, /p_dry_run boolean default true/);
});

test("billing_reminder_log interdit tout double rappel, avec un dédoublonnage PAR FACTURE (v3)", () => {
  // Rappel de facture : unique par (invoice_id, reminder_type) — deux factures
  // distinctes de même échéance reçoivent chacune leur rappel.
  assert.match(MIGRATION, /create unique index if not exists billing_reminder_log_invoice_unique\s+on public\.billing_reminder_log \(invoice_id, reminder_type\)\s+where invoice_id is not null/);
  // Rappel d'abonnement : unique par (organization_id, reminder_type, target_date).
  assert.match(MIGRATION, /create unique index if not exists billing_reminder_log_subscription_unique\s+on public\.billing_reminder_log \(organization_id, reminder_type, target_date\)\s+where invoice_id is null/);
  // L'ancienne clé par Organization, qui supprimait un rappel légitime, n'existe plus.
  assert.doesNotMatch(MIGRATION, /constraint billing_reminder_log_unique unique/);
  assert.match(sqlFunctionBody("public.admin_run_billing_reminders"), /on conflict do nothing/);
});

test("billing_reminder_log ne contient aucune colonne de contenu sensible (email, montant, référence)", () => {
  const start = MIGRATION.indexOf("create table if not exists public.billing_reminder_log");
  const end = MIGRATION.indexOf(");", start);
  const body = MIGRATION.slice(start, end);
  // Colonnes interdites explicitement, jamais le mot-clé SQL `references`
  // (clé étrangère) qui contient légitimement le sous-mot "reference".
  assert.doesNotMatch(body, /\bemail\b|amount_minor|manual_reference|\bmontant\b/i);
});

test("le passage grace -> billing_blocked n'a lieu que hors dry-run, jamais confondu avec un rappel", () => {
  const body = sqlFunctionBody("public.admin_run_billing_reminders");
  assert.match(body, /if not p_dry_run then[\s\S]*grace_ends_on < p_as_of/);
});

// ---------------------------------------------------------------------------
// 4. Aucun envoi réel, aucun cron déployé
// ---------------------------------------------------------------------------

test("aucun code d'envoi d'email réel n'existe dans ce lot", () => {
  for (const source of [sansCommentaires(MIGRATION), sansCommentaires(ACTIONS)]) {
    assert.doesNotMatch(source, /resend\.emails|smtp|sendgrid|nodemailer/i);
  }
});

test("vercel.json : un seul cron quotidien (orchestrateur NCE-01), aucun cron de rappel dédié", () => {
  // NCE-01 : les rappels de facturation passent par l'orchestrateur quotidien
  // unique (run_communications_daily_system) — jamais par un second cron.
  const parsed = JSON.parse(VERCEL_CONFIG) as { crons?: Array<{ path?: string }> };
  const paths = (parsed.crons ?? []).map((c) => c.path);
  assert.deepEqual(paths, ["/api/cron/daily-communications"], "un seul cron applicatif");
  assert.ok(!paths.some((p) => p?.includes("billing-reminder")), "aucun cron de rappel de facturation n'est déployé");
});

test("l'action serveur garde dryRun=true par défaut et ne journalise jamais error.message brut", () => {
  assert.match(ACTIONS, /dryRun = true/);
  assert.doesNotMatch(sansCommentaires(ACTIONS), /message:\s*error\.message/);
});

// ---------------------------------------------------------------------------
// 5. Le fichier pgTAP est cohérent et n'est pas déclaré exécuté
// ---------------------------------------------------------------------------

test("le fichier pgTAP 01C déclare exactement autant d'assertions que son plan()", () => {
  const clean = sansCommentaires(PGTAP);
  const planMatch = clean.match(/select plan\((\d+)\);/);
  assert.ok(planMatch, "select plan(N) introuvable");
  const declared = Number(planMatch![1]);
  const assertions = (clean.match(/^select (is|ok)\(/gm) ?? []).length;
  assert.equal(assertions, declared);
});

test("le fichier pgTAP 01C s'exécute dans une transaction annulée (rollback)", () => {
  assert.match(PGTAP, /^begin;/);
  assert.match(PGTAP, /rollback;\s*$/);
});

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01G — Loyers manuels : vérification/consolidation
// =============================================================================
// Audit préalable (voir session, agent d'exploration dédié) : le parcours
// loyers existe déjà et est déjà mature, avant ce mandat —
//   • génération des loyers dus : private.generate_due_schedules(run_on),
//     câblée sur un job pg_cron quotidien (lot_6c1, puis lot_6c3) ;
//   • saisie de paiement hors plateforme : public.confirm_payment(...)
//     (lot_6c2), capability payment.record ;
//   • allocation : private.allocate_payment_to_due(...) — un paiement peut
//     être réparti sur plusieurs dues de la même location (lot_6c2) ;
//   • reçu/quittance : document_type 'payment_receipt'/'rent_receipt',
//     téléchargeable Owner (financial-documents) et locataire
//     (tenant-portal/documents), gardé par la capability receipt.view ;
//   • annulation/correction auditée : public.reverse_payment(id, reason)
//     (lot_6c2) — motif obligatoire, statut 'reversed' (jamais de
//     suppression), écriture ledger_entries compensatoire et domain_events
//     'PAYMENT_REVERSED' ;
//   • rappels : private.prepare_financial_communications(run_on) (lot_6c3)
//     notifie les échéances en retard via message_deliveries, distinct de
//     billing_reminder_log (REVENUE-01C, SaaS, non déployé).
// Rien de tout cela n'est reconstruit ici : conformément au mandat
// ("ne pas reconstruire ce qui existe déjà, corriger seulement les manques
// réellement prouvés"), aucun manque fonctionnel n'a été trouvé côté loyers.
//
// Seul manque réellement prouvé : la séparation SaaS/loyers n'était vérifiée
// que dans un seul sens. tests/billing-providers.test.ts ("étanchéité — le
// billing ne touche jamais le domaine loyer") empêche déjà `src/core/billing`
// de référencer les tables loyers. Aucun test symétrique n'empêchait le
// domaine loyers de référencer les tables de facturation SaaS. Ce fichier
// comble uniquement ce manque.
// =============================================================================

const ROOT = join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const RENT_MODULE_DIRS = [
  "src/modules/payments",
  "src/modules/finance",
  "src/modules/documents",
  "src/modules/tenancy",
  "src/modules/operations",
];

const SAAS_BILLING_TABLES = [
  "organization_subscriptions", "billing_invoices", "billing_events",
  "billing_prices", "billing_payment_attempts", "billing_reminder_log",
  "commercial_interventions",
];

// Migrations qui construisent le domaine loyers ("lot_6*"), pour la même
// vérification côté SQL.
const RENT_LOT_MIGRATIONS = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => /lot_6[a-z0-9_]*\.sql$/i.test(f));

test("les modules TypeScript du domaine loyers ne référencent jamais une table de facturation SaaS", () => {
  for (const dir of RENT_MODULE_DIRS) {
    const files = walk(join(ROOT, dir)).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const file of files) {
      const code = sansCommentaires(readFileSync(file, "utf8"));
      for (const table of SAAS_BILLING_TABLES) {
        assert.doesNotMatch(
          code,
          new RegExp(`from\\(["']${table}["']\\)|rpc\\(["'][a-z_]*${table}[a-z_]*["']`),
          `${file} référence la table de facturation SaaS ${table}`,
        );
      }
    }
  }
});

test("les modules du domaine loyers n'importent jamais src/core/billing (frontière de module, pas seulement de table)", () => {
  for (const dir of RENT_MODULE_DIRS) {
    const files = walk(join(ROOT, dir)).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const file of files) {
      const code = sansCommentaires(readFileSync(file, "utf8"));
      assert.doesNotMatch(code, /from\s+["'][^"']*core\/billing[^"']*["']/, `${file} importe src/core/billing`);
    }
  }
});

test("les migrations du domaine loyers (lot_6*) ne créent ni ne référencent une table de facturation SaaS", () => {
  assert.ok(RENT_LOT_MIGRATIONS.length >= 5, "au moins les lots 6a-6e doivent être présents");
  for (const filename of RENT_LOT_MIGRATIONS) {
    const sql = sansCommentaires(readFileSync(join(ROOT, "supabase/migrations", filename), "utf8"));
    for (const table of SAAS_BILLING_TABLES) {
      assert.doesNotMatch(sql, new RegExp(`\\b${table}\\b`), `${filename} référence ${table}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Non-régression : les invariants confirmés par l'audit restent vrais
// ---------------------------------------------------------------------------

test("génération des loyers dus, allocation et annulation auditée existent bien (non-régression de l'audit 01G)", () => {
  const lot6c1 = readFileSync(
    join(ROOT, "supabase/migrations", RENT_LOT_MIGRATIONS.find((f) => f.includes("lot_6c1"))!),
    "utf8",
  );
  assert.match(lot6c1, /generate_due_schedules/);

  const lot6c2Name = RENT_LOT_MIGRATIONS.find((f) => f.includes("lot_6c2"));
  assert.ok(lot6c2Name, "lot_6c2 (paiements/allocations) introuvable");
  const lot6c2 = readFileSync(join(ROOT, "supabase/migrations", lot6c2Name!), "utf8");
  assert.match(lot6c2, /allocate_payment_to_due/);
  assert.match(lot6c2, /reverse_payment/);
  // Le motif de correction reste obligatoire : jamais une annulation muette.
  assert.match(sansCommentaires(lot6c2), /reason/i);

  const lot6c3Name = RENT_LOT_MIGRATIONS.find((f) => f.includes("lot_6c3"));
  assert.ok(lot6c3Name, "lot_6c3 (documents/notifications) introuvable");
  const lot6c3 = readFileSync(join(ROOT, "supabase/migrations", lot6c3Name!), "utf8");
  assert.match(lot6c3, /prepare_financial_communications/);
});

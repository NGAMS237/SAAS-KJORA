import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260914120000_security_tenants_access_01.sql", import.meta.url),
  "utf8",
);
const documents = readFileSync(new URL("../src/modules/documents/server.ts", import.meta.url), "utf8");
const dataImport = readFileSync(new URL("../src/modules/data-import/server.ts", import.meta.url), "utf8");
const dataExport = readFileSync(new URL("../src/modules/data-export/server.ts", import.meta.url), "utf8");
const contextResolver = readFileSync(new URL("../src/core/routing/context-resolver.ts", import.meta.url), "utf8");
const billingWebhook = readFileSync(new URL("../src/app/api/billing/webhooks/[provider]/route.ts", import.meta.url), "utf8");
const financialCron = readFileSync(new URL("../src/app/api/financial-communications/cron/route.ts", import.meta.url), "utf8");

test("la migration retire le SELECT global et restaure uniquement la projection minimale", () => {
  assert.match(migration, /revoke select on table public\.tenants from public, anon, authenticated/i);
  assert.match(migration, /grant select \(id, organization_id, full_name, created_at, updated_at\)/i);
  assert.doesNotMatch(migration, /grant select on (?:table )?public\.tenants to authenticated/i);
});

test("les trois projections privées sont SECURITY DEFINER avec search_path fermé", () => {
  const definitions = migration.match(/create or replace function public\.list_tenant[\s\S]*?\$\$;/gi) ?? [];
  assert.equal(definitions.length, 3);
  for (const definition of definitions) {
    assert.match(definition, /security definer set search_path = ''/i);
    assert.match(definition, /\(select auth\.uid\(\)\) is not null/i);
    assert.match(definition, /private\.has_capability\(target_organization_id,/i);
  }
});

test("les limites SQL des projections sont imposées dans les fonctions", () => {
  assert.match(migration, /cardinality\(target_tenant_ids\) between 1 and 200/i);
  assert.match(migration, /list_tenants_for_import[\s\S]*?limit 5000;/i);
});

test("les projections privées ne sont exécutables ni par anon ni par public", () => {
  for (const name of ["list_tenant_document_contacts", "list_tenants_for_import", "list_tenants_for_export"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(uuid(?:, uuid\\[\\])?\\) from public, anon`, "i"));
  }
});

test("documents, import et export n'effectuent plus de lecture privée directe", () => {
  assert.match(documents, /rpc\("list_tenant_document_contacts"/);
  assert.match(dataImport, /rpc\("list_tenants_for_import"/);
  assert.match(dataExport, /rpc\("list_tenants_for_export"/);
  for (const source of [documents, dataImport, dataExport]) {
    assert.doesNotMatch(source, /from\("tenants"\)[\s\S]{0,120}select\([^)]*(?:phone|email|preferred_language|profession|identity_document|internal_notes)/i);
  }
});

test("les erreurs des nouveaux accès ne concatènent aucune donnée locataire", () => {
  assert.doesNotMatch(migration, /raise exception[\s\S]{0,100}(?:t\.email|t\.phone|identity_document)/i);
});

test("platform_admin n'a aucun chemin direct et service_role reste confiné au serveur", () => {
  assert.match(contextResolver, /platform_admin[\s\S]{0,180}ne sont pas implémentés/i);
  assert.doesNotMatch(migration, /platform_admin/i);
  for (const serverRoute of [billingWebhook, financialCron]) {
    assert.match(serverRoute, /SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)/);
    assert.doesNotMatch(serverRoute, /["']use client["']/);
  }
});

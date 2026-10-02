import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildManualWhatsAppMessage, buildWhatsAppUrl, normalizePhoneE164 } from "../src/modules/communications/manual-whatsapp.ts";
import { safeNextPath } from "../src/core/auth/safe-next-path.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("les retours propriétaire, portail, partenaire et Admin restent internes", () => {
  for (const valid of ["/app", "/portal", "/partenaire", "/administration", "/invitation/accepter?token=fictif"]) assert.equal(safeNextPath(valid), valid);
  for (const hostile of ["//evil.test", "/\\evil.test", "/%5cevil.test", "/%09//evil.test", "https://evil.test/a"]) assert.equal(safeNextPath(hostile), "/app");
  const partner = read("../src/app/partenaires/connexion/page.tsx");
  assert.match(partner, /safeNextPath/); assert.match(partner, /startsWith\("\/partenaire"\)/);
  assert.match(read("../src/app/administration/layout.tsx"), /next=\/administration/);
  assert.match(read("../src/app/(portal-auth)/portal/connexion/page.tsx"), /startsWith\("\/portal"\)/);
});

test("la PWA refuse explicitement toutes les surfaces privées et les documents", () => {
  const sw = read("../public/sw.js");
  for (const value of ["/api/", "/app/", "/administration/", "/portal/", "/partenaire/", "/connexion/", "/documents/", ".pdf"]) assert.match(sw, new RegExp(value.replaceAll("/", "\\/")));
  assert.match(sw, /request\.headers\.has\("authorization"\)/); assert.match(sw, /set-cookie/); assert.match(sw, /private\|no-store/);
  assert.deepEqual([...sw.matchAll(/const PRECACHE = \[([^\]]+)\]/g)].length, 1);
});

test("la normalisation produit des E.164 supportés sans unicité ni identité implicite", () => {
  assert.equal(normalizePhoneE164("CM", "06 99 00 11 22"), "+237699001122");
  assert.equal(normalizePhoneE164("CA", "+1 514 555 0100"), "+15145550100");
  assert.equal(normalizePhoneE164("CI", "07-08-09-10-11"), "+225708091011");
  assert.equal(normalizePhoneE164("XX", "699001122"), null);
  assert.equal(normalizePhoneE164("CM", "12"), null);
});

test("le handoff manuel est bilingue, encodé et ne promet aucun envoi", () => {
  const fr = buildManualWhatsAppMessage({ phoneE164: "+237699001122", displayName: "Locataire Démo", language: "fr", documentType: "rent_receipt", periodStart: "2026-09-01", periodEnd: "2026-09-30" });
  const en = buildManualWhatsAppMessage({ phoneE164: "+15145550100", displayName: "Demo Tenant", language: "en", documentType: "due_notice", periodStart: null, periodEnd: null });
  assert.match(fr, /portail locataire KJORA sécurisé/); assert.match(en, /secure KJORA tenant portal/);
  assert.doesNotMatch(`${fr}${en}`, /sent|delivered|read|envoyé|livré|lu/i);
  assert.equal(buildWhatsAppUrl("not-phone", fr), null);
  const url = buildWhatsAppUrl("+237699001122", fr); assert.ok(url?.startsWith("https://wa.me/237699001122?text=")); assert.doesNotMatch(url ?? "", /\s/);
});

test("la route résout le numéro côté serveur à partir du seul document", () => {
  const route = read("../src/app/api/communications/whatsapp/manual/route.ts");
  assert.match(route, /documentId/); assert.doesNotMatch(route, /body\.(phone|organization|role)/);
  assert.match(route, /prepare_manual_whatsapp_handoff/); assert.doesNotMatch(route, /status\s*[:=]\s*["'](?:sent|delivered|read)["']/);
});

test("le locataire peut confirmer ou retirer WhatsApp uniquement via son accès portail actif", () => {
  const sql = read("../supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql");
  const route = read("../src/app/api/tenant-portal/whatsapp/route.ts");
  const view = read("../src/tenant-portal/whatsapp-preferences.tsx");
  assert.match(sql, /set_my_tenant_whatsapp_status/); assert.match(sql, /has_active_tenant_portal_access/);
  assert.match(sql, /p_action not in \('confirm','disable'\)/); assert.match(sql, /service_consent_source='tenant_portal'/);
  assert.match(route, /\["confirm", "disable"\]/); assert.doesNotMatch(route, /phone|organizationId|role/);
  assert.match(view, /Confirm WhatsApp/); assert.match(view, /Withdraw consent/); assert.match(view, /Marketing remains disabled/);
});

test("la migration est additive, consent-aware, append-only et garde le fournisseur disabled", () => {
  const sql = read("../supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql");
  for (const state of ["unknown", "declared", "verified", "disabled"]) assert.match(sql, new RegExp(`'${state}'`));
  for (const value of ["service_consent_source", "service_consent_version", "marketing_consent_source", "marketing_consent_version", "number_changed", "whatsapp_open_requested"]) assert.match(sql, new RegExp(value));
  assert.match(sql, /before update or delete/); assert.match(sql, /receipt\.share/); assert.match(sql, /status <> 'ready'/);
  for (const parameter of ["p_country_code", "p_calling_code", "p_national_number", "p_phone_e164"]) assert.match(sql, new RegExp(`${parameter} is null`));
  for (const parameter of ["p_whatsapp_declared", "p_service_consent", "p_marketing_consent"]) assert.match(sql, new RegExp(`${parameter} is null`));
  assert.match(sql, /previous\.whatsapp_status = 'verified'/); assert.match(sql, /whatsapp_status=next_status/);
  assert.match(sql, /set search_path=''/); assert.match(sql, /revoke all .* from public,anon/);
  assert.doesNotMatch(sql, /unique\s*\([^)]*phone|provider\s*=\s*'meta'|status\s*=\s*'sent'/i);
  assert.match(read("../src/modules/communications/whatsapp-provider.ts"), /enabled: false/);
});

test("la migration de mois local déjà appliquée reste strictement inchangée", () => {
  const existing = read("../supabase/migrations/20261001090000_pilot_month_end_africa_preview.sql");
  assert.equal(createHash("sha256").update(existing).digest("hex"), "c5d9c860e41077a9a41485af3e895b149fd2f29b875ca8467de770050aa4a173");
});

test("le centre de contrôle distingue WhatsApp manuel, future API, site et support", () => {
  const readiness = read("../src/modules/platform-admin/operations-readiness.ts");
  const view = read("../src/modules/platform-admin/operations-view.tsx");
  for (const key of ["commercial_site", "whatsapp_manual", "whatsapp_api", "support"]) { assert.match(readiness, new RegExp(`"${key}"`)); assert.match(view, new RegExp(`${key}:`)); }
  assert.match(readiness, /whatsapp_api: configured\("configured_disabled"/);
});

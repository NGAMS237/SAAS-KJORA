import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildManualWhatsAppMessage, buildWhatsAppUrl, normalizeManualWhatsAppContext, normalizePhoneE164 } from "../src/modules/communications/manual-whatsapp.ts";
import { SUPPORTED_PHONE_COUNTRIES } from "../src/core/currency/metadata.ts";
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
  assert.equal(SUPPORTED_PHONE_COUNTRIES.length, 14);
  for (const entry of SUPPORTED_PHONE_COUNTRIES) {
    assert.equal(normalizePhoneE164(entry.countryCode, entry.nationalExample), `+${entry.callingCode}${entry.nationalExample}`);
  }
  assert.equal(normalizePhoneE164("CI", "0701020304"), "+2250701020304");
  assert.equal(normalizePhoneE164("BJ", "0197123456"), "+2290197123456");
  assert.equal(normalizePhoneE164("XX", "699001122"), null);
  for (const invalid of ["069900112", "69900112", "6990011220", "699 001 122", "+237699001122", "69900A122"]) assert.equal(normalizePhoneE164("CM", invalid), null);
  for (const invalid of ["7010203045", "070102030", "0801020304"]) assert.equal(normalizePhoneE164("CI", invalid), null);
  for (const invalid of ["97123456", "0097123456", "019712345"]) assert.equal(normalizePhoneE164("BJ", invalid), null);
});

test("les catalogues TypeScript et SQL portent exactement les mêmes motifs nationaux", () => {
  const sql = read("../supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql");
  assert.match(sql, /national_pattern text not null/);
  assert.match(sql, /p_national_number !~ c\.national_pattern/);
  for (const entry of SUPPORTED_PHONE_COUNTRIES) {
    const literal = `('${entry.countryCode}','${entry.callingCode}',${entry.nationalLength},'${entry.nationalPattern}')`;
    assert.ok(sql.includes(literal), `catalogue SQL divergent pour ${entry.countryCode}`);
  }
  assert.doesNotMatch(sql, /national_length-1|national_length\s*-\s*1/);
});

test("les formulaires affichent un exemple par pays sans consigne globale sur le zéro", () => {
  const forms = [
    read("../src/modules/communications/personal-whatsapp-preferences.tsx"),
    read("../src/modules/tenancy/tenant-whatsapp-preferences.tsx"),
    read("../src/modules/partners/application-form.tsx"),
  ].join("\n");
  assert.match(forms, /nationalExample/);
  assert.match(forms, /nationalPattern/);
  assert.doesNotMatch(forms, /sans (?:0|préfixe 0) initial|sans préfixe 0|no leading 0|without leading 0/i);
});

test("le contexte serveur du handoff est fermé, bilingue et tolère un nom vide", () => {
  assert.equal(normalizeManualWhatsAppContext({phoneE164:"+237699001122",displayName:"",language:"xx",documentType:"rent_receipt",periodStart:"2026-10-01",periodEnd:null})?.displayName,"KJORA");
  assert.equal(normalizeManualWhatsAppContext({phoneE164:"+237699001122",displayName:"A",language:"en",documentType:"unknown",periodStart:null,periodEnd:null}),null);
  assert.equal(normalizeManualWhatsAppContext({phoneE164:"bad",displayName:"A",language:"en",documentType:"due_notice",periodStart:null,periodEnd:null}),null);
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
  assert.match(route, /Cache-Control["']\s*:\s*["']private, no-store/);
  assert.match(route, /normalizeManualWhatsAppContext/);
});

test("le locataire peut confirmer ou retirer WhatsApp uniquement via son accès portail actif", () => {
  const sql = read("../supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql");
  const route = read("../src/app/api/tenant-portal/whatsapp/route.ts");
  const view = read("../src/tenant-portal/whatsapp-preferences.tsx");
  assert.match(sql, /set_my_tenant_whatsapp_status/); assert.match(sql, /has_active_tenant_portal_access/);
  assert.match(sql, /p_action not in \('confirm_service','disable','consent_marketing','revoke_marketing'\)/); assert.match(sql, /'tenant_confirmed'/);
  assert.match(route, /confirm_service/); assert.match(route, /consent_marketing/); assert.doesNotMatch(route, /organizationId|role/);
  assert.match(route, /private, no-store/); assert.match(view, /Confirm for service/); assert.match(view, /Accept optional marketing/); assert.doesNotMatch(view, /Confirm WhatsApp/);
});

test("la migration est additive, consent-aware, append-only et garde le fournisseur disabled", () => {
  const sql = read("../supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql");
  for (const state of ["unknown", "declared", "tenant_confirmed", "verified", "disabled"]) assert.match(sql, new RegExp(`'${state}'`));
  for (const value of ["service_consent_source", "service_consent_version", "marketing_consent_source", "marketing_consent_version", "number_changed", "whatsapp_open_requested"]) assert.match(sql, new RegExp(value));
  assert.match(sql, /before update or delete/); assert.match(sql, /receipt\.share/); assert.match(sql, /status is distinct from 'ready'/);
  assert.match(sql, /review_status is distinct from 'approved'/); assert.doesNotMatch(sql, /coalesce\([^\n]*review_status[^\n]*approved/);
  for (const parameter of ["p_country_code", "p_calling_code", "p_national_number", "p_phone_e164"]) assert.match(sql, new RegExp(parameter));
  for (const parameter of ["p_whatsapp_declared", "p_service_consent", "p_marketing_consent"]) assert.match(sql, new RegExp(`${parameter} is null`));
  assert.match(sql, /old\.whatsapp_status in \('tenant_confirmed','verified'\)/); assert.match(sql, /whatsapp_status=next_status/);
  assert.match(sql, /tenant_marketing_consent_requires_tenant_action/); assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /supported_phone_countries/); assert.match(sql, /national_length/); assert.match(sql, /national_pattern/);
  assert.match(sql, /set search_path=''/); assert.match(sql, /revoke all .* from public,anon/);
  assert.doesNotMatch(sql, /phone_fingerprint|unique\s*\([^)]*phone|provider\s*=\s*'meta'|status\s*=\s*'sent'/i);
  assert.match(read("../src/modules/communications/whatsapp-provider.ts"), /enabled: false/);
});

test("Owner et partenaire disposent d’une source personnelle, distincte des autorisations", () => {
  const sql=read("../supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql");
  for(const value of ["user_communication_preferences","partner_application_communication_preferences","save_my_whatsapp_preferences","submit_partner_application_v2"])assert.match(sql,new RegExp(value));
  assert.match(read("../src/app/(internal)/app/profil/page.tsx"),/PersonalWhatsAppPreferencesForm/);
  assert.match(read("../src/modules/partners/partner-dashboard.tsx"),/PersonalWhatsAppPreferencesForm/);
  assert.match(read("../src/modules/partners/application-form.tsx"),/marketingConsent/);
  assert.match(read("../src/app/api/profile/whatsapp/route.ts"),/private, no-store/);
  assert.match(read("../src/modules/tenancy/views.tsx"),/TenantWhatsAppPreferencesForm/);
  assert.match(read("../src/app/api/tenancy/whatsapp/route.ts"),/marketingConsent!==false/);
});

test("le journal ne contient aucun numéro ou fingerprint et la PWA ne met pas les réponses privées en cache", () => {
  const sql=read("../supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql");
  const eventBlocks=[...sql.matchAll(/create table public\.(?:tenant|personal)_whatsapp_consent_events \(([\s\S]*?)\n\);/g)].map((match)=>match[1]);
  assert.equal(eventBlocks.length,2);for(const block of eventBlocks)assert.doesNotMatch(block,/phone_e164|phone_fingerprint|national_number/);
  const sw=read("../public/sw.js");assert.match(sw,/private\|no-store/);assert.match(sw,/\/api\//);
});

test("la migration de mois local déjà appliquée reste strictement inchangée", () => {
  const existing = read("../supabase/migrations/20261001090000_pilot_month_end_africa_preview.sql").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(existing).digest("hex"), "f7613cca43bc785808d10d0da64d0f0e60d3094314f959ee4f3da60225746324");
});

test("le centre de contrôle distingue WhatsApp manuel, future API, site et support", () => {
  const readiness = read("../src/modules/platform-admin/operations-readiness.ts");
  const view = read("../src/modules/platform-admin/operations-view.tsx");
  for (const key of ["commercial_site", "whatsapp_manual", "whatsapp_api", "support"]) { assert.match(readiness, new RegExp(`"${key}"`)); assert.match(view, new RegExp(`${key}:`)); }
  assert.match(readiness, /whatsapp_api: configured\("configured_disabled"/);
});

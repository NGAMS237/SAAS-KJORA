import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/20260928210200_partners_mvp_01.sql","utf8");
test("la candidature publique est bornée et limitée",()=>{assert.match(sql,/v_attempts > 3/);assert.match(sql,/between 20 and 2000/);assert.match(sql,/status_token_hash/)});
test("les quatre profils et l'acceptation des conditions sont enregistrés",()=>{
  const form=fs.readFileSync("src/modules/partners/application-form.tsx","utf8");
  for(const profile of ["commercial","referral_partner","influencer","agency"]) {
    assert.match(sql,new RegExp(`'${profile}'`));
    assert.match(form,new RegExp(`value="${profile}"`));
  }
  assert.match(sql,/terms_version text not null/);
  assert.match(sql,/terms_accepted_at timestamptz not null/);
  assert.match(form,/termsAccepted/);
});
test("l'empreinte réseau est un HMAC et le suivi exige un jeton opaque non mis en cache",()=>{const route=fs.readFileSync("src/app/api/partners/applications/route.ts","utf8");assert.match(route,/createHmac\("sha256",salt\)/);assert.match(route,/read_partner_application_status/);assert.match(route,/"Cache-Control": "no-store"/);assert.match(route,/"Referrer-Policy": "no-referrer"/);assert.doesNotMatch(route,/service_role/)});
test("le partenaire reste distinct des rôles Owner et Admin",()=>{assert.match(sql,/partner_dashboard_self/);assert.match(sql,/where user_id=\(select auth.uid\(\)\)/);assert.doesNotMatch(sql,/organization_memberships/)});
test("aucune table partenaire n'est lisible directement",()=>{assert.match(sql,/revoke all on public\.partner_applications[\s\S]*from public,anon,authenticated/)});
test("l'administration est protégée",()=>{assert.match(sql,/admin_list_partner_applications[\s\S]*assert_platform_admin/);assert.match(sql,/admin_review_partner_application[\s\S]*assert_platform_admin/)});
test("la rémunération est auditable et à quatre états",()=>{for(const s of ["pending","approved","paid","cancelled"])assert.match(sql,new RegExp(`'${s}'`));assert.match(sql,/paid_by <> approved_by/);assert.match(sql,/payment_reference_required/);assert.match(sql,/partner_reward_events/)});
test("les décisions Admin sont immuables et le paiement applique les quatre yeux",()=>{assert.match(sql,/partner_admin_events_immutable/);assert.match(sql,/four_eyes_required/);assert.match(sql,/admin_transition_partner_reward/)});
test("les données privées clientes ne figurent pas au tableau de bord",()=>{const page=fs.readFileSync("src/app/partenaire/page.tsx","utf8");assert.doesNotMatch(page,/lease_contracts|rent_payments|tenants\./)});

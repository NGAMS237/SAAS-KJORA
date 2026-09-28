import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOrganizationCurrency, isSupportedOrganizationTimezone } from "../src/core/organization/settings.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260830190349_post_6d_settings_deposit_ux.sql", import.meta.url), "utf8");

test("les fuseaux UI sont des identifiants IANA contrôlés", () => {
  assert.equal(isSupportedOrganizationTimezone("Africa/Douala"), true);
  assert.equal(isSupportedOrganizationTimezone("UTC+1 libre"), false);
});

test("la devise Organization est structurée", () => {
  // AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A : le catalogue de devises de
  // location est passé de XAF seul à 6 devises (XAF, XOF, NGN, CDF, KES,
  // ZAR) — voir src/core/currency/metadata.ts. XOF était auparavant refusé
  // par erreur dans ce test ; il est désormais une devise valide. Les
  // devises hors catalogue (EUR/USD/CAD/BTC) restent refusées.
  for (const currency of ["XAF", "XOF", "NGN", "CDF", "KES", "ZAR"]) assert.equal(isOrganizationCurrency(currency), true);
  for (const currency of ["EUR", "USD", "CAD", "BTC"]) assert.equal(isOrganizationCurrency(currency), false);
});

test("la RPC settings contrôle identité, capability, tenant et verrou financier", () => {
  assert.match(migration, /auth\.uid\(\)/i);
  assert.match(migration, /private\.has_capability\(target_organization_id, 'organization\.profile\.manage'\)/i);
  assert.match(migration, /where p\.organization_id = target_organization_id/i);
  assert.match(migration, /organization_currency_locked/i);
  assert.match(migration, /organization_currency_not_enabled/i);
  assert.match(migration, /currency_code = 'XAF'/i);
  assert.match(migration, /pg_catalog\.pg_timezone_names/i);
  assert.match(migration, /revoke all on function public\.update_organization_profile_settings[\s\S]*from public, anon/i);
});

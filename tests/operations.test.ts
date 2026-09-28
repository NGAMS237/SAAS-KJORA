import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  activityHref, dashboardPeriod, parseAuditFilters, shiftDashboardPeriod,
} from "../src/modules/operations/model.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260830125630_lot_6d_dashboard_activity_audit.sql", import.meta.url),
  "utf8",
);

test("la période dashboard est mensuelle, bornée et navigable", () => {
  assert.deepEqual(dashboardPeriod("2028-02"), { key: "2028-02", from: "2028-02-01", to: "2028-02-29" });
  assert.equal(shiftDashboardPeriod(dashboardPeriod("2026-12"), 1).key, "2027-01");
  assert.equal(shiftDashboardPeriod(dashboardPeriod("2026-01"), -1).key, "2025-12");
  assert.equal(dashboardPeriod("2026-13", new Date("2026-08-30T00:00:00Z")).key, "2026-08");
});

test("les filtres audit refusent les valeurs ambiguës", () => {
  const actor = "11000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseAuditFilters({ action: "payment.reversed", actor, from: "2026-08-01", to: "2026-08-31" }), {
    action: "payment.reversed", actor, from: "2026-08-01", to: "2026-08-31", cursorAt: null, cursorId: null,
  });
  assert.equal(parseAuditFilters({ actor: "../other-org", action: "DROP TABLE" }).actor, null);
  assert.equal(parseAuditFilters({ from: "30/08/2026" }).from, null);
});

test("activité et notifications ouvrent uniquement leur contexte autorisé", () => {
  const id = "11000000-0000-4000-8000-000000000001";
  assert.equal(activityHref({ type: "PROPERTY_CREATED", aggregateId: id, payload: {} }), `/app/biens/${id}`);
  assert.equal(activityHref({ type: "DUE_GENERATED", aggregateId: id, payload: { lease_id: id } }), `/app/locations/${id}`);
  assert.equal(activityHref({ type: "DOCUMENT_GENERATED", aggregateId: id, payload: {} }), `/api/financial-documents/${id}/download`);
  // NCE-01 : destination de notification résolue par le module fermé
  // (tests/notifications-communications-e2e-01.test.ts), plus ici.
});

test("le dashboard délègue les vérités financières à une projection SQL capability-scoped", () => {
  assert.match(migration, /create or replace function public\.get_operational_dashboard/i);
  assert.match(migration, /private\.has_capability\(target_organization_id, 'due\.view'\)/i);
  assert.match(migration, /private\.has_capability\(target_organization_id, 'payment\.view'\)/i);
  assert.match(migration, /sum\(p\.amount_xaf\)[\s\S]*p\.status = 'confirmed'/i);
  assert.match(migration, /sum\(ds\.remaining_amount_xaf\)/i);
  assert.match(migration, /covered_by_opening_credit_xaf \+ ds\.covered_by_payment_credit_xaf/i);
  assert.doesNotMatch(migration, /expected_xaf\s*-\s*collected_xaf/i);
});

test("activité, notifications et audit restent trois couches séparées", () => {
  assert.match(migration, /list_organization_activity/i);
  assert.match(migration, /mark_all_notifications_read/i);
  assert.match(migration, /list_operational_audit/i);
  assert.match(migration, /payment\.reversed/i);
  assert.match(migration, /document\.invalidated/i);
  assert.match(migration, /domain_events_audit_sensitive_actions/i);
});

test("les RPC 6D refusent PUBLIC et anon et conservent les contrôles d’identité", () => {
  for (const fn of ["get_operational_dashboard", "list_organization_activity", "mark_all_notifications_read", "set_notification_read_state", "list_operational_audit", "get_operational_health"]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\([\\s\\S]*?from public, anon`, "i"));
  }
  assert.match(migration, /\(select auth\.uid\(\)\) is null/i);
  assert.match(migration, /private\.has_capability\(target_organization_id, 'audit\.view'\)/i);
});

test("le rollout 6D ne déclenche ni email, ni backfill, ni portail", () => {
  assert.doesNotMatch(migration, /update public\.organization_communication_settings/i);
  assert.doesNotMatch(migration, /insert into public\.message_deliveries/i);
  assert.doesNotMatch(migration, /TenantPortalAccess|tenant_portal/i);
  assert.doesNotMatch(migration, /insert into public\.administrative_audit_log[\s\S]{0,500}\)\s*select/i);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calendarEntryProration,
  calendarExitProration,
  parseLeaseInput,
  parseTenantInput,
} from "../src/modules/tenancy/model.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260826213000_lot_6b_tenants_leases.sql", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../src/core/navigation/navigation.ts", import.meta.url), "utf8");

const tenantBase = { fullName: "Jeanne Mbarga", phone: "+237699000111", email: "", preferredLanguage: "fr", profession: "Commerçante", identityDocumentType: "", identityDocumentNumber: "", identityDocumentExpiresOn: "", internalNotes: "" };
const leaseBase = { tenantId: "11000000-0000-4000-8000-000000000001", propertyId: "12000000-0000-4000-8000-000000000001", unitId: "13000000-0000-4000-8000-000000000001", startDate: "2026-08-15", endDate: "", baseRentXaf: 200000, recurringChargesXaf: 25000, securityDepositXaf: 200000, initialPrepaymentPeriods: 1, initialPrepaymentAmountXaf: 225000, billingFrequency: "monthly", dueDay: 5, generateDueDaysBefore: 5, overdueReminderDaysAfter: 1, entryProrationMode: "calendar_days", exitProrationMode: "calendar_days", entryProrationOverrideXaf: "", entryProrationOverrideReason: "", exitProrationOverrideXaf: "", exitProrationOverrideReason: "" };

test("tenant accepts phone only", () => assert.equal(parseTenantInput(tenantBase).ok, true));
test("tenant accepts email only", () => assert.equal(parseTenantInput({ ...tenantBase, phone: "", email: "jeanne@example.com" }).ok, true));
test("tenant rejects no contact", () => assert.deepEqual(parseTenantInput({ ...tenantBase, phone: "", email: "" }), { ok: false, error: "tenant_contact_required" }));
test("tenant normalizes email", () => { const parsed = parseTenantInput({ ...tenantBase, phone: "", email: " JEANNE@EXAMPLE.COM " }); assert.equal(parsed.ok && parsed.value.email, "jeanne@example.com"); });
test("tenant requires identity type and number together", () => assert.equal(parseTenantInput({ ...tenantBase, identityDocumentType: "cni" }).ok, false));
test("lease parses separate amounts and scheduling metadata", () => { const parsed = parseLeaseInput(leaseBase); assert.equal(parsed.ok, true); if (parsed.ok) { assert.equal(parsed.value.baseRentXaf, 200000); assert.equal(parsed.value.recurringChargesXaf, 25000); assert.equal(parsed.value.generateDueDaysBefore, 5); } });
test("lease rejects zero base rent", () => assert.equal(parseLeaseInput({ ...leaseBase, baseRentXaf: 0 }).ok, false));
test("lease accepts day 31", () => assert.equal(parseLeaseInput({ ...leaseBase, dueDay: 31 }).ok, true));
test("lease rejects invalid due day", () => assert.equal(parseLeaseInput({ ...leaseBase, dueDay: 32 }).ok, false));
test("lease rejects end before start", () => assert.equal(parseLeaseInput({ ...leaseBase, endDate: "2026-08-14" }).ok, false));
test("manual proration correction requires a reason", () => assert.equal(parseLeaseInput({ ...leaseBase, entryProrationOverrideXaf: 120000 }).ok, false));
test("calendar entry proration uses inclusive remaining days", () => assert.equal(calendarEntryProration(310000, "2026-08-16", "calendar_days"), 160000));
test("calendar exit proration uses occupied calendar days", () => assert.equal(calendarExitProration(310000, "2026-08-10", "calendar_days"), 100000));
test("none proration preserves periodic total", () => assert.equal(calendarEntryProration(225000, "2026-08-15", "none"), 225000));
test("migration derives periodic total and occupancy rather than storing a boolean", () => { assert.match(migration, /periodic_total_xaf bigint generated always/i); assert.doesNotMatch(migration, /occup(?:ied|ancy)\s+boolean/i); });
test("migration excludes active overlapping periods at database level", () => { assert.match(migration, /constraint leases_active_period_no_overlap exclude using gist/i); assert.match(migration, /where \(status = 'active'\)/i); });
test("draft creation and explicit activation are separate", () => { assert.match(migration, /status text not null default 'draft'/i); assert.match(migration, /LEASE_ACTIVATED/); });
test("ended leases free units while active leases prevent archival", () => { assert.match(migration, /status = 'ended'/i); assert.match(migration, /prevent_archiving_occupied_unit/i); });
test("tenant private fields use a capability-checked projection", () => { assert.match(migration, /get_tenant_private_profile/i); assert.match(migration, /has_capability\(target_organization_id, 'tenant.manage'\)/i); });
test("locations is a central capability-filtered navigation item", () => assert.match(navigation, /href: "\/app\/locations"[\s\S]*requiredCapability: "lease.view"/));
test("Lot 6B does not create financial truth tables", () => { assert.doesNotMatch(migration, /create table public\.(dues|charges|ledger|payments|payment_allocations|receipts)/i); });

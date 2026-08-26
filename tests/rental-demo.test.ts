import assert from "node:assert/strict";
import test from "node:test";
import {
  activateDemoLease, addDemoLease, addDemoProperty, addDemoTenant, addDemoUnit,
  initialDemoRentalState, unitOccupancy, DemoValidationError,
} from "../src/modules/rental-demo/model.ts";

function emptyState() { return { properties: [], units: [], tenants: [], leases: [] }; }

test("créer une maison produit toujours l'Unit explicite Maison entière", () => {
  const state = addDemoProperty(emptyState(), { name: "Maison Test", locality: "Douala", type: "house" }, "p1", "u1");
  assert.equal(state.properties[0]?.type, "house");
  assert.deepEqual(state.units[0], { id: "u1", propertyId: "p1", label: "Maison entière", type: "whole_house" });
});

test("un immeuble accepte plusieurs Units distinctes et vacantes", () => {
  let state = addDemoProperty(emptyState(), { name: "Immeuble Test", locality: "Yaoundé", type: "building" }, "p1", "unused");
  state = addDemoUnit(state, { propertyId: "p1", label: "Appartement A1", type: "apartment" }, "u1");
  state = addDemoUnit(state, { propertyId: "p1", label: "Studio B1", type: "studio" }, "u2");
  assert.equal(state.units.length, 2);
  assert.equal(unitOccupancy(state, "u1"), "vacant");
});

test("un locataire peut être créé avec téléphone seulement sans accès portail", () => {
  const state = addDemoTenant(emptyState(), { name: "Téléphone Démo", phone: "+237 600 000 000" }, "t1");
  assert.equal(state.tenants[0]?.email, undefined);
  assert.equal(state.tenants[0]?.portalAccess, "none");
});

test("un locataire peut être créé avec email seulement sans accès portail", () => {
  const state = addDemoTenant(emptyState(), { name: "Email Demo", email: "demo@example.test" }, "t1");
  assert.equal(state.tenants[0]?.phone, undefined);
  assert.equal(state.tenants[0]?.portalAccess, "none");
});

test("un locataire sans téléphone ni email est refusé", () => {
  assert.throws(() => addDemoTenant(emptyState(), { name: "Sans Contact" }, "t1"), (error) => error instanceof DemoValidationError && error.code === "tenant-contact");
});

test("un brouillon de bail n'occupe pas l'Unit puis son activation l'occupe", () => {
  const base = {
    properties: [{ id: "p1", name: "Maison", locality: "Douala", type: "house" as const }],
    units: [{ id: "u1", propertyId: "p1", label: "Maison entière", type: "whole_house" as const }],
    tenants: [{ id: "t1", name: "Tenant Demo", phone: "+237 600", portalAccess: "none" as const }],
    leases: [],
  };
  const draft = addDemoLease(base, { unitId: "u1", tenantId: "t1", amountXaf: 100000, frequency: "monthly", startDate: "2026-09-01", dueDay: 5 }, "l1");
  assert.equal(draft.leases[0]?.status, "draft");
  assert.equal(unitOccupancy(draft, "u1"), "vacant");
  const active = activateDemoLease(draft, "l1");
  assert.equal(active.leases[0]?.status, "active");
  assert.equal(unitOccupancy(active, "u1"), "occupied");
});

test("l'activation refuse deux périodes de bail qui se chevauchent", () => {
  const state = {
    ...initialDemoRentalState,
    leases: [
      ...initialDemoRentalState.leases,
      { id: "overlap", unitId: "unit-akwa-a1", tenantId: "tenant-jane", amountXaf: 200000, frequency: "monthly" as const, startDate: "2026-08-15", dueDay: 5, status: "draft" as const },
    ],
  };
  assert.throws(() => activateDemoLease(state, "overlap"), (error) => error instanceof DemoValidationError && error.code === "lease-overlap");
});

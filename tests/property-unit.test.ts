import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterProperties,
  parsePropertyInput,
  parsePropertyUpdate,
  parseUnitInput,
  parseUnitUpdate,
  type PropertySummary,
} from "../src/modules/properties/model.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826190000_lot_6a_properties_units.sql", import.meta.url),
  "utf8",
);

test("la création Property valide le minimum maison/immeuble", () => {
  assert.deepEqual(parsePropertyInput({ name: " Maison Akwa ", locality: " Douala ", type: "house" }), {
    ok: true,
    value: { name: "Maison Akwa", locality: "Douala", type: "house" },
  });
  assert.equal(parsePropertyInput({ name: "", locality: "Douala", type: "building" }).ok, false);
  assert.equal(parsePropertyInput({ name: "Test", locality: "Douala", type: "warehouse" }).ok, false);
});

test("la modification Property ne permet pas de réécrire le type", () => {
  const result = parsePropertyUpdate({ name: "Immeuble A", locality: "Yaoundé", type: "house" });
  assert.deepEqual(result, { ok: true, value: { name: "Immeuble A", locality: "Yaoundé" } });
  assert.match(migration, /property_type_immutable/i);
});

test("la recherche Property porte sur nom et localité", () => {
  const properties: PropertySummary[] = [
    { id: "p1", name: "Résidence Bastos", locality: "Yaoundé", type: "building", status: "active", unitCount: 2, vacantCount: 2 },
    { id: "p2", name: "Maison Akwa", locality: "Douala", type: "house", status: "active", unitCount: 1, vacantCount: 1 },
  ];
  assert.deepEqual(filterProperties(properties, "bastos").map((property) => property.id), ["p1"]);
  assert.deepEqual(filterProperties(properties, "douala").map((property) => property.id), ["p2"]);
  assert.equal(filterProperties(properties, "inconnu").length, 0);
});

test("Unit accepte Chambre et superficie facultative", () => {
  const propertyId = "20000000-0000-4000-8000-00000000000a";
  assert.deepEqual(parseUnitInput({ propertyId, label: " Chambre 3 ", type: "room", areaSqm: "16.5" }), {
    ok: true,
    value: { propertyId, label: "Chambre 3", type: "room", areaSqm: 16.5 },
  });
  assert.equal(parseUnitInput({ propertyId, label: "Studio", type: "studio", areaSqm: "" }).ok, true);
  assert.equal(parseUnitInput({ propertyId, label: "Studio", type: "studio", areaSqm: "-2" }).ok, false);
});

test("Maison entière reste une Unit système non duplicable", () => {
  const propertyId = "20000000-0000-4000-8000-00000000000a";
  assert.equal(parseUnitInput({ propertyId, label: "Maison entière", type: "whole_house" }).ok, false);
  assert.deepEqual(parseUnitUpdate({ label: "Maison entière", type: "apartment", areaSqm: null }, "whole_house"), {
    ok: true,
    value: { label: "Maison entière", type: "whole_house", areaSqm: null },
  });
  assert.match(migration, /units_one_whole_house_idx/i);
  assert.match(migration, /new\.type = 'house'[\s\S]*'Maison entière'[\s\S]*'whole_house'/i);
});

test("la migration protège isolation, archivage et occupation future", () => {
  assert.match(migration, /foreign key \(organization_id, property_id\)[\s\S]*references public\.properties \(organization_id, id\)/i);
  assert.match(migration, /alter table public\.properties enable row level security/i);
  assert.match(migration, /alter table public\.units enable row level security/i);
  assert.match(migration, /private\.has_capability\(organization_id, 'property\.manage'\)/i);
  assert.match(migration, /private\.has_capability\(organization_id, 'unit\.manage'\)/i);
  assert.match(migration, /policy "domain events are internal only"[\s\S]*using \(false\)/i);
  assert.match(migration, /grant update \(name, locality, status\)[\s\S]*public\.properties/i);
  assert.match(migration, /grant update \(label, type, area_sqm, status\)[\s\S]*public\.units/i);
  assert.match(migration, /property_archived_immutable/i);
  assert.match(migration, /unit_archived_immutable/i);
  assert.doesNotMatch(migration, /occupied\s+(boolean|bool)/i);
  assert.doesNotMatch(migration, /grant[\s\S]{0,80}delete[\s\S]{0,80}public\.(properties|units)/i);
  assert.match(migration, /event_type[^\n]*PROPERTY_CREATED/i);
});

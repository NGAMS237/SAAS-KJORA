import assert from "node:assert/strict";
import test from "node:test";
import {
  selectActiveOrganization,
  type OrganizationOption,
} from "../src/core/organization/select-active-organization.ts";

const organizationA: OrganizationOption = {
  id: "00000000-0000-4000-8000-00000000000a", name: "Org A", role: "organization_owner",
  countryCode: "CM", currencyCode: "XAF", language: "fr", timezone: "Africa/Douala",
};
const organizationB: OrganizationOption = {
  id: "00000000-0000-4000-8000-00000000000b", name: "Org B", role: "organization_owner",
  countryCode: "CM", currencyCode: "XAF", language: "en", timezone: "Africa/Douala",
};

test("une Organization unique devient active automatiquement", () => {
  assert.equal(selectActiveOrganization([organizationA], null), organizationA);
});

test("une Organization demandée hors périmètre n'est jamais injectée", () => {
  assert.equal(selectActiveOrganization([organizationA], organizationB.id), organizationA);
});

test("un membre A+B peut choisir B sans fusionner les contextes", () => {
  const organizations = [organizationA, organizationB];
  const selected = selectActiveOrganization(organizations, organizationB.id);
  assert.equal(selected, organizationB);
  assert.equal(selected?.id, organizationB.id);
  assert.deepEqual(organizations, [organizationA, organizationB]);
});

test("aucune Organization accessible produit un contexte vide", () => {
  assert.equal(selectActiveOrganization([], organizationA.id), null);
});

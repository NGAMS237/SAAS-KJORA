export type PropertyType = "house" | "building";
export type UnitType = "whole_house" | "apartment" | "studio" | "shop";
export type Occupancy = "vacant" | "occupied";
export type LeaseFrequency = "monthly" | "quarterly" | "semiannual" | "annual";
export type LeaseStatus = "draft" | "active" | "closed";

export type DemoProperty = { id: string; name: string; locality: string; type: PropertyType };
export type DemoUnit = { id: string; propertyId: string; label: string; type: UnitType };
export type DemoTenant = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  preferredLanguage?: "fr" | "en";
  portalAccess: "none";
};
export type DemoLease = {
  id: string;
  unitId: string;
  tenantId: string;
  amountXaf: number;
  frequency: LeaseFrequency;
  startDate: string;
  dueDay: number;
  endDate?: string;
  status: LeaseStatus;
};
export type DemoRentalState = {
  properties: DemoProperty[];
  units: DemoUnit[];
  tenants: DemoTenant[];
  leases: DemoLease[];
};

export class DemoValidationError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export const initialDemoRentalState: DemoRentalState = {
  properties: [
    { id: "prop-bonamoussadi", name: "Maison Bonamoussadi", locality: "Douala · Bonamoussadi", type: "house" },
    { id: "prop-akwa", name: "Immeuble Akwa", locality: "Douala · Akwa", type: "building" },
    { id: "prop-bastos", name: "Résidence Bastos", locality: "Yaoundé · Bastos", type: "building" },
  ],
  units: [
    { id: "unit-maison-entiere", propertyId: "prop-bonamoussadi", label: "Maison entière", type: "whole_house" },
    { id: "unit-akwa-a1", propertyId: "prop-akwa", label: "Appartement A1", type: "apartment" },
    { id: "unit-akwa-a2", propertyId: "prop-akwa", label: "Appartement A2", type: "apartment" },
    { id: "unit-akwa-b1", propertyId: "prop-akwa", label: "Studio B1", type: "studio" },
    { id: "unit-bastos-rdc", propertyId: "prop-bastos", label: "Boutique RDC", type: "shop" },
  ],
  tenants: [
    { id: "tenant-amine", name: "Amine Démo", phone: "+237 600 000 001 (fictif)", preferredLanguage: "fr", portalAccess: "none" },
    { id: "tenant-jane", name: "Jane Example", email: "jane@example.test", preferredLanguage: "en", portalAccess: "none" },
  ],
  leases: [
    { id: "lease-demo-active", unitId: "unit-akwa-a1", tenantId: "tenant-amine", amountXaf: 240000, frequency: "monthly", startDate: "2026-08-01", dueDay: 5, status: "active" },
  ],
};

export function addDemoProperty(
  state: DemoRentalState,
  input: Omit<DemoProperty, "id">,
  propertyId: string,
  houseUnitId: string,
) {
  if (!input.name.trim() || !input.locality.trim() || !["house", "building"].includes(input.type)) {
    throw new DemoValidationError("property-required");
  }
  const property = { ...input, id: propertyId, name: input.name.trim(), locality: input.locality.trim() };
  const units = input.type === "house"
    ? [...state.units, { id: houseUnitId, propertyId, label: "Maison entière", type: "whole_house" as const }]
    : state.units;
  return { ...state, properties: [...state.properties, property], units };
}

export function addDemoUnit(state: DemoRentalState, input: Omit<DemoUnit, "id">, id: string) {
  if (!state.properties.some((property) => property.id === input.propertyId) || !input.label.trim()) {
    throw new DemoValidationError("unit-required");
  }
  return { ...state, units: [...state.units, { ...input, id, label: input.label.trim() }] };
}

export function addDemoTenant(state: DemoRentalState, input: Omit<DemoTenant, "id" | "portalAccess">, id: string) {
  if (!input.name.trim()) throw new DemoValidationError("tenant-name");
  if (!input.phone?.trim() && !input.email?.trim()) throw new DemoValidationError("tenant-contact");
  const tenant: DemoTenant = {
    id,
    name: input.name.trim(),
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    preferredLanguage: input.preferredLanguage,
    portalAccess: "none",
  };
  return { ...state, tenants: [...state.tenants, tenant] };
}

export function addDemoLease(state: DemoRentalState, input: Omit<DemoLease, "id" | "status">, id: string): DemoRentalState {
  if (!state.units.some((unit) => unit.id === input.unitId) || !state.tenants.some((tenant) => tenant.id === input.tenantId)) {
    throw new DemoValidationError("lease-reference");
  }
  if (input.amountXaf <= 0 || input.dueDay < 1 || input.dueDay > 28 || !input.startDate) {
    throw new DemoValidationError("lease-required");
  }
  if (input.endDate && input.endDate < input.startDate) throw new DemoValidationError("lease-dates");
  const lease: DemoLease = { ...input, id, status: "draft" };
  return { ...state, leases: [...state.leases, lease] };
}

function periodsOverlap(left: DemoLease, right: DemoLease) {
  const leftEnd = left.endDate || "9999-12-31";
  const rightEnd = right.endDate || "9999-12-31";
  return left.startDate <= rightEnd && right.startDate <= leftEnd;
}

export function activateDemoLease(state: DemoRentalState, leaseId: string) {
  const candidate = state.leases.find((lease) => lease.id === leaseId);
  if (!candidate || candidate.status !== "draft") throw new DemoValidationError("lease-not-draft");
  const conflict = state.leases.some((lease) => lease.id !== leaseId
    && lease.unitId === candidate.unitId
    && lease.status === "active"
    && periodsOverlap(lease, candidate));
  if (conflict) throw new DemoValidationError("lease-overlap");
  return { ...state, leases: state.leases.map((lease) => lease.id === leaseId ? { ...lease, status: "active" as const } : lease) };
}

export function closeDemoLease(state: DemoRentalState, leaseId: string, endDate: string) {
  return { ...state, leases: state.leases.map((lease) => lease.id === leaseId ? { ...lease, status: "closed" as const, endDate } : lease) };
}

export function activeLeaseForUnit(state: DemoRentalState, unitId: string) {
  return state.leases.find((lease) => lease.unitId === unitId && lease.status === "active") ?? null;
}

export function unitOccupancy(state: DemoRentalState, unitId: string): Occupancy {
  return activeLeaseForUnit(state, unitId) ? "occupied" : "vacant";
}

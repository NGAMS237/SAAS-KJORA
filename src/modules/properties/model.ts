export const PROPERTY_TYPES = ["house", "building"] as const;
export const UNIT_TYPES = ["whole_house", "apartment", "studio", "room", "shop", "office"] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type UnitType = (typeof UNIT_TYPES)[number];
export type ResourceStatus = "active" | "archived";

export type PropertySummary = {
  id: string;
  name: string;
  locality: string;
  type: PropertyType;
  status: ResourceStatus;
  unitCount: number;
  vacantCount: number;
};

export type UnitRecord = {
  id: string;
  propertyId: string;
  label: string;
  type: UnitType;
  areaSqm: number | null;
  status: ResourceStatus;
  occupancy: "vacant" | "occupied";
  activeLeaseId: string | null;
  activeTenantName: string | null;
};

export type PropertyDetail = Omit<PropertySummary, "unitCount" | "vacantCount"> & {
  units: UnitRecord[];
};

export type PropertyInput = {
  name: string;
  locality: string;
  type: PropertyType;
};

export type UnitInput = {
  propertyId: string;
  label: string;
  type: UnitType;
  areaSqm: number | null;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parsePropertyInput(input: Record<string, unknown>): ValidationResult<PropertyInput> {
  const name = trimmed(input.name);
  const locality = trimmed(input.locality);
  const type = input.type;
  if (name.length < 2 || name.length > 120) return { ok: false, error: "invalid_property_name" };
  if (locality.length < 2 || locality.length > 160) return { ok: false, error: "invalid_property_locality" };
  if (typeof type !== "string" || !(PROPERTY_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "invalid_property_type" };
  }
  return { ok: true, value: { name, locality, type: type as PropertyType } };
}

export function parsePropertyUpdate(input: Record<string, unknown>): ValidationResult<Omit<PropertyInput, "type">> {
  const name = trimmed(input.name);
  const locality = trimmed(input.locality);
  if (name.length < 2 || name.length > 120) return { ok: false, error: "invalid_property_name" };
  if (locality.length < 2 || locality.length > 160) return { ok: false, error: "invalid_property_locality" };
  return { ok: true, value: { name, locality } };
}

export function parseUnitInput(input: Record<string, unknown>): ValidationResult<UnitInput> {
  const propertyId = trimmed(input.propertyId);
  const label = trimmed(input.label);
  const type = input.type;
  const rawArea = input.areaSqm;
  const areaSqm = rawArea === "" || rawArea === null || rawArea === undefined ? null : Number(rawArea);
  if (!UUID_PATTERN.test(propertyId)) return { ok: false, error: "invalid_property" };
  if (label.length < 1 || label.length > 120) return { ok: false, error: "invalid_unit_label" };
  if (typeof type !== "string" || !(UNIT_TYPES as readonly string[]).includes(type) || type === "whole_house") {
    return { ok: false, error: "invalid_unit_type" };
  }
  if (areaSqm !== null && (!Number.isFinite(areaSqm) || areaSqm <= 0 || areaSqm > 1_000_000)) {
    return { ok: false, error: "invalid_unit_area" };
  }
  return { ok: true, value: { propertyId, label, type: type as UnitType, areaSqm } };
}

export function parseUnitUpdate(
  input: Record<string, unknown>,
  currentType: UnitType,
): ValidationResult<Omit<UnitInput, "propertyId">> {
  const label = trimmed(input.label);
  const requestedType = currentType === "whole_house" ? "whole_house" : input.type;
  const rawArea = input.areaSqm;
  const areaSqm = rawArea === "" || rawArea === null || rawArea === undefined ? null : Number(rawArea);
  if (label.length < 1 || label.length > 120) return { ok: false, error: "invalid_unit_label" };
  if (typeof requestedType !== "string" || !(UNIT_TYPES as readonly string[]).includes(requestedType)) {
    return { ok: false, error: "invalid_unit_type" };
  }
  if (areaSqm !== null && (!Number.isFinite(areaSqm) || areaSqm <= 0 || areaSqm > 1_000_000)) {
    return { ok: false, error: "invalid_unit_area" };
  }
  return { ok: true, value: { label, type: requestedType as UnitType, areaSqm } };
}

export function filterProperties(properties: readonly PropertySummary[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...properties];
  return properties.filter((property) =>
    `${property.name} ${property.locality}`.toLocaleLowerCase().includes(normalized),
  );
}

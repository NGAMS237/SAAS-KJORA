import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PropertyDetail, PropertySummary, PropertyType, ResourceStatus, UnitRecord, UnitType } from "@/modules/properties/model";

type PropertyRow = {
  id: string;
  name: string;
  locality: string;
  type: PropertyType;
  status: ResourceStatus;
};

type UnitRow = {
  id: string;
  property_id: string;
  label: string;
  type: UnitType;
  area_sqm: number | string | null;
  status: ResourceStatus;
};

function toUnit(row: UnitRow): UnitRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    label: row.label,
    type: row.type,
    areaSqm: row.area_sqm === null ? null : Number(row.area_sqm),
    status: row.status,
    occupancy: "vacant",
  };
}

export async function listActiveProperties(organizationId: string): Promise<PropertySummary[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: propertyData, error: propertyError }, { data: unitData, error: unitError }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, locality, type, status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("units")
      .select("id, property_id, label, type, area_sqm, status")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(1000),
  ]);
  if (propertyError) throw propertyError;
  if (unitError) throw unitError;
  const counts = new Map<string, number>();
  for (const unit of (unitData ?? []) as UnitRow[]) {
    counts.set(unit.property_id, (counts.get(unit.property_id) ?? 0) + 1);
  }
  return ((propertyData ?? []) as PropertyRow[]).map((property) => ({
    id: property.id,
    name: property.name,
    locality: property.locality,
    type: property.type,
    status: property.status,
    unitCount: counts.get(property.id) ?? 0,
    vacantCount: counts.get(property.id) ?? 0,
  }));
}

export async function getPropertyDetail(
  organizationId: string,
  propertyId: string,
): Promise<PropertyDetail | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: property, error: propertyError }, { data: units, error: unitError }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, locality, type, status")
      .eq("organization_id", organizationId)
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("units")
      .select("id, property_id, label, type, area_sqm, status")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);
  if (propertyError) throw propertyError;
  if (unitError) throw unitError;
  if (!property) return null;
  return { ...(property as PropertyRow), units: ((units ?? []) as UnitRow[]).map(toUnit) };
}

export async function getUnitDetail(
  organizationId: string,
  propertyId: string,
  unitId: string,
) {
  const supabase = await createSupabaseServerClient();
  const [{ data: property, error: propertyError }, { data: unit, error: unitError }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, name, locality, type, status")
      .eq("organization_id", organizationId)
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("units")
      .select("id, property_id, label, type, area_sqm, status")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId)
      .eq("id", unitId)
      .maybeSingle(),
  ]);
  if (propertyError) throw propertyError;
  if (unitError) throw unitError;
  if (!property || !unit) return null;
  return { property: property as PropertyRow, unit: toUnit(unit as UnitRow) };
}

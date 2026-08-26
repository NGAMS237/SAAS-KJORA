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

type ActiveLeaseRow = { id: string; unit_id: string; tenant_id: string };

function toUnit(row: UnitRow, activeLease?: ActiveLeaseRow, tenantName?: string): UnitRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    label: row.label,
    type: row.type,
    areaSqm: row.area_sqm === null ? null : Number(row.area_sqm),
    status: row.status,
    occupancy: activeLease ? "occupied" : "vacant",
    activeLeaseId: activeLease?.id ?? null,
    activeTenantName: tenantName ?? null,
  };
}

export async function listActiveProperties(organizationId: string): Promise<PropertySummary[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data: propertyData, error: propertyError }, { data: unitData, error: unitError }, { data: leaseData, error: leaseError }] = await Promise.all([
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
    supabase.from("leases").select("unit_id").eq("organization_id", organizationId).eq("status", "active").limit(1000),
  ]);
  if (propertyError) throw propertyError;
  if (unitError) throw unitError;
  if (leaseError) throw leaseError;
  const occupied = new Set((leaseData ?? []).map((lease) => lease.unit_id));
  const counts = new Map<string, number>();
  const vacant = new Map<string, number>();
  for (const unit of (unitData ?? []) as UnitRow[]) {
    counts.set(unit.property_id, (counts.get(unit.property_id) ?? 0) + 1);
    if (!occupied.has(unit.id)) vacant.set(unit.property_id, (vacant.get(unit.property_id) ?? 0) + 1);
  }
  return ((propertyData ?? []) as PropertyRow[]).map((property) => ({
    id: property.id,
    name: property.name,
    locality: property.locality,
    type: property.type,
    status: property.status,
    unitCount: counts.get(property.id) ?? 0,
    vacantCount: vacant.get(property.id) ?? 0,
  }));
}

export async function getPropertyDetail(
  organizationId: string,
  propertyId: string,
): Promise<PropertyDetail | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: property, error: propertyError }, { data: units, error: unitError }, { data: leases, error: leaseError }, { data: tenants, error: tenantError }] = await Promise.all([
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
    supabase.from("leases").select("id, unit_id, tenant_id").eq("organization_id", organizationId).eq("property_id", propertyId).eq("status", "active"),
    supabase.from("tenants").select("id, full_name").eq("organization_id", organizationId).limit(1000),
  ]);
  if (propertyError) throw propertyError;
  if (unitError) throw unitError;
  if (leaseError) throw leaseError;
  if (tenantError) throw tenantError;
  if (!property) return null;
  const active = new Map(((leases ?? []) as ActiveLeaseRow[]).map((lease) => [lease.unit_id, lease]));
  const names = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant.full_name]));
  return { ...(property as PropertyRow), units: ((units ?? []) as UnitRow[]).map((row) => { const lease = active.get(row.id); return toUnit(row, lease, lease ? names.get(lease.tenant_id) : undefined); }) };
}

export async function getUnitDetail(
  organizationId: string,
  propertyId: string,
  unitId: string,
) {
  const supabase = await createSupabaseServerClient();
  const [{ data: property, error: propertyError }, { data: unit, error: unitError }, { data: lease, error: leaseError }] = await Promise.all([
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
    supabase.from("leases").select("id, unit_id, tenant_id").eq("organization_id", organizationId).eq("unit_id", unitId).eq("status", "active").maybeSingle(),
  ]);
  if (propertyError) throw propertyError;
  if (unitError) throw unitError;
  if (leaseError) throw leaseError;
  if (!property || !unit) return null;
  let tenantName: string | undefined;
  if (lease) {
    const { data: tenant, error } = await supabase.from("tenants").select("full_name").eq("organization_id", organizationId).eq("id", lease.tenant_id).maybeSingle();
    if (error) throw error;
    tenantName = tenant?.full_name;
  }
  return { property: property as PropertyRow, unit: toUnit(unit as UnitRow, lease as ActiveLeaseRow | undefined, tenantName) };
}

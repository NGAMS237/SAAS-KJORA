import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GLOBAL_OVERDUE_REMINDER_DAYS } from "@/modules/tenancy/model";
import type {
  BillingFrequency,
  IdentityDocumentType,
  LeaseInput,
  LeaseOptions,
  LeaseStatus,
  LeaseSummary,
  ProrationMode,
  TenantDetail,
  TenantLanguage,
  TenantSummary,
} from "@/modules/tenancy/model";
import type { UnitType } from "@/modules/properties/model";

type TenantRow = {
  id: string;
  full_name: string;
  civility: "M." | "Mme" | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  preferred_language: TenantLanguage | null;
  profession: string | null;
};

type LeaseRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  unit_id: string;
  status: LeaseStatus;
  start_date: string;
  end_date: string | null;
  ended_on: string | null;
  end_reason: string | null;
  base_rent_xaf: number | string;
  recurring_charges_xaf: number | string;
  periodic_total_xaf: number | string;
  security_deposit_xaf: number | string;
  initial_prepayment_amount_xaf: number | string;
  prepaid_full_periods: number | string;
  prepayment_remainder_xaf: number | string;
  billing_frequency: BillingFrequency;
  due_day: number;
  generate_due_days_before: number;
  overdue_reminder_days_after: number;
  entry_proration_mode: ProrationMode;
  exit_proration_mode: ProrationMode;
  entry_proration_override_xaf: number | string | null;
  entry_proration_override_reason: string | null;
  exit_proration_override_xaf: number | string | null;
  exit_proration_override_reason: string | null;
  payment_terms: string | null;
};

type PropertyRow = { id: string; name: string };
type UnitRow = { id: string; property_id: string; label: string; type: UnitType; reference_rent_xaf: number | string | null };

const LEASE_COLUMNS = "id, tenant_id, property_id, unit_id, status, start_date, end_date, ended_on, end_reason, base_rent_xaf, recurring_charges_xaf, periodic_total_xaf, security_deposit_xaf, initial_prepayment_amount_xaf, prepaid_full_periods, prepayment_remainder_xaf, billing_frequency, due_day, generate_due_days_before, overdue_reminder_days_after, entry_proration_mode, exit_proration_mode, entry_proration_override_xaf, entry_proration_override_reason, exit_proration_override_xaf, exit_proration_override_reason, payment_terms";

function optionalNumber(value: number | string | null) {
  return value === null ? null : Number(value);
}

function toLease(
  row: LeaseRow,
  tenants: Map<string, string>,
  properties: Map<string, string>,
  units: Map<string, string>,
): LeaseSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    propertyId: row.property_id,
    unitId: row.unit_id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    endedOn: row.ended_on,
    endReason: row.end_reason,
    baseRentXaf: Number(row.base_rent_xaf),
    recurringChargesXaf: Number(row.recurring_charges_xaf),
    periodicTotalXaf: Number(row.periodic_total_xaf),
    securityDepositXaf: Number(row.security_deposit_xaf),
    initialPrepaymentAmountXaf: Number(row.initial_prepayment_amount_xaf),
    prepaidFullPeriods: Number(row.prepaid_full_periods),
    prepaymentRemainderXaf: Number(row.prepayment_remainder_xaf),
    billingFrequency: row.billing_frequency,
    dueDay: row.due_day,
    generateDueDaysBefore: row.generate_due_days_before,
    overdueReminderDaysAfter: row.overdue_reminder_days_after,
    entryProrationMode: row.entry_proration_mode,
    exitProrationMode: row.exit_proration_mode,
    entryProrationOverrideXaf: optionalNumber(row.entry_proration_override_xaf),
    entryProrationOverrideReason: row.entry_proration_override_reason,
    exitProrationOverrideXaf: optionalNumber(row.exit_proration_override_xaf),
    exitProrationOverrideReason: row.exit_proration_override_reason,
    paymentTerms: row.payment_terms,
    tenantName: tenants.get(row.tenant_id) ?? "—",
    propertyName: properties.get(row.property_id) ?? "—",
    unitLabel: units.get(row.unit_id) ?? "—",
  };
}

async function loadLeaseMappings(organizationId: string) {
  const supabase = await createSupabaseServerClient();
  const [tenantResult, propertyResult, unitResult] = await Promise.all([
    supabase.from("tenants").select("id, full_name").eq("organization_id", organizationId).limit(1000),
    supabase.from("properties").select("id, name").eq("organization_id", organizationId).limit(500),
    supabase.from("units").select("id, label").eq("organization_id", organizationId).limit(2000),
  ]);
  if (tenantResult.error) throw tenantResult.error;
  if (propertyResult.error) throw propertyResult.error;
  if (unitResult.error) throw unitResult.error;
  return {
    tenants: new Map((tenantResult.data ?? []).map((row) => [row.id, row.full_name])),
    properties: new Map((propertyResult.data ?? []).map((row) => [row.id, row.name])),
    units: new Map((unitResult.data ?? []).map((row) => [row.id, row.label])),
  };
}

export async function listLeases(organizationId: string): Promise<LeaseSummary[]> {
  const supabase = await createSupabaseServerClient();
  const [leaseResult, mappings] = await Promise.all([
    supabase.from("leases").select(LEASE_COLUMNS).eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500),
    loadLeaseMappings(organizationId),
  ]);
  if (leaseResult.error) throw leaseResult.error;
  return ((leaseResult.data ?? []) as LeaseRow[]).map((row) => toLease(row, mappings.tenants, mappings.properties, mappings.units));
}

export async function getLeaseDetail(organizationId: string, leaseId: string): Promise<LeaseSummary | null> {
  const supabase = await createSupabaseServerClient();
  const [leaseResult, mappings] = await Promise.all([
    supabase.from("leases").select(LEASE_COLUMNS).eq("organization_id", organizationId).eq("id", leaseId).maybeSingle(),
    loadLeaseMappings(organizationId),
  ]);
  if (leaseResult.error) throw leaseResult.error;
  return leaseResult.data ? toLease(leaseResult.data as LeaseRow, mappings.tenants, mappings.properties, mappings.units) : null;
}

export async function listTenants(organizationId: string): Promise<TenantSummary[]> {
  const supabase = await createSupabaseServerClient();
  const [tenantResult, leases] = await Promise.all([
    supabase.rpc("list_tenant_profiles", { target_organization_id: organizationId }),
    listLeases(organizationId),
  ]);
  if (tenantResult.error) throw tenantResult.error;
  return ((tenantResult.data ?? []) as Array<Omit<TenantRow, "id"> & { tenant_id: string }>).map((row) => ({
    id: row.tenant_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    preferredLanguage: row.preferred_language,
    profession: row.profession,
    currentLease: leases.find((lease) => lease.tenantId === row.tenant_id && lease.status === "active") ?? null,
  }));
}

export async function getTenantDetail(organizationId: string, tenantId: string): Promise<TenantDetail | null> {
  const supabase = await createSupabaseServerClient();
  const [tenantResult, privateResult, leases] = await Promise.all([
    supabase.from("tenants").select("id, full_name, civility, first_name, last_name").eq("organization_id", organizationId).eq("id", tenantId).maybeSingle(),
    supabase.rpc("get_tenant_private_profile", { target_tenant_id: tenantId }),
    listLeases(organizationId),
  ]);
  if (tenantResult.error) throw tenantResult.error;
  if (privateResult.error) throw privateResult.error;
  if (!tenantResult.data) return null;
  const row = tenantResult.data as TenantRow;
  const privateRow = (privateResult.data?.[0] ?? null) as {
    phone: string | null;
    email: string | null;
    preferred_language: TenantLanguage | null;
    profession: string | null;
    identity_document_type: IdentityDocumentType | null;
    identity_document_number: string | null;
    identity_document_expires_on: string | null;
    internal_notes: string | null;
  } | null;
  return {
    id: row.id,
    fullName: row.full_name,
    civility: row.civility,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: privateRow?.phone ?? null,
    email: privateRow?.email ?? null,
    preferredLanguage: privateRow?.preferred_language ?? null,
    profession: privateRow?.profession ?? null,
    identityDocumentType: privateRow?.identity_document_type ?? null,
    identityDocumentNumber: privateRow?.identity_document_number ?? null,
    identityDocumentExpiresOn: privateRow?.identity_document_expires_on ?? null,
    internalNotes: privateRow?.internal_notes ?? null,
    leases: leases.filter((lease) => lease.tenantId === tenantId),
  };
}

export async function getLeaseOptions(organizationId: string): Promise<LeaseOptions> {
  const supabase = await createSupabaseServerClient();
  const [tenantsResult, propertiesResult, unitsResult, activeResult] = await Promise.all([
    supabase.from("tenants").select("id, full_name").eq("organization_id", organizationId).order("full_name").limit(1000),
    supabase.from("properties").select("id, name").eq("organization_id", organizationId).eq("status", "active").order("name").limit(500),
    supabase.from("units").select("id, property_id, label, type, reference_rent_xaf").eq("organization_id", organizationId).eq("status", "active").order("label").limit(2000),
    supabase.from("leases").select("unit_id").eq("organization_id", organizationId).eq("status", "active").limit(2000),
  ]);
  if (tenantsResult.error) throw tenantsResult.error;
  if (propertiesResult.error) throw propertiesResult.error;
  if (unitsResult.error) throw unitsResult.error;
  if (activeResult.error) throw activeResult.error;
  const properties = new Map(((propertiesResult.data ?? []) as PropertyRow[]).map((row) => [row.id, row.name]));
  const occupied = new Set((activeResult.data ?? []).map((row) => row.unit_id));
  return {
    tenants: (tenantsResult.data ?? []).map((row) => ({ id: row.id, fullName: row.full_name })),
    units: ((unitsResult.data ?? []) as UnitRow[]).map((row) => ({
      id: row.id,
      propertyId: row.property_id,
      propertyName: properties.get(row.property_id) ?? "—",
      label: row.label,
      type: row.type,
      occupied: occupied.has(row.id),
      referenceRentXaf: row.reference_rent_xaf === null ? null : Number(row.reference_rent_xaf),
    })),
  };
}

export function leaseInputToRow(input: LeaseInput) {
  return {
    tenant_id: input.tenantId,
    property_id: input.propertyId,
    unit_id: input.unitId,
    start_date: input.startDate,
    end_date: input.endDate,
    base_rent_xaf: input.baseRentXaf,
    recurring_charges_xaf: input.recurringChargesXaf,
    security_deposit_xaf: input.securityDepositXaf,
    initial_prepayment_amount_xaf: input.initialPrepaymentAmountXaf,
    billing_frequency: input.billingFrequency,
    due_day: input.dueDay,
    generate_due_days_before: input.generateDueDaysBefore,
    overdue_reminder_days_after: GLOBAL_OVERDUE_REMINDER_DAYS,
    entry_proration_mode: input.entryProrationMode,
    exit_proration_mode: input.exitProrationMode,
    entry_proration_override_xaf: input.entryProrationOverrideXaf,
    entry_proration_override_reason: input.entryProrationOverrideReason,
    exit_proration_override_xaf: input.exitProrationOverrideXaf,
    exit_proration_override_reason: input.exitProrationOverrideReason,
    payment_terms: input.paymentTerms,
  };
}

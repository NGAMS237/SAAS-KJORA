import { UUID_PATTERN, type UnitType } from "../properties/model.ts";

export const TENANT_LANGUAGES = ["fr", "en"] as const;
export const IDENTITY_DOCUMENT_TYPES = ["cni", "passport", "other"] as const;
export const LEASE_STATUSES = ["draft", "active", "ended"] as const;
export const BILLING_FREQUENCIES = ["monthly", "quarterly", "semiannual", "annual"] as const;
export const PRORATION_MODES = ["none", "calendar_days"] as const;

export type TenantLanguage = (typeof TENANT_LANGUAGES)[number];
export type IdentityDocumentType = (typeof IDENTITY_DOCUMENT_TYPES)[number];
export type LeaseStatus = (typeof LEASE_STATUSES)[number];
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];
export type ProrationMode = (typeof PRORATION_MODES)[number];

export type TenantInput = {
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredLanguage: TenantLanguage | null;
  profession: string | null;
  identityDocumentType: IdentityDocumentType | null;
  identityDocumentNumber: string | null;
  identityDocumentExpiresOn: string | null;
  internalNotes: string | null;
};

export type TenantSummary = Omit<TenantInput, "identityDocumentType" | "identityDocumentNumber" | "identityDocumentExpiresOn" | "internalNotes"> & {
  id: string;
  currentLease: LeaseSummary | null;
};

export type TenantDetail = TenantInput & {
  id: string;
  leases: LeaseSummary[];
};

export type LeaseInput = {
  tenantId: string;
  propertyId: string;
  unitId: string;
  startDate: string;
  endDate: string | null;
  baseRentXaf: number;
  recurringChargesXaf: number;
  securityDepositXaf: number;
  initialPrepaymentPeriods: number;
  initialPrepaymentAmountXaf: number;
  billingFrequency: BillingFrequency;
  dueDay: number;
  generateDueDaysBefore: number;
  overdueReminderDaysAfter: number;
  entryProrationMode: ProrationMode;
  exitProrationMode: ProrationMode;
  entryProrationOverrideXaf: number | null;
  entryProrationOverrideReason: string | null;
  exitProrationOverrideXaf: number | null;
  exitProrationOverrideReason: string | null;
};

export type LeaseSummary = LeaseInput & {
  id: string;
  status: LeaseStatus;
  endedOn: string | null;
  periodicTotalXaf: number;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
};

export type LeaseOptionUnit = {
  id: string;
  propertyId: string;
  propertyName: string;
  label: string;
  type: UnitType;
  occupied: boolean;
};

export type LeaseOptions = {
  tenants: Array<{ id: string; fullName: string }>;
  units: LeaseOptionUnit[];
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function optionalText(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  return text(value, max);
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function integer(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function amount(value: unknown) {
  return integer(value, 0, Number.MAX_SAFE_INTEGER);
}

export function parseTenantInput(input: Record<string, unknown>): ValidationResult<TenantInput> {
  const fullName = text(input.fullName, 160);
  const phone = optionalText(input.phone, 32);
  const email = optionalText(input.email, 320)?.toLowerCase() ?? null;
  if (!fullName || fullName.length < 2) return { ok: false, error: "invalid_tenant_name" };
  if (!phone && !email) return { ok: false, error: "tenant_contact_required" };
  if (phone && phone.length < 6) return { ok: false, error: "invalid_tenant_phone" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "invalid_tenant_email" };

  const preferredLanguage = input.preferredLanguage === "" || input.preferredLanguage == null
    ? null
    : input.preferredLanguage;
  if (preferredLanguage !== null && !(TENANT_LANGUAGES as readonly unknown[]).includes(preferredLanguage)) {
    return { ok: false, error: "invalid_tenant_language" };
  }
  const identityDocumentType = input.identityDocumentType === "" || input.identityDocumentType == null
    ? null
    : input.identityDocumentType;
  if (identityDocumentType !== null && !(IDENTITY_DOCUMENT_TYPES as readonly unknown[]).includes(identityDocumentType)) {
    return { ok: false, error: "invalid_identity_type" };
  }
  const identityDocumentNumber = optionalText(input.identityDocumentNumber, 80);
  if ((identityDocumentType === null) !== (identityDocumentNumber === null)) {
    return { ok: false, error: "identity_pair_required" };
  }
  const identityDocumentExpiresOn = optionalDate(input.identityDocumentExpiresOn);
  if (identityDocumentExpiresOn === undefined) return { ok: false, error: "invalid_identity_expiry" };
  return {
    ok: true,
    value: {
      fullName,
      phone,
      email,
      preferredLanguage: preferredLanguage as TenantLanguage | null,
      profession: optionalText(input.profession, 120),
      identityDocumentType: identityDocumentType as IdentityDocumentType | null,
      identityDocumentNumber,
      identityDocumentExpiresOn,
      internalNotes: optionalText(input.internalNotes, 4000),
    },
  };
}

export function parseLeaseInput(input: Record<string, unknown>): ValidationResult<LeaseInput> {
  const tenantId = typeof input.tenantId === "string" ? input.tenantId : "";
  const propertyId = typeof input.propertyId === "string" ? input.propertyId : "";
  const unitId = typeof input.unitId === "string" ? input.unitId : "";
  if (![tenantId, propertyId, unitId].every((value) => UUID_PATTERN.test(value))) {
    return { ok: false, error: "invalid_lease_relationship" };
  }
  const startDate = optionalDate(input.startDate);
  const endDate = optionalDate(input.endDate);
  if (!startDate || startDate === undefined || endDate === undefined) return { ok: false, error: "invalid_lease_dates" };
  if (endDate && endDate < startDate) return { ok: false, error: "invalid_lease_dates" };
  const baseRentXaf = amount(input.baseRentXaf);
  const recurringChargesXaf = amount(input.recurringChargesXaf);
  const securityDepositXaf = amount(input.securityDepositXaf);
  const initialPrepaymentAmountXaf = amount(input.initialPrepaymentAmountXaf);
  const initialPrepaymentPeriods = Number(input.initialPrepaymentPeriods);
  if (!baseRentXaf || recurringChargesXaf === null || securityDepositXaf === null || initialPrepaymentAmountXaf === null) {
    return { ok: false, error: "invalid_lease_amount" };
  }
  if (!Number.isFinite(initialPrepaymentPeriods) || initialPrepaymentPeriods < 0 || initialPrepaymentPeriods > 9999) {
    return { ok: false, error: "invalid_initial_prepayment" };
  }
  if (!(BILLING_FREQUENCIES as readonly unknown[]).includes(input.billingFrequency)) {
    return { ok: false, error: "invalid_billing_frequency" };
  }
  if (!(PRORATION_MODES as readonly unknown[]).includes(input.entryProrationMode)
    || !(PRORATION_MODES as readonly unknown[]).includes(input.exitProrationMode)) {
    return { ok: false, error: "invalid_proration_mode" };
  }
  const dueDay = integer(input.dueDay, 1, 31);
  const generateDueDaysBefore = integer(input.generateDueDaysBefore, 0, 90);
  const overdueReminderDaysAfter = integer(input.overdueReminderDaysAfter, 1, 90);
  if (dueDay === null || generateDueDaysBefore === null || overdueReminderDaysAfter === null) {
    return { ok: false, error: "invalid_due_schedule" };
  }
  const entryProrationOverrideXaf = input.entryProrationOverrideXaf === "" || input.entryProrationOverrideXaf == null
    ? null : amount(input.entryProrationOverrideXaf);
  const exitProrationOverrideXaf = input.exitProrationOverrideXaf === "" || input.exitProrationOverrideXaf == null
    ? null : amount(input.exitProrationOverrideXaf);
  if (entryProrationOverrideXaf === null && input.entryProrationOverrideXaf !== "" && input.entryProrationOverrideXaf != null) {
    return { ok: false, error: "invalid_proration_override" };
  }
  if (exitProrationOverrideXaf === null && input.exitProrationOverrideXaf !== "" && input.exitProrationOverrideXaf != null) {
    return { ok: false, error: "invalid_proration_override" };
  }
  const entryProrationOverrideReason = optionalText(input.entryProrationOverrideReason, 500);
  const exitProrationOverrideReason = optionalText(input.exitProrationOverrideReason, 500);
  if ((entryProrationOverrideXaf === null) !== (entryProrationOverrideReason === null)
    || (exitProrationOverrideXaf === null) !== (exitProrationOverrideReason === null)) {
    return { ok: false, error: "proration_override_reason_required" };
  }
  return {
    ok: true,
    value: {
      tenantId, propertyId, unitId, startDate, endDate, baseRentXaf, recurringChargesXaf,
      securityDepositXaf, initialPrepaymentPeriods, initialPrepaymentAmountXaf,
      billingFrequency: input.billingFrequency as BillingFrequency,
      dueDay, generateDueDaysBefore, overdueReminderDaysAfter,
      entryProrationMode: input.entryProrationMode as ProrationMode,
      exitProrationMode: input.exitProrationMode as ProrationMode,
      entryProrationOverrideXaf, entryProrationOverrideReason,
      exitProrationOverrideXaf, exitProrationOverrideReason,
    },
  };
}

export function calendarEntryProration(totalXaf: number, startDate: string, mode: ProrationMode) {
  if (mode === "none") return totalXaf;
  const [year, month, day] = startDate.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.round((totalXaf * (daysInMonth - day + 1)) / daysInMonth);
}

export function calendarExitProration(totalXaf: number, endedOn: string, mode: ProrationMode) {
  if (mode === "none") return totalXaf;
  const [year, month, day] = endedOn.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.round((totalXaf * day) / daysInMonth);
}

export function filterTenants(tenants: readonly TenantSummary[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...tenants];
  return tenants.filter((tenant) => `${tenant.fullName} ${tenant.phone ?? ""} ${tenant.email ?? ""}`.toLocaleLowerCase().includes(normalized));
}

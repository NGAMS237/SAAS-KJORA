import { UUID_PATTERN } from "../properties/model.ts";

export const PAYMENT_METHODS = ["cash", "mtn_momo", "orange_money", "bank_transfer", "other"] as const;
export const PAYMENT_STATUSES = ["confirmed", "reversed"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentAllocationInput = { dueId: string; amountXaf: number };

export type PaymentInput = {
  leaseId: string;
  amountXaf: number;
  paymentDate: string;
  method: PaymentMethod;
  externalReference: string | null;
  note: string | null;
  idempotencyKey: string;
  allocations: PaymentAllocationInput[] | null;
};

export type PaymentDueOption = {
  id: string;
  kind: "periodic" | "initial_prorata" | "deposit";
  reference: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  rentXaf: number;
  recurringChargesXaf: number;
  depositXaf: number;
  remainingXaf: number;
  status: string;
};

export type PaymentLeaseOption = {
  leaseId: string;
  tenantId: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  status: "active" | "ended";
  amountDueXaf: number;
  availableCreditXaf: number;
  dues: PaymentDueOption[];
};

export type PaymentAllocationSummary = {
  id: string;
  dueId: string;
  dueReference: string;
  dueKind: PaymentDueOption["kind"];
  periodStart: string;
  periodEnd: string;
  amountXaf: number;
  rentXaf: number;
  recurringChargesXaf: number;
  depositXaf: number;
};

export type PaymentSummary = {
  id: string;
  reference: string;
  tenantId: string;
  leaseId: string;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  amountXaf: number;
  paymentDate: string;
  method: PaymentMethod;
  externalReference: string | null;
  status: PaymentStatus;
  allocationMode: "automatic" | "manual";
  allocatedXaf: number;
  creditCreatedXaf: number;
  createdBy: string;
  createdAt: string;
  reversedAt: string | null;
};

export type PaymentDetail = PaymentSummary & {
  note: string | null;
  balanceBeforeXaf: number;
  balanceAfterXaf: number;
  confirmedAt: string;
  reversedBy: string | null;
  reversalReason: string | null;
  allocations: PaymentAllocationSummary[];
};

export type PaymentConfirmation = {
  paymentId: string;
  paymentReference: string;
  allocatedAmountXaf: number;
  creditCreatedXaf: number;
  balanceBeforeXaf: number;
  balanceAfterXaf: number;
  paymentStatus: PaymentStatus;
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function optionalText(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

export function parsePaymentInput(input: Record<string, unknown>): ValidationResult<PaymentInput> {
  const leaseId = typeof input.leaseId === "string" ? input.leaseId : "";
  const amountXaf = Number(input.amountXaf);
  const paymentDate = typeof input.paymentDate === "string" ? input.paymentDate : "";
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  if (!UUID_PATTERN.test(leaseId)) return { ok: false, error: "invalid_payment_lease" };
  if (!Number.isSafeInteger(amountXaf) || amountXaf <= 0) return { ok: false, error: "invalid_payment_amount" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || paymentDate < "2000-01-01") {
    return { ok: false, error: "invalid_payment_date" };
  }
  if (paymentDate > new Date().toISOString().slice(0, 10)) return { ok: false, error: "future_payment_date" };
  if (!(PAYMENT_METHODS as readonly unknown[]).includes(input.method)) return { ok: false, error: "invalid_payment_method" };
  if (idempotencyKey.length < 16 || idempotencyKey.length > 200) return { ok: false, error: "invalid_idempotency_key" };
  const externalReference = optionalText(input.externalReference, 160);
  const note = optionalText(input.note, 2000);
  if (externalReference === undefined) return { ok: false, error: "invalid_payment_reference" };
  if (note === undefined) return { ok: false, error: "invalid_payment_note" };

  let allocations: PaymentAllocationInput[] | null = null;
  if (input.allocations !== null && input.allocations !== undefined) {
    if (!Array.isArray(input.allocations)) return { ok: false, error: "invalid_payment_allocations" };
    allocations = [];
    const seen = new Set<string>();
    let allocated = 0;
    for (const raw of input.allocations) {
      if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_payment_allocation" };
      const dueId = "dueId" in raw && typeof raw.dueId === "string" ? raw.dueId : "";
      const allocationAmount = "amountXaf" in raw ? Number(raw.amountXaf) : NaN;
      if (!UUID_PATTERN.test(dueId) || seen.has(dueId)
        || !Number.isSafeInteger(allocationAmount) || allocationAmount <= 0) {
        return { ok: false, error: "invalid_payment_allocation" };
      }
      seen.add(dueId);
      allocated += allocationAmount;
      allocations.push({ dueId, amountXaf: allocationAmount });
    }
    if (allocated > amountXaf) return { ok: false, error: "payment_allocation_exceeds_payment" };
  }

  return {
    ok: true,
    value: {
      leaseId,
      amountXaf,
      paymentDate,
      method: input.method as PaymentMethod,
      externalReference,
      note,
      idempotencyKey,
      allocations,
    },
  };
}

export function parsePaymentReversal(input: Record<string, unknown>) {
  const paymentId = typeof input.paymentId === "string" ? input.paymentId : "";
  const reason = optionalText(input.reason, 500);
  if (!UUID_PATTERN.test(paymentId)) return { ok: false as const, error: "invalid_payment" };
  if (!reason || reason.length < 3) return { ok: false as const, error: "payment_reversal_reason_required" };
  return { ok: true as const, value: { paymentId, reason } };
}

export function proposePaymentAllocations(
  dues: readonly PaymentDueOption[],
  amountXaf: number,
  paymentDate: string,
) {
  let available = Math.max(0, Number.isSafeInteger(amountXaf) ? amountXaf : 0);
  const allocations: PaymentAllocationInput[] = [];
  const eligible = [...dues]
    .filter((due) => due.kind !== "deposit" && due.dueDate <= paymentDate && due.remainingXaf > 0)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate)
      || left.periodStart.localeCompare(right.periodStart)
      || left.id.localeCompare(right.id));
  for (const due of eligible) {
    if (available === 0) break;
    const amount = Math.min(available, due.remainingXaf);
    allocations.push({ dueId: due.id, amountXaf: amount });
    available -= amount;
  }
  return { allocations, allocatedXaf: amountXaf - available, creditCreatedXaf: available };
}

export function reconcilePaymentAllocation(amountXaf: number, allocations: readonly PaymentAllocationInput[]) {
  const allocatedXaf = allocations.reduce((sum, allocation) => sum + allocation.amountXaf, 0);
  return {
    allocatedXaf,
    creditCreatedXaf: Math.max(amountXaf - allocatedXaf, 0),
    reconciles: Number.isSafeInteger(amountXaf) && amountXaf > 0
      && allocatedXaf >= 0 && allocatedXaf <= amountXaf,
  };
}

export function proposeInitialPaymentAllocations(
  dues: readonly PaymentDueOption[], amountXaf: number, paymentDate: string,
) {
  let available = Math.max(0, Number.isSafeInteger(amountXaf) ? amountXaf : 0);
  const allocations: PaymentAllocationInput[] = [];
  const eligible = [...dues]
    .filter((due) => due.remainingXaf > 0 && (due.kind === "deposit" || due.dueDate <= paymentDate))
    .sort((left, right) => {
      if (left.kind === "deposit" && right.kind !== "deposit") return -1;
      if (right.kind === "deposit" && left.kind !== "deposit") return 1;
      return left.dueDate.localeCompare(right.dueDate)
        || left.periodStart.localeCompare(right.periodStart) || left.id.localeCompare(right.id);
    });
  for (const due of eligible) {
    if (available === 0) break;
    const allocated = Math.min(available, due.remainingXaf);
    allocations.push({ dueId: due.id, amountXaf: allocated });
    available -= allocated;
  }
  return { allocations, allocatedXaf: amountXaf - available, creditCreatedXaf: available };
}

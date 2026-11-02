import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/modules/properties/model";
import { parseLeaseInput, parseTenantInput } from "@/modules/tenancy/model";
import { leaseInputToRow } from "@/modules/tenancy/server";

type TenancyAction =
  | "create_tenant"
  | "update_tenant"
  | "create_lease"
  | "update_lease"
  | "activate_lease"
  | "end_lease"
  | "schedule_rent_change";

function sameOrigin(request: Request) {
  return isSameOrigin(request);
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function mutationError(error: { code?: string; message?: string } | null) {
  if (!error) return jsonError("resource_unavailable", 404);
  if (error.code === "23P01") return jsonError("lease_period_overlap", 409);
  if (error.code === "23505") return jsonError("duplicate_resource", 409);
  if (error.code === "42501") return jsonError("forbidden", 403);
  if (["23503", "23514", "22023"].includes(error.code ?? "")) {
    if (error.message?.includes("active_lease_terms_immutable")) return jsonError("active_lease_terms_immutable", 409);
    if (error.message?.includes("lease_invalid_transition")) return jsonError("lease_invalid_transition", 409);
    return jsonError("business_rule_rejected", 409);
  }
  return jsonError("server_error", 500);
}

function tenantRow(value: ReturnType<typeof parseTenantInput> & { ok: true }) {
  return {
    full_name: value.value.fullName,
    civility: value.value.civility,
    first_name: value.value.firstName,
    last_name: value.value.lastName,
    phone: value.value.phone,
    email: value.value.email,
    preferred_language: value.value.preferredLanguage,
    profession: value.value.profession,
    identity_document_type: value.value.identityDocumentType,
    identity_document_number: value.value.identityDocumentNumber,
    identity_document_expires_on: value.value.identityDocumentExpiresOn,
    internal_notes: value.value.internalNotes,
  };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("forbidden", 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action as TenancyAction | undefined;
  if (!body || !action) return jsonError("invalid_payload", 400);

  const requiredCapability = action.includes("tenant") ? "tenant.manage" : "lease.manage";
  const access = await requireActiveCapability(requiredCapability);
  if (!access.authorization) {
    return jsonError(access.status === 401 ? "unauthenticated" : "forbidden", access.status);
  }
  const { organizationId, userId } = access.authorization;
  const supabase = await createSupabaseServerClient();

  if (action === "create_tenant" || action === "update_tenant") {
    const parsed = parseTenantInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    if (action === "create_tenant") {
      const { data, error } = await supabase
        .from("tenants")
        .insert({ organization_id: organizationId, created_by: userId, ...tenantRow(parsed) })
        .select("id")
        .single();
      return error || !data ? mutationError(error) : NextResponse.json({ tenantId: data.id }, { status: 201 });
    }
    if (typeof body.tenantId !== "string" || !UUID_PATTERN.test(body.tenantId)) return jsonError("invalid_tenant", 400);
    const { data, error } = await supabase
      .from("tenants")
      .update(tenantRow(parsed))
      .eq("organization_id", organizationId)
      .eq("id", body.tenantId)
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ tenantId: data.id });
  }

  if (action === "create_lease" || action === "update_lease") {
    const parsed = parseLeaseInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    if (action === "create_lease") {
      const { data, error } = await supabase
        .from("leases")
        .insert({ organization_id: organizationId, created_by: userId, status: "draft", ...leaseInputToRow(parsed.value) })
        .select("id")
        .single();
      return error || !data ? mutationError(error) : NextResponse.json({ leaseId: data.id }, { status: 201 });
    }
    if (typeof body.leaseId !== "string" || !UUID_PATTERN.test(body.leaseId)) return jsonError("invalid_lease", 400);
    const { data, error } = await supabase
      .from("leases")
      .update(leaseInputToRow(parsed.value))
      .eq("organization_id", organizationId)
      .eq("id", body.leaseId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ leaseId: data.id });
  }

  if (typeof body.leaseId !== "string" || !UUID_PATTERN.test(body.leaseId)) return jsonError("invalid_lease", 400);
  if (action === "activate_lease") {
    const { data, error } = await supabase
      .from("leases")
      .update({ status: "active" })
      .eq("organization_id", organizationId)
      .eq("id", body.leaseId)
      .eq("status", "draft")
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ leaseId: data.id });
  }
  if (action === "schedule_rent_change") {
    const effectiveFrom = typeof body.effectiveFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.effectiveFrom) ? body.effectiveFrom : null;
    const baseRent = Number(body.baseRentXaf);
    const charges = Number(body.recurringChargesXaf ?? 0);
    if (!effectiveFrom) return jsonError("invalid_effective_date", 400);
    if (!Number.isSafeInteger(baseRent) || baseRent <= 0 || !Number.isSafeInteger(charges) || charges < 0) return jsonError("invalid_rent_amounts", 400);
    const { data: lease, error: leaseError } = await supabase
      .from("leases")
      .select("due_day, generate_due_days_before, status")
      .eq("organization_id", organizationId)
      .eq("id", body.leaseId)
      .maybeSingle();
    if (leaseError || !lease) return mutationError(leaseError);
    if (lease.status !== "active") return jsonError("lease_not_active", 409);
    const { data, error } = await supabase.rpc("schedule_lease_financial_terms", {
      target_lease_id: body.leaseId,
      target_effective_from: effectiveFrom,
      target_base_rent_xaf: baseRent,
      target_recurring_charges_xaf: charges,
      target_due_day: Math.min(Number(lease.due_day), 28),
      target_generate_due_days_before: lease.generate_due_days_before,
    });
    if (error) {
      if (error.message?.includes("future_period_already_generated")) return jsonError("future_period_already_generated", 409);
      if (error.message?.includes("invalid_future_financial_terms")) return jsonError("invalid_effective_date", 400);
      if (error.code === "23505") return jsonError("duplicate_resource", 409);
      return mutationError(error);
    }
    return NextResponse.json({ termsId: data }, { status: 201 });
  }
  if (action === "end_lease") {
    const endedOn = typeof body.endedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.endedOn) ? body.endedOn : null;
    const endReason = typeof body.endReason === "string" && body.endReason.trim()
      ? body.endReason.trim()
      : null;
    if (!endedOn) return jsonError("invalid_lease_end_date", 400);
    if (endReason && endReason.length > 500) return jsonError("invalid_lease_end_reason", 400);
    const { data, error } = await supabase
      .from("leases")
      .update({ status: "ended", ended_on: endedOn, end_reason: endReason })
      .eq("organization_id", organizationId)
      .eq("id", body.leaseId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ leaseId: data.id });
  }
  return jsonError("invalid_action", 400);
}

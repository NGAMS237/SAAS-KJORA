import { NextResponse } from "next/server";
import { requireActiveCapability } from "@/core/authorization/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  parsePropertyInput,
  parsePropertyUpdate,
  parseUnitInput,
  parseUnitUpdate,
  UUID_PATTERN,
  type UnitType,
} from "@/modules/properties/model";

type RentalAction =
  | "create_property"
  | "update_property"
  | "archive_property"
  | "create_unit"
  | "update_unit"
  | "archive_unit";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function mutationError(error: { code?: string; message?: string } | null) {
  if (!error) return jsonError("resource_unavailable", 404);
  if (error.code === "23505") return jsonError("duplicate_resource", 409);
  if (error.code === "42501") return jsonError("forbidden", 403);
  if (["23503", "23514", "22023"].includes(error.code ?? "")) {
    if (error.message?.includes("house_requires_whole_house")) return jsonError("house_units_locked", 409);
    return jsonError("business_rule_rejected", 409);
  }
  return jsonError("server_error", 500);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("forbidden", 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action as RentalAction | undefined;
  if (!body || !action) return jsonError("invalid_payload", 400);

  const requiredCapability = action.includes("unit") ? "unit.manage" : "property.manage";
  const access = await requireActiveCapability(requiredCapability);
  if (!access.authorization) {
    return jsonError(access.status === 401 ? "unauthenticated" : "forbidden", access.status);
  }
  const { organizationId, userId } = access.authorization;
  const supabase = await createSupabaseServerClient();

  if (action === "create_property") {
    const parsed = parsePropertyInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const { data, error } = await supabase
      .rpc("create_property_with_reference_rent", {
        target_organization_id: organizationId,
        property_name: parsed.value.name,
        property_locality: parsed.value.locality,
        property_type: parsed.value.type,
        unit_reference_rent_xaf: parsed.value.referenceRentXaf,
      });
    return error || !data ? mutationError(error) : NextResponse.json({ propertyId: data }, { status: 201 });
  }

  if (typeof body.propertyId !== "string" || !UUID_PATTERN.test(body.propertyId)) {
    return jsonError("invalid_property", 400);
  }

  if (action === "update_property") {
    const parsed = parsePropertyUpdate(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const { data, error } = await supabase
      .from("properties")
      .update(parsed.value)
      .eq("organization_id", organizationId)
      .eq("id", body.propertyId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ propertyId: data.id });
  }

  if (action === "archive_property") {
    const { data, error } = await supabase
      .from("properties")
      .update({ status: "archived" })
      .eq("organization_id", organizationId)
      .eq("id", body.propertyId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ propertyId: data.id });
  }

  if (action === "create_unit") {
    const parsed = parseUnitInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const { data, error } = await supabase
      .from("units")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        property_id: parsed.value.propertyId,
        label: parsed.value.label,
        type: parsed.value.type,
        area_sqm: parsed.value.areaSqm,
        reference_rent_xaf: parsed.value.referenceRentXaf,
      })
      .select("id")
      .single();
    return error || !data ? mutationError(error) : NextResponse.json({ unitId: data.id }, { status: 201 });
  }

  if (typeof body.unitId !== "string" || !UUID_PATTERN.test(body.unitId)) {
    return jsonError("invalid_unit", 400);
  }

  if (action === "update_unit") {
    const { data: current, error: currentError } = await supabase
      .from("units")
      .select("type")
      .eq("organization_id", organizationId)
      .eq("property_id", body.propertyId)
      .eq("id", body.unitId)
      .eq("status", "active")
      .maybeSingle();
    if (currentError || !current) return mutationError(currentError);
    const parsed = parseUnitUpdate(body, current.type as UnitType);
    if (!parsed.ok) return jsonError(parsed.error, 400);
    const { data, error } = await supabase
      .from("units")
      .update({ label: parsed.value.label, type: parsed.value.type, area_sqm: parsed.value.areaSqm, reference_rent_xaf: parsed.value.referenceRentXaf })
      .eq("organization_id", organizationId)
      .eq("property_id", body.propertyId)
      .eq("id", body.unitId)
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ unitId: data.id });
  }

  if (action === "archive_unit") {
    const { data, error } = await supabase
      .from("units")
      .update({ status: "archived" })
      .eq("organization_id", organizationId)
      .eq("property_id", body.propertyId)
      .eq("id", body.unitId)
      .eq("status", "active")
      .select("id")
      .maybeSingle();
    return error || !data ? mutationError(error) : NextResponse.json({ unitId: data.id });
  }

  return jsonError("invalid_action", 400);
}

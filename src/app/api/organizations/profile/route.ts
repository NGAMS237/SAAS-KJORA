import { NextResponse } from "next/server";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isOrganizationCurrency, isSupportedOrganizationTimezone } from "@/core/organization/settings";

export async function PUT(request: Request) {
  const { activeOrganization } = await loadOrganizationContext();
  if (!activeOrganization) return NextResponse.json({ error: "organization_required" }, { status: 409 });
  const body = (await request.json()) as { name?: unknown; language?: unknown; timezone?: unknown; currency?: unknown };
  if (typeof body.name !== "string" || !["fr", "en"].includes(String(body.language))
    || !isSupportedOrganizationTimezone(body.timezone) || !isOrganizationCurrency(body.currency)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("update_organization_profile_settings", {
    target_organization_id: activeOrganization.id,
    organization_name: body.name.trim(),
    organization_language: body.language,
    organization_timezone: body.timezone,
    organization_currency: body.currency,
  }).maybeSingle();
  if (error || !data) {
    const code = error?.message.includes("organization_currency_locked") ? "organization_currency_locked" : "forbidden";
    return NextResponse.json({ error: code }, { status: 403 });
  }
  return NextResponse.json({ organizationId: activeOrganization.id });
}

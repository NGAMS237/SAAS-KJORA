import { NextResponse } from "next/server";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  const { activeOrganization } = await loadOrganizationContext();
  if (!activeOrganization) return NextResponse.json({ error: "organization_required" }, { status: 409 });
  const body = (await request.json()) as { name?: unknown; language?: unknown; timezone?: unknown };
  if (typeof body.name !== "string" || !["fr", "en"].includes(String(body.language)) || typeof body.timezone !== "string") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_profiles")
    .update({ name: body.name.trim(), language: body.language, timezone: body.timezone.trim() })
    .eq("organization_id", activeOrganization.id)
    .select("organization_id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ organizationId: data.organization_id });
}

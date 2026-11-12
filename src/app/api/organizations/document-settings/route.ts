import { NextResponse } from "next/server";
import { getActiveAuthorization, isOrganizationActive } from "@/core/authorization/server";
import { isSameOrigin } from "@/core/security/same-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDocumentBranding } from "@/modules/documents/render-context";

export const runtime = "nodejs";

// Enregistre les informations bailleur affichées sur les avis, quittances et reçus (propriétaire seul).
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const authorization = await getActiveAuthorization();
  if (!authorization || authorization.role !== "organization_owner") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await isOrganizationActive(authorization.organizationId))) return NextResponse.json({ error: "organization_unavailable" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const branding = parseDocumentBranding(body);
  if (!branding) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  if (branding.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(branding.email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_organization_document_settings", {
    target_organization_id: authorization.organizationId,
    target_settings: branding,
  });
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") return NextResponse.json({ error: "migration_missing" }, { status: 503 });
    if (error.code === "42501") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (error.code === "23514") return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

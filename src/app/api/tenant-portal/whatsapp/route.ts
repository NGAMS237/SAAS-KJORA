import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/modules/properties/model";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { accessId?: unknown; action?: unknown } | null;
  if (!body || typeof body.accessId !== "string" || !UUID_PATTERN.test(body.accessId) || !["confirm", "disable"].includes(String(body.action))) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_my_tenant_whatsapp_status", { target_access_id: body.accessId, p_action: body.action, p_consent_version: "pilot-service-v1" });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "forbidden" : "unavailable" }, { status: error.code === "42501" ? 403 : 409 });
  return NextResponse.json(data);
}

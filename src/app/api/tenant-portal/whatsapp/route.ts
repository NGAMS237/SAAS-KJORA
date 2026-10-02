import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UUID_PATTERN } from "@/modules/properties/model";

export async function POST(request: Request) {
  const reply=(body:unknown,init?:ResponseInit)=>NextResponse.json(body,{...init,headers:{...init?.headers,"Cache-Control":"private, no-store"}});
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { accessId?: unknown; action?: unknown } | null;
  if (!body || typeof body.accessId !== "string" || !UUID_PATTERN.test(body.accessId) || !["confirm_service", "disable", "consent_marketing", "revoke_marketing"].includes(String(body.action))) return reply({ error: "invalid_request" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_my_tenant_whatsapp_status", { target_access_id: body.accessId, p_action: body.action, p_consent_version: "pilot-service-v1" });
  if (error) return reply({ error: error.code === "42501" ? "forbidden" : "unavailable" }, { status: error.code === "42501" ? 403 : 409 });
  return reply(data);
}

import { isSameOrigin } from "@/core/security/same-origin";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_tenant_portal_session");
  if (error || Number(data) < 1) return NextResponse.json({ error: "portal_access_required" }, { status: 403 });
  return NextResponse.json({ accessCount: Number(data) });
}

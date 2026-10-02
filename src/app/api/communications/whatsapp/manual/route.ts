import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildManualWhatsAppMessage, buildWhatsAppUrl, type ManualWhatsAppContext } from "@/modules/communications/manual-whatsapp";
import { UUID_PATTERN } from "@/modules/properties/model";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null) as { documentId?: unknown } | null;
  if (!body || typeof body.documentId !== "string" || !UUID_PATTERN.test(body.documentId)) return NextResponse.json({ error: "invalid_document" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("prepare_manual_whatsapp_handoff", { target_document_id: body.documentId });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
    return NextResponse.json({ error: error.message === "whatsapp_not_available" ? "whatsapp_not_available" : "handoff_unavailable" }, { status });
  }
  const context = data as ManualWhatsAppContext;
  const url = buildWhatsAppUrl(context.phoneE164, buildManualWhatsAppMessage(context));
  if (!url) return NextResponse.json({ error: "handoff_unavailable" }, { status: 409 });
  return NextResponse.json({ url, notice: context.language === "en" ? "WhatsApp was opened. KJORA cannot confirm that the message was sent." : "WhatsApp a été ouvert. KJORA ne peut pas confirmer que le message a été envoyé." });
}

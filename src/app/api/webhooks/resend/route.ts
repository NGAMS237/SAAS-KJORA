import { NextResponse, type NextRequest } from "next/server";
import { isHandledResendEvent, summarizeResendEvent, verifyResendWebhook } from "@/core/email/resend-webhook";
import { COMMUNICATIONS_ENV } from "@/modules/communications/config";
import { createServiceRoleClient } from "@/modules/communications/server";

// =============================================================================
// NCE-01 — Webhook Resend : sent, delivered, delivery_delayed, failed,
// bounced, complained, suppressed (classement : resend-webhook.ts).
// Signature Svix vérifiée sur le corps BRUT avant tout parsing ; événement
// idempotent en base (private.email_provider_events) ; rien n'est journalisé
// ni renvoyé du contenu (ni adresse, ni sujet, ni payload).
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const verification = verifyResendWebhook(process.env[COMMUNICATIONS_ENV.webhookSecret], {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, raw);
  if (!verification.ok) {
    const status = verification.reason === "invalid_secret" ? 503 : 401;
    return NextResponse.json({ error: verification.reason === "invalid_secret" ? "webhook_not_configured" : "invalid_signature" }, { status });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const event = summarizeResendEvent(payload);
  if (!event) return NextResponse.json({ error: "invalid_event" }, { status: 400 });
  if (!isHandledResendEvent(event.type) || !event.providerMessageId) {
    // Événement hors périmètre (ouverture, clic…) : accusé de réception, rien d'écrit.
    return NextResponse.json({ outcome: "ignored" });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) return NextResponse.json({ error: "service_unavailable" }, { status: 503 });
  const result = await supabase.rpc("record_email_provider_event", {
    p_event_id: request.headers.get("svix-id"),
    p_event_type: event.type,
    p_provider_message_id: event.providerMessageId,
    p_occurred_at: event.occurredAt,
    // Étiquette : file + identifiant + génération, ou rien (rapprochement
    // par identifiant fournisseur exact seulement).
    p_delivery_queue: event.deliveryRef?.queue ?? null,
    p_delivery_id: event.deliveryRef?.deliveryId ?? null,
    p_delivery_generation: event.deliveryRef?.resendGeneration ?? null,
  });
  // 500 → Resend relivrera ; l'idempotence en base absorbe le doublon.
  if (result.error) return NextResponse.json({ error: "event_not_recorded" }, { status: 500 });
  const outcome = (result.data as { outcome?: unknown } | null)?.outcome;
  return NextResponse.json({ outcome: typeof outcome === "string" ? outcome : "recorded" });
}

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isProviderName } from "@/core/billing/provider-capabilities";
import { getBillingProvider } from "@/core/billing/provider";
import { isProviderConfigured, providerMode } from "@/core/billing/provider-config";
import { decideWebhook, type WebhookContext } from "@/core/billing/webhook-rules";

// =============================================================================
// KJORA — Réception des webhooks provider (ALIGN-04A)
// =============================================================================
// Contrat de cette route, dans l'ordre où il est appliqué :
//
//  1. Le provider vient du chemin, et doit figurer dans la liste fermée.
//  2. Le corps est lu BRUT, jamais reparsé avant vérification : une signature
//     porte sur des octets, pas sur un objet JSON reconstruit.
//  3. La signature est vérifiée par l'adaptateur. Sans adaptateur enregistré,
//     ou sans secret configuré, la route répond honnêtement qu'elle n'est pas
//     en service — elle ne fait jamais semblant d'accepter.
//  4. L'événement est enregistré par (provider, provider_event_id). L'unicité
//     est une contrainte de base : un rejeu perd la course et devient un
//     doublon reconnu, y compris si deux requêtes arrivent en même temps.
//  5. La décision d'effet est prise par `decideWebhook`, module pur.
//
// Ce que cette route ne fait jamais :
//   • activer un plan sans événement dont la signature est vérifiée ;
//   • croire un montant annoncé par le provider ;
//   • renvoyer au provider autre chose qu'un accusé neutre — pas de détail
//     d'état interne, pas de message d'erreur exploitable.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Réponse neutre. On accuse réception sans rien révéler. */
function ack(status = 200) {
  return NextResponse.json({ received: true }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;

  if (!isProviderName(provider)) return ack(404);
  if (!isProviderConfigured(provider)) {
    // Non configuré : on ne prétend pas traiter. 503 invite le provider à
    // rejouer plus tard plutôt qu'à considérer l'événement comme livré.
    return NextResponse.json({ received: false }, { status: 503 });
  }

  const adapter = getBillingProvider(provider);
  if (!adapter) return NextResponse.json({ received: false }, { status: 503 });

  // --- 2. Corps brut, avant toute interprétation ----------------------------
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key.toLowerCase()] = value; });

  // --- 3. Signature --------------------------------------------------------
  const verification = await adapter.verifyWebhook(rawBody, headers);
  if (!verification.valid) {
    // 400 et non 401 : on ne distingue pas les motifs de rejet vers l'extérieur.
    return NextResponse.json({ received: false }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !secretKey) return NextResponse.json({ received: false }, { status: 503 });

  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 4. Idempotence par contrainte d'unicité -----------------------------
  const digest = createHash("sha256").update(rawBody).digest("hex");

  const inserted = await supabase
    .from("billing_webhook_events")
    .insert({
      provider,
      provider_event_id: verification.providerEventId,
      event_type: verification.eventType,
      mode: providerMode(),
      payload_digest: digest,
      signature_verified: true,
      disposition: "acknowledge_unhandled",
    })
    .select("id")
    .single();

  if (inserted.error) {
    // 23505 = violation d'unicité : l'événement a déjà été reçu. C'est le
    // chemin normal d'un rejeu, pas une erreur. On répond 200 pour que le
    // provider cesse de réessayer.
    if (inserted.error.code === "23505") return ack();
    return NextResponse.json({ received: false }, { status: 500 });
  }

  // --- 5. Décision ---------------------------------------------------------
  // Le contexte métier (intention en attente, montant attendu, Organization)
  // sera résolu par ALIGN-04B, qui rattachera l'événement à son intention.
  // Tant que ce rattachement n'existe pas, aucun événement ne peut activer
  // quoi que ce soit : `pendingPlanExists` est faux, et `decideWebhook`
  // refuse l'activation. C'est le comportement voulu, pas un manque.
  const webhookContext: WebhookContext = {
    alreadyProcessed: false,
    currentStatus: "free",
    pendingPlanExists: false,
    expectedAmountMinor: 0,
    expectedCurrency: "XAF",
    reportedAmountMinor: 0,
    reportedCurrency: "XAF",
    organizationKnown: false,
  };

  const disposition = decideWebhook(verification.eventType, webhookContext);

  await supabase
    .from("billing_webhook_events")
    .update({
      disposition: disposition.action,
      disposition_reason:
        disposition.action === "reject" || disposition.action === "acknowledge_unhandled"
          ? disposition.reason
          : null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", inserted.data.id);

  return ack();
}

import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isReplaceableIncomingIntent,
  type SiteAppIntent,
} from "@/core/onboarding/plan-intent";

/**
 * Durably supersede a previous acquisition intent after authentication.
 * A null billing country is an explicit "selection pending" state, never a
 * currency or entitlement. Invalid/partial links are not written.
 */
export async function persistIncomingSiteAppIntent(intent: SiteAppIntent): Promise<boolean> {
  if (!isReplaceableIncomingIntent(intent)) return false;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("replace_site_app_intent", {
    target_plan: intent.plan,
    target_cycle: intent.billingCycle,
    target_billing_country: intent.billingCountry,
    target_locale: intent.locale,
    target_source: intent.source,
  });
  return !error;
}

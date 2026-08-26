"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export function createSupabaseBrowserClient() {
  const { publishableKey, url } = requireSupabasePublicConfig();
  return createBrowserClient(url, publishableKey, {
    auth: {
      experimental: {
        appendPkceFlowIdToRedirects: true,
      },
    },
  });
}

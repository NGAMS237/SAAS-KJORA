"use client";

import { useEffect } from "react";
import type { SiteAppLocale } from "@/core/onboarding/plan-intent";

export function PublicDocumentLanguage({ locale }: { locale: SiteAppLocale }) {
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  return null;
}

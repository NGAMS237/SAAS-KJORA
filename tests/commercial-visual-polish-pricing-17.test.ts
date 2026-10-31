import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PRICE_CATALOG } from "../src/core/billing/model.ts";
import { buildConnexionUrl } from "../src/core/onboarding/plan-intent.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const home = read("../src/app/page.tsx");
const homeCss = read("../src/app/public-home.module.css");
const documentLanguage = read("../src/app/public-document-language.tsx");

test("public pricing is sourced from the canonical XAF, XOF and CAD catalog", () => {
  assert.deepEqual(
    ["essentiel", "avance", "patrimoine"].map((plan) => ({
      plan,
      XAF: PRICE_CATALOG.XAF[plan as "essentiel" | "avance" | "patrimoine"].monthly,
      XOF: PRICE_CATALOG.XOF[plan as "essentiel" | "avance" | "patrimoine"].monthly,
      CAD: PRICE_CATALOG.CAD[plan as "essentiel" | "avance" | "patrimoine"].monthly,
    })),
    [
      { plan: "essentiel", XAF: 5_900, XOF: 5_900, CAD: 1_499 },
      { plan: "avance", XAF: 12_900, XOF: 12_900, CAD: 3_199 },
      { plan: "patrimoine", XAF: 24_900, XOF: 24_900, CAD: 6_199 },
    ],
  );
  assert.match(home, /PRICE_CATALOG\[currency\]\[plan\]\.monthly/);
  assert.match(home, /Afrique centrale[\s\S]*XAF/);
  assert.match(home, /Afrique de l’Ouest[\s\S]*XOF/);
  assert.match(home, /Canada \/ diaspora[\s\S]*CAD/);
  assert.match(home, /data-pricing-source="PRICE_CATALOG"/);
});

test("commercial CTA links keep the real onboarding intent in French and English", () => {
  for (const locale of ["fr", "en"] as const) {
    const url = buildConnexionUrl({
      plan: "avance",
      billingCycle: "monthly",
      billingCountry: null,
      locale,
      source: "site",
    });
    assert.match(url, /^\/connexion\?/);
    assert.match(url, /plan=avance/);
    assert.match(url, /billing_cycle=monthly/);
    assert.match(url, new RegExp(`locale=${locale}`));
    assert.match(url, /source=site/);
  }
  assert.match(home, /buildConnexionUrl/);
  assert.match(home, /planHref\(slug\)/);
});

test("the public page is bilingual and updates the document language", () => {
  for (const phrase of [
    "Trois marchés, des prix sans ambiguïté",
    "Three markets, pricing without ambiguity",
    "Créer mon espace gratuit",
    "Create my free workspace",
  ]) assert.match(home, new RegExp(phrase));
  assert.match(documentLanguage, /document\.documentElement\.lang = locale/);
  assert.match(home, /aria-label=\{locale === "fr" \? "Ouvrir la navigation" : "Open navigation"\}/);
});

test("primary actions and dark commercial sections retain explicit high contrast", () => {
  assert.match(homeCss, /--gold: #f3ad5e/);
  assert.match(homeCss, /\.home :global\(\.button--primary\)[\s\S]*background: var\(--gold\)[\s\S]*color: var\(--forest-deep\)/);
  assert.match(homeCss, /\.securitySection h2, \.finalCta h2 \{ color: var\(--paper\); \}/);
  assert.match(homeCss, /\.securityButton[\s\S]*background: var\(--gold\)[\s\S]*color: var\(--forest-deep\)/);
  assert.match(homeCss, /\.home > :global\(\.public-footer\) p \{ color: rgb\(255 253 248 \/ 0\.76\); \}/);
  assert.match(homeCss, /\.home a:focus-visible, \.home summary:focus-visible/);
});

test("motion is optional and the responsive public layout stays bounded", () => {
  assert.match(homeCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(homeCss, /transition-duration: 0\.01ms !important/);
  assert.match(homeCss, /min-height: clamp\(620px, calc\(100svh - 76px\), 760px\)/);
  assert.match(homeCss, /@media \(max-width: 600px\)/);
  assert.match(homeCss, /overflow: clip/);
});

test("commercial polish does not bridge the public page to private or provider surfaces", () => {
  for (const source of [home, homeCss, documentLanguage]) {
    assert.doesNotMatch(source, /\/api\//);
    assert.doesNotMatch(source, /\(internal\)|billing_webhook_events|billing_provider_intents/i);
    assert.doesNotMatch(source, /createCheckout|checkout\.sessions|payment_intent|subscription\.create/i);
    assert.doesNotMatch(source, /createClient|createServerClient|supabase\.rpc|supabase\.from/i);
  }
  assert.doesNotMatch(home, /closed beta|bêta fermée|registration[^.]{0,30}later|inscriptions[^.]{0,30}plus tard/i);
});

test("public imagery remains optimized and intrinsically sized", () => {
  assert.match(home, /from "next\/image"/);
  assert.match(home, /kjora-hero-abidjan\.webp/);
  assert.match(home, /preload/);
  assert.match(home, /kjora-proprietaire-locataire\.webp[\s\S]*width=\{1536\}[\s\S]*height=\{1024\}/);
  assert.match(home, /kjora-diaspora-canada\.webp[\s\S]*width=\{1672\}[\s\S]*height=\{941\}/);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { buildConnexionUrl } from "../src/core/onboarding/plan-intent.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/app/page.tsx");
const styles = read("src/app/public-home.module.css");
const footer = read("src/core/ui/public-footer.tsx");
const sw = read("public/sw.js");

test("la nouvelle expérience contient les messages hero FR et EN", () => {
  for (const phrase of [
    "Gérez vos locations, simplement. Où que vous soyez.",
    "Manage your rentals with ease. Wherever you are.",
    "Commencer gratuitement",
    "Get started free",
  ]) assert.ok(home.includes(phrase), `texte public manquant : ${phrase}`);
});

test("les trois visuels optimisés sont utilisés avec dimensions et chargement adaptés", () => {
  const assets = [
    "public/images/marketing/kjora-hero-abidjan.webp",
    "public/images/marketing/kjora-proprietaire-locataire.webp",
    "public/images/marketing/kjora-diaspora-canada.webp",
  ];
  for (const asset of assets) {
    const url = new URL(`../${asset}`, import.meta.url);
    assert.equal(existsSync(url), true, `actif manquant : ${asset}`);
    assert.ok(statSync(url).size < 350_000, `actif trop lourd : ${asset}`);
    assert.ok(home.includes(`/${asset.replace("public/", "")}`));
  }
  assert.equal((home.match(/\bpreload\b/g) ?? []).length, 1, "seul le hero doit être préchargé");
  assert.match(home, /sizes="100vw" preload/);
  assert.match(home, /sizes="\(max-width: 840px\) 100vw, 50vw"/);
});

test("l'animation reste CSS-only, discrète et neutralisée si le mouvement est réduit", () => {
  assert.match(styles, /heroDrift 16s ease-in-out infinite alternate/);
  assert.match(styles, /scale\(1\.04\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.heroImage, \.heroContent \{ animation: none; transform: none; \}/);
  assert.doesNotMatch(home, /setInterval|requestAnimationFrame|useEffect/);
});

test("les CTA réutilisent le parcours réel et gardent la langue", () => {
  const fr = buildConnexionUrl({ plan: "decouverte", billingCycle: "monthly", billingCountry: null, locale: "fr", source: "site" });
  const en = buildConnexionUrl({ plan: "decouverte", billingCycle: "monthly", billingCountry: null, locale: "en", source: "site" });
  assert.match(fr, /^\/connexion\?/);
  assert.match(fr, /next=%2Fonboarding%2Forganization/);
  assert.match(en, /locale=en/);
  assert.doesNotMatch(home, /href=["']#["']/);
});

test("la page explique honnêtement les flux financiers et WhatsApp manuel", () => {
  for (const phrase of ["n’encaisse pas aujourd’hui automatiquement", "does not automatically collect rent today", "WhatsApp reste manuel", "WhatsApp sharing remains manual", "Aucun paiement n’est déclenché depuis cette page", "This page never starts a payment"]) assert.ok(home.includes(phrase), `garde-fou éditorial manquant : ${phrase}`);
  assert.doesNotMatch(home, /inscription et paiements non disponibles|Disponible au lancement|registration and payments unavailable/i);
});

test("navigation et footer couvrent les routes publiques et les accès pertinents", () => {
  for (const route of ["/aide", "/contact", "/partenaires", "/connexion", "/portal/connexion", "/securite", "/confidentialite", "/mentions-legales"]) assert.ok(footer.includes(route), `lien de footer manquant : ${route}`);
  assert.match(home, /className=\{styles\.mobileMenu\}/);
});

test("les protections PWA privées restent intactes", () => {
  for (const prefix of ["/api/", "/app/", "/administration/", "/portal/", "/connexion/", "/onboarding/"]) assert.ok(sw.includes(`"${prefix}"`), `préfixe privé manquant : ${prefix}`);
  assert.doesNotMatch(sw.match(/const PRECACHE = \[[^;]+/)?.[0] ?? "", /\/app|\/portal|\/connexion|\/api/);
  assert.match(sw, /private\|no-store/i);
  assert.match(sw, /set-cookie/i);
});

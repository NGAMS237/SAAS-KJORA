import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/app/(internal)/app/page.tsx", import.meta.url), "utf8");
const tenancyViews = readFileSync(new URL("../src/modules/tenancy/views.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/core/ui/ui.tsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/core/preferences/preferences-provider.tsx", import.meta.url), "utf8");
const designSystem = readFileSync(new URL("../docs/design/KJORA-UI-SYSTEM-v2.md", import.meta.url), "utf8");

test("v2 centralizes the semantic light and dark tokens", () => {
  for (const token of ["brand-ink", "brand-blue", "brand-gold", "text-primary", "text-secondary", "surface-raised", "financial-positive", "financial-negative", "focus"]) {
    assert.match(css, new RegExp("--" + token + ":"));
  }
  assert.match(css, /:root\[data-theme="dark"\][\s\S]*--background: #0c141e/i);
  assert.match(css, /--success-soft: #18352a/i);
  assert.doesNotMatch(css, /--background: #111312/);
});

test("v2 preserves accessible focus, touch targets and reduced motion", () => {
  assert.match(css, /:focus-visible[\s\S]*outline:/);
  assert.match(css, /\.button[\s\S]*min-height: 44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition-duration: 0\.01ms !important/);
});

test("dashboard pilot uses live portfolio data and no fake financial totals", () => {
  assert.match(dashboard, /listActiveProperties/);
  assert.match(dashboard, /listTenants/);
  assert.match(dashboard, /listLeases/);
  assert.match(dashboard, /Suivi financier bientôt disponible/);
  assert.doesNotMatch(dashboard, /1 240 000 XAF|920 000 XAF|320 000 XAF|échéances fictives/i);
});

test("tenant and lease pilots expose honest future financial states", () => {
  assert.match(ui, /export function FinancialStateCard/);
  assert.match(tenancyViews, /Solde actuel/);
  assert.match(tenancyViews, /Crédit disponible/);
  assert.match(tenancyViews, /Prochaine échéance/);
  assert.match(tenancyViews, /Total périodique/);
  assert.match(tenancyViews, /Date limite/);
  assert.match(tenancyViews, /Avis préparé/);
  assert.match(tenancyViews, /Disponible avec Dues \+ Ledger 6C1/);
  assert.doesNotMatch(tenancyViews, />-55 000</);
});

test("theme selection supports persistence and the device preference", () => {
  assert.match(preferences, /localStorage\.getItem\("kjora-theme"\)/);
  assert.match(preferences, /prefers-color-scheme: dark/);
  assert.match(preferences, /localStorage\.setItem\("kjora-theme", theme\)/);
});

test("v2 documentation freezes scope and future financial semantics", () => {
  assert.match(designSystem, /v2A PILOTE/);
  assert.match(designSystem, /Vous devez \/ Solde dû/);
  assert.match(designSystem, /Crédit disponible/);
  assert.match(designSystem, /À jour/);
  assert.match(designSystem, /v2B et 6C1 restent non commencés/);
});

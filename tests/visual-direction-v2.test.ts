import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/app/(internal)/app/page.tsx", import.meta.url), "utf8");
const tenancyViews = readFileSync(new URL("../src/modules/tenancy/views.tsx", import.meta.url), "utf8");
const financeViews = readFileSync(new URL("../src/modules/finance/views.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/core/ui/ui.tsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/core/preferences/preferences-provider.tsx", import.meta.url), "utf8");
const designSystem = readFileSync(new URL("../docs/design/KJORA-UI-SYSTEM-v2.md", import.meta.url), "utf8");
const propertiesViews = readFileSync(new URL("../src/modules/properties/views.tsx", import.meta.url), "utf8");
const team = readFileSync(new URL("../src/core/team/team-management.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/app/(internal)/app/parametres/page.tsx", import.meta.url), "utf8");
const payments = readFileSync(new URL("../src/app/(internal)/app/paiements/page.tsx", import.meta.url), "utf8");
const paymentViews = readFileSync(new URL("../src/modules/payments/views.tsx", import.meta.url), "utf8");
const activity = readFileSync(new URL("../src/app/(internal)/app/activite/page.tsx", import.meta.url), "utf8");
const portalHome = readFileSync(new URL("../src/app/(portal)/portal/page.tsx", import.meta.url), "utf8");
const portalRents = readFileSync(new URL("../src/app/(portal)/portal/loyers/page.tsx", import.meta.url), "utf8");
const portalReceipts = readFileSync(new URL("../src/app/(portal)/portal/recus/page.tsx", import.meta.url), "utf8");
const portalShell = readFileSync(new URL("../src/tenant-portal/portal-shell.tsx", import.meta.url), "utf8");

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
  assert.match(dashboard, /Échéances et Ledger disponibles/);
  assert.match(dashboard, /getUserGreetingName/);
  assert.doesNotMatch(dashboard, /email\?\.split/);
  assert.doesNotMatch(dashboard, /1 240 000 XAF|920 000 XAF|320 000 XAF|échéances fictives/i);
});

test("tenant and lease pilots expose live, qualified financial states", () => {
  assert.match(ui, /export function FinancialStateCard/);
  assert.match(financeViews, /Solde dû/);
  assert.match(financeViews, /Crédit disponible/);
  assert.match(financeViews, /Périodes couvertes/);
  assert.match(financeViews, /Prochaine échéance non couverte/);
  assert.match(tenancyViews, /Montant mensuel total/);
  assert.match(tenancyViews, /TenantFinancialSummary tenantId=\{lease\.tenantId\}/);
  assert.match(tenancyViews, /Date limite/);
  assert.match(tenancyViews, /Le \$\{day\} de chaque mois/);
  assert.match(tenancyViews, /Prochaine échéance :/);
  assert.match(tenancyViews, /Avis d’échéance/);
  assert.match(tenancyViews, /jours avant chaque échéance/);
  assert.doesNotMatch(tenancyViews, />J-\{lease\.generateDueDaysBefore\}</);
  assert.match(tenancyViews, /LeaseDuesPanel/);
  assert.doesNotMatch(financeViews, />-55 000</);
});

test("theme selection supports persistence and the device preference", () => {
  assert.match(preferences, /localStorage\.getItem\("kjora-theme"\)/);
  assert.match(preferences, /prefers-color-scheme: dark/);
  assert.match(preferences, /localStorage\.setItem\("kjora-theme", theme\)/);
});

test("v2B defines reusable organic geometry without deforming controls", () => {
  for (const token of ["radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-organic", "radius-signature", "shape-soft-right", "shape-signature-left"]) {
    assert.match(css, new RegExp("--" + token + ":"));
  }
  assert.match(css, /--radius-signature: 64px/);
  assert.match(css, /\.dashboard-hero[\s\S]*border-radius: var\(--shape-signature-right\)/);
  assert.match(css, /\.lease-hero,[\s\S]*\.auth-panel,[\s\S]*border-radius: var\(--shape-signature-left\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*--radius-signature: 48px/);
  assert.doesNotMatch(css, /\.field input[^{]*\{[^}]*shape-signature/);
});

test("v2B reaches properties, units, team, settings and auth surfaces", () => {
  assert.match(propertiesViews, /resource-index-v2/);
  assert.match(propertiesViews, /property-detail-v2/);
  assert.match(propertiesViews, /unit-detail-v2/);
  assert.match(team, /team-management-v2/);
  assert.match(team, /team-invite-card/);
  assert.match(settings, /settings-v2/);
  assert.match(css, /\.auth-panel,[\s\S]*\.pin-lock-panel/);
  assert.match(css, /\.desktop-rail[\s\S]*linear-gradient/);
});

test("6C2 payments and contextual 6C3 documents are real while the portal stays honest", () => {
  assert.match(ui, /export function FutureState/);
  assert.match(payments, /getPayments/);
  assert.match(paymentViews, /Confirmer l’encaissement/);
  assert.match(paymentViews, /FinancialDocumentsPanel/);
  assert.match(activity, /NotificationsView/);
  assert.match(portalHome, /Disponible avec le Lot 6E/);
  assert.match(portalRents, /Disponible avec le Lot 6C1 puis le Portail 6E/);
  assert.match(portalReceipts, /Disponible avec le Lot 6C3 puis le Portail 6E/);
  assert.match(portalShell, /Disponible avec le Lot 6E/);
  for (const source of [payments, paymentViews, activity, portalHome, portalRents, portalReceipts, portalShell]) {
    assert.doesNotMatch(source, /80 000 XAF|160 000 XAF|240 000 XAF|Échéances fictives|Paiement fictif|demoPortalContext|Horizon Habitat|reçu fictif/i);
  }
});

test("v2 documentation records global scope and future financial semantics", () => {
  assert.match(designSystem, /v2B GLOBAL/);
  assert.match(designSystem, /Organic Signature Geometry/);
  assert.match(designSystem, /Signature asymmetric right/);
  assert.match(designSystem, /Ne jamais appliquer l’asymétrie aux inputs/);
  assert.match(designSystem, /Vous devez \/ Solde dû/);
  assert.match(designSystem, /Crédit disponible/);
  assert.match(designSystem, /À jour/);
  assert.match(designSystem, /Lot 6C1/);
});

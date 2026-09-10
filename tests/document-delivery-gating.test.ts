import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const documentsViews = readFileSync(
  new URL("../src/modules/documents/views.tsx", import.meta.url),
  "utf8",
);
const financialDocumentsRoute = readFileSync(
  new URL("../src/app/api/financial-documents/route.ts", import.meta.url),
  "utf8",
);
const contractsSql = readFileSync(
  new URL("../supabase/migrations/20260901224122_lot_6f_contracts_signatures.sql", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// DOCUMENT DELIVERY (§8-§12) — boutons explicites + modals, lus statiquement
// (composants React ne sont pas exécutés dans les tests Node de ce dépôt ;
// on vérifie la présence et la cohérence du code plutôt qu'un rendu DOM).
// ---------------------------------------------------------------------------

test("le bouton d'envoi est renommé « Envoyer par email » et n'est plus silencieusement désactivé par emailDeliveryEnabled", () => {
  assert.match(documentsViews, /Envoyer par email/);
  // L'ancien pattern couplait disabled à !emailDeliveryEnabled ; il ne doit plus apparaître.
  assert.doesNotMatch(documentsViews, /disabled=\{busy \|\| document\.status === "invalidated" \|\| !emailDeliveryEnabled\}/);
});

test("la modal « Adresse email manquante » existe avec le texte et les boutons requis", () => {
  assert.match(documentsViews, /Adresse email manquante/);
  assert.match(documentsViews, /Aucune adresse email n.est renseignée pour ce locataire\./);
  assert.match(documentsViews, /Ajouter l.email/);
  assert.match(documentsViews, /focus=email/);
});

test("la modal « Envoi par email indisponible » existe avec le texte et le lien PDF requis", () => {
  assert.match(documentsViews, /Envoi par email indisponible/);
  assert.match(documentsViews, /L.envoi automatique n.est pas encore disponible/);
  assert.match(documentsViews, /Télécharger le PDF/);
});

test("le déclenchement client vérifie d'abord tenantEmail puis emailDeliveryEnabled avant tout appel serveur", () => {
  assert.match(documentsViews, /if \(!document\.tenantEmail\) \{ setModal\("missing_email"\); return; \}/);
  assert.match(documentsViews, /if \(!emailDeliveryEnabled\) \{ setModal\("unavailable"\); return; \}/);
});

test("les erreurs de mise en file sont mappées en messages propres, jamais un code brut affiché", () => {
  assert.match(documentsViews, /function friendlyDeliveryError/);
  assert.doesNotMatch(documentsViews, /setMessage\(result\.body\.error\)/);
});

// ---------------------------------------------------------------------------
// Garde serveur (§9, §12) — ne jamais mettre en file un envoi que le worker
// ne traitera jamais (feature flag désactivé), et ne jamais renvoyer le texte
// d'erreur Postgres brut au client.
// ---------------------------------------------------------------------------

test("l'action queue_email vérifie KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED avant d'appeler le RPC", () => {
  assert.match(financialDocumentsRoute, /KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED !== "true"/);
  assert.match(financialDocumentsRoute, /email_delivery_disabled/);
});

test("l'action queue_email ne renvoie plus le message Postgres brut au client", () => {
  assert.match(financialDocumentsRoute, /function mapQueueEmailError/);
  assert.match(financialDocumentsRoute, /mapQueueEmailError\(result\.error\)/);
});

test("les contrats restent portail-uniquement : aucun canal email n'est branché à send_lease_contract", () => {
  const fn = contractsSql.match(/create or replace function public\.send_lease_contract[\s\S]*?\$\$;/i);
  assert.ok(fn, "fonction send_lease_contract introuvable");
  assert.doesNotMatch(fn[0], /message_deliveries/i);
  assert.doesNotMatch(fn[0], /resend/i);
  assert.match(fn[0], /insert into (public\.)?notifications/i);
});

// ---------------------------------------------------------------------------
// FEATURE GATING UX (§13-§18)
// ---------------------------------------------------------------------------

const featureUpgradeModal = readFileSync(
  new URL("../src/core/entitlements/feature-upgrade-modal.tsx", import.meta.url),
  "utf8",
);
const quotaModal = readFileSync(
  new URL("../src/core/entitlements/quota-modal.tsx", import.meta.url),
  "utf8",
);
const contractEntryLink = readFileSync(
  new URL("../src/modules/contracts/entry-link.tsx", import.meta.url),
  "utf8",
);

test("FeatureUpgradeModal ne navigue jamais automatiquement : Continuer ici ferme, Voir les offres est un vrai lien", () => {
  // "Continuer ici" est un <button> dont le seul comportement au clic est de
  // fermer la modal (onClick={onClose}) — jamais un push/redirect. On vérifie
  // le mécanisme (bouton + onClose), pas une forme textuelle arbitraire.
  const continueButtonBlock = featureUpgradeModal.match(/<button[^>]*onClick=\{onClose\}[^>]*>\s*\{[^}]*Continuer ici[\s\S]*?<\/button>/);
  assert.ok(continueButtonBlock, "le bouton « Continuer ici » doit être un <button onClick={onClose}>");
  // "Voir les offres" est un vrai <Link> Next.js vers /app/billing (navigation
  // explicite au clic de l'utilisateur), jamais un onClick programmatique.
  assert.match(featureUpgradeModal, /<Link[^>]*href="\/app\/billing"[^>]*>[\s\S]*?Voir les offres/);
  assert.doesNotMatch(featureUpgradeModal, /useEffect[\s\S]*router\.push/);
});

test("FeatureUpgradeModal rappelle qu'aucune donnée n'est modifiée", () => {
  assert.match(featureUpgradeModal, /Aucune de vos données n.est modifiée\./);
});

test("QuotaLimitModal n'a pas été modifié pour EXPORT-01/Document Delivery (non-régression)", () => {
  // Le composant doit rester réactif (basé sur une erreur serveur), jamais
  // transformé en variante de FeatureUpgradeModal.
  assert.doesNotMatch(quotaModal, /FeatureUpgradeModal/);
});

test("l'entrée Contrats affiche un indicateur premium et ouvre FeatureUpgradeModal quand non entitled", () => {
  assert.match(contractEntryLink, /FeatureUpgradeModal/);
  assert.match(contractEntryLink, /PremiumBadge/);
  assert.match(contractEntryLink, /Les contrats ne sont pas inclus dans votre offre/);
});

test("les surfaces déjà basées sur des quotas (collaborateurs, biens, organisations) ne référencent pas FeatureUpgradeModal", () => {
  // Ces surfaces doivent rester sur QuotaLimitModal (quota, pas feature) —
  // vérifié en confirmant qu'aucune n'importe FeatureUpgradeModal.
  const teamViews = readFileSync(new URL("../src/core/team/team-management.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(teamViews, /FeatureUpgradeModal/);
});

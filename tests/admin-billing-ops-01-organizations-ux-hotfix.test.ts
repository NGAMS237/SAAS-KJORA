import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ADMIN_COPY } from "../src/modules/platform-admin/copy.ts";

// =============================================================================
// ADMIN-BILLING-OPS-01 — Correctif UX urgent : Organizations non cliquables
// =============================================================================
// Même distinction méthodologique que les autres suites de cette console :
// invariants de source sur le TSX/CSS réellement livré (aucun rendu React
// disponible dans ce bac à sable — pas de jsdom/RTL configuré, `node --test`
// seul), et un test exécuté sur la fonction pure de correspondance de ligne.
// =============================================================================

const VIEWS = readFileSync(
  new URL("../src/modules/platform-admin/views.tsx", import.meta.url),
  "utf8",
);
const CSS = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const LAYOUT = readFileSync(
  new URL("../src/app/administration/layout.tsx", import.meta.url),
  "utf8",
);
const SERVER = readFileSync(
  new URL("../src/modules/platform-admin/server.ts", import.meta.url),
  "utf8",
);

const listStart = VIEWS.indexOf("export function OrganizationsView");
const subscriptionsStart = VIEWS.indexOf("export function SubscriptionsView");
assert.notEqual(listStart, -1, "OrganizationsView introuvable");
assert.notEqual(subscriptionsStart, -1, "SubscriptionsView introuvable");
// Bornée au corps réel de OrganizationsView : la vue Abonnements qui suit a
// ses propres besoins de navigation et ne doit pas fausser ces assertions.
const LIST_VIEW = VIEWS.slice(listStart, subscriptionsStart);

const HREF_TEMPLATE = "href={`/administration/organizations/${row.organizationId}`}";

// ---------------------------------------------------------------------------
// 1. Chaque ligne reçoit l'UUID attendu et génère le lien exact
// ---------------------------------------------------------------------------

test("le lien exact vers la fiche Organization est généré à partir de row.organizationId", () => {
  const occurrences = LIST_VIEW.split(HREF_TEMPLATE).length - 1;
  assert.ok(occurrences >= 2, `attendu au moins 2 usages du href exact, trouvé ${occurrences}`);
});

test("mapOrganizationRow transmet l'UUID de organization_id sans altération (invariant de source)", () => {
  // server.ts importe "server-only" : un import dynamique depuis le test
  // échoue hors du bundler Next.js (ERR_MODULE_NOT_FOUND), comme pour le
  // reste de cette console — invariant de source, même limite documentée
  // que les autres suites de ce module.
  const start = SERVER.indexOf("function mapOrganizationRow");
  assert.notEqual(start, -1, "mapOrganizationRow introuvable");
  const body = SERVER.slice(start, SERVER.indexOf("}", SERVER.indexOf("organizationId:", start)) + 1);
  assert.ok(
    body.includes('organizationId: String(r.organization_id ?? "")'),
    "organizationId n'est plus dérivé directement de organization_id sans altération",
  );
});

// ---------------------------------------------------------------------------
// 2. Colonne "Actions" présente, distincte du nom cliquable
// ---------------------------------------------------------------------------

test("une colonne Actions dédiée existe, en plus du nom cliquable", () => {
  assert.ok(LIST_VIEW.includes("{t.colActions}"), "en-tête de colonne Actions absent");
  assert.ok(LIST_VIEW.includes("admin-table__actions-link"), "lien d'action dédié absent");
  // Le nom reste cliquable (non-régression du lien existant).
  assert.ok(LIST_VIEW.includes("admin-table__view-link"), "le nom a cessé d'être cliquable");
});

test("le colSpan de la ligne vide reflète le nombre réel de colonnes (7)", () => {
  assert.ok(LIST_VIEW.includes("colSpan={7}"), "colSpan non mis à jour après l'ajout de la colonne Actions");
});

test("le lien d'action porte un intitulé accessible incluant le nom de l'Organization", () => {
  assert.ok(LIST_VIEW.includes("aria-label={t.viewManageAriaLabel(row.name)}"));
});

test("aucun onClick + router.push n'est utilisé là où un Link natif suffit", () => {
  assert.ok(!/router\.push/.test(LIST_VIEW), "router.push détecté dans la vue liste des Organizations");
});

// ---------------------------------------------------------------------------
// 3. Libellés FR/EN
// ---------------------------------------------------------------------------

test("les nouvelles clés colActions/viewManageLabel/viewManageAriaLabel existent en FR et en EN", () => {
  assert.equal(ADMIN_COPY.fr.colActions, "Actions");
  assert.equal(ADMIN_COPY.en.colActions, "Actions");
  assert.equal(ADMIN_COPY.fr.viewManageLabel, "Voir / Gérer");
  assert.equal(ADMIN_COPY.en.viewManageLabel, "View / Manage");
  assert.ok(ADMIN_COPY.fr.viewManageAriaLabel("RESIDENCE TEST").includes("RESIDENCE TEST"));
  assert.ok(ADMIN_COPY.en.viewManageAriaLabel("RESIDENCE TEST").includes("RESIDENCE TEST"));
});

test("les dictionnaires FR et EN restent alignés après l'ajout des nouvelles clés (garde générale déjà existante)", () => {
  const fr = Object.keys(ADMIN_COPY.fr).sort();
  const en = Object.keys(ADMIN_COPY.en).sort();
  assert.deepEqual(fr, en);
  assert.ok(fr.includes("colActions") && fr.includes("viewManageLabel") && fr.includes("viewManageAriaLabel"));
});

// ---------------------------------------------------------------------------
// 4. Accessibilité clavier — focus visible, affordance de survol
// ---------------------------------------------------------------------------

test("le lien d'action et le nom cliquable ont tous deux un focus clavier visible", () => {
  assert.ok(CSS.includes(".admin-table__actions-link:focus-visible"), "focus visible absent sur le bouton d'action");
  assert.ok(CSS.includes(".admin-table__view-link:focus-visible"), "focus visible absent sur le nom cliquable");
});

test("la ligne du tableau a un effet de survol perceptible", () => {
  assert.ok(CSS.includes(".admin-table__row:hover"));
  assert.ok(LIST_VIEW.includes('className="admin-table__row"'), "la classe de survol n'est pas posée sur <tr>");
});

test("la zone cliquable du bouton d'action a un padding suffisant (cible tactile)", () => {
  const start = CSS.indexOf(".admin-table__actions-link {");
  assert.notEqual(start, -1);
  const end = CSS.indexOf("}", start);
  const rule = CSS.slice(start, end);
  assert.ok(/padding:\s*7px\s*14px/.test(rule), "padding insuffisant pour une cible tactile confortable");
});

// ---------------------------------------------------------------------------
// 5. Aucun changement aux autorisations platform_admin (non-régression)
// ---------------------------------------------------------------------------

test("le layout continue de refuser Owner, collaborateur, locataire et anonyme (inchangé par ce correctif UX)", () => {
  assert.ok(LAYOUT.includes("resolvePlatformAdmin"));
  assert.ok(LAYOUT.includes("if (!decision.allowed)"));
  for (const role of ["organization_owner", "manager", "collector", "caretaker", "accountant", "viewer"]) {
    assert.ok(!LAYOUT.includes(role), `le layout ne doit toujours accorder aucun rôle d'Organization : ${role}`);
  }
});

test("la console reste non indexable et non mise en cache (inchangé par ce correctif UX)", () => {
  assert.ok(LAYOUT.includes("index: false"));
  assert.ok(LAYOUT.includes('dynamic = "force-dynamic"'));
});

test("ce correctif n'ajoute aucune écriture Supabase côté application", () => {
  for (const method of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert.ok(!SERVER.includes(method), `écriture détectée : ${method}`);
  }
});

test("aucun secret ni clé de service dans les fichiers touchés par ce correctif", () => {
  const patterns = [/service_role/i, /SUPABASE_SERVICE/i, /sk_live/i, /sk_test/i, /BEGIN [A-Z ]*PRIVATE KEY/];
  for (const source of [VIEWS, CSS]) {
    for (const pattern of patterns) {
      assert.ok(!pattern.test(source), `motif sensible trouvé : ${pattern}`);
    }
  }
});

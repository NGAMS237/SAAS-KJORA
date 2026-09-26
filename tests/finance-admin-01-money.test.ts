import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decimalDigitsFor,
  formatMinorAmount,
  minorToMajor,
} from "../src/modules/platform-admin/money.ts";

// =============================================================================
// FINANCE-ADMIN-01 v2 — Correctif XAF bloquant
// =============================================================================
// Bug corrigé : formatMinorAmount() divisait systématiquement par 100, alors
// que XAF n'a pas de sous-unité (5900 XAF affiché comme 59 XAF). Ces tests
// EXÉCUTENT réellement la fonction de conversion — ce ne sont pas des
// invariants de source (grep de texte), contrairement à une partie des tests
// du reste de cette console (qui n'ont pas d'environnement Next/React pour
// monter des composants). money.ts est un module pur, sans "server-only" et
// sans dépendance Supabase : il s'exécute directement sous `node --test`.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. minorToMajor — la règle centrale, par devise
// ---------------------------------------------------------------------------

test("minorToMajor(5900, 'XAF') === 5900 — XAF n'a pas de sous-unité, jamais divisé", () => {
  assert.equal(minorToMajor(5900, "XAF"), 5900);
});

test("minorToMajor(24900, 'XAF') === 24900", () => {
  assert.equal(minorToMajor(24900, "XAF"), 24900);
});

test("minorToMajor(1999, 'CAD') === 19.99 — CAD a des cents, divisé par 100", () => {
  assert.equal(minorToMajor(1999, "CAD"), 19.99);
});

test("minorToMajor(0, 'CAD') === 0 et minorToMajor(0, 'XAF') === 0", () => {
  assert.equal(minorToMajor(0, "CAD"), 0);
  assert.equal(minorToMajor(0, "XAF"), 0);
});

test("minorToMajor reste mathématiquement cohérent sur une valeur négative (aucun rejet ajouté : la validation d'un montant négatif est du ressort de la contrainte de base 'amount_minor > 0', pas de l'affichage)", () => {
  assert.equal(minorToMajor(-1999, "CAD"), -19.99);
  assert.equal(minorToMajor(-5900, "XAF"), -5900);
});

test("minorToMajor ne mélange jamais les règles CAD et XAF : la même valeur numérique donne deux résultats différents selon la devise", () => {
  const cad = minorToMajor(5900, "CAD");
  const xaf = minorToMajor(5900, "XAF");
  assert.notEqual(cad, xaf);
  assert.equal(cad, 59);
  assert.equal(xaf, 5900);
});

// ---------------------------------------------------------------------------
// 2. decimalDigitsFor — cohérent avec minorToMajor
// ---------------------------------------------------------------------------

test("decimalDigitsFor('XAF') === 0 et decimalDigitsFor('CAD') === 2", () => {
  assert.equal(decimalDigitsFor("XAF"), 0);
  assert.equal(decimalDigitsFor("CAD"), 2);
});

// ---------------------------------------------------------------------------
// 3. formatMinorAmount — bout en bout (conversion + mise en forme)
// ---------------------------------------------------------------------------

test("formatMinorAmount(5900, 'XAF', 'fr-FR') affiche 5 900, jamais 59", () => {
  const out = formatMinorAmount(5900, "XAF", "fr-FR");
  assert.ok(out.includes("5"));
  assert.ok(out.includes("900"), `attendu "900" dans la sortie, obtenu: ${out}`);
  assert.ok(!/\b59\b/.test(out), `la régression du bug XAF/100 est revenue : ${out}`);
});

test("formatMinorAmount(24900, 'XAF', 'fr-FR') affiche 24 900, jamais 249", () => {
  const out = formatMinorAmount(24900, "XAF", "fr-FR");
  assert.ok(out.includes("24") && out.includes("900"), `obtenu: ${out}`);
  assert.ok(!/\b249\b/.test(out), `la régression du bug XAF/100 est revenue : ${out}`);
});

test("formatMinorAmount(1999, 'CAD', 'en-CA') affiche 19.99, jamais 1999", () => {
  const out = formatMinorAmount(1999, "CAD", "en-CA");
  assert.ok(out.includes("19.99"), `attendu "19.99" dans la sortie, obtenu: ${out}`);
  assert.ok(!out.includes("1,999") && !out.includes("1999.00"), `montant CAD non converti : ${out}`);
});

test("formatMinorAmount(0, 'CAD', 'en-CA') et formatMinorAmount(0, 'XAF', 'fr-FR') affichent un zéro propre", () => {
  const cad = formatMinorAmount(0, "CAD", "en-CA");
  const xaf = formatMinorAmount(0, "XAF", "fr-FR");
  assert.ok(cad.includes("0.00") || cad.includes("0,00") || /\b0\b/.test(cad), `CAD zéro : ${cad}`);
  assert.ok(/\b0\b/.test(xaf), `XAF zéro : ${xaf}`);
});

test("formatMinorAmount ne mélange jamais deux devises dans une même sortie", () => {
  const out = formatMinorAmount(5900, "XAF", "fr-FR");
  assert.ok(!out.includes("CAD"));
  assert.ok(!out.includes("$"));
});

test("un montant négatif ne fait pas planter formatMinorAmount (comportement défini, pas une exception)", () => {
  assert.doesNotThrow(() => formatMinorAmount(-1999, "CAD", "en-CA"));
  assert.doesNotThrow(() => formatMinorAmount(-5900, "XAF", "fr-FR"));
});

// ---------------------------------------------------------------------------
// 4. Non-régression : le montant réel du catalogue ALIGN-03 s'affiche juste
// ---------------------------------------------------------------------------
// Rappel du catalogue billing_prices (20260908140000_align_03_billing_saas
// .sql) : essentiel/monthly/XAF = 5900, avance/monthly/CAD = 3199. Ce sont
// exactement les valeurs utilisées par admin_finance_summary pour le revenu
// attendu — la régression XAF les aurait affichées comme 59 et 32.

test("catalogue ALIGN-03 : essentiel/monthly/XAF (5900) s'affiche comme 5 900, jamais 59", () => {
  assert.equal(minorToMajor(5900, "XAF"), 5900);
});

test("catalogue ALIGN-03 : avance/monthly/CAD (3199) s'affiche comme 31.99, jamais 3199 ni 32", () => {
  assert.equal(minorToMajor(3199, "CAD"), 31.99);
});

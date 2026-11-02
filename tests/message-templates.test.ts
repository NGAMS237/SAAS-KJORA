import assert from "node:assert/strict";
import test from "node:test";

import { buildMailtoUrl, firstName, MESSAGE_TEMPLATES, normalizeTenantPhone, renderTemplate } from "../src/modules/communications/message-templates.ts";

test("normalise les numéros camerounais saisis avec espaces", () => {
  assert.equal(normalizeTenantPhone("6 53 32 99 08"), "+237653329908");
  assert.equal(normalizeTenantPhone("+237 694 76 21 38"), "+237694762138");
  assert.equal(normalizeTenantPhone("237656652224"), "+237656652224");
});

test("reconnaît un numéro nigérian local et refuse l'inconnu", () => {
  assert.equal(normalizeTenantPhone("0903 570 1447"), "+2349035701447");
  assert.equal(normalizeTenantPhone("12345"), null);
  assert.equal(normalizeTenantPhone(null), null);
});

test("remplit les variables et laisse les manquantes visibles", () => {
  const text = renderTemplate("Bonjour {prenom}, {du} pour {logement} {nouveau_loyer}", { prenom: "Gildas", du: "40 000 XAF", logement: "B1" });
  assert.equal(text, "Bonjour Gildas, 40 000 XAF pour B1 [nouveau_loyer]");
});

test("chaque modèle a un identifiant unique et un texte", () => {
  const keys = MESSAGE_TEMPLATES.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const item of MESSAGE_TEMPLATES) assert.ok(item.body.length > 10);
});

test("prénom et mailto", () => {
  assert.equal(firstName("alice Ayissi"), "Alice");
  assert.ok(buildMailtoUrl("a@b.co", "Sujet é", "Corps")?.startsWith("mailto:a@b.co?subject="));
  assert.equal(buildMailtoUrl("pas-un-mail", "s", "b"), null);
});

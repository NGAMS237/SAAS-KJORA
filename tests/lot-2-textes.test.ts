import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getUserGreetingName } from "../src/core/auth/user-display-name.ts";

test("prénom : métadonnées d'abord, puis repli sur le courriel", () => {
  assert.equal(getUserGreetingName({ given_name: "blaise" }), "Blaise");
  assert.equal(getUserGreetingName({}, "jean.tremblay@exemple.com"), "Jean");
  assert.equal(getUserGreetingName(null, "x123@exemple.com"), null);
});

test("la page Support garde une espace avant « détaille »", () => {
  const source = readFileSync("src/app/(internal)/app/support/page.tsx", "utf8");
  assert.match(source, /Aide<\/Link>\{" "\}/);
});

test("l'interface française n'expose plus de jargon anglais courant", () => {
  const files = ["src/modules/operations/views.tsx", "src/modules/tenancy/views.tsx", "src/modules/properties/views.tsx", "src/modules/payments/views.tsx"];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /de l’Organization active/, file);
    assert.doesNotMatch(source, /tenant-scoped/, file);
  }
});

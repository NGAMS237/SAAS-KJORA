import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("la console envoie vers la page de connexion dédiée au lieu d'un 404 pour un compte sans droit", () => {
  const layout = read("../src/app/administration/layout.tsx");
  assert.match(layout, /redirect\("\/connexion\/administration\?next=\/administration"\)/);
  assert.match(layout, /redirect\("\/connexion\/administration\?reason=not-admin"\)/);
  assert.ok(layout.includes("notFound()"), "une vérification en échec reste un refus fermé");
});

test("la page de connexion administrateur n'accorde aucun droit et n'est pas indexable", () => {
  const page = read("../src/app/connexion/administration/page.tsx");
  assert.ok(page.includes("resolvePlatformAdmin"));
  assert.match(page, /if \(decision\.allowed\) redirect\("\/administration"\)|redirect\(CONSOLE_PATH\)/);
  assert.ok(page.includes("index: false"));
  assert.ok(page.includes('nextPath={CONSOLE_PATH}'));
});

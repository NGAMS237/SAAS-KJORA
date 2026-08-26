import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../src/core/auth/safe-next-path.ts";

test("le retour Auth accepte un chemin interne d’invitation", () => {
  assert.equal(safeNextPath("/invitation/accepter"), "/invitation/accepter");
});

test("le retour Auth refuse les redirections externes et protocol-relative", () => {
  assert.equal(safeNextPath("https://evil.example/steal", "https://saas-kjora.vercel.app"), "/app");
  assert.equal(safeNextPath("//evil.example/steal"), "/app");
});

test("le retour Auth accepte une URL absolue du même domaine", () => {
  assert.equal(
    safeNextPath("https://saas-kjora.vercel.app/invitation/accepter", "https://saas-kjora.vercel.app"),
    "/invitation/accepter",
  );
});

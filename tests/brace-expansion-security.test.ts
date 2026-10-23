import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type LockPackage = { version?: string };
type PackageLock = { packages: Record<string, LockPackage> };

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
) as PackageLock;

test("brace-expansion reste corrigé dans les deux chaînes minimatch", () => {
  assert.equal(lock.packages["node_modules/brace-expansion"]?.version, "1.1.21");
  assert.equal(
    lock.packages["node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion"]?.version,
    "5.0.12",
  );
});

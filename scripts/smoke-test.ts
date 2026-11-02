// Usage : npm run smoke -- https://kjorapp.com
// Code de sortie 0 = tout passe, 1 = au moins un contrôle échoue.
import { runSmokeChecks } from "./smoke-checks.ts";

const baseUrl = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "https://kjorapp.com";
const results = await runSmokeChecks(baseUrl);

console.log(`Test de fumée — ${baseUrl}`);
for (const result of results) console.log(`${result.ok ? "OK    " : "ECHEC "} ${result.name}${result.ok ? "" : `\n         -> ${result.detail}`}`);

const failed = results.filter((result) => !result.ok).length;
console.log(failed === 0 ? `\n${results.length}/${results.length} contrôles réussis.` : `\n${failed} contrôle(s) en échec sur ${results.length}.`);
process.exit(failed === 0 ? 0 : 1);

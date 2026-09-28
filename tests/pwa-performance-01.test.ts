import test from "node:test";import assert from "node:assert/strict";import fs from "node:fs";
const sw=fs.readFileSync("public/sw.js","utf8");const manifest=fs.readFileSync("src/app/manifest.ts","utf8");
test("le manifeste reste installable et bilingue par description",()=>{assert.match(manifest,/display: "standalone"/);assert.match(manifest,/purpose: "maskable"/);assert.match(manifest,/shortcuts/)});
test("le service worker exclut routes privées et API",()=>{for(const p of ["/api/","/app/","/administration/","/portal/","/auth/"])assert.match(sw,new RegExp(p.replaceAll("/","\\/")));assert.match(sw,/NEVER_CACHE_PREFIXES/)});
test("aucun cache de requête non GET ou origine tierce",()=>{assert.match(sw,/request\.method !== "GET"/);assert.match(sw,/url\.origin !== self\.location\.origin/)});
test("le repli hors ligne est public et explicite",()=>{assert.match(sw,/\/hors-ligne\//);const page=fs.readFileSync("src/app/hors-ligne/page.tsx","utf8");assert.match(page,/ne met jamais en cache/);assert.match(page,/never stored/)});

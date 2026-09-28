import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
const sql=read("../supabase/migrations/20260928203733_whatsapp_foundation_01.sql");
const provider=read("../src/modules/communications/whatsapp-provider.ts");

test("les numéros sont strictement E.164 et WhatsApp reste une indication distincte",()=>{
  assert.ok(sql.includes("'^\\+[1-9][0-9]{7,14}$'"));
  assert.ok(!sql.includes("'^\\\\+[1-9][0-9]{7,14}$'"), "le motif SQL ne doit pas exiger un antislash avant le +");
  assert.match(sql,/whatsapp_capable boolean/);
});
test("les consentements transactionnel et marketing sont séparés et révocables",()=>{
  for(const name of ["whatsapp_transactional_consented_at","whatsapp_transactional_revoked_at","whatsapp_marketing_consented_at","whatsapp_marketing_revoked_at"]) assert.match(sql,new RegExp(name));
});
test("la file possède les sept états demandés et ne contient aucun message en clair",()=>{
  for(const state of ["queued","blocked_configuration","claimed","sent","provider_failed","delivery_unknown","delivered"]) assert.match(sql,new RegExp(`'${state}'`));
  assert.doesNotMatch(sql,/message_body|recipient_phone/);
});
test("l'adapter disabled ne fait aucun appel réseau et échoue de façon contrôlée",()=>{
  assert.match(provider,/enabled: false/); assert.match(provider,/blocked_configuration/);
  assert.doesNotMatch(provider,/\bfetch\(|axios|whatsapp-web/i);
});
test("aucun accès direct anon/authenticated n'est accordé à la file",()=>{
  assert.match(sql,/revoke all on public\.tenant_communication_preferences, public\.whatsapp_templates, public\.whatsapp_outbox from public, anon, authenticated/);
});

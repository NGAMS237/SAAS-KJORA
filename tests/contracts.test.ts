import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { canonicalContractContent, canTransitionContract, filterContractSections, parseSignatureRequest, renderContractSections, validateControlledSections, type ContractSection, type LeaseContract } from "../src/modules/contracts/model.ts";
import { generateContractPdf } from "../src/modules/contracts/pdf.ts";
import { CAPABILITIES } from "../src/core/authorization/capabilities.ts";
import { portalNotificationHref } from "../src/tenant-portal/model.ts";

const migration=readFileSync(new URL("../supabase/migrations/20260901224122_lot_6f_contracts_signatures.sql",import.meta.url),"utf8");
const sections:ContractSection[]=[
  {key:"rent",title:"Loyer",condition:"always",body:"{{tenant.name}} paie {{lease.base_rent}} {{organization.currency}}."},
  {key:"deposit",title:"Dépôt",condition:"deposit_positive",body:"Dépôt : {{lease.deposit}} {{organization.currency}}."},
  {key:"charges",title:"Charges",condition:"charges_positive",body:"Charges : {{lease.charges}} {{organization.currency}}."},
];

test("contract.manage est centralisée et limitée à Owner/Gestionnaire dans la migration",()=>{assert.ok(CAPABILITIES.includes("contract.manage"));assert.match(migration,/\('organization_owner', 'contract\.manage'\)/);assert.match(migration,/\('manager', 'contract\.manage'\)/);assert.doesNotMatch(migration,/\('(collector|caretaker|accountant|viewer)', 'contract\.manage'\)/);});
test("les modèles n'acceptent que des variables contrôlées",()=>{assert.equal(validateControlledSections(sections),true);assert.equal(validateControlledSections([{...sections[0],body:"{{process.env.SECRET}}"}]),false);});
test("la clause dépôt disparaît quand le dépôt vaut zéro",()=>{const filtered=filterContractSections(sections,{deposit:0,charges:1000});assert.equal(filtered.some((section)=>section.key==="deposit"),false);assert.equal(filtered.some((section)=>section.key==="charges"),true);});
test("les variables sont rendues depuis le snapshot figé",()=>{const rendered=renderContractSections([sections[0]],{tenant:{name:"Awa Démo"},lease:{base_rent:80000},organization:{currency:"XAF"}});assert.equal(rendered[0].body,"Awa Démo paie 80000 XAF.");});
test("la sérialisation canonique est stable",()=>{assert.equal(canonicalContractContent(sections),canonicalContractContent(structuredClone(sections)));});
test("les transitions formelles refusent tout retour silencieux",()=>{assert.equal(canTransitionContract("draft","ready"),true);assert.equal(canTransitionContract("sent","tenant_signed"),true);assert.equal(canTransitionContract("completed","draft"),false);assert.equal(canTransitionContract("cancelled","ready"),false);});
test("la signature exige consentement et trace non vide",()=>{assert.equal(parseSignatureRequest({method:"stylized_name",displayName:"Blaise N.",consent:true}).ok,true);assert.equal(parseSignatureRequest({method:"stylized_name",displayName:"B",consent:true}).ok,false);assert.equal(parseSignatureRequest({method:"drawn",strokes:[{x:1,y:1},{x:2,y:2}],consent:true}).ok,true);assert.equal(parseSignatureRequest({method:"drawn",strokes:[],consent:true}).ok,false);});
test("les notifications contrat ouvrent la ressource exacte",()=>{assert.equal(portalNotificationHref({notificationType:"contract_ready",payload:{contractId:"123"},documentId:null,dueId:null,leaseId:"lease"}),"/portal/contrats?contract=123");});
test("les tables 6F sont RLS/default-deny et les RPC sont privées à authenticated",()=>{for(const table of ["contract_templates","organization_contract_settings","lease_contracts","contract_signatures","contract_amendments"]){assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`,`i`));}assert.match(migration,/revoke all on public\.contract_templates[\s\S]*from public, anon, authenticated/i);assert.match(migration,/revoke all on function public\.list_contract_templates/i);assert.match(migration,/grant execute on function public\.list_contract_templates[\s\S]*to authenticated/i);});
test("les contrats et signatures finalisés sont immuables et le bucket est privé",()=>{assert.match(migration,/immutable_contract/);assert.match(migration,/immutable_contract_signature/);assert.match(migration,/values \('contract-documents','contract-documents',false/);assert.match(migration,/target_storage_path <> c\.organization_id\|\|/);});
test("le portail reste Tenant/Lease scoped et les URLs signées durent 120 secondes",()=>{assert.match(migration,/private\.has_active_tenant_portal_access\(target_access_id\)/);assert.match(migration,/la\.tenant_id=c\.tenant_id and la\.lease_id=c\.lease_id/);const route=readFileSync(new URL("../src/app/api/tenant-portal/contracts/[contractId]/download/route.ts",import.meta.url),"utf8");const server=readFileSync(new URL("../src/modules/contracts/server.ts",import.meta.url),"utf8");assert.match(server,/createSignedUrl\(storagePath, 120/);assert.match(route,/getPortalContract\(accessId,contractId\)/);});
test("6F n'active ni fournisseur payant, ni email financier, ni accès public",()=>{assert.doesNotMatch(migration,/docusign|yousign|adobe sign|flutterwave|campay|stripe/i);assert.doesNotMatch(migration,/public\s*=\s*true/i);assert.doesNotMatch(migration,/message_deliveries|financial_email/i);});
// AFRICA-CONTRACTS-PERFORMANCE-01 — AXE B
const settingsView=readFileSync(new URL("../src/modules/contracts/settings-view.tsx",import.meta.url),"utf8");
const contractViews=readFileSync(new URL("../src/modules/contracts/views.tsx",import.meta.url),"utf8");
test("les modèles proposent un aperçu local avec des données fictives, jamais réelles",()=>{
  assert.match(settingsView,/FICTITIOUS_PREVIEW_SNAPSHOT/);
  assert.match(settingsView,/données fictives/i);
  assert.doesNotMatch(settingsView,/FICTITIOUS_PREVIEW_SNAPSHOT[\s\S]*fetch\(/);
});
test("le cachet et la signature électronique sont explicitement distingués, avec un aperçu visuel du cachet",()=>{
  assert.match(settingsView,/signature électronique est distincte/i);
  assert.match(settingsView,/contract-stamp-preview/);
});
test("le parcours contrat signale l'absence de modalités de paiement au lieu de la fabriquer",()=>{
  assert.match(contractViews,/leasePaymentTermsRecorded/);
  assert.match(contractViews,/non renseignées/i);
});
test("le PDF final inclut contenu, preuves et cachet dans un document A4 valide",async()=>{const contract:LeaseContract={id:"00000000-0000-4000-8000-000000000001",organizationId:"00000000-0000-4000-8000-000000000002",leaseId:"00000000-0000-4000-8000-000000000003",tenantId:"00000000-0000-4000-8000-000000000004",templateId:"00000000-0000-4000-8000-000000000005",templateVersion:1,language:"fr",reference:"CTR-2026-DEMO000001",status:"tenant_signed",templateSnapshot:{name:"Bail standard"},dataSnapshot:{organization:{name:"KJORA Démo",currency:"XAF"},tenant:{name:"Awa Démo"},lease:{base_rent:80000}},contentSnapshot:[sections[0]],contentSha256:"a".repeat(64),stampSnapshot:{enabled:true,company:"KJORA Démo",position:"signature_block"},finalStoragePath:null,finalSha256:null,createdAt:"2026-09-02T10:00:00.000Z",sentAt:"2026-09-02T10:10:00.000Z",completedAt:null,signatures:[{party:"owner",signerUserId:"00000000-0000-4000-8000-000000000006",method:"stylized_name",consentCode:"owner_contract_signature_v1",consentText:"Consentement exact",contentSha256:"a".repeat(64),signedAt:"2026-09-02T10:15:00.000Z",signatureData:{displayName:"Bailleur Démo"}},{party:"tenant",signerUserId:"00000000-0000-4000-8000-000000000007",method:"drawn",consentCode:"tenant_contract_signature_v1",consentText:"Consentement exact",contentSha256:"a".repeat(64),signedAt:"2026-09-02T10:20:00.000Z",signatureData:{strokes:[{x:1,y:1},{x:20,y:10},{x:40,y:2}]}}]};const bytes=await generateContractPdf(contract);const pdf=await PDFDocument.load(bytes);assert.ok(bytes.byteLength>1000);assert.ok(pdf.getPageCount()>=1);});

// =============================================================================
// CONTRATS-UX-PILOTE-01
// =============================================================================
const pdfSource=readFileSync(new URL("../src/modules/contracts/pdf.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/app/globals.css",import.meta.url),"utf8");

// 1. Cachet rouge, ovale, distinct d'une signature électronique (texte noir).
test("le cachet PDF est dessiné en rouge, ovale et pivoté — distinct de la signature électronique (INK/noir)",()=>{
  assert.match(pdfSource,/STAMP_RED\s*=\s*rgb\(/);
  assert.match(pdfSource,/drawEllipse\(\{[^}]*rotate:\s*degrees\(-7\)/);
  assert.match(pdfSource,/borderColor:\s*STAMP_RED/);
  assert.match(pdfSource,/color:\s*STAMP_RED/);
});
test("le cachet visuel (CSS) est rouge, ovale et pivoté, avec un texte d'aide qui le distingue explicitement de la signature",()=>{
  assert.match(css,/--stamp-red/i);
  assert.match(css,/\.contract-stamp-preview__box[\s\S]{0,400}border-radius:\s*50%/);
  assert.match(css,/\.contract-stamp-preview__box[\s\S]{0,400}rotate\(-?\d+deg\)/);
  assert.match(settingsView,/tampon encreur/i);
});

// 2. Aperçu de modèle facile à trouver, avec données RÉELLES de la Location
// (jamais fictives) sur l'écran de génération — distinct de l'aperçu à
// données fictives déjà existant dans les paramètres (FICTITIOUS_PREVIEW_SNAPSHOT).
test("l'écran de génération propose un aperçu avec les données réelles de CETTE Location, jamais fabriquées",()=>{
  assert.match(contractViews,/function TemplateRealDataPreview/);
  assert.match(contractViews,/previewSnapshot/);
  assert.doesNotMatch(contractViews,/FICTITIOUS_PREVIEW_SNAPSHOT/);
  assert.match(contractViews,/jamais fabriquées/);
});
test("le lien vers tous les modèles disponibles reste accessible depuis l'écran de génération",()=>{
  assert.match(contractViews,/href="\/app\/parametres\/contrats"/);
  assert.match(contractViews,/Voir tous les modèles disponibles/);
});

// 3. État de chargement par action, anti double-clic, retour clair succès/erreur.
test("chaque action du contrat a son propre libellé de progression (anti double-clic par bouton, pas un busy global unique)",()=>{
  assert.match(contractViews,/const ACTION_LABELS: Record<string, \{ idle: string; pending: string; success: string \}>/);
  for(const action of ["generate","validate","send","cancel"]) assert.match(contractViews,new RegExp(`${action}:\\s*\\{\\s*idle:`));
  assert.match(contractViews,/const busy = pendingAction !== null/);
  assert.match(contractViews,/disabled=\{busy/);
});
test("un succès affiche un message de confirmation explicite, une erreur reste visible séparément",()=>{
  assert.match(contractViews,/setNotice\(ACTION_LABELS\[name\]\?\.success/);
  assert.match(contractViews,/notice \? <p className="form-feedback" role="status">/);
  assert.match(contractViews,/error \? <p className="form-error" role="alert">/);
});

// 4. Civilité/prénom/nom facultatifs pour l'identité individuelle du cachet
// (bailleur) — additifs, ne remplacent jamais le champ "Nom" déjà affiché.
test("les réglages du cachet exposent civilité/prénom/nom facultatifs, sans jamais écraser le Nom déjà renseigné",()=>{
  assert.match(settingsView,/Civilité \(facultatif\)/);
  assert.match(settingsView,/Prénom\(s\) \(facultatif\)/);
  assert.match(settingsView,/Nom\(s\) \(facultatif\)/);
  assert.match(settingsView,/current\.name\.trim\(\)\?current\.name:/);
});
test("le champ Nom du cachet reste le seul réellement affiché, avec une aide qui l'explique",()=>{
  assert.match(settingsView,/Champ réellement affiché sur le cachet/);
});

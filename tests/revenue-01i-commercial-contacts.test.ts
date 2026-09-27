import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// =============================================================================
// REVENUE-LAUNCH-01 — Sous-lot 01I — Contacts commerciaux — Tests
// =============================================================================
// Audit préalable (voir session, agent d'exploration dédié) : aucune table ni
// RPC existante ne trace un consentement marketing, un téléphone ou un pays
// de contact nulle part dans le schéma. organization_profiles.country_code
// est verrouillé à 'CM' (check constraint) — inutilisable tel quel pour un
// contact commercial (ex. propriétaire de la diaspora) : ce lot introduit
// donc son propre champ `country`, sans desserrer cette contrainte. EXPORT-01
// (data_exports/request_data_export) est borné à UNE Organization : ce lot
// n'y touche pas et construit sa propre RPC d'export transversal, réservée à
// platform_admin.
//
// Tous les fichiers `server-only` (server.ts, views.tsx — TSX non
// transpilable par le test runner Node — et contacts-actions.ts, qui importe
// transitivement lib/supabase/server.ts) sont inspectés en texte source,
// jamais importés comme modules ES — même convention que
// revenue-01h-admin-lifecycle.test.ts.
// =============================================================================

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*--.*$/gm, "");
}

const MIGRATION = read("../supabase/migrations/20260927190000_revenue_01i_commercial_contacts.sql");
const PGTAP = read("../supabase/tests/database/rls_revenue_01i_commercial_contacts.test.sql");
const ADMIN_SERVER = read("../src/modules/platform-admin/server.ts");
const ADMIN_VIEWS = read("../src/modules/platform-admin/views.tsx");
const ADMIN_COPY = read("../src/modules/platform-admin/copy.ts");
const CONTACTS_ACTIONS = read("../src/modules/platform-admin/contacts-actions.ts");
const CONTACTS_PAGE = read("../src/app/administration/contacts/page.tsx");
const ADMIN_SHELL = read("../src/modules/platform-admin/admin-shell.tsx");
const EXPORT_ROUTE = read("../src/app/api/administration/contacts/export/route.ts");
const CSV_MODULE = read("../src/modules/data-export/csv.ts");

const MIGRATION_CLEAN = sansCommentaires(MIGRATION);

// ---------------------------------------------------------------------------
// 1. Migration — enveloppe et non-application
// ---------------------------------------------------------------------------

test("la migration 01I est enveloppée begin;/commit; (convention du projet)", () => {
  assert.match(MIGRATION, /^begin;/);
  assert.match(MIGRATION, /\ncommit;\s*$/);
});

// ---------------------------------------------------------------------------
// 2. organization_commercial_contacts — schéma, RLS, contraintes
// ---------------------------------------------------------------------------

test("organization_commercial_contacts existe avec organization_id en clé primaire (une fiche par Organization)", () => {
  assert.match(
    MIGRATION_CLEAN,
    /create table public\.organization_commercial_contacts \(\s*organization_id uuid primary key references public\.organizations \(id\) on delete cascade,/,
  );
});

test("phone est facultatif (5 à 30 caractères ou null), country obligatoire (2 à 80), language fr\\/en par défaut fr", () => {
  assert.match(
    MIGRATION_CLEAN,
    /phone text check \(phone is null or char_length\(trim\(phone\)\) between 5 and 30\)/,
  );
  assert.match(
    MIGRATION_CLEAN,
    /country text not null check \(char_length\(trim\(country\)\) between 2 and 80\)/,
  );
  assert.match(
    MIGRATION_CLEAN,
    /language text not null default 'fr' check \(language in \('fr', 'en'\)\)/,
  );
});

test("consent_source est une liste fermée à une seule valeur ('admin_manual_entry') — aucun formulaire public n'existe encore", () => {
  assert.match(
    MIGRATION_CLEAN,
    /consent_source text check \(consent_source is null or consent_source in \('admin_manual_entry'\)\)/,
  );
});

test("contrainte : consentement et désabonnement sont mutuellement exclusifs", () => {
  assert.match(
    MIGRATION_CLEAN,
    /constraint organization_commercial_contacts_consent_unsub_exclusive check \(\s*not \(marketing_consent and unsubscribed_at is not null\)\s*\)/,
  );
});

test("contrainte : marketing_consent_at et consent_source sont toujours renseignés ensemble, jamais l'un sans l'autre", () => {
  assert.match(
    MIGRATION_CLEAN,
    /constraint organization_commercial_contacts_consent_pair check \(\s*\(marketing_consent_at is null\) = \(consent_source is null\)\s*\)/,
  );
});

test("organization_commercial_contacts : RLS activée, aucun accès direct accordé, aucune policy (même schéma que admin_organization_notes)", () => {
  assert.match(MIGRATION_CLEAN, /alter table public\.organization_commercial_contacts enable row level security/);
  assert.match(
    MIGRATION_CLEAN,
    /revoke all on public\.organization_commercial_contacts from anon, authenticated/,
  );
  assert.doesNotMatch(MIGRATION_CLEAN, /create policy[\s\S]{0,120}on public\.organization_commercial_contacts/);
});

test("organization_commercial_contacts réutilise le trigger touch_updated_at (lot_5b), jamais une nouvelle fonction de trigger", () => {
  assert.match(
    MIGRATION_CLEAN,
    /create trigger organization_commercial_contacts_touch_updated_at\s*\nbefore update on public\.organization_commercial_contacts\s*\nfor each row execute function private\.touch_updated_at\(\);/,
  );
});

test("aucun trigger ne crée automatiquement une fiche contact (jamais d'inscription automatique à une newsletter)", () => {
  const triggerCount = (MIGRATION_CLEAN.match(/create trigger/gi) ?? []).length;
  assert.equal(triggerCount, 1, "un seul trigger attendu (touch_updated_at), jamais un trigger de création automatique");
  assert.doesNotMatch(MIGRATION_CLEAN, /after insert on public\.organizations/);
  assert.doesNotMatch(MIGRATION_CLEAN, /after insert on public\.memberships/);
});

// ---------------------------------------------------------------------------
// 3. organization_profiles.country_code — non-régression (verrou CM intact)
// ---------------------------------------------------------------------------

test("organization_profiles.country_code n'est jamais touché par ce lot (verrou 'CM' intact, nouveau champ `country` indépendant)", () => {
  assert.doesNotMatch(MIGRATION_CLEAN, /alter table public\.organization_profiles/);
  assert.doesNotMatch(MIGRATION_CLEAN, /country_code/);
});

// ---------------------------------------------------------------------------
// 4. administrative_audit_log — extension additive, jamais une seconde table
// ---------------------------------------------------------------------------

test("administrative_audit_log.action est étendu de façon additive (les 29 valeurs précédentes restent, dont celles de 01H)", () => {
  const PREVIOUS_ACTIONS = [
    "member.invited", "member.invitation_resent", "member.invitation_revoked", "member.invitation_accepted",
    "member.role_changed", "member.revoked", "owner.transferred", "payment.reversed", "document.invalidated",
    "tenant_portal.invited", "tenant_portal.invitation_resent", "tenant_portal.invitation_accepted",
    "tenant_portal.revoked", "tenant_portal.reactivated", "contract.generated", "contract.validated",
    "contract.owner_signed", "contract.sent", "contract.tenant_viewed", "contract.tenant_signed",
    "contract.finalized", "contract.cancelled",
    "organization.suspended", "organization.reactivated", "organization.archived", "organization.restored",
    "member.disabled_by_admin", "member.reactivated_by_admin", "owner.transferred_by_admin", "admin.note_added",
  ];
  for (const action of PREVIOUS_ACTIONS) {
    assert.ok(MIGRATION_CLEAN.includes(`'${action}'`), `valeur historique perdue : ${action}`);
  }
  const NEW_ACTIONS = ["contact.updated", "contact.marketing_consent_changed"];
  for (const action of NEW_ACTIONS) {
    assert.ok(MIGRATION_CLEAN.includes(`'${action}'`), `nouvelle valeur manquante : ${action}`);
  }
  // Une seule table d'historique : jamais de second `create table ... audit`.
  assert.doesNotMatch(MIGRATION_CLEAN, /create table public\.\w*audit\w*/);
});

// ---------------------------------------------------------------------------
// 5. RPC d'écriture — admin_upsert_organization_contact / admin_set_marketing_consent
// ---------------------------------------------------------------------------

test("admin_upsert_organization_contact garde par assert_platform_admin, valide pays/langue/téléphone, upsert jamais de doublon", () => {
  const start = MIGRATION_CLEAN.indexOf("create or replace function public.admin_upsert_organization_contact(");
  assert.notEqual(start, -1);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start) + 3);
  assert.match(body, /perform private\.assert_platform_admin\(\);/);
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  for (const outcome of ["organization_not_found", "invalid_phone", "country_required", "invalid_language", "saved"]) {
    assert.ok(body.includes(`'${outcome}'`), `issue manquante : ${outcome}`);
  }
  assert.match(body, /on conflict \(organization_id\) do update/);
  assert.match(body, /private\.write_administrative_audit\(\s*target_organization_id, 'contact\.updated'/);
});

test("admin_set_marketing_consent exige une fiche existante, valide la source, met à jour horodatage/désabonnement en une seule RPC", () => {
  const start = MIGRATION_CLEAN.indexOf("create or replace function public.admin_set_marketing_consent(");
  assert.notEqual(start, -1);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start) + 3);
  assert.match(body, /perform private\.assert_platform_admin\(\);/);
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  for (const outcome of ["contact_not_found", "invalid_consent", "invalid_source", "consent_updated"]) {
    assert.ok(body.includes(`'${outcome}'`), `issue manquante : ${outcome}`);
  }
  // Une seule RPC gère les deux sens de la décision (accord et retrait).
  assert.match(body, /marketing_consent_at = now\(\)/);
  assert.match(body, /unsubscribed_at = case when p_consent then null else now\(\) end/);
  assert.match(body, /private\.write_administrative_audit\(\s*target_organization_id, 'contact\.marketing_consent_changed'/);
});

test("aucune suppression de donnée dans ce lot : pas de `delete from` dans la migration 01I", () => {
  const deletes = MIGRATION_CLEAN.match(/delete from [^\s;]+/gi) ?? [];
  assert.deepEqual(deletes, []);
});

// ---------------------------------------------------------------------------
// 6. RPC de lecture — console paginée + export non paginé
// ---------------------------------------------------------------------------

test("admin_list_commercial_contacts est paginée (rows/total_count/limit/offset), garde platform_admin, jamais has_capability", () => {
  const start = MIGRATION_CLEAN.indexOf("create or replace function public.admin_list_commercial_contacts(");
  assert.notEqual(start, -1);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start) + 3);
  assert.match(body, /perform private\.assert_platform_admin\(\);/);
  assert.match(body, /stable/);
  assert.doesNotMatch(body, /has_capability/);
  assert.match(body, /'rows', page_rows,/);
  assert.match(body, /'total_count', total,/);
  assert.match(body, /'limit', safe_limit,/);
  assert.match(body, /'offset', safe_offset/);
  // Courriel du propriétaire toujours dérivé en lecture, jamais stocké.
  assert.match(body, /where m\.organization_id = o\.id and m\.role = 'organization_owner' and m\.status = 'active'/);
});

test("admin_list_commercial_contacts_for_export est bornée (limit 5000), mêmes colonnes que la console, garde platform_admin", () => {
  const start = MIGRATION_CLEAN.indexOf("create or replace function public.admin_list_commercial_contacts_for_export(");
  assert.notEqual(start, -1);
  const body = MIGRATION_CLEAN.slice(start, MIGRATION_CLEAN.indexOf("$$;", start) + 3);
  assert.match(body, /perform private\.assert_platform_admin\(\);/);
  assert.match(body, /stable/);
  assert.match(body, /limit 5000/);
});

test("l'export ne réutilise jamais le couple RPC/table EXPORT-01 (data_exports, request_data_export) — hors-scope (borné à une Organization)", () => {
  assert.doesNotMatch(MIGRATION_CLEAN, /data_exports/);
  assert.doesNotMatch(MIGRATION_CLEAN, /request_data_export/);
  assert.doesNotMatch(MIGRATION_CLEAN, /record_data_export_download/);
});

// ---------------------------------------------------------------------------
// 7. Droits d'exécution
// ---------------------------------------------------------------------------

test("les quatre nouvelles RPC sont révoquées de public/anon et accordées à authenticated", () => {
  const ALL_NEW_RPCS = [
    "admin_upsert_organization_contact(uuid, text, text, text)",
    "admin_set_marketing_consent(uuid, boolean, text)",
    "admin_list_commercial_contacts(integer, integer, text)",
    "admin_list_commercial_contacts_for_export()",
  ];
  for (const signature of ALL_NEW_RPCS) {
    const fnName = signature.split("(")[0];
    assert.ok(
      MIGRATION_CLEAN.includes(`revoke all on function public.${signature} from public, anon;`),
      `revoke manquant pour ${fnName}`,
    );
    assert.ok(
      MIGRATION_CLEAN.includes(`grant execute on function public.${signature} to authenticated;`),
      `grant manquant pour ${fnName}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 8. Non-régression — les lots fermés ne sont jamais rouverts
// ---------------------------------------------------------------------------

test("les RPC déjà livrées (01A-01H) ne sont jamais redéfinies par ce lot", () => {
  const CLOSED_RPCS = [
    "public.admin_get_organization_detail(",
    "public.admin_suspend_organization(",
    "public.admin_disable_member(",
    "public.admin_grant_commercial_intervention(",
    "public.admin_finance_billing_extension(",
    "private.has_capability(",
  ];
  for (const rpc of CLOSED_RPCS) {
    assert.doesNotMatch(
      MIGRATION_CLEAN,
      new RegExp(`create or replace function ${rpc.replace(/[().]/g, "\\$&")}`),
      `${rpc} ne doit pas être redéfinie par REVENUE-01I`,
    );
  }
});

// ---------------------------------------------------------------------------
// 9. src/modules/platform-admin/server.ts — lecture console
// ---------------------------------------------------------------------------

test("listCommercialContacts appelle admin_list_commercial_contacts (paginée), jamais la RPC d'export", () => {
  const start = ADMIN_SERVER.indexOf("export async function listCommercialContacts");
  assert.notEqual(start, -1);
  const body = ADMIN_SERVER.slice(start, ADMIN_SERVER.indexOf("\n}", start));
  assert.match(body, /"admin_list_commercial_contacts"/);
  assert.doesNotMatch(body, /"admin_list_commercial_contacts_for_export"/);
  assert.match(body, /page_limit: limit,/);
  assert.match(body, /page_offset: offset,/);
  assert.match(body, /search_term: filters\.search\?\.trim\(\) \|\| null,/);
});

test("AdminCommercialContactRow expose ownerEmail dérivé et aucun champ de campagne/newsletter", () => {
  const start = ADMIN_SERVER.indexOf("export type AdminCommercialContactRow");
  assert.notEqual(start, -1);
  const body = ADMIN_SERVER.slice(start, ADMIN_SERVER.indexOf("};", start));
  for (const field of [
    "organizationId", "organizationName", "ownerEmail", "phone", "country", "language",
    "marketingConsent", "marketingConsentAt", "consentSource", "unsubscribedAt",
  ]) {
    assert.match(body, new RegExp(`${field}[?:]`), `champ manquant : ${field}`);
  }
  assert.doesNotMatch(ADMIN_SERVER, /newsletterSubscribed/);
  assert.doesNotMatch(ADMIN_SERVER, /campaignId/);
});

// ---------------------------------------------------------------------------
// 10. src/modules/platform-admin/contacts-actions.ts — double barrière
// ---------------------------------------------------------------------------

test("contacts-actions.ts revérifie is_platform_admin_self, ne fuite jamais error.message, n'envoie jamais rien", () => {
  assert.match(CONTACTS_ACTIONS, /"use server"/);
  assert.match(CONTACTS_ACTIONS, /is_platform_admin_self/);
  assert.doesNotMatch(CONTACTS_ACTIONS, /message: error\.message/);
  assert.doesNotMatch(CONTACTS_ACTIONS, /resend/i);
  assert.doesNotMatch(CONTACTS_ACTIONS, /sendEmail/i);
});

test("upsertOrganizationContactAction et setMarketingConsentAction existent et appellent les bonnes RPC", () => {
  assert.match(CONTACTS_ACTIONS, /export async function upsertOrganizationContactAction\(/);
  assert.match(CONTACTS_ACTIONS, /export async function setMarketingConsentAction\(/);
  assert.match(CONTACTS_ACTIONS, /callAdminContactRpc\("admin_upsert_organization_contact",/);
  assert.match(CONTACTS_ACTIONS, /callAdminContactRpc\("admin_set_marketing_consent",/);
});

// ---------------------------------------------------------------------------
// 11. Route d'export CSV — garde 404 discrète, réutilisation buildCsvDocument
// ---------------------------------------------------------------------------

test("la route d'export exige resolvePlatformAdmin (404 discret si refusé), jamais un message qui confirme son existence", () => {
  assert.match(EXPORT_ROUTE, /resolvePlatformAdmin\(\)/);
  assert.match(EXPORT_ROUTE, /status: 404/);
  assert.match(EXPORT_ROUTE, /buildCsvDocument\(/);
  assert.match(EXPORT_ROUTE, /"admin_list_commercial_contacts_for_export"/);
  assert.match(EXPORT_ROUTE, /Content-Type.*text\/csv/);
});

test("buildCsvDocument (EXPORT-01) est bien réutilisé — pas de seconde implémentation CSV dans ce lot", () => {
  assert.match(CSV_MODULE, /export function buildCsvDocument/);
  assert.doesNotMatch(EXPORT_ROUTE, /function buildCsvDocument/);
});

// ---------------------------------------------------------------------------
// 12. Page, navigation et vue
// ---------------------------------------------------------------------------

test("la page /administration/contacts appelle listCommercialContacts et rend ContactsView", () => {
  assert.match(CONTACTS_PAGE, /listCommercialContacts\(/);
  assert.match(CONTACTS_PAGE, /<ContactsView/);
});

test("le lien de navigation vers /administration/contacts est ajouté à la coque Admin", () => {
  assert.match(ADMIN_SHELL, /href: "\/administration\/contacts", key: "navContacts" as const/);
});

test("ContactsView affiche recherche, tableau (téléphone/pays/langue/consentement), export CSV et les deux dialogues de confirmation", () => {
  assert.match(ADMIN_VIEWS, /export function ContactsView\(/);
  assert.match(ADMIN_VIEWS, /t\.searchByNameOrEmail/);
  assert.match(ADMIN_VIEWS, /t\.colPhone/);
  assert.match(ADMIN_VIEWS, /t\.colCountry/);
  assert.match(ADMIN_VIEWS, /t\.colLanguage/);
  assert.match(ADMIN_VIEWS, /t\.colConsent/);
  assert.match(ADMIN_VIEWS, /href="\/api\/administration\/contacts\/export"/);
  assert.match(ADMIN_VIEWS, /id="edit-contact-dialog"/);
  assert.match(ADMIN_VIEWS, /id="consent-dialog"/);
});

test("le bouton de consentement n'apparaît que lorsqu'une fiche contact existe déjà (row.country truthy)", () => {
  const start = ADMIN_VIEWS.indexOf("export function ContactsView");
  const end = ADMIN_VIEWS.indexOf("\nexport function", start + 1);
  const body = ADMIN_VIEWS.slice(start, end === -1 ? ADMIN_VIEWS.length : end);
  assert.match(body, /row\.country \? \(/);
});

test("la source de consentement passée depuis l'UI est toujours 'admin_manual_entry' (seule source réelle à ce stade)", () => {
  const start = ADMIN_VIEWS.indexOf("function handleConsentSubmit");
  assert.notEqual(start, -1);
  const body = ADMIN_VIEWS.slice(start, ADMIN_VIEWS.indexOf("\n  }", start));
  assert.match(body, /"admin_manual_entry"/);
});

// ---------------------------------------------------------------------------
// 13. copy.ts — parité FR/EN
// ---------------------------------------------------------------------------

test("copy.ts fournit les mêmes clés REVENUE-01I en français et en anglais (aucun écran à moitié traduit)", () => {
  const NEW_KEYS = [
    "navContacts", "contactsTitle", "contactsLead", "searchByNameOrEmail",
    "colPhone", "colCountry", "colLanguage", "colConsent",
    "consentYes", "consentNo", "consentUnsubscribed", "noContactRecorded",
    "actionEditContact", "actionGrantConsent", "actionUnsubscribe", "exportCsv",
    "formPhoneOptional", "formCountry", "formLanguage",
    "editContactConfirmText", "grantConsentConfirmText", "unsubscribeConfirmText",
  ];
  const frSection = ADMIN_COPY.slice(0, ADMIN_COPY.indexOf("const en: AdminCopy = {"));
  const enSection = ADMIN_COPY.slice(ADMIN_COPY.indexOf("const en: AdminCopy = {"));
  for (const key of NEW_KEYS) {
    assert.ok(frSection.includes(`${key}:`), `clé FR manquante : ${key}`);
    assert.ok(enSection.includes(`${key}:`), `clé EN manquante : ${key}`);
  }
});

test("outcomeLabels REVENUE-01I sont fournis en FR et en EN pour chaque issue des RPC de contacts", () => {
  const OUTCOME_KEYS = [
    "invalid_phone", "country_required", "invalid_language", "saved",
    "contact_not_found", "invalid_consent", "invalid_source", "consent_updated",
  ];
  const frSection = ADMIN_COPY.slice(0, ADMIN_COPY.indexOf("const en: AdminCopy = {"));
  const enSection = ADMIN_COPY.slice(ADMIN_COPY.indexOf("const en: AdminCopy = {"));
  for (const key of OUTCOME_KEYS) {
    assert.ok(frSection.includes(`${key}:`), `outcomeLabel FR manquant : ${key}`);
    assert.ok(enSection.includes(`${key}:`), `outcomeLabel EN manquant : ${key}`);
  }
});

// ---------------------------------------------------------------------------
// 14. pgTAP — réellement exécuté (PostgreSQL 16 local + pgtap réel)
// ---------------------------------------------------------------------------

test("le fichier pgTAP 01I déclare exactement autant d'assertions que son plan()", () => {
  const clean = sansCommentaires(PGTAP);
  const planMatch = clean.match(/select plan\((\d+)\);/);
  assert.ok(planMatch, "select plan(N) introuvable");
  const declared = Number(planMatch![1]);
  const assertions = (clean.match(/^select (is|ok|throws_ok)\(/gm) ?? []).length;
  assert.equal(assertions, declared);
});

test("le fichier pgTAP 01I s'exécute dans une transaction annulée (rollback)", () => {
  assert.match(PGTAP, /^begin;/);
  assert.match(PGTAP, /rollback;\s*$/);
});

test("le fichier pgTAP 01I couvre l'exclusivité consentement/désabonnement et la dérivation du courriel propriétaire", () => {
  // organization_commercial_contacts n'accorde aucun privilège à `authenticated`
  // (accès exclusif via RPC, par design) : les vérifications post-désabonnement
  // passent par admin_list_commercial_contacts_for_export(), en deux assertions
  // scalaires distinctes (pgTAP ne compare pas un type composite anonyme).
  assert.match(
    PGTAP,
    /select marketing_consent from public\.admin_list_commercial_contacts_for_export\(\) where organization_name = 'REVENUE-01I Org A'\),\s*\n\s*false,/,
  );
  assert.match(
    PGTAP,
    /select unsubscribed_at is not null from public\.admin_list_commercial_contacts_for_export\(\) where organization_name = 'REVENUE-01I Org A'\),\s*\n\s*true,/,
  );
  assert.match(PGTAP, /admin_list_commercial_contacts_for_export\(\)/);
  assert.match(PGTAP, /throws_ok\(/);
});

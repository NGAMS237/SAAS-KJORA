import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  applyReadOverrides,
  badgeLabel,
  isSafeInternalPath,
  isTrustedOpenNavigation,
  mapNotificationRpcError,
  notificationOpenMode,
  notificationActionMessage,
  notificationDisplay,
  notificationFallbackHref,
  notificationNoticeMessage,
  parseNotificationNotice,
  resolveNotificationDestination,
  unreadCount,
  type NotificationOpenResult,
} from "../src/modules/notifications/model.ts";
import {
  classifyResendStatus,
  createResendTransport,
  deliveryIdempotencyKey,
  deliveryReferenceTag,
} from "../src/core/email/resend-transport.ts";
import { parseDeliveryReference } from "../src/core/email/resend-webhook.ts";
import {
  HANDLED_RESEND_EVENTS,
  RESEND_EVENT_CLASSES,
  isHandledResendEvent,
  signWebhookPayload,
  summarizeResendEvent,
  verifyResendWebhook,
} from "../src/core/email/resend-webhook.ts";
import { drainEmailQueues, safeErrorCode, type ClaimedDelivery, type QueueAdapter, type RenderOutcome } from "../src/modules/communications/worker.ts";
import {
  expectedCronAuthorization,
  isProductionDeployment,
  isSaasAutoInvoicingEnabled,
  resolveTransactionalEmailStatus,
  senderAddress,
} from "../src/modules/communications/config.ts";
import {
  COMMUNICATION_TOGGLES,
  anyToggleEnabled,
  communicationSettingsMessage,
  parseCommunicationSettings,
  parseToggleInput,
  testDeliveryIdempotencyKey,
  RESEND_SIMULATED_DELIVERED,
} from "../src/modules/communications/settings-model.ts";
import { rentDeliveryEmail, saasBillingEmail, SAAS_TEMPLATE_KEYS } from "../src/modules/communications/emails.ts";
import { MANUAL_BILLING_MESSAGES, MANUAL_INVOICE_ISSUE_OUTCOMES } from "../src/core/billing/manual-billing-outcomes.ts";
import type { FinancialDocumentRecord } from "../src/modules/documents/model.ts";

// =============================================================================
// NOTIFICATIONS-COMMUNICATIONS-E2E-01 — Tests Node comportementaux
// =============================================================================
// Complète le pgTAP RÉELLEMENT exécuté (rls_notifications_communications_e2e_01,
// 128 assertions). Modules purs testés par exécution (résolveur, libellés,
// transport, webhook, worker, configuration) ; câblage serveur/TSX et SQL
// vérifiés en texte source (fichiers server-only non importables par Node).
// Aucun réseau : le transport reçoit un faux fetch.
// =============================================================================

const ORG = "a1000000-0000-4000-8000-000000000001";
const OTHER_ORG = "a1000000-0000-4000-8000-000000000002";
const DOC = "b1000000-0000-4000-8000-000000000001";
const TENANT = "c1000000-0000-4000-8000-000000000001";
const LEASE = "d1000000-0000-4000-8000-000000000001";

// Normalisation CRLF -> LF : ce fichier recherche un motif multi-lignes exact
// ("then\n    -- Nouvelle génération PROPRE") par indexOf. Sur un checkout
// Windows avec core.autocrlf=true, le fichier source sur disque contient
// "\r\n" : ce motif (qui ne contient qu'un "\n" nu) n'est alors plus trouvé
// comme sous-chaîne contiguë, et le test dérivé échoue — alors que la
// migration SQL elle-même est correcte des deux côtés. No-op sur ce bac à
// sable (déjà en LF).
const MIGRATION = readFileSync("supabase/migrations/20260928090000_notifications_communications_e2e_01.sql", "utf8").replace(/\r\n/g, "\n");
// Même normalisation que MIGRATION ci-dessus, appliquée à l'assistant `read`
// partagé : le test "v4 : resend repart d'une génération propre" (et 5
// autres) relit ce même fichier de migration via `read(...)` dans une
// variable locale `migration` distincte de la constante `MIGRATION`
// ci-dessus — normaliser seulement `MIGRATION` ne suffisait donc pas, cette
// seconde copie non normalisée restait sujette au même problème CRLF que
// celui déjà documenté plus haut.
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function opened(overrides: Partial<NotificationOpenResult>): NotificationOpenResult {
  return {
    found: true, organization_id: ORG, notification_type: "due_notice_ready",
    document_id: DOC, tenant_id: TENANT, lease_id: LEASE, can_view_payments: true, can_view_contracts: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Destinations fermées (Phase B)
// ---------------------------------------------------------------------------

test("chaque type ouvre sa destination fermée", () => {
  const cases: Array<[string, Partial<NotificationOpenResult>, string]> = [
    ["due_notice_ready", {}, `/api/financial-documents/${DOC}/download`],
    ["payment_receipt_ready", {}, `/api/financial-documents/${DOC}/download`],
    ["rent_receipt_ready", {}, `/api/financial-documents/${DOC}/download`],
    ["payment_overdue", {}, `/app/paiements?lease=${LEASE}`],
    ["payment_overdue", { lease_id: null }, `/app/paiements?tenant=${TENANT}`],
    ["low_credit", {}, `/app/locataires/${TENANT}/etat-de-compte`],
    ["last_prepaid_period", {}, `/app/paiements?lease=${LEASE}`],
    ["last_prepaid_period", { can_view_payments: false }, `/app/locations/${LEASE}`],
    ["delivery_failed", {}, `/app/locataires/${TENANT}#documents`],
    ["contract_ready", {}, `/app/locations/${LEASE}/contrat`],
    ["contract_completed", { can_view_contracts: false }, `/app/locations/${LEASE}`],
  ];
  for (const [type, overrides, expected] of cases) {
    const destination = resolveNotificationDestination(opened({ notification_type: type, ...overrides }), ORG);
    assert.equal(destination.href, expected, `${type} ${JSON.stringify(overrides)}`);
    assert.equal(destination.fallback, false);
  }
});

test("document retiré : repli sur le contexte encore autorisé, jamais sur le document", () => {
  const destination = resolveNotificationDestination(opened({ document_id: null }), ORG);
  assert.equal(destination.href, `/app/locataires/${TENANT}#documents`);
  const none = resolveNotificationDestination(opened({ document_id: null, tenant_id: null, lease_id: null }), ORG);
  assert.equal(none.href, notificationFallbackHref("resource_unavailable"));
  assert.equal(none.fallback, true);
});

test("sans payment.view, un retard ne mène jamais aux paiements", () => {
  const destination = resolveNotificationDestination(opened({ notification_type: "payment_overdue", can_view_payments: false }), ORG);
  assert.equal(destination.href, `/app/locataires/${TENANT}/etat-de-compte`);
  assert.doesNotMatch(destination.href, /paiements/);
});

test("autre Organization, notification introuvable ou type inconnu : repli non bloquant", () => {
  assert.equal(resolveNotificationDestination(opened({ organization_id: OTHER_ORG }), ORG).href, notificationFallbackHref("other_organization"));
  assert.equal(resolveNotificationDestination({ found: false }, ORG).href, notificationFallbackHref("notification_unavailable"));
  assert.equal(resolveNotificationDestination(null, ORG).href, notificationFallbackHref("notification_unavailable"));
  assert.equal(resolveNotificationDestination(opened({ notification_type: "drop_table" }), ORG).fallback, true);
  // Jamais l'écran générique « Ressource introuvable » : toujours le centre de notifications.
  for (const href of [notificationFallbackHref("resource_unavailable"), notificationFallbackHref("other_organization")]) {
    assert.match(href, /^\/app\/activite\?notice=[a-z_]+#notifications$/);
  }
});

test("identifiants hostiles : jamais interpolés dans une URL", () => {
  const hostile = [
    "../../api/admin", "javascript:alert(1)", "//evil.example", `${DOC}/../../x`, "https://evil.example", "' or 1=1 --",
  ];
  for (const value of hostile) {
    const destination = resolveNotificationDestination(opened({ document_id: value, tenant_id: value, lease_id: value }), ORG);
    assert.equal(destination.href, notificationFallbackHref("resource_unavailable"), value);
  }
  const foreignOrg = resolveNotificationDestination(opened({ organization_id: "not-a-uuid" }), ORG);
  assert.equal(foreignOrg.fallback, true);
});

test("chemins internes stricts et navigation de confiance", () => {
  assert.equal(isSafeInternalPath(`/app/paiements?lease=${LEASE}`), true);
  assert.equal(isSafeInternalPath("//evil.example/app"), false);
  assert.equal(isSafeInternalPath("https://evil.example"), false);
  assert.equal(isSafeInternalPath("/app/../api/x"), false);
});

test("Sec-Fetch-Site : seules same-origin et none écrivent ; absent = fail-closed, cross-site = rejet", () => {
  assert.equal(isTrustedOpenNavigation("same-origin"), true);
  assert.equal(isTrustedOpenNavigation("none"), true);
  for (const value of [null, undefined, "", "cross-site", "same-site", "SAME-ORIGIN", "same-origin, none", "whatever"]) {
    assert.equal(isTrustedOpenNavigation(value as string | null | undefined), false, String(value));
  }
  assert.equal(notificationOpenMode("same-origin"), "open");
  assert.equal(notificationOpenMode("none"), "open");
  // En-tête absent : AUCUNE écriture (lecture seule gardée en base).
  assert.equal(notificationOpenMode(null), "peek");
  assert.equal(notificationOpenMode(undefined), "peek");
  assert.equal(notificationOpenMode(""), "peek");
  // Autre site : ni lecture ni écriture.
  assert.equal(notificationOpenMode("cross-site"), "reject");
  assert.equal(notificationOpenMode("same-site"), "reject");
  assert.equal(notificationOpenMode("bogus"), "reject");
});

test("route d'ouverture : écriture seulement en mode open, peek sans écriture, rejet sans requête", () => {
  const route = read("src/app/api/notifications/[notificationId]/open/route.ts");
  assert.match(route, /notificationOpenMode\(request\.headers\.get\("sec-fetch-site"\)\)/);
  assert.match(route, /mode === "open" \? "open_notification" : "peek_notification"/);
  const reject = route.indexOf('if (mode === "reject")');
  assert.ok(reject > 0 && reject < route.indexOf("getActiveAuthorization()"), "rejet avant toute lecture de session ou de base");
  const migration = read("supabase/migrations/20260928090000_notifications_communications_e2e_01.sql");
  const peek = migration.slice(migration.indexOf("create or replace function public.peek_notification"), migration.indexOf("-- Marquer lue devient strictement idempotent"));
  assert.match(peek, /language sql\s+stable/);
  assert.doesNotMatch(peek, /\bupdate\b/i);
  // Le marquage au clic ne dépend pas de l'en-tête : Server Action (POST).
  assert.match(read("src/modules/documents/views.tsx"), /void setNotificationReadAction\(id, true\)/);
});

test("messages de repli FR/EN, codes fermés", () => {
  assert.equal(parseNotificationNotice("resource_unavailable"), "resource_unavailable");
  assert.equal(parseNotificationNotice("<script>"), null);
  for (const notice of ["notification_unavailable", "resource_unavailable", "other_organization"] as const) {
    assert.ok(notificationNoticeMessage(notice, "FR").length > 10);
    assert.ok(notificationNoticeMessage(notice, "EN").length > 10);
    assert.notEqual(notificationNoticeMessage(notice, "FR"), notificationNoticeMessage(notice, "EN"));
  }
});

// ---------------------------------------------------------------------------
// 2. Libellés et état lu/non lu (Phase A)
// ---------------------------------------------------------------------------

test("libellés distinguant locataire, logement, référence et date, en FR et EN", () => {
  const input = {
    type: "due_notice_ready" as const,
    payload: { due_reference: "DUE-2026-0042", due_date: "2026-10-05" },
    tenantName: "Awa Locataire", propertyName: "Résidence Akwa", unitLabel: "Porte 3",
    createdAt: "2026-09-27T08:00:00Z",
  };
  const fr = notificationDisplay(input, "FR");
  assert.equal(fr.title, "Avis d’échéance prêt");
  assert.equal(fr.context, "Awa Locataire — Résidence Akwa · Porte 3");
  assert.equal(fr.detail, "DUE-2026-0042 · échéance du 05/10/2026");
  assert.equal(fr.date, "27/09/2026");
  const en = notificationDisplay(input, "EN");
  assert.equal(en.title, "Due notice ready");
  assert.equal(en.detail, "DUE-2026-0042 · due 05/10/2026");
  assert.match(fr.ariaLabel(false), /^Non lue, /);
  assert.match(en.ariaLabel(true), /^Read, /);
});

test("aucune adresse électronique affichée, même glissée dans le payload", () => {
  const display = notificationDisplay({
    type: "payment_overdue",
    payload: { due_reference: "tenant@example.com", tenant_email: "tenant@example.com", remaining_xaf: 1000 },
    tenantName: "x@y.cm", propertyName: null, unitLabel: null, createdAt: "2026-09-27",
  }, "FR");
  assert.doesNotMatch(`${display.title} ${display.context} ${display.detail} ${display.ariaLabel(false)}`, /@/);
});

test("mise à jour optimiste : badge immédiat, liste reçue jamais mutée", () => {
  const list = [
    { id: "1", readAt: null }, { id: "2", readAt: null }, { id: "3", readAt: "2026-09-01T00:00:00Z" },
  ];
  const updated = applyReadOverrides(list, new Map([["1", true], ["3", false]]), "2026-09-27T10:00:00Z");
  assert.equal(unreadCount(list), 2);
  assert.equal(unreadCount(updated), 2);
  assert.equal(updated[0].readAt, "2026-09-27T10:00:00Z");
  assert.equal(updated[2].readAt, null);
  assert.equal(list[0].readAt, null, "la liste d'origine est intacte");
  const allRead = applyReadOverrides(list, new Map(list.map((item) => [item.id, true])), "2026-09-27T10:00:00Z");
  assert.equal(unreadCount(allRead), 0);
  assert.equal(badgeLabel(0), null);
  assert.equal(badgeLabel(7), "7");
  assert.equal(badgeLabel(250), "99+");
});

test("erreurs lu/non lu : codes stables, jamais error.message", () => {
  assert.equal(mapNotificationRpcError({ code: "42501" }), "forbidden");
  assert.equal(mapNotificationRpcError({ code: "22P02" }), "invalid_notification");
  assert.equal(mapNotificationRpcError({ code: "XX000" }), "failed");
  const route = read("src/app/api/financial-documents/route.ts");
  assert.doesNotMatch(route, /error:\s*result\.error\.message/);
  const actions = read("src/modules/notifications/actions.ts");
  assert.doesNotMatch(actions, /result\.error\.message/);
  for (const code of ["unauthenticated", "forbidden", "invalid_notification", "organization_unavailable", "failed"] as const) {
    assert.ok(notificationActionMessage(code, "FR") && notificationActionMessage(code, "EN"));
  }
});

test("câblage : cloche et centre passent par la route d'ouverture, badge optimiste", () => {
  const views = read("src/modules/documents/views.tsx");
  assert.match(views, /\/api\/notifications\/\$\{notification\.id\}\/open/);
  assert.match(views, /useNotificationsWithLocalReadState/);
  assert.match(views, /markAllNotificationsReadAction/);
  assert.match(views, /aria-pressed=\{isRead\}/);
  assert.doesNotMatch(views, /notificationHref/);
  const route = read("src/app/api/notifications/[notificationId]/open/route.ts");
  assert.match(route, /notificationOpenMode/);
  assert.match(route, /isOrganizationActive/);
  assert.match(route, /"open_notification"/);
  assert.doesNotMatch(route, /\.payload\b/);
  const server = read("src/modules/documents/server.ts");
  assert.match(server, /rpc\("list_my_notifications"/);
});

// ---------------------------------------------------------------------------
// 3. Transport Resend (Phase E) — faux fetch, aucun réseau
// ---------------------------------------------------------------------------

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(responses: Array<{ status: number; body?: unknown } | "throw">) {
  const calls: Call[] = [];
  const impl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    const next = responses.shift() ?? { status: 200, body: { id: "re_default" } };
    if (next === "throw") throw new Error("socket hang up token=abc");
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body ?? {} };
  };
  return { calls, impl };
}

const MESSAGE = { from: "KJORA <noreply@kjora.test>", to: "awa@kjora.test", subject: "S", html: "<p>h</p>", text: "t" };

test("Idempotency-Key déterministe par ligne et génération, protection secondaire seulement", async () => {
  const { calls, impl } = fakeFetch([{ status: 429 }, { status: 200, body: { id: "re_1" } }]);
  const transport = createResendTransport({ apiKey: "re_test_key", fetchImpl: impl });
  const id = "e1000000-0000-4000-8000-000000000001";
  const key = deliveryIdempotencyKey("rent", id);
  assert.equal(key, deliveryIdempotencyKey("rent", id, 0));
  assert.notEqual(key, deliveryIdempotencyKey("saas", id));
  assert.equal(deliveryIdempotencyKey("rent", id, 1), `kjora-rent-${id}-r1`, "une ré-expédition Admin change de clé");
  assert.notEqual(deliveryIdempotencyKey("rent", id, 1), key);
  assert.deepEqual(deliveryReferenceTag("saas", id, 0), { name: "kjora_delivery", value: `saas_${id}_g0` });
  assert.deepEqual(deliveryReferenceTag("rent", id, 1), { name: "kjora_delivery", value: `rent_${id}_g1` });
  const first = await transport.send(MESSAGE, key);
  const second = await transport.send(MESSAGE, key);
  assert.deepEqual(first, { ok: false, kind: "retryable", code: "resend_429" });
  assert.deepEqual(second, { ok: true, providerMessageId: "re_1" });
  assert.equal(calls[0].headers["idempotency-key"], key);
  assert.equal(calls[1].headers["idempotency-key"], key);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.deepEqual(calls[0].body.to, ["awa@kjora.test"]);
  assert.doesNotMatch(JSON.stringify(calls[0].body), /re_test_key/);
});

test("classement explicite : refus certain, refus définitif, issue ambiguë", async () => {
  assert.deepEqual(classifyResendStatus(429), { kind: "retryable", code: "resend_429" });
  assert.deepEqual(classifyResendStatus(422), { kind: "terminal", code: "resend_422" });
  assert.deepEqual(classifyResendStatus(401), { kind: "terminal", code: "resend_401" });
  assert.deepEqual(classifyResendStatus(409), { kind: "ambiguous", code: "resend_409" });
  for (const status of [500, 502, 503, 504]) assert.equal(classifyResendStatus(status).kind, "ambiguous", String(status));
  const { impl } = fakeFetch(["throw", { status: 422, body: { message: "Invalid `to` field: awa@kjora.test" } }, { status: 200, body: {} }]);
  const transport = createResendTransport({ apiKey: "k", fetchImpl: impl });
  assert.deepEqual(await transport.send(MESSAGE, "kjora-rent-abcdefgh"), { ok: false, kind: "ambiguous", code: "network_error" });
  assert.deepEqual(await transport.send(MESSAGE, "kjora-rent-abcdefgh"), { ok: false, kind: "terminal", code: "resend_422" });
  assert.deepEqual(await transport.send(MESSAGE, "kjora-rent-abcdefgh"), { ok: false, kind: "ambiguous", code: "resend_missing_id" });
  assert.deepEqual(await transport.send(MESSAGE, "bad key with spaces"), { ok: false, kind: "terminal", code: "invalid_idempotency_key" });
});

test("timeout ambigu : la requête interrompue est classée « issue inconnue », jamais relançable", async () => {
  const hanging = async (_url: string, init: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => {
      const error = new Error("aborted"); error.name = "AbortError"; reject(error);
    });
  });
  const transport = createResendTransport({ apiKey: "k", fetchImpl: hanging as never, timeoutMs: 20 });
  assert.deepEqual(await transport.send(MESSAGE, "kjora-rent-abcdefgh"), { ok: false, kind: "ambiguous", code: "provider_timeout" });
});

// ---------------------------------------------------------------------------
// 4. Webhook Resend signé (Phase E)
// ---------------------------------------------------------------------------

const SECRET = `whsec_${Buffer.from("kjora-test-webhook-secret-32-bytes!!").toString("base64")}`;

test("signature Svix valide acceptée ; altérée, absente ou périmée refusée", () => {
  const body = JSON.stringify({ type: "email.delivered", created_at: "2026-09-27T10:00:00Z", data: { email_id: "re_1", to: ["awa@kjora.test"] } });
  const now = 1_790_000_000;
  const signature = signWebhookPayload(SECRET, "msg_1", String(now), body);
  const headers = { id: "msg_1", timestamp: String(now), signature: `v1,${signature}` };
  assert.deepEqual(verifyResendWebhook(SECRET, headers, body, now), { ok: true });
  assert.deepEqual(verifyResendWebhook(SECRET, { ...headers, signature: "v1,AAAA" }, body, now), { ok: false, reason: "invalid_signature" });
  assert.deepEqual(verifyResendWebhook(SECRET, headers, body.replace("delivered", "bounced"), now), { ok: false, reason: "invalid_signature" });
  assert.deepEqual(verifyResendWebhook(SECRET, headers, body, now + 301), { ok: false, reason: "stale_timestamp" });
  assert.deepEqual(verifyResendWebhook(SECRET, { ...headers, id: null }, body, now), { ok: false, reason: "missing_headers" });
  assert.deepEqual(verifyResendWebhook(undefined, headers, body, now), { ok: false, reason: "invalid_secret" });
  // Rotation : plusieurs signatures, une seule valide suffit.
  assert.deepEqual(verifyResendWebhook(SECRET, { ...headers, signature: `v1,AAAA v1,${signature}` }, body, now), { ok: true });
});

test("événement résumé : identifiant de message et date seulement, jamais l'adresse", () => {
  const summary = summarizeResendEvent({ type: "email.bounced", created_at: "2026-09-27T10:00:00Z", data: { email_id: "re_9", to: ["awa@kjora.test"], subject: "Secret" } });
  assert.deepEqual(summary, { type: "email.bounced", providerMessageId: "re_9", occurredAt: "2026-09-27T10:00:00.000Z", deliveryRef: null });
  assert.doesNotMatch(JSON.stringify(summary), /@|Secret/);
  assert.equal(summarizeResendEvent("nope"), null);
  const route = read("src/app/api/webhooks/resend/route.ts");
  assert.ok(route.indexOf("verifyResendWebhook") < route.indexOf("JSON.parse"), "signature vérifiée AVANT le parsing");
  assert.match(route, /request\.text\(\)/);
  assert.match(route, /p_delivery_queue: event\.deliveryRef\?\.queue \?\? null/);
  assert.match(route, /p_delivery_id: event\.deliveryRef\?\.deliveryId \?\? null/);
  assert.match(route, /p_delivery_generation: event\.deliveryRef\?\.resendGeneration \?\? null/);
});

test("étiquette kjora_delivery : file, ligne ET génération ; ancien format ou valeur hostile ignorés", () => {
  const id = "e1000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseDeliveryReference(`rent_${id}_g0`), { queue: "rent", deliveryId: id, resendGeneration: 0 });
  assert.deepEqual(parseDeliveryReference(`rent_${id}_g1`), { queue: "rent", deliveryId: id, resendGeneration: 1 });
  assert.deepEqual(parseDeliveryReference(`saas_${id}_g20`), { queue: "saas", deliveryId: id, resendGeneration: 20 });
  for (const value of [
    `rent_${id}`, // ancien format v2, sans génération
    `rent_${id}_g21`, `rent_${id}_g01`, `rent_${id}_g-1`, `rent_${id}_g`, `mail_${id}_g0`,
    `rent_${id}_g0_extra`, `rent_${id.toUpperCase()}_g0`, "rent__g0", 42, null,
  ]) {
    assert.equal(parseDeliveryReference(value), null, String(value));
  }
  // Aller-retour : l'étiquette posée à l'envoi est exactement celle relue.
  for (const generation of [0, 1, 7, 20]) {
    const tag = deliveryReferenceTag("rent", id, generation);
    assert.deepEqual(parseDeliveryReference(tag.value), { queue: "rent", deliveryId: id, resendGeneration: generation });
  }
  const migration = read("supabase/migrations/20260928090000_notifications_communications_e2e_01.sql");
  assert.match(migration, /row_generation <> p_delivery_generation then\s+return 'generation_mismatch'/);
  assert.match(migration, /where id = p_delivery_id for update/);
});

test("email.failed et email.delivery_delayed : classés explicitement, jamais « livré », jamais relancés", () => {
  assert.deepEqual([...HANDLED_RESEND_EVENTS].sort(), [
    "email.bounced", "email.complained", "email.delivered", "email.delivery_delayed", "email.failed", "email.sent", "email.suppressed",
  ]);
  assert.equal(RESEND_EVENT_CLASSES["email.failed"], "terminal_failure");
  assert.equal(RESEND_EVENT_CLASSES["email.delivery_delayed"], "information");
  assert.equal(RESEND_EVENT_CLASSES["email.delivered"], "terminal_success");
  assert.ok(!Object.values(RESEND_EVENT_CLASSES).some((value) => value === ("retryable" as string)), "aucun webhook ne relance");
  assert.equal(isHandledResendEvent("email.opened"), false);
  assert.equal(isHandledResendEvent("__proto__"), false);
  const failed = summarizeResendEvent({ type: "email.failed", created_at: "2026-09-27T10:00:00Z", data: { email_id: "re_f", tags: { kjora_delivery: "rent_e1000000-0000-4000-8000-000000000001_g0" } } });
  assert.deepEqual(failed?.deliveryRef, { queue: "rent", deliveryId: "e1000000-0000-4000-8000-000000000001", resendGeneration: 0 }, "étiquette sous forme d'objet");
  const delayed = summarizeResendEvent({ type: "email.delivery_delayed", data: { email_id: "re_d", tags: [{ name: "kjora_delivery", value: "saas_e1000000-0000-4000-8000-000000000002_g3" }] } });
  assert.deepEqual(delayed?.deliveryRef, { queue: "saas", deliveryId: "e1000000-0000-4000-8000-000000000002", resendGeneration: 3 }, "étiquette sous forme de liste");
  assert.equal(summarizeResendEvent({ type: "email.failed", data: { email_id: "x", tags: { kjora_delivery: "rent_../../x_g0" } } })?.deliveryRef, null);
  const migration = read("supabase/migrations/20260928090000_notifications_communications_e2e_01.sql");
  assert.match(migration, /when 'email\.failed' then 'provider_failed'/);
  assert.match(migration, /'email\.sent', 'email\.delivered', 'email\.delivery_delayed', 'email\.failed'/);
  assert.match(migration, /target_status in \('bounced', 'complained', 'suppressed'\)/, "email.failed n'alimente pas la suppression");
});

// ---------------------------------------------------------------------------
// 5. Worker (Phase E) — files simulées
// ---------------------------------------------------------------------------

type FakeRow = ClaimedDelivery & { outcome: RenderOutcome | "throw" };

function row(id: string, outcome: RenderOutcome | "throw", generation = 0): FakeRow {
  return { id, claimToken: `t-${id}`, attemptCount: 1, resendGeneration: generation, outcome };
}

function fakeQueue(rows: FakeRow[], options: { completeResult?: "ok" | "false" | "throw"; markSendingResult?: boolean } = {}) {
  const log: string[] = [];
  let claimed = false;
  const adapter: QueueAdapter<ClaimedDelivery> = {
    async claim() { if (claimed) return []; claimed = true; return rows; },
    async render(delivery) {
      const current = delivery as FakeRow;
      if (current.outcome === "throw") throw new Error("PDF failed: key=secret-value");
      return current.outcome;
    },
    async markSending(delivery) { log.push(`sending:${delivery.id}`); return options.markSendingResult ?? true; },
    async complete(delivery, id) {
      log.push(`complete:${delivery.id}:${id}`);
      if (options.completeResult === "throw") throw new Error("db connection lost");
      return options.completeResult !== "false";
    },
    async fail(delivery, code, retryable) { log.push(`fail:${delivery.id}:${code}:${retryable}`); return true; },
    async markUnknown(delivery, code) { log.push(`unknown:${delivery.id}:${code}`); return true; },
    async cancel(delivery, reason) { log.push(`cancel:${delivery.id}:${reason}`); return true; },
    async hold(delivery, reason) { log.push(`hold:${delivery.id}:${reason}`); return true; },
  };
  return { adapter, log };
}

const SEND: RenderOutcome = { kind: "send", message: { to: "awa@kjora.test", subject: "s", html: "h", text: "t" } };
const worker = (rent: QueueAdapter<ClaimedDelivery>, saas: QueueAdapter<ClaimedDelivery>, impl: ReturnType<typeof fakeFetch>["impl"]) =>
  drainEmailQueues({ from: "KJORA <noreply@kjora.test>", transport: createResendTransport({ apiKey: "k", fetchImpl: impl }), rent, saas });

test("worker : point de non-retour avant l'appel, puis succès, refus certain, refus définitif, ambiguïté", async () => {
  const rent = fakeQueue([row("r1", SEND), row("r2", SEND), row("r3", SEND), row("r4", SEND), row("r5", SEND)]);
  const { calls, impl } = fakeFetch([
    { status: 200, body: { id: "re_ok" } }, { status: 429 }, { status: 422 }, { status: 503 }, "throw",
  ]);
  const summary = await worker(rent.adapter, fakeQueue([]).adapter, impl);
  assert.deepEqual(rent.log, [
    "sending:r1", "complete:r1:re_ok",
    "sending:r2", "fail:r2:resend_429:true",
    "sending:r3", "fail:r3:resend_422:false",
    "sending:r4", "unknown:r4:resend_503",
    "sending:r5", "unknown:r5:network_error",
  ]);
  assert.equal(calls.length, 5, "un seul appel fournisseur par ligne et par passage");
  assert.deepEqual(calls[0].body.tags, [{ name: "kjora_delivery", value: "rent_r1_g0" }]);
  assert.equal(summary.rent.sent, 1);
  assert.equal(summary.rent.failed, 2);
  assert.equal(summary.rent.unknown, 2);
});

test("worker : timeout ambigu → revue, aucune seconde tentative dans le passage", async () => {
  const rent = fakeQueue([row("r1", SEND)]);
  const hanging = async (_url: string, init: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); });
  });
  let attempts = 0;
  const counting = (url: string, init: { signal?: AbortSignal }) => { attempts += 1; return hanging(url, init); };
  const summary = await drainEmailQueues({
    from: "a@kjora.test", transport: createResendTransport({ apiKey: "k", fetchImpl: counting as never, timeoutMs: 15 }),
    rent: rent.adapter, saas: fakeQueue([]).adapter,
  });
  assert.equal(attempts, 1);
  assert.deepEqual(rent.log, ["sending:r1", "unknown:r1:provider_timeout"]);
  assert.equal(summary.rent.unknown, 1);
  assert.equal(summary.rent.failed, 0);
});

test("worker : crash de la base APRÈS acceptation fournisseur → revue, jamais de renvoi", async () => {
  for (const completeResult of ["throw", "false"] as const) {
    const rent = fakeQueue([row("r1", SEND)], { completeResult });
    const { calls, impl } = fakeFetch([{ status: 200, body: { id: "re_accepted" } }]);
    const summary = await worker(rent.adapter, fakeQueue([]).adapter, impl);
    assert.equal(calls.length, 1, completeResult);
    assert.deepEqual(rent.log, ["sending:r1", "complete:r1:re_accepted", "unknown:r1:finalization_failed"]);
    assert.equal(summary.rent.sent, 0);
    assert.equal(summary.rent.unknown, 1);
  }
});

test("worker : point de non-retour refusé → aucun appel fournisseur", async () => {
  const rent = fakeQueue([row("r1", SEND)], { markSendingResult: false });
  const { calls, impl } = fakeFetch([]);
  const summary = await worker(rent.adapter, fakeQueue([]).adapter, impl);
  assert.equal(calls.length, 0);
  assert.equal(summary.rent.staleTokens, 1);
});

test("worker : rendu impossible, annulation, mise en attente — rien n'est envoyé ni marqué commencé", async () => {
  const rent = fakeQueue([row("r1", "throw"), row("r2", { kind: "cancel", reason: "document_invalidated" })]);
  const saas = fakeQueue([row("s1", { kind: "hold", reason: "legal_identity_missing" })]);
  const { calls, impl } = fakeFetch([]);
  const summary = await worker(rent.adapter, saas.adapter, impl);
  assert.equal(calls.length, 0);
  assert.match(rent.log[0], /^fail:r1:render:[a-z0-9_:.\-]+:true$/);
  assert.equal(rent.log[1], "cancel:r2:document_invalidated");
  assert.deepEqual(saas.log, ["hold:s1:legal_identity_missing"]);
  assert.ok(!rent.log.some((line) => line.startsWith("sending:")) && !saas.log.some((line) => line.startsWith("sending:")));
  assert.equal(summary.saas.held, 1);
});

test("reprise après plus de 24 h : une ré-expédition Admin porte une NOUVELLE clé ; sans décision, rien ne repart", async () => {
  const id = "e1000000-0000-4000-8000-000000000009";
  const rent = fakeQueue([row(id, SEND, 1)]);
  const { calls, impl } = fakeFetch([{ status: 200, body: { id: "re_again" } }]);
  await worker(rent.adapter, fakeQueue([]).adapter, impl);
  assert.equal(calls[0].headers["idempotency-key"], `kjora-rent-${id}-r1`);
  // Le worker ne choisit jamais les lignes : seules celles que la base rend
  // réservables partent (jamais 'delivery_unknown' — vérifié en pgTAP).
  const migration = read("supabase/migrations/20260928090000_notifications_communications_e2e_01.sql");
  const claim = migration.slice(migration.indexOf("create or replace function public.claim_message_deliveries"), migration.indexOf("create or replace function public.mark_message_delivery_sending"));
  assert.match(claim, /md\.status in \('pending', 'failed'\)/);
  assert.doesNotMatch(claim, /status = 'processing' and md\.claimed_at/);
});

test("worker : échéance et nombre de lots bornés (fonction quotidienne courte)", async () => {
  let claims = 0;
  const endless: QueueAdapter<ClaimedDelivery> = {
    async claim() { claims += 1; return [{ id: `r${claims}`, claimToken: "t", attemptCount: 1, resendGeneration: 0 }]; },
    async render() { return { kind: "cancel", reason: "x" }; },
    async markSending() { return true; }, async markUnknown() { return true; },
    async complete() { return true; }, async fail() { return true; }, async cancel() { return true; },
  };
  const empty = fakeQueue([]);
  const bounded = await drainEmailQueues({ from: "a@kjora.test", transport: createResendTransport({ apiKey: "k", fetchImpl: fakeFetch([]).impl }), rent: endless, saas: empty.adapter, maxBatchesPerQueue: 3 });
  assert.equal(claims, 3);
  assert.equal(bounded.stoppedBy, "max_batches");
  let now = 0;
  const timed = await drainEmailQueues({ from: "a@kjora.test", transport: createResendTransport({ apiKey: "k", fetchImpl: fakeFetch([]).impl }), rent: endless, saas: fakeQueue([]).adapter, deadline: 10, now: () => (now += 6) });
  assert.equal(timed.stoppedBy, "deadline");
  await assert.rejects(drainEmailQueues({ from: " ", transport: createResendTransport({ apiKey: "k", fetchImpl: fakeFetch([]).impl }), rent: endless, saas: empty.adapter }), /email_sender_missing/);
  assert.equal(safeErrorCode(new Error("Bearer abc.def")), "bearer_abc.def");
  assert.equal(safeErrorCode(42), "render_failed");
});

test("aucune affirmation « exactly-once » ni « jamais deux fois » non démontrée", () => {
  const sources = [
    "src/modules/communications/worker.ts", "src/core/email/resend-transport.ts",
    "supabase/migrations/20260928090000_notifications_communications_e2e_01.sql",
    "docs/architecture/NOTIFICATIONS-COMMUNICATIONS-E2E-01.md", "src/modules/platform-admin/operations-view.tsx",
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /ne double jamais|jamais deux fois|ne peut (?:pas|jamais) envoyer deux fois|aucune double livraison|no double delivery/i);
  for (const match of sources.matchAll(/exactly-once/gi)) {
    const around = sources.slice(Math.max(0, match.index! - 40), match.index! + 20);
    assert.match(around, /pas|not|n'est|jamais/i, `« exactly-once » doit être nié : ${around}`);
  }
});

// ---------------------------------------------------------------------------
// 6. Configuration, réglages et cron (Phases D/E)
// ---------------------------------------------------------------------------

test("configuration : booléens et NOMS de variables, jamais de valeur secrète", () => {
  const status = resolveTransactionalEmailStatus({ RESEND_TRANSACTIONAL_API_KEY: "re_live_secret", KJORA_TRANSACTIONAL_EMAIL_FROM: "KJORA <Notifications@KJORA.cm>", KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED: "true" });
  assert.deepEqual(status, { deliveryEnabled: true, operational: true, senderAddress: "notifications@kjora.cm", missing: [] });
  const off = resolveTransactionalEmailStatus({ KJORA_TRANSACTIONAL_EMAIL_FROM: "pas une adresse" });
  assert.equal(off.operational, false);
  assert.deepEqual(off.missing, ["RESEND_TRANSACTIONAL_API_KEY", "KJORA_TRANSACTIONAL_EMAIL_FROM", "KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED"]);
  assert.doesNotMatch(JSON.stringify(status), /re_live_secret/);
  assert.equal(senderAddress("noreply@kjora.cm"), "noreply@kjora.cm");
  assert.equal(senderAddress("<script>"), null);
  assert.equal(isProductionDeployment({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionDeployment({ VERCEL_ENV: "preview" }), false);
  assert.equal(isSaasAutoInvoicingEnabled({}), false);
  assert.equal(expectedCronAuthorization({ CRON_SECRET: "short" }), null);
  assert.equal(expectedCronAuthorization({ CRON_SECRET: "a-long-enough-cron-secret" }), "Bearer a-long-enough-cron-secret");
});

test("réglages : cinq booléens exacts, tout désactivé par défaut, test vers l'adresse de simulation", () => {
  const values = parseToggleInput(Object.fromEntries(COMMUNICATION_TOGGLES.map((key) => [key, false])));
  assert.ok(values);
  assert.equal(anyToggleEnabled(values), false);
  assert.equal(parseToggleInput({ dueNoticeEmailEnabled: "true" }), null);
  assert.equal(parseToggleInput({ ...values, extra: true })?.dueNoticeEmailEnabled, false);
  const parsed = parseCommunicationSettings({ configured: false, ownerEmailDeliverable: true, tenantsWithoutEmail: "3" });
  assert.equal(parsed?.dueNoticeEmailEnabled, false);
  assert.equal(parsed?.tenantsWithoutEmail, 3);
  assert.equal(RESEND_SIMULATED_DELIVERED, "delivered@resend.dev");
  assert.equal(testDeliveryIdempotencyKey(ORG, 600_000), testDeliveryIdempotencyKey(ORG, 1_199_999));
  assert.notEqual(testDeliveryIdempotencyKey(ORG, 600_000), testDeliveryIdempotencyKey(ORG, 1_200_000));
  for (const code of ["forbidden", "email_not_configured", "production_disabled"] as const) {
    assert.notEqual(communicationSettingsMessage(code, "FR"), communicationSettingsMessage(code, "EN"));
  }
  const actions = read("src/modules/communications/settings-actions.ts");
  assert.match(actions, /isProductionDeployment\(process\.env\)\) return \{ ok: false, error: "production_disabled" \}/);
  assert.match(actions, /RESEND_SIMULATED_DELIVERED/);
  assert.match(actions, /authorization\.role !== "organization_owner"/);
  const page = read("src/app/(internal)/app/parametres/communications/page.tsx");
  assert.match(page, /organization_owner/);
  const view = read("src/modules/communications/settings-view.tsx");
  assert.match(view, /disabled=\{!emailOperational/);
});

test("cron unique : Bearer CRON_SECRET en temps constant, un seul chemin planifié par jour", () => {
  const handler = read("src/modules/communications/cron-handler.ts");
  assert.match(handler, /timingSafeEqual/);
  assert.ok(handler.indexOf("authorized(request)") < handler.indexOf("runDailyCommunications("), "autorisation avant tout travail");
  const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
  assert.equal(vercel.crons.length, 1);
  assert.equal(vercel.crons[0].path, "/api/cron/daily-communications");
  assert.match(vercel.crons[0].schedule, /^\d+ \d+ \* \* \*$/, "quotidien (compatible Hobby)");
  const legacy = read("src/app/api/financial-communications/cron/route.ts");
  assert.match(legacy, /handleDailyCommunicationsCron/);
  assert.doesNotMatch(legacy, /api\.resend\.com/);
});

test("aucune clé service_role côté navigateur", () => {
  const clientFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(tsx?|jsx?)$/.test(entry.name) && /^["']use client["']/.test(read(path).trimStart())) clientFiles.push(path);
    }
  };
  walk("src");
  assert.ok(clientFiles.length > 10);
  for (const file of clientFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|communications\/server|RESEND_TRANSACTIONAL_API_KEY/, file);
  }
  assert.match(read("src/modules/communications/server.ts"), /^import "server-only";/);
  assert.match(read("src/modules/communications/cron-handler.ts"), /^import "server-only";/);
});

// ---------------------------------------------------------------------------
// 7. Gabarits (Phases F/G)
// ---------------------------------------------------------------------------

function document(overrides: Partial<FinancialDocumentRecord> = {}): FinancialDocumentRecord {
  return {
    id: DOC, organizationId: ORG, tenantId: TENANT, leaseId: LEASE, dueId: null, paymentId: null,
    type: "due_notice", reference: "AVI-DUE-1", status: "ready", language: "fr", issuedOn: "2026-09-27",
    periodStart: "2026-10-01", periodEnd: "2026-10-31", templateVersion: "v1", storagePath: null, createdBy: null,
    createdAt: "2026-09-27", invalidatedAt: null, invalidationReason: null, tenantEmail: null, lastDelivery: null,
    snapshot: { tenant_name: "Awa", organization_name: "Agence Akwa", due_date: "2026-10-05", period_start: "2026-10-01", period_end: "2026-10-31", expected_xaf: 40000, remaining_xaf: 40000 },
    ...overrides,
  };
}

test("loyers : rappel de retard et copie propriétaire explicites, sans lien", () => {
  const reminder = rentDeliveryEmail(document(), { templateKey: "overdue_reminder", ownerCopy: false });
  assert.match(reminder.subject, /^Rappel — /);
  assert.match(reminder.text, /n’est pas encore réglée/);
  const copy = rentDeliveryEmail(document({ language: "en" }), { templateKey: "due_notice", ownerCopy: true });
  assert.match(copy.subject, /^Owner copy — /);
  assert.doesNotMatch(`${reminder.html}${copy.html}`, /href=|https?:\/\//, "pièce jointe, jamais de lien");
});

test("SaaS : quatre gabarits FR/EN, montant XAF, transactionnels, sans lien", () => {
  const invoice = { number: "KJORA-2026-000123", organizationName: "Agence Akwa", planLabel: "Essentiel", cycleLabel: "Mensuel", amountMinor: 5900, periodStart: "2026-10-01", periodEnd: "2026-11-01", dueOn: "2026-10-08", paidAt: "2026-10-03T10:00:00Z" };
  for (const template of SAAS_TEMPLATE_KEYS) {
    for (const language of ["fr", "en"] as const) {
      const email = saasBillingEmail(template, invoice, language);
      assert.match(email.subject, /KJORA-2026-000123/);
      assert.match(email.text, /5[\s  ,.]?900 XAF/);
      assert.doesNotMatch(email.html, /href=|https?:\/\/|désinscri|unsubscribe/i);
    }
  }
  assert.match(saasBillingEmail("saas_receipt", invoice, "fr").subject, /^Reçu/);
  assert.match(saasBillingEmail("saas_invoice_overdue", invoice, "en").subject, /overdue/);
});

test("résultat manuel « période déjà facturée » traduit FR/EN", () => {
  assert.ok((MANUAL_INVOICE_ISSUE_OUTCOMES as readonly string[]).includes("period_already_invoiced"));
  const message = MANUAL_BILLING_MESSAGES.period_already_invoiced;
  assert.ok(message.fr.length > 20 && message.en.length > 20);
});

// ---------------------------------------------------------------------------
// 8. Migration — invariants vérifiés en texte (le comportement l'est en pgTAP)
// ---------------------------------------------------------------------------

test("migration additive : aucune suppression de données, aucun appel réseau, aucun auth.* écrit", () => {
  assert.doesNotMatch(MIGRATION, /\bdelete\s+from\b/i);
  assert.doesNotMatch(MIGRATION, /\btruncate\b/i);
  assert.doesNotMatch(MIGRATION, /\b(insert\s+into|update|delete\s+from)\s+auth\./i);
  assert.doesNotMatch(MIGRATION, /\bhttp_(get|post)\b|\bnet\.http|pg_net/i);
  assert.doesNotMatch(MIGRATION, /stripe|flutterwave|saspay|mobile\s*money/i);
});

test("avis d'échéance : rattrapage borné, courriel seulement à l'heure", () => {
  assert.match(MIGRATION, /d\.notice_date <= run_on\s+and \(d\.notice_date >= run_on - 7 or d\.created_at >= run_on::timestamptz - interval '1 day'\)/);
  assert.match(MIGRATION, /create_due_notice_document\(item\.id, run_on, item\.notice_date = run_on\)/);
  assert.match(MIGRATION, /create_due_notice_document\(item\.id, run_on, false\)/);
  assert.match(MIGRATION, /'emails_queued', 0/);
});

test("file : réservation atomique, service_role seul, factures SaaS uniques par période", () => {
  assert.equal((MIGRATION.match(/for update of (md|bd) skip locked/g) ?? []).length, 2);
  for (const fn of ["claim_message_deliveries", "complete_message_delivery", "fail_message_delivery", "claim_billing_email_deliveries", "record_email_provider_event", "run_communications_daily_system"]) {
    assert.match(MIGRATION, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role;`), fn);
    assert.doesNotMatch(MIGRATION, new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated;`), fn);
  }
  assert.match(MIGRATION, /create unique index if not exists billing_invoices_org_period_unique/);
  assert.match(MIGRATION, /s\.plan in \('essentiel', 'avance', 'patrimoine'\)/);
  assert.match(MIGRATION, /s\.currency = 'XAF'\s+and s\.provider is null/);
  assert.match(MIGRATION, /'auto:' \|\| item\.renewal_date::text \|\| ':' \|\| item\.billing_cycle/);
});

test("supervision Admin : compteurs et acteur masqué, jamais une adresse complète", () => {
  const overview = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.admin_communications_overview"), MIGRATION.indexOf("create or replace function public.admin_list_operation_runs"));
  assert.doesNotMatch(overview, /recipient_email|\.email\b/);
  assert.match(MIGRATION, /private\.mask_email\(u\.email::text\)/);
  assert.ok(existsSync("src/app/administration/operations/page.tsx"));
  const actions = read("src/modules/platform-admin/operations-actions.ts");
  assert.match(actions, /export async function runCommunicationsAction\(dryRun = true\)/);
  assert.match(actions, /export async function reconcileDueNoticesAction\(dryRun = true/);
  assert.match(actions, /is_platform_admin_self/);
});

test("worker : l'étiquette porte la génération de la ligne réservée", async () => {
  const rent = fakeQueue([row("r9", SEND, 2)]);
  const { calls, impl } = fakeFetch([{ status: 200, body: { id: "re_g2" } }]);
  await worker(rent.adapter, fakeQueue([]).adapter, impl);
  assert.deepEqual(calls[0].body.tags, [{ name: "kjora_delivery", value: "rent_r9_g2" }]);
  assert.equal(calls[0].headers["idempotency-key"], "kjora-rent-r9-r2");
});

test("v4 : un seul mécanisme de verrou pour toute affectation d'identifiant fournisseur", () => {
  const migration = read("supabase/migrations/20260928090000_notifications_communications_e2e_01.sql");
  const common = migration.slice(
    migration.indexOf("create or replace function private.reserve_provider_message_id"),
    migration.indexOf("-- 1. Notifications"),
  );
  assert.match(common, /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(/);
  assert.match(common, /not \(p_queue = 'rent' and md\.id = p_delivery_id\)/);
  assert.match(common, /not \(p_queue = 'saas' and bd\.id = p_delivery_id\)/);
  const body = (name: string, next: string) => migration.slice(migration.indexOf(name), migration.indexOf(next, migration.indexOf(name) + name.length));
  const paths = [
    body("create or replace function public.complete_message_delivery(", "create or replace function"),
    body("create or replace function public.complete_billing_email_delivery(", "create or replace function"),
    body("create or replace function public.admin_resolve_delivery_review(", "create or replace function"),
    body("create or replace function private.apply_provider_event_to_queue(", "create or replace function"),
  ];
  for (const path of paths) {
    assert.match(path, /private\.reserve_provider_message_id\(/);
    assert.doesNotMatch(path, /exists \(select 1 from public\.(message_deliveries|billing_email_deliveries)\s+where provider_message_id/);
  }
  // complete_* : refus AVANT toute écriture, résultat false.
  for (const path of paths.slice(0, 2)) {
    assert.ok(path.indexOf("reserve_provider_message_id(") < path.indexOf("provider_message_id = p_provider_message_id"));
    assert.match(path, /reserve_provider_message_id\([^)]*\) then\s+return false;/);
  }
});

test("v4 : resend repart d'une génération propre (aucune métadonnée de revue ou d'expédition)", () => {
  const migration = read("supabase/migrations/20260928090000_notifications_communications_e2e_01.sql");
  const resolve = migration.slice(migration.indexOf("create or replace function public.admin_resolve_delivery_review("),
    migration.indexOf("create or replace function public.admin_list_provider_events"));
  const resend = resolve.slice(resolve.indexOf("if p_decision = 'resend' then\n    -- Nouvelle génération PROPRE"), resolve.indexOf("elsif p_queue = 'rent' then"));
  for (const column of [
    "reviewed_by = null", "reviewed_at = null", "review_reason = null", "last_error_code = null",
    "provider = null", "provider_message_id = null", "sent_at = null", "delivered_at = null",
    "provider_event_at = null", "provider_delayed_at = null", "next_attempt_at = now()", "attempt_count = 0",
    "resend_generation = resend_generation + 1",
  ]) {
    assert.equal(resend.split(column).length - 1, 2, `${column} dans les deux files`);
  }
  assert.equal(resend.split("last_error_message = null").length - 1, 1, "last_error_message n'existe que côté loyers");
});

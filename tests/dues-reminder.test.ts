import assert from "node:assert/strict";
import test from "node:test";

import { buildReminder, defaultReminderTemplate, isPaymentRecordedPath, paymentDrawerHref, reminderGreetingName } from "../src/modules/finance/reminder.ts";

const base = { templateKey: "retard" as const, tenantName: "Charles Ekoto Abada", civility: null, unitLabel: "Chambre 1 E1", totalDueXaf: 249000, rowRemainingXaf: 30000, rowTotalXaf: 30000, dueDate: "2026-11-05" };

test("la relance cite le total dû, pas seulement le reste de la ligne", () => {
  const { body, amountXaf } = buildReminder(base);
  assert.equal(amountXaf, 249000);
  assert.match(body, /249[\s  ]000 XAF/);
  assert.doesNotMatch(body, /\[[a-z_]+\]/);
});

test("la civilité précède le nom quand elle est connue", () => {
  assert.equal(reminderGreetingName("Charles Ekoto Abada", "M."), "M. Charles Ekoto Abada");
  assert.equal(reminderGreetingName("Marie Tchoua", "Mme"), "Mme Marie Tchoua");
  assert.equal(reminderGreetingName("charles ekoto", null), "Charles");
  assert.match(buildReminder({ ...base, civility: "M." }).body, /^Bonjour M\. Charles Ekoto Abada,/);
});

test("le montant ne descend jamais sous le reste de la ligne", () => {
  assert.equal(buildReminder({ ...base, totalDueXaf: 0 }).amountXaf, 30000);
});

test("rappel avant échéance : jour du mois et loyer", () => {
  const { body } = buildReminder({ ...base, templateKey: "rappel_avant" });
  assert.match(body, /le 5 de ce mois/);
  assert.match(body, /30[\s  ]000 XAF/);
});

test("modèle par défaut selon l'état", () => {
  assert.equal(defaultReminderTemplate("overdue"), "retard");
  assert.equal(defaultReminderTemplate("partially_paid"), "retard");
  assert.equal(defaultReminderTemplate("due"), "rappel_avant");
});

test("adresse de paiement et détection du paiement enregistré", () => {
  assert.equal(paymentDrawerHref("abc", 30000.4), "/app/paiements/nouveau?lease=abc&amount=30000");
  assert.equal(paymentDrawerHref("abc", -5), "/app/paiements/nouveau?lease=abc&amount=0");
  assert.equal(isPaymentRecordedPath("/app/paiements/0c221bac-1d10-4da3-bdd3-7c3b04aa1111/"), true);
  assert.equal(isPaymentRecordedPath("/app/paiements/nouveau"), false);
  assert.equal(isPaymentRecordedPath("/app/paiements/"), false);
});

test("le mode tiroir repose sur un attribut data-embedded (une classe sur <html> est effacée par React)", async () => {
  const { readFileSync } = await import("node:fs");
  const marker = readFileSync(new URL("../src/core/shell/embedded-marker.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  assert.match(marker, /setAttribute\('data-embedded','1'\)/);
  assert.doesNotMatch(marker, /classList/);
  assert.match(css, /html\[data-embedded\] \.mobile-bottom-nav/);
  assert.doesNotMatch(css, /html\.is-embedded/);
});

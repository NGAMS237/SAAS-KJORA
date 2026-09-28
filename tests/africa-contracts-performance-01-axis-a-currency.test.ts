// =============================================================================
// AFRICA-CONTRACTS-PERFORMANCE-01 — AXE A (métadonnées monétaires)
// =============================================================================
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RENTAL_CURRENCIES,
  SUPPORTED_COUNTRIES,
  decimalsForRentalCurrency,
  defaultsForCountry,
  formatRentalAmount,
  isRentalCurrency,
  isSupportedCountry,
  roundToCurrencyPrecision,
  sumSameCurrency,
} from "../src/core/currency/metadata.ts";

test("AXE A — les 6 devises de location attendues sont exactement celles du catalogue", () => {
  assert.deepEqual([...RENTAL_CURRENCIES].sort(), ["CDF", "KES", "NGN", "XAF", "XOF", "ZAR"]);
  for (const currency of RENTAL_CURRENCIES) assert.equal(isRentalCurrency(currency), true);
  assert.equal(isRentalCurrency("EUR"), false);
  assert.equal(isRentalCurrency("USD"), false);
});

test("AXE A — décimales : 0 pour XAF/XOF, 2 pour NGN/CDF/KES/ZAR", () => {
  assert.equal(decimalsForRentalCurrency("XAF"), 0);
  assert.equal(decimalsForRentalCurrency("XOF"), 0);
  assert.equal(decimalsForRentalCurrency("NGN"), 2);
  assert.equal(decimalsForRentalCurrency("CDF"), 2);
  assert.equal(decimalsForRentalCurrency("KES"), 2);
  assert.equal(decimalsForRentalCurrency("ZAR"), 2);
});

test("AXE A — arrondi cohérent avec les décimales de la devise, y compris montants négatifs et nuls", () => {
  assert.equal(roundToCurrencyPrecision(1234.6, "XAF"), 1235);
  assert.equal(roundToCurrencyPrecision(1234.4, "XAF"), 1234);
  assert.equal(roundToCurrencyPrecision(0, "XAF"), 0);
  assert.equal(roundToCurrencyPrecision(-1234.6, "XAF"), -1235);
  assert.equal(roundToCurrencyPrecision(1234.567, "KES"), 1234.57);
  assert.equal(roundToCurrencyPrecision(-1234.567, "KES"), -1234.57);
  assert.equal(roundToCurrencyPrecision(0, "KES"), 0);
});

test("AXE A — formatage : jamais de /100 implicite, toujours borné aux décimales de la devise", () => {
  const xaf = formatRentalAmount(500000, "XAF", "fr-FR");
  assert.ok(!xaf.includes("5 000,00") && !xaf.includes("5000.00"), `format XAF ne doit pas diviser par 100: ${xaf}`);
  assert.ok(xaf.includes("500"), `format XAF doit conserver la valeur entière: ${xaf}`);

  const kes = formatRentalAmount(50000, "KES", "en-KE");
  assert.ok(kes.includes("50,000") || kes.includes("50000"), `format KES: ${kes}`);

  // Devise absente du catalogue de location : jamais une exception (Intl
  // accepte tout code ISO-4217-like ; à défaut de décimales connues pour
  // cette devise, le repli à 2 décimales de decimalsForRentalCurrency
  // s'applique, jamais un /100 implicite ni un crash).
  const fallback = formatRentalAmount(1000, "ZZZ", "fr-FR");
  assert.ok(fallback.includes("ZZZ"), `le code devise doit rester visible: ${fallback}`);
  assert.ok(fallback.includes("1"), `la valeur doit rester présente: ${fallback}`);

  const negative = formatRentalAmount(-1500, "XAF", "fr-FR");
  assert.ok(negative.includes("-") || negative.includes("−"), `un montant négatif doit rester signé: ${negative}`);

  const zero = formatRentalAmount(0, "NGN", "en-NG");
  assert.ok(zero.length > 0);
});

test("AXE A — sumSameCurrency additionne correctement et refuse de mélanger des devises", () => {
  assert.equal(sumSameCurrency([{ amount: 40000, currency: "XAF" }, { amount: 2000, currency: "XAF" }]), 42000);
  assert.equal(sumSameCurrency([]), 0);
  assert.equal(sumSameCurrency([{ amount: 10.555, currency: "KES" }, { amount: 5, currency: "KES" }]), 15.56);
  assert.throws(
    () => sumSameCurrency([{ amount: 100, currency: "XAF" }, { amount: 100, currency: "NGN" }]),
    /currency_mismatch/,
    "sommer XAF et NGN doit lever, jamais produire un total trompeur",
  );
});

test("AXE A — catalogue pays : chaque pays propose une devise du catalogue de devises", () => {
  assert.ok(SUPPORTED_COUNTRIES.length >= 12, "au moins les 6 marchés attendus (zone XOF regroupant plusieurs pays)");
  for (const country of SUPPORTED_COUNTRIES) {
    assert.equal(isRentalCurrency(country.currency), true, `${country.countryCode} doit proposer une devise supportée`);
    assert.equal(isSupportedCountry(country.countryCode), true);
  }
  // Un code pays par pays (pas de doublon).
  const codes = SUPPORTED_COUNTRIES.map((c) => c.countryCode);
  assert.equal(new Set(codes).size, codes.length, "aucun pays en double dans le catalogue");
});

test("AXE A — defaultsForCountry renvoie les bons défauts, et null pour un pays non supporté", () => {
  assert.equal(defaultsForCountry("CM")?.currency, "XAF");
  assert.equal(defaultsForCountry("KE")?.currency, "KES");
  assert.equal(defaultsForCountry("SN")?.currency, "XOF");
  assert.equal(defaultsForCountry("NG")?.currency, "NGN");
  assert.equal(defaultsForCountry("CD")?.currency, "CDF");
  assert.equal(defaultsForCountry("ZA")?.currency, "ZAR");
  assert.equal(defaultsForCountry("US"), null);
  assert.equal(isSupportedCountry("US"), false);
});

// =============================================================================
// KJORA — Conversion monétaire (module PUR)
// =============================================================================
// Point UNIQUE de conversion "unité mineure -> unité majeure", pour éviter que
// plusieurs endroits du code appliquent des règles divergentes (c'est
// exactement le bug corrigé ici : FINANCE-ADMIN-01 divisait XAF par 100 comme
// s'il avait des centimes).
//
// Règle ALIGN-00/ALIGN-03, déjà appliquée par `formatMoney` (fiche
// Organization, ADMIN-BILLING-OPS-01) et maintenant partagée par la vue
// Finances :
//   • CAD a une sous-unité (le cent) : amount_minor est en cents, /100 pour
//     obtenir des dollars.
//   • XAF n'a PAS de sous-unité (aucun sou/centime en usage) : amount_minor
//     EST déjà le montant en XAF. Le diviser par 100 le fausse d'un facteur
//     100 (5900 XAF affichés comme 59 XAF).
//
// Module PUR (pas de "server-only", pas de dépendance Supabase) : importable
// aussi bien depuis server.ts que depuis un composant client ("use client",
// views.tsx), et testable directement par `node --test` sans environnement.
// =============================================================================

/** Devises dont amount_minor est directement le montant affiché (pas de centimes). */
const ZERO_DECIMAL_CURRENCIES = new Set(["XAF"]);

/**
 * Convertit un montant en unité mineure (tel que stocké en base) vers l'unité
 * majeure à afficher, selon la devise. Jamais de règle générique "/100" : la
 * devise décide, explicitement, à chaque appel.
 */
export function minorToMajor(amountMinor: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency)) {
    return amountMinor;
  }
  return amountMinor / 100;
}

/** Nombre de décimales à afficher pour cette devise (0 pour XAF, 2 pour CAD). */
export function decimalDigitsFor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

/**
 * Formatte un montant en unité mineure vers une chaîne monétaire lisible,
 * dans la bonne unité, sans jamais mélanger deux devises dans un même appel.
 */
export function formatMinorAmount(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  const major = minorToMajor(amountMinor, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(major);
  } catch {
    return `${major.toFixed(decimalDigitsFor(currency))} ${currency}`;
  }
}

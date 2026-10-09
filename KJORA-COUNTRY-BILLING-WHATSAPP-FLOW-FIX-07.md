# KJORA — COUNTRY-BILLING-WHATSAPP-FLOW-FIX-07

## Base et périmètre

- Dépôt : `NGAMS237/SAAS-KJORA`.
- Branche locale : `codex/kjora-country-billing-whatsapp-flow-fix-07`.
- Base réelle : `1605753f892718b4ebdab6f90a08db0f922bc0bf` (`origin/main`, descendant de la base minimale exigée).
- Travail réalisé dans un clone isolé; aucun push, merge, PR ou changement distant.
- Aucune migration appliquée à Supabase, aucun déploiement, DNS, paiement, courriel ou message WhatsApp réel.

## Résultat

- Le catalogue locatif conserve `CI → XOF`, `Africa/Abidjan`, français.
- Le catalogue d’abonnement ajoute `CI → XOF`; `CM → XAF` et `CA → CAD` restent inchangés.
- Les prix XOF reprennent les montants nominaux XAF validés, sous un code ISO distinct. Aucune conversion ou addition XAF/XOF n’est introduite.
- Stripe Test reste limité au CAD. Aucun provider Afrique ou WhatsApp n’est activé.
- Découverte reste accessible sans carte. Un marché locatif sans tarif SaaS local ne reçoit aucun faux prix XAF.
- La migration additive corrige seulement les abonnements CI/Découverte strictement vierges. Toute ligne avec historique financier est préservée et signalée pour revue supervisée.
- L’onboarding propose une étape WhatsApp Owner facultative, reprenable et basée sur l’infrastructure existante. `declared` reste distinct de `verified`.
- La création locataire est suivie d’une étape WhatsApp facultative. Le dossier est créé une seule fois; un échec de préférences se retente sans suppression ni duplication.
- Le bailleur ne peut jamais accepter le marketing à la place du locataire. La fiche n’expose qu’un résumé masqué, servi en `private, no-store`.
- Le parcours partenaire existant continue d’utiliser le catalogue téléphonique partagé; aucune modification partenaire n’a été nécessaire.

## Migration locale non appliquée

`supabase/migrations/20261005205909_country_billing_whatsapp_flow_fix_07.sql`

Elle élargit les contraintes de pays/devise, ajoute les lignes de prix XOF,
remplace les deux RPC Billing avec `SECURITY DEFINER` et `search_path=''`,
révoque `PUBLIC`/`anon`, et ajoute une lecture WhatsApp locataire masquée gardée
par `tenant.manage`. Elle ne modifie aucune migration historique.

Procédure requise avant toute application distante : sauvegarde fraîche,
reconstruction SQL éphémère complète, suite pgTAP complète, revue des
Organizations CI conservant une paire historique XAF, puis autorisation
séparée. Aucun `supabase db push` global ne doit être utilisé.

## Fichiers du lot (19)

### Billing et contrat

- `src/core/billing/model.ts`
- `src/core/billing/server.ts`
- `src/core/billing/billing-view.tsx`
- `src/core/onboarding/plan-intent.ts`
- `src/app/(internal)/app/billing/page.tsx`
- `docs/product/KJORA-SITE-APP-INTEGRATION-CONTRACT-v0.2.md`
- `supabase/migrations/20261005205909_country_billing_whatsapp_flow_fix_07.sql`
- `supabase/tests/database/country_billing_whatsapp_flow_fix_07.test.sql`

### Onboarding Owner

- `src/core/organization/organization-onboarding-form.tsx`
- `src/app/onboarding/organization/page.tsx`
- `src/modules/communications/personal-whatsapp-preferences.tsx`

### Parcours locataire

- `src/app/(internal)/app/locataires/nouveau/page.tsx`
- `src/app/api/tenancy/whatsapp/route.ts`
- `src/modules/tenancy/tenant-whatsapp-preferences.tsx`
- `src/modules/tenancy/views.tsx`

### Tests et rapport

- `tests/billing.test.ts`
- `tests/site-app-flow-canada.test.ts`
- `tests/country-billing-whatsapp-flow-fix-07.test.ts`
- `KJORA-COUNTRY-BILLING-WHATSAPP-FLOW-FIX-07.md`

## Validations exécutées

| Contrôle | Résultat |
| --- | --- |
| Baseline `npm ci` | PASS — 364 packages; audit informatif : 7 vulnérabilités déjà présentes (6 high, 1 critical), aucun `audit fix` exécuté |
| Baseline tests | PASS — 972/972 |
| Tests ciblés | PASS — 98/98 |
| `npm test` final | PASS — 999/999 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx next build --webpack` | PASS — 82/82 pages générées, même nombre qu’à la baseline |
| `git diff --check` | PASS |
| Contrôle anti-secrets | PASS — aucune signature de clé, jeton, variable secrète renseignée ou clé privée dans le diff |
| Fichiers interdits | PASS — aucun `.env*` secret, `node_modules`, `.next`, `.vercel`, `supabase/.temp`, ZIP ou journal ajouté au lot |
| Plan pgTAP statique | PASS — `plan(20)` et 20 assertions |
| Replay SQL / pgTAP réel / concurrence | NON EXÉCUTÉ — PostgreSQL, Docker et Supabase local indisponibles |
| Navigateur authentifié CI/CM | NON EXÉCUTÉ — aucun Supabase local isolé; le projet distant est hors périmètre |
| Application autonome du patch | PASS — `git am --3way` depuis la base obligatoire, worktree propre et arbres Git identiques |

## Commits locaux applicatifs

- `6941bfc` — `fix(billing): align Cote d'Ivoire subscriptions with XOF`
- `c51e220` — `feat(onboarding): collect optional owner WhatsApp preferences`
- `ff9b21c` — `feat(tenancy): integrate consent-aware tenant WhatsApp details`
- `f0ac131` — `test(pilot): cover country billing and WhatsApp workflows`

Le commit de documentation final et son SHA sont fournis avec le livrable; le
rapport ne peut pas contenir son propre SHA sans rendre ce SHA caduc.

## Limites et décisions ouvertes

- La migration et le pgTAP doivent être exécutés sur une base éphémère avant toute autorisation distante.
- Les Organizations CI possédant un historique Billing XAF exigent une revue supervisée; elles ne sont jamais réécrites automatiquement.
- La facturation Afrique payante et les factures manuelles XOF restent désactivées jusqu’à un lot/provider explicitement autorisé.
- Les parcours navigateur authentifiés CI et CM restent à contrôler sur un environnement isolé après validation SQL.

COUNTRY RENTAL CI/XOF : PASS

SUBSCRIPTION CI/XOF : PASS

RENTAL/BILLING SEPARATION : PASS

OWNER WHATSAPP ONBOARDING : PASS

TENANT WHATSAPP FLOW : PASS

CONSENT AND PRIVACY : PASS

SQL ISOLATED TESTS : NON EXÉCUTÉ

BROWSER AUTH FLOW : NON EXÉCUTÉ

READY FOR PATCH APPLICATION : OUI

READY FOR REMOTE MIGRATION : NON

READY FOR PRODUCTION : NON

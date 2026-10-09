# KJORA — COUNTRY-BILLING-HISTORY-GUARD-FIX-07-v2

## Base et branche

- Dépôt : `NGAMS237/SAAS-KJORA`
- Base obligatoire : `1605753f892718b4ebdab6f90a08db0f922bc0bf`
- Patch v1 appliqué : SHA-256 `799c4e06cf4ef13d0a657aaeae4b460dcc1614e7f941147341e887d70ea99f48`
- Tree v1 vérifié : `946072c1ef4f916a918d5eed5bcc11634a1b8c55`
- Branche locale : `codex/kjora-country-billing-whatsapp-flow-fix-07-v2`
- Aucun push, merge, PR, déploiement ou changement distant.

Le SHA du commit documentaire, le Tree SHA final et le SHA-256 du patch v2
sont fournis dans le manifeste externe de clôture. Un fichier inclus dans son
propre commit et son propre patch ne peut pas auto-référencer ces empreintes
sans les rendre immédiatement caduques.

## Correctif

La fonction `public.prepare_plan_change_for_market(uuid,text,text,text)` ne
change désormais le marché d'abonnement que pour une ligne réellement vierge :

- statut `free` et plan `decouverte`;
- aucune période, échéance, grâce, annulation, programmation ou intention;
- aucun fournisseur, identifiant fournisseur ou moyen de paiement;
- aucune facture, tentative, événement Billing, intention fournisseur,
  webhook, intervention commerciale ou trace de rappel.

Un changement demandé sur un abonnement non vierge retourne
`billing_country_change_requires_support`, avec le pays et la devise déjà
enregistrés, avant tout appel au workflow de plan. Si le marché est identique,
le workflow normal reste accessible.

Les protections existantes restent inchangées : `SECURITY DEFINER`,
`search_path=''`, `auth.uid()`, `billing.manage`, isolation Organization,
révocation de `PUBLIC` et `anon`, exécution limitée à `authenticated`.

## Fichiers propres au correctif v2

- `supabase/migrations/20261005205909_country_billing_whatsapp_flow_fix_07.sql`
- `supabase/tests/database/country_billing_whatsapp_flow_fix_07.test.sql`
- `tests/country-billing-whatsapp-flow-fix-07.test.ts`
- `KJORA-COUNTRY-BILLING-WHATSAPP-FLOW-FIX-07-v2-FINAL.md`

Le patch autonome v2 contient aussi les 19 fichiers du lot v1 depuis la base
obligatoire. Il contient donc 20 chemins distincts au total, le présent rapport
étant le seul nouveau chemin par rapport à la v1.

## Migration

- Migration concernée : `20261005205909_country_billing_whatsapp_flow_fix_07.sql`
- Ancienne migration antérieure au lot 07 modifiée : aucune
- Migration distante appliquée : aucune
- `migration repair` : non exécuté

## pgTAP

- Plan statique : `plan(55)`
- Assertions statiquement comptées : 55
- Scénarios : vierge, facture, tentative, événement, références fournisseur,
  abonnement payant, intention fournisseur, webhook, intervention commerciale,
  rappel, marché identique, accès inter-Organization, `anon`/`PUBLIC`, snapshots
  avant/après et absence de mutation financière parasite.
- Replay SQL et pgTAP réel : **NON EXÉCUTÉ** — Docker, Supabase CLI et PostgreSQL
  local sont indisponibles.

## Validations exécutées

| Contrôle | Résultat |
| --- | --- |
| Patch v1 SHA-256 et Tree SHA | PASS |
| Tests Node ciblés | PASS — 30/30 |
| `npm test` | PASS — 1002/1002 |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npx next build --webpack` | PASS — 82/82 pages; relance autorisée après blocage réseau des polices |
| `git diff --check` | PASS |
| Plan pgTAP statique | PASS — 55/55 |
| Replay SQL / pgTAP réel | NON EXÉCUTÉ |

L'environnement d'exécution utilisait Node `24.19.0` alors que le dépôt cible
Node `22.x`. `npm ci` a réussi sans modification du lockfile; cette différence
doit être éliminée dans la CI de validation SQL/Preview.

## Risques et étapes restantes

- Exécuter toutes les migrations et les 55 assertions pgTAP sur une base locale
  ou éphémère isolée.
- Confirmer le comportement concurrent avec les producteurs d'historique
  Billing sur cet environnement isolé.
- Ne créer une Preview supervisée qu'après pgTAP réel vert.
- Ne pas appliquer cette migration à distance sans autorisation séparée.

READY FOR PATCH REVIEW : OUI

READY FOR ISOLATED SQL VALIDATION : OUI

READY FOR SUPERVISED PREVIEW : NON

READY FOR PRODUCTION : NON

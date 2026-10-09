# KJORA — FIX-FLOW07-MIGRATION-BACKFILL-GUARD

Date : 2026-10-09

## Base et périmètre

- Dépôt : `NGAMS237/SAAS-KJORA`
- Base : `54ec40a8a75540ef10c8515f860ffa91ea6c6568`
- Base tree : `5b3930afe1e5af7e85d1c4a2b3c716d2a51a2318`
- Branche locale : `codex/fix-flow07-migration-backfill-guard`
- Migration corrigée : `supabase/migrations/20261005205909_country_billing_whatsapp_flow_fix_07.sql`
- Aucune nouvelle migration.
- Aucune autre migration modifiée.
- La RPC v2 `prepare_plan_change_for_market` n'a pas été modifiée.

## Correction

Le `UPDATE` initial de backfill CI exige désormais exactement le même état
d'abonnement vierge que la variable `subscription_pristine` de la RPC :

- statut `free` et forfait `decouverte`;
- toutes les références fournisseur, périodes, échéances, états de grâce,
  échecs, blocages et annulations absents;
- aucun changement de forfait ou de cycle programmé ou en attente;
- aucun moyen de paiement;
- aucune facture, tentative, événement Billing, intention fournisseur, webhook,
  intervention commerciale ou rappel de facturation.

Toutes les conditions sont reliées par `AND`. L'échec d'une seule condition
exclut l'abonnement du backfill et conserve donc son pays et sa devise pour
traitement manuel.

## Tests ajoutés

Trois tests Node statiques isolent explicitement le bloc `UPDATE` situé avant
la déclaration de la RPC. Ils vérifient :

1. que le backfill initial est analysé indépendamment de la RPC;
2. que ses 23 gardes de colonnes NULL sont identiques à celles de la RPC;
3. que ses sept gardes d'historique sont identiques à celles de la RPC et
   qu'aucun `OR` permissif n'est introduit.

Le test pgTAP existant n'a pas été modifié : son plan demeure à 55 assertions.
Le défaut était antérieur aux fixtures comportementales pgTAP; la nouvelle
couverture statique vise précisément le bloc de migration qui avait échappé au
test de la RPC.

## Validations exécutées

| Contrôle | Résultat |
| --- | --- |
| Test Node ciblé | PASS — 33/33 |
| Suite Node complète | PASS — 1005/1005 |
| TypeScript | PASS |
| ESLint | PASS |
| Build Next.js Webpack | PASS — 82/82 pages |
| `git diff --check` | PASS |
| Contrôle anti-secrets | PASS |
| Replay SQL local | NON EXÉCUTÉ — PostgreSQL/Supabase CLI/Docker indisponibles |
| pgTAP réel | NON EXÉCUTÉ — environnement SQL local indisponible |

Le premier lancement du build dans le bac à sable a échoué sur le téléchargement
de `next/font` avec `EACCES`. Le même build, relancé avec l'accès réseau
nécessaire, a terminé avec succès. L'environnement utilise Node.js 24.19.0 alors
que le dépôt déclare Node.js 22.x; aucune dépendance n'a été modifiée.

## Sécurité et actions distantes

- Aucun secret, fichier d'environnement ou artefact de build ajouté.
- Aucun push, merge, PR, déploiement ou changement DNS.
- Aucune migration distante et aucune modification Supabase distante.

READY FOR PATCH : OUI

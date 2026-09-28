# KJORA — LAUNCH-AUTONOMOUS-01 v2 — revue de sûreté

Date : 2026-09-28

Base vérifiée : `29f24b294df176dec6c036a6773386583830dd40`

La v2 reprend les six commits fonctionnels de LAUNCH-AUTONOMOUS-01 et ajoute
un commit de durcissement. Elle remplace intégralement le patch v1.

## Correctifs bloquants apportés par la revue

1. **Webhooks Stripe atomiques.** Le patch v1 journalisait l'événement avant
   l'effet métier. Une erreur après cette insertion faisait répondre `500`,
   mais le rejeu Stripe était ensuite absorbé comme doublon : l'événement
   pouvait être perdu. La RPC v2 journalise et applique dans une seule
   transaction. En cas d'échec, les deux opérations sont annulées et le rejeu
   reste possible.
2. **États Stripe exacts.** `customer.subscription.updated` ne force plus
   systématiquement l'état `grace`. Les statuts actif, impayé, annulation
   programmée et annulé sont distingués. Une annulation programmée exige sa
   date effective.
3. **Validation E.164 SQL.** Le motif PostgreSQL n'exige plus par erreur un
   antislash avant le `+` du numéro international.
4. **Confidentialité du suivi partenaire.** La PWA ne met plus en cache
   `/partenaires/suivi?...token=...`. L'API de candidature et la page de suivi
   déclarent `no-store` et `no-referrer`.
5. **Programme partenaire cohérent.** Les quatre profils annoncés sont
   acceptés (`commercial`, `referral_partner`, `influencer`, `agency`) et la
   version des conditions acceptées est conservée. Un paiement de récompense
   exige désormais une référence, en plus de la règle des quatre yeux.
6. **Dépendance Stripe reproductible.** Le SDK est fixé à la version exacte
   `22.6.2` dans le manifeste et le verrou npm.

## Validation exécutée après durcissement

- installation npm propre ;
- tests Node complets : **917/917 PASS** ;
- TypeScript : PASS ;
- ESLint : PASS ;
- build Next.js Webpack : PASS, **78 routes** ;
- `git diff --check` : PASS ;
- tests ciblés Stripe, partenaires, PWA et WhatsApp : PASS.

## Gate restant obligatoire

Les cinq nouvelles migrations et leurs fichiers pgTAP n'ont pas été exécutés
sur PostgreSQL dans cet environnement, faute de moteur Docker/PostgreSQL.
Avant toute Preview fonctionnelle, la CI Supabase éphémère doit donc :

1. rejouer toutes les migrations depuis une base vide ;
2. exécuter toute la suite pgTAP ;
3. exercer au minimum le doublon concurrent et le rollback/rejeu d'un webhook
   Stripe en échec ;
4. confirmer les grants des nouvelles signatures RPC.

Stripe reste désactivé par défaut et limité aux clés `sk_test_`. WhatsApp reste
sur l'adapter `disabled`. Aucune migration distante, aucun fournisseur et
aucune Production n'ont été modifiés pendant cette revue.


# Kjora — Dashboard, Activity, Notifications et Audit v0.1

> Lot 6D — implémenté, migré et testé sur KJORA Production le 30 août 2026. Déploiement Vercel et validation fonctionnelle Blaise en attente.

## Vérités affichées

- `Attendu` : somme des Dues locatives de la période active.
- `Encaissé` : somme des Payments `confirmed` dont la date appartient à la période active.
- `Crédit appliqué` : crédit d’ouverture et crédit issu de Payments réellement affectés aux Dues de la période.
- `Reste dû` : projection `dues_with_status`, jamais un calcul client `attendu - encaissé`.
- `En retard` : Dues locatives dont le statut dérivé est `overdue`.
- Occupation : Units actives rapprochées des Leases actives, sans booléen métier dupliqué.

La période par défaut est le mois courant ; son libellé reste visible et la navigation mensuelle n’agrège jamais plusieurs Organizations.

## Séparation des traces

- **Domain Event** : fait métier non localisé, immuable et interne.
- **Activity** : projection chronologique des Domain Events que le rôle est autorisé à voir.
- **Notification** : message adressé à un User, dédupliqué, marquable lu et revérifié par capability.
- **Audit** : trace sensible immuable visible uniquement par `Organization Owner`.
- **Communication** : livraison externe séparée par l’outbox 6C3 ; désactivée pendant le rollout sûr.

Les futurs `PAYMENT_REVERSED` et `DOCUMENT_INVALIDATED` alimentent le journal administratif existant. Aucun événement historique n’est backfillé.

## Sécurité

Les RPC 6D sont `SECURITY DEFINER` avec `search_path` vide, vérification `auth.uid()`, Organization active et capability. `PUBLIC` et `anon` n’ont aucun droit d’exécution. Les rôles sans `due.view` + `payment.view` reçoivent des KPI financiers indisponibles (`null`), jamais des montants partiels ou des zéros trompeurs. L’Audit et la santé opérationnelle exigent `audit.view`, capability Owner-only.

La cloche et le centre de notifications lisent uniquement les notifications du destinataire authentifié dans l’Organization active. Le changement d’Organization recharge le layout et ne conserve aucun cache métier cross-tenant.

## Monitoring minimal

La vue Owner expose le dernier état du cron financier quotidien, le backlog/les échecs du processeur documentaire et les compteurs de livraisons. Elle ne retourne ni message fournisseur brut, ni token, ni secret. Aucun nouveau cron ou worker n’est créé par 6D.

## Hors périmètre

- Reporting avancé et agrégation multi-Organization ;
- activation des emails financiers ;
- nouveau système d’événements, notifications, audit ou outbox ;
- backfill ;
- accès portail locataire et Lot 6E.

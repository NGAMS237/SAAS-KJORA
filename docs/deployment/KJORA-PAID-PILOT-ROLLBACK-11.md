# KJORA — Rollback du pilote payant

## Rollback opérationnel immédiat

1. `BILLING_KILL_SWITCH_ALL=1` et `BILLING_KILL_SWITCH_STRIPE_LIVE=1` dans Hostinger.
2. Redéployer uniquement avec autorisation Gate C.
3. Désactiver le webhook Live côté Stripe si des rejeux dangereux persistent.
4. Révoquer l’Organization dans `paid_pilot_access`; ne supprimer aucune donnée financière.
5. Conserver webhooks, factures et événements pour audit; ne jamais faire `db reset`.

## Rollback applicatif

Redéployer le commit précédent connu comme vert. Garder la migration additive : ses colonnes et journaux sont compatibles avec l’ancien code. N’effacer ni facture, ni intention, ni webhook.

## Retour SQL

Une migration compensatrice séparée est obligatoire. Elle doit d’abord prouver l’absence de dépendance et préserver toutes les lignes. La suppression directe de colonnes, tables ou factures n’est pas un rollback acceptable.

## Réconciliation

Comparer Stripe et KJORA par identifiants masqués, période, montant, devise et statut. Toute correction financière est manuelle, documentée et append-only. Aucun plan payant ne doit être accordé pour « compenser » une panne sans paiement réellement confirmé.

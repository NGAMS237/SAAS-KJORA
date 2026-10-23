# KJORA — STRIPE-LIVE-SAFE-ACTIVATION-15

## Statut

Ce lot livre uniquement le cloisonnement applicatif et les contrôles de
configuration. Il n'active pas Stripe Live, ne crée ni webhook ni Checkout,
et ne renseigne aucune variable Hostinger.

## Sélecteur fermé

`BILLING_PROVIDER_MODE` est obligatoire :

| Mode | Conditions supplémentaires | Résultat |
|---|---|---|
| `sandbox` | `BILLING_PROVIDER_STRIPE_TEST_ENABLED=1` | Stripe Test seulement |
| `live` | pilote, invitation et fournisseur Live explicitement à `1` | Stripe Live seulement |
| absent, invalide ou contradictoire | aucune | Stripe indisponible |

Une clé, un Price ID, un webhook, une session ou un événement de l'autre
environnement est refusé. Les six prix CAD sont résolus côté serveur depuis le
contrat commercial; le navigateur ne peut jamais fournir le prix ou le montant.

## Matrice Hostinger sans valeurs

| Groupe | Variables |
|---|---|
| Sélection | `BILLING_PROVIDER_MODE`, `BILLING_PROVIDER_STRIPE_TEST_ENABLED`, `BILLING_PROVIDER_STRIPE_LIVE_ENABLED` |
| Gates pilote | `KJORA_PAID_PILOT_ENABLED`, `KJORA_PAID_PILOT_INVITE_ONLY` |
| Coupe-circuits | `BILLING_KILL_SWITCH_ALL`, `BILLING_KILL_SWITCH_STRIPE`, `BILLING_KILL_SWITCH_STRIPE_LIVE` |
| Stripe Live serveur | `STRIPE_LIVE_SECRET_KEY`, `STRIPE_LIVE_PUBLISHABLE_KEY`, `STRIPE_LIVE_WEBHOOK_SECRET` |
| Catalogue Live | les six `STRIPE_LIVE_PRICE_*_CAD` |

Les valeurs ne sont saisies que dans Hostinger. Elles ne sont jamais ajoutées
à Git, aux tests, aux rapports ou aux journaux.

## Runbook après fusion seulement

1. Vérifier la CI et le SHA déployé.
2. Laisser tous les coupe-circuits fermés; renseigner la matrice Live complète.
3. Créer/auditer le webhook Stripe Live vers
   `https://kjorapp.com/api/billing/webhooks/stripe` avec la liste fermée :
   `checkout.session.completed`, `invoice.created`, `invoice.finalized`,
   `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Effectuer les smoke tests sans paiement, y compris pilote non autorisé.
5. Obtenir une autorisation séparée avant d'ouvrir les coupe-circuits et avant
   tout premier Checkout Live.

## Fermeture immédiate et retour Sandbox

En cas d'écart, définir les coupe-circuits global et Stripe Live à `1`, puis
redéployer seulement avec autorisation supervisée. Ne supprimer ni événement,
ni facture, ni accès pilote. Un retour temporaire au Sandbox exige
`BILLING_PROVIDER_MODE=sandbox`, un catalogue Test complet et aucune variable
Live activée. Les procédures opérationnelles détaillées restent dans
`docs/deployment/KJORA-PAID-PILOT-ROLLBACK-11.md` et
`docs/deployment/KJORA-PAID-PILOT-FIRST-PAYMENT-11.md`.

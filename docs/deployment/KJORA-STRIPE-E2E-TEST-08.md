# KJORA — Stripe Test — protocole E2E 08

État : préparé, non exécuté. Aucun paiement réel ou Stripe Live n'est autorisé.

## Webhook attendu par le code

- URL : `https://kjorapp.com/api/billing/webhooks/stripe`
- corps brut obligatoire;
- signature `stripe-signature` vérifiée avec le secret Test;
- événements interprétés :
  - `checkout.session.completed`;
  - `invoice.payment_failed`;
  - `customer.subscription.updated`;
  - `customer.subscription.deleted`;
  - `charge.refunded`.

Un autre type d'événement est accusé sans mutation dangereuse. Les rejeux sont
neutralisés par l'unicité `(provider, provider_event_id)` et les événements
hors ordre sont ignorés.

## Préflight

1. Catalogue Stripe Test : 3 produits et 6 tarifs PASS.
2. Endpoint webhook Test exact actif avec uniquement les événements ci-dessus.
3. Variables Hostinger conformes à
   `KJORA-STRIPE-HOSTINGER-ENV-08.md`.
4. Déploiement Hostinger explicitement autorisé et build vert.
5. Compte propriétaire fictif, Organization Canada/CAD dédiée au test.
6. Vérifier dans Stripe que l'indicateur **Test mode** est actif.

## Parcours supervisé

1. Se connecter au compte propriétaire fictif.
2. Ouvrir `/app/billing` et choisir un forfait KJORA payant.
3. Vérifier que Checkout est hébergé par Stripe et porte le bon produit, le bon
   cycle et le bon montant CAD.
4. Utiliser uniquement une carte de test officielle Stripe, jamais une carte
   réelle.
5. Vérifier le retour interne
   `https://kjorapp.com/app/billing?checkout=success`.
6. Confirmer dans Stripe Test puis dans KJORA la réception du webhook signé et
   l'activation du forfait attendu.
7. Ouvrir le portail client depuis KJORA; vérifier le retour vers
   `https://kjorapp.com/app/billing`.
8. Programmer une annulation Test en fin de période.
9. Vérifier `cancellation_scheduled`, puis le traitement d'un événement de
   suppression Test sans doublon.
10. Fermer les kill switches après la fenêtre de test.

## Preuves à conserver sans données privées

- SHA applicatif et horodatage;
- identifiants Stripe masqués;
- types et identifiants d'événements masqués;
- statuts HTTP du webhook;
- état KJORA avant/après;
- absence de `livemode=true`;
- absence de secret, carte ou contenu client dans les logs.

## Critères

| Gate | Statut actuel |
| --- | --- |
| Catalogue Stripe Test | NON EXÉCUTÉ |
| Webhook Test vérifié | NON EXÉCUTÉ |
| Hostinger configuré | NON EXÉCUTÉ |
| Checkout Test | NON EXÉCUTÉ |
| Webhook signé | NON EXÉCUTÉ |
| Portail client | NON EXÉCUTÉ |
| Annulation Test | NON EXÉCUTÉ |
| Stripe Live | NON |
| Production prête | NON |

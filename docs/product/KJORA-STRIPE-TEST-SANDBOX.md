# KJORA — Stripe Canada/diaspora — Sandbox

Cette intégration ne fonctionne qu'en mode Stripe Test et reste désactivée tant que
`BILLING_PROVIDER_STRIPE_TEST_ENABLED` n'est pas exactement `1`. Le navigateur
ne reçoit aucune clé. Les Price IDs sont choisis dans une liste fermée côté serveur.

## Scénarios à valider sur KJORA Dev

- Succès : Checkout Test, webhook signé `checkout.session.completed` avec
  `payment_status=paid`, puis activation du plan demandé.
- Carte refusée : aucun entitlement n'est activé ; l'intention reste réparable.
- Webhook répété : l'unicité `(provider, provider_event_id)` accuse le rejeu sans
  second effet.
- Webhook ancien : un événement antérieur au dernier événement appliqué est ignoré.
- Annulation : le portail Test programme ou constate l'annulation ; seul le
  webhook signé met à jour KJORA.
- Reprise : une nouvelle intention validée peut ouvrir un nouveau Checkout Test.
- Remboursement : l'événement est journalisé `refunded` et doit être revu par
  l'Admin avant toute décision commerciale complémentaire.

Ne jamais employer ce parcours pour les loyers. Aucun appel Stripe réel n'est
effectué par la suite automatisée : les tests injectent des fakes déterministes.

# KJORA — Runbook de déploiement pilote payant

## Ordre obligatoire

1. CI de la branche : tests Node, TypeScript, ESLint, build Webpack, replay SQL et pgTAP.
2. Revue humaine du diff et contrôle anti-secrets.
3. Gate B : sauvegarde Supabase fraîche, inventaire des migrations, puis application de la seule migration `20261017120000_paid_pilot_production_readiness_11.sql` avec autorisation explicite.
4. Vérifier les grants, RLS, compteurs avant/après et exécuter les contrôles SQL transactionnels.
5. Gate A : dans Stripe Live, saisir les clés et créer/auditer le catalogue uniquement après autorisation explicite. Ne jamais copier de secret dans un journal.
6. Créer le webhook Live exact `https://kjorapp.com/api/billing/webhooks/stripe`, avec la liste fermée d’événements. Saisir son secret directement dans Hostinger.
7. Gate C : ajouter les variables Live dans Hostinger en gardant `BILLING_KILL_SWITCH_ALL=1`, redéployer, puis smoke tests publics/authentifiés.
8. Ajouter une seule Organization pilote à l’allowlist par un `platform_admin`; confirmer Owner actif, `billing.manage`, pays CA et devise SaaS CAD.
9. Lever les coupe-circuits pour une fenêtre supervisée seulement.
10. Gate D : premier Checkout Live et paiement réel seulement après accord explicite de Blaise.
11. Vérifier webhook, facture d’abonnement, plan effectif, portail client et journaux avant toute deuxième invitation.

## Smoke tests sans argent réel

- `/`, `/connexion`, `/app`, `/app/billing`, `/conditions-abonnement` en FR/EN.
- Découverte sans carte.
- Owner non invité : aucun Checkout Live.
- collaborateur/locataire/anonyme : aucun Checkout Live.
- URL hostile : aucun prix, devise, Organization ou droit accepté.
- Admin : dernier paiement, dernière synchronisation et dernier webhook visibles sans identifiant fournisseur.
- Secrets absents du HTML, des bundles, des réponses et des logs.

## Arrêt immédiat

Réactiver `BILLING_KILL_SWITCH_ALL=1` si : signature invalide, facture absente, montant/devise divergents, plan activé sans paiement confirmé, données inter-Organization, événement impossible à rattacher, erreur 5xx répétée ou secret exposé.

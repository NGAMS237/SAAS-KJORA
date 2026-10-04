# KJORA — Matrice de smoke tests Hostinger

À exécuter après un déploiement supervisé, sur desktop et mobile. Utiliser uniquement des fixtures identifiables et supprimables. Ne jamais utiliser de données client réelles. Conserver les fournisseurs et automatismes désactivés.

## Préconditions

- SHA déployé et heure consignés.
- HTTPS valide sur `kjorapp.com`; `www` redirige vers l'apex.
- Compte Owner, collaborateur, locataire, partenaire et `platform_admin` de test séparés.
- Stripe fermé, Resend financier fermé, WhatsApp provider `disabled`, aucun cron.
- Journaux Hostinger et Supabase ouverts sans filtre affichant des secrets.

## Public

| Parcours | Attendu |
|---|---|
| `/` | rendu public, aucune donnée privée, application non indexable |
| `/connexion` | formulaire Auth disponible, erreurs sûres |
| `/aide` | `200`, contenu FR/EN attendu |
| `/contact` | surface publique, aucun secret navigateur |
| `/securite` | `200`, aucune promesse de certification inventée |
| `/confidentialite` | `200`, contenu attendu |
| `/partenaires` | candidature visible, conditions et origine same-site |
| `/hors-ligne` | repli public uniquement |
| `/robots.txt` | `200`, directives noindex cohérentes |

## Owner

- Connexion puis reprise d'une session existante.
- Création d'Organization de test; pays, devise immobilière et fuseau conservés.
- Profil, bien maison/immeuble, unité, locataire et bail.
- Génération/lecture du contrat et des documents sans envoi externe.
- Facturation : Découverte sans carte; page billing lisible avec Stripe fermé.
- Déconnexion, reconnexion et isolation d'une seconde Organization.
- Aucun secret ou identifiant fournisseur dans HTML, JavaScript, réseau ou stockage navigateur.

## Locataire

- Invitation de test, connexion et portail strictement séparé du Membership interne.
- Loyers, reçus, contrats et notifications limités au locataire courant.
- Préférence WhatsApp confirmée/révoquée depuis le portail seulement.
- URL d'une autre Organization refusée; aucune ressource privée dans le cache PWA.

## Partenaire

- Candidature avec consentement et doublon contrôlé.
- Connexion, suivi, tableau de bord et code/lien propres au partenaire.
- Aucune donnée de loyer, locataire, contrat ou paiement privé d'une Organization.
- Les liens de retour restent internes et aucune attribution URL ne devient un droit.

## Administration

- `platform_admin` accède à `/administration`; anonyme, Owner, collaborateur et locataire sont refusés.
- Organizations, abonnements, opérations et partenaires chargent leurs données autorisées.
- Le badge indique Production sur Hostinger sans `VERCEL_ENV`.
- Les statuts fournisseurs restent factuels : configuré n'est pas synonyme d'opérationnel.
- Aucune action de paiement, email ou WhatsApp n'est déclenchée par le rendu.

## WhatsApp manuel gratuit

Utiliser un numéro fictif appartenant à une fixture et ne pas confirmer l'envoi dans WhatsApp.

1. Consentement de service explicite présent; marketing distinct.
2. Document fictif `ready` et `approved` seulement.
3. Ouverture `wa.me` correcte avec numéro structuré et texte prérempli.
4. Lien documentaire court/sécurisé; aucun secret dans l'URL.
5. Journal limité à la demande d'ouverture.
6. Aucun statut « envoyé », « livré » ou « lu ».
7. Aucun appel Meta Cloud API.

## Resend — préparé, non exécuté par défaut

Après une autorisation spécifique seulement : un destinataire de développement autorisé, un message transactionnel unique, aucune boucle ni test de masse. Contrôler SPF, DKIM, DMARC, acceptation et spam sans afficher l'adresse complète ou le contenu dans les journaux. Rejeu idempotent sans second envoi. Sinon marquer `NON EXÉCUTÉ`.

## Stripe — préparé, coupe-circuit fermé

Au smoke test initial, vérifier uniquement :

- `BILLING_PROVIDER_STRIPE_TEST_ENABLED=0`;
- `BILLING_KILL_SWITCH_ALL=1` et `BILLING_KILL_SWITCH_STRIPE=1`;
- aucune session Checkout et aucun appel webhook;
- `/app/billing` reste lisible et n'accorde aucun plan payant.

Un futur test autorisé doit utiliser exclusivement une carte Test, vérifier Checkout, portail avec retour `/app/billing`, webhook signé et rejeu idempotent. Aucun paiement réel.

## Cache, proxy et journaux

- `/app`, `/portal`, `/administration`, `/api`, documents et PDF ne sont jamais servis depuis le cache PWA.
- Les réponses dynamiques privées portent des directives `private/no-store` appropriées.
- Le reverse proxy conserve HTTPS et les cookies `Secure`.
- Les webhooks reçoivent le corps brut; sans secret ils échouent proprement.
- Aucun jeton, clé, sel, adresse complète, numéro de téléphone ou contenu métier dans les logs.

## Critères de sortie

Chaque ligne reçoit `PASS`, `FAIL` ou `NON EXÉCUTÉ`, avec heure, navigateur, rôle et preuve non sensible. Un échec Auth, isolation, cache privé, secret, fournisseur involontaire ou journal sensible déclenche immédiatement le rollback. Le passage des smoke tests n'équivaut pas à `READY FOR PRODUCTION`; une décision de Blaise reste obligatoire.

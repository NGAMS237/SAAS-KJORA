# KJORA — STRIPE TEST END-TO-END ACTIVATION-08

Date : 2026-10-11

## Base

- Dépôt : `NGAMS237/SAAS-KJORA`
- Fusion attendue `54ec40a` : ancêtre confirmé.
- Base réelle après `fetch` et `pull --ff-only` :
  `34207fadeff26bc76d127d741333e16160fb5b22`.
- Branche : `codex/kjora-stripe-test-activation-08`.
- Arbre initial : propre.

## Audit du code

Le parcours existe déjà côté serveur :

- Checkout et portail utilisent le SDK Stripe officiel;
- la clé doit commencer par `sk_test_`;
- la devise Checkout est imposée à CAD;
- l'origine de retour est fermée à `KJORA_APP_ORIGIN`;
- le webhook vérifie le corps brut signé;
- l'effet Stripe est atomique dans `process_stripe_test_event`;
- rejeu et événement hors ordre sont neutralisés;
- les coupe-circuits global et Stripe couvrent Checkout et webhook;
- aucune variable Stripe `NEXT_PUBLIC_*` n'existe.

Correction locale 08 : le mapping exige désormais les six Price IDs valides et
distincts. Un audit en lecture seule vérifie également noms de produits,
mode Test, état actif, CAD, cycle et montants canoniques, tout en masquant les
identifiants affichés. Le script sécurisé de configuration refuse une clé Live,
prévalide DPAPI, rend la correction du tarif rejouable et chiffre le secret du
webhook sans l'écrire en clair sur disque.

## Baseline avant modification

- `npm ci` : PASS, avec avertissement Node 24.19.0 alors que le dépôt cible
  Node 22.x; 9 vulnérabilités npm signalées, aucune correction automatique.
- Tests Node : PASS — 1005/1005.
- TypeScript : PASS.
- ESLint : PASS.
- Build Webpack : PASS — 82/82 pages.
- `git diff --check` : PASS.

## État des services externes

La configuration Stripe Test a été auditée puis corrigée avec l'autorisation
explicite de Blaise :

- les trois produits KJORA attendus sont présents en mode Test;
- les six tarifs CAD canoniques sont actifs et validés;
- le tarif Essentiel 149,90 CAD initialement mensuel a été archivé;
- un nouveau tarif Essentiel 149,90 CAD annuel a été créé;
- le webhook Test exact `https://kjorapp.com/api/billing/webhooks/stripe` a été
  créé avec uniquement les cinq événements consommés par l'application;
- l'audit final retourne `products: 3`, `prices: 6`, six statuts `PASS` et un
  webhook `PASS`;
- le secret webhook n'a jamais été affiché. Il est sauvegardé hors Git et hors
  OneDrive dans `%LOCALAPPDATA%\Temp\KJORA-Stripe-Test`, chiffré pour le compte
  Windows courant;
- le test réel de déchiffrement DPAPI est `PASS`;
- empreinte SHA-256 de la sauvegarde utilisable :
  `AD4F2F5D40851A34942664D92C494627392845AE4D9D3F95FF2D426789354B0B`.

Une première sauvegarde DPAPI correspond à un endpoint supprimé lors de la
récupération et ne doit pas être utilisée. Elle reste conservée jusqu'à
confirmation explicite de son nettoyage. Aucun secret n'a été enregistré dans
Hostinger et aucun redéploiement ou paiement Test n'a été effectué.

## Statuts

| Gate | Statut |
| --- | --- |
| CODE READY | PASS |
| STRIPE TEST CONFIGURED | OUI — catalogue et webhook audités |
| HOSTINGER CONFIGURED | NON |
| WEBHOOK VERIFIED | OUI — configuration Stripe Test, livraison HTTP non testée |
| CHECKOUT TEST PASSED | NON EXÉCUTÉ |
| PORTAL TEST PASSED | NON EXÉCUTÉ |
| CANCELLATION TEST PASSED | NON EXÉCUTÉ |
| STRIPE LIVE ENABLED | NON |
| READY FOR PRODUCTION | NON |

## Validations finales locales

- Tests Node : PASS — 1012/1012.
- TypeScript : PASS.
- ESLint : PASS.
- Build Next.js Webpack : PASS — 82/82 pages générées.
- `git diff --check` : PASS.
- Contrôle anti-secrets sur les onze fichiers du lot : PASS.
- Tests ciblés STRIPE-08 : PASS — 7/7.
- Commit applicatif local : `c3547e7` (`feat(billing): validate Stripe Test activation`).
- Aucun merge, déploiement Hostinger, Stripe Live, Supabase, DNS ou Production.

## Prochain gate réel

La configuration des variables Stripe Test dans Hostinger et le redéploiement
supervisé exigent une autorisation explicite distincte. Ils sont nécessaires
avant les tests Checkout, webhook signé, portail et annulation. Le mode Live,
Supabase, DNS et Production restent hors périmètre.

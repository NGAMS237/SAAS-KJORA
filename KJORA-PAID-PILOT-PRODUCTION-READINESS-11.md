# KJORA — PAID-PILOT-PRODUCTION-READINESS-11

- Date : 2026-10-17
- Dépôt : `NGAMS237/SAAS-KJORA`
- Branche locale : `codex/kjora-paid-pilot-production-readiness-11`
- Base : `9fb142793b0d0d0c3a6cfc97ae09582f1eeb7c57`
- Tree de base : `d7583ce1eea2fc0c862ecebaf2b189f571881829`

## Résultat

Le lot prépare un pilote Stripe Live privé sans l’activer : Test et Live sont séparés, la configuration est fail-closed, l’Organization doit être allowlistée et le Checkout ne reçoit du navigateur ni Organization, ni pays, ni devise, ni montant, ni Price ID. Les webhooks signés synchronisent l’état d’abonnement et les factures SaaS, séparément des loyers. Aucun secret, paiement, migration distante, déploiement, email ou autre fournisseur réel n’a été utilisé.

## Audit factuel de la base KJORA — lecture seule

- Projet : `alvheiwlfzuefljcfrtv`, `ACTIVE_HEALTHY`, région `eu-west-3`, PostgreSQL 17.6.
- 13 Organizations, 15 memberships, 3 abonnements, 0 facture Billing, 2 intentions fournisseur et 3 événements webhook.
- Abonnements : 1 `active`, 2 `free`; intentions : 1 `paid`, 1 `cancelled`.
- Webhooks : 2 `checkout.session.completed`, 1 `customer.subscription.deleted`; aucun `invoice.paid` observé.
- Cause confirmée du défaut de facture : l’ancien endpoint ne recevait pas le cycle complet des événements de facture et l’ancienne RPC ne matérialisait pas `billing_invoices`.
- Les six tables `private.*` signalées sans RLS ont un ACL de table vide (Owner PostgreSQL seulement). Le rôle client dispose de `USAGE` sur le schéma mais d’aucun privilège de table : aucune exposition client observée. L’avis reste à revoir séparément.
- Advisors préexistants : fonctions `SECURITY DEFINER` exposées à leurs rôles applicatifs, tables default-deny sans policy, protection Auth contre mots de passe compromis désactivée, et index de clés étrangères manquants. Ils n’ont pas été corrigés hors périmètre. Références : [database linter](https://supabase.com/docs/guides/database/database-linter), [password security](https://supabase.com/docs/guides/auth/password-security).
- L’historique distant contient les migrations jusqu’à `20261015195207_stripe_test_reactivation_new_cycle`; la migration du lot 11 est absente et n’a pas été appliquée.

## Changements

### Configuration et Stripe

- Contrats fermés de six prix CAD distincts par environnement.
- Clés, Price IDs, sessions et `livemode` strictement séparés Test/Live.
- Live exige `KJORA_PAID_PILOT_ENABLED=1`, `KJORA_PAID_PILOT_INVITE_ONLY=1` et `BILLING_PROVIDER_STRIPE_LIVE_ENABLED=1`; Test et Live simultanés ferment Stripe.
- Audit Live en lecture seule; script de création catalogue Live préparé mais non exécuté, protégé par une phrase d’approbation exacte.
- Liste webhook complète : Checkout, création/mise à jour/suppression d’abonnement, facture payée/échouée/action requise et remboursement.

### Base candidate

- `paid_pilot_access`, RLS active, aucun accès client direct; mutation réservée à `platform_admin`.
- Éligibilité : session, Owner actif `organization_owner`, `billing.manage`, Organization active et allowlist active.
- Checkout : catalogue SQL, CA/CAD, intention pending, montant exact et idempotence validés côté serveur.
- Traitement webhook `service_role` uniquement, `SECURITY DEFINER`, `search_path=''`, corps signé et empreinte SHA-256.
- Rejeu et ordre des événements traités; divergence facture/devise/montant refusée.
- Factures fournisseur écrites uniquement dans `billing_invoices` avec source `provider`; aucune table de loyers modifiée.
- Résiliation/remboursement ramène le plan à Découverte; échec/action requise n’accorde aucun entitlement.
- État Admin limité au statut fonctionnel du paiement, de la synchronisation et du webhook, sans identifiant Stripe ni carte.

### Produit, légal et communication

- État de paiement et source de facture visibles dans l’espace abonnement.
- Page publique FR/EN `/conditions-abonnement`; les décisions juridiques non établies restent marquées « À VALIDER PAR BLAISE ».
- Sept modèles transactionnels FR/EN préparés sous forme de fonction pure. Aucun transport et aucun envoi activés.

## Validations exécutées

| Contrôle | Résultat |
|---|---|
| Node.js | 22.23.3 officiel, archive vérifiée par SHA-256 |
| Tests ciblés lot 11 | PASS — 13/13 |
| Tests Node complets | PASS — 1048/1048 |
| TypeScript | PASS |
| ESLint | PASS |
| Build Next.js Webpack | PASS — 83/83 pages générées |
| `git diff --check` | PASS |
| Contrôle anti-secrets | PASS — 598 fichiers suivis/candidats inspectés, aucune valeur plausible |
| Plan pgTAP statique | PASS — `plan(24)` pour 24 assertions |
| Replay migrations sur base neuve | NON EXÉCUTÉ — PostgreSQL, Docker et Supabase CLI absents |
| pgTAP réel | NON EXÉCUTÉ — aucun environnement SQL isolé local |
| CI SQL éphémère du SHA final | NON EXÉCUTÉ — push interdit sans autorisation explicite |
| Stripe Test après patch | NON EXÉCUTÉ — patch non déployé |
| Stripe Live audit/catalogue | NON EXÉCUTÉ — Gate A/D fermée, aucune clé Live utilisée |
| Navigateur après patch | NON EXÉCUTÉ — aucun déploiement autorisé |

## Preuve Stripe Test antérieure au patch

Checkout Test, retour sécurisé, activation de l’abonnement et ouverture du portail ont été observés. La page de résiliation a été atteinte mais la résiliation finale n’a pas été exécutée. La synchronisation d’une facture KJORA a échoué faute d’événement `invoice.paid`. Cette preuve est donc **PARTIELLE** et ne valide pas le nouveau code non déployé.

## Risques et décisions ouvertes

- Le SQL du lot doit être reconstruit et exécuté en CI éphémère avant Gate B.
- Le catalogue Live, taxes Stripe, politique de remboursement/rétractation, facture et juridiction exigent validation humaine/juridique.
- La concordance stricte montant/devise refuse volontairement taxes, proratas ou ajustements non prévus; leur activation nécessite un nouveau contrat serveur et des tests.
- Les advisors Supabase préexistants doivent faire l’objet d’un lot d’audit distinct; aucune correction globale n’est autorisée ici.
- Les messages transactionnels restent désactivés; aucune promesse d’email n’est faite.

## Gates

| Gate | Statut |
|---|---|
| Code local | PASS |
| Patch autonome | PASS — export depuis la base et application `git am --3way` vérifiée sur worktree propre |
| CI SQL éphémère | NON EXÉCUTÉ |
| Gate B — migration Supabase | BLOQUÉE PAR CI, NON AUTORISÉE |
| Gate A — secrets/catalogue Stripe Live | NON AUTORISÉE |
| Gate C — Hostinger/redeploy | NON AUTORISÉE |
| Gate D — action financière Live | NON AUTORISÉE |
| READY FOR COMMIT LOCAL | OUI |
| READY FOR PUSH/CI | OUI, APRÈS AUTORISATION EXPLICITE |
| READY FOR PAID PILOT | NON |
| READY FOR PUBLIC LIVE | NON |

## Confirmations

- Aucun push, merge, PR, déploiement, DNS ou mutation Supabase.
- Aucun Stripe Live, paiement réel, email, WhatsApp, Resend ou SASPAY.
- Aucun secret affiché, journalisé ou ajouté au dépôt.

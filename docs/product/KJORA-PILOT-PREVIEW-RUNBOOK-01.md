# KJORA — Runbook Preview du pilote 01

## Portée

Preview isolée uniquement. Ne pas modifier Production, DNS, fournisseurs Live ou données réelles. Les variables ci-dessous sont citées par leur nom seulement.

## Supabase Preview

1. Créer ou sélectionner une base éphémère sans données réelles.
2. Vérifier `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY` dans l'environnement Preview uniquement.
3. Rejouer les migrations depuis zéro, puis la suite pgTAP complète.
4. Créer des comptes de test distincts pour Owner gratuit/payant, collaborateur, locataire, partenaire et Admin ; ne jamais les écrire dans le dépôt.
5. Nettoyer les fixtures par leurs identifiants dédiés après les tests.

## Resend Preview

Variables : `RESEND_TRANSACTIONAL_API_KEY`, `KJORA_TRANSACTIONAL_EMAIL_FROM`, `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED`, `RESEND_WEBHOOK_SECRET`, `CRON_SECRET`.

- Commencer avec `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED` désactivé.
- Avant un test réel autorisé, vérifier domaine/destinataire, limites, idempotence et logs expurgés.
- Un dry-run ou une mise en file n'est jamais présenté comme une livraison.

## Stripe Test

Variables : `BILLING_PROVIDER_STRIPE_TEST_ENABLED`, `STRIPE_SANDBOX_SECRET_KEY`, `STRIPE_SANDBOX_WEBHOOK_SECRET`, `BILLING_KILL_SWITCH_STRIPE` et les six noms `STRIPE_TEST_PRICE_*_CAD` documentés dans `.env.example`.

- Exiger une clé `sk_test_`, des Price Test et un webhook Test.
- Conserver le kill switch disponible. Ne saisir aucune carte réelle et ne jamais activer le mode Live.

## WhatsApp désactivé

Variables réservées : `KJORA_WHATSAPP_PROVIDER`, `KJORA_WHATSAPP_ACCESS_TOKEN`, `KJORA_WHATSAPP_PHONE_NUMBER_ID`, `KJORA_WHATSAPP_WEBHOOK_SECRET`.

Pendant ce pilote, garder le provider désactivé et les secrets absents. Aucun message réel n'est nécessaire pour valider l'interface et les états de file.

## Gate et rollback

- PASS requis : tests Node, typecheck, lint, build Webpack, `git diff --check`, replay SQL et pgTAP dans la base isolée, matrice navigateur.
- En cas d'incident : désactiver communications/Stripe Test, arrêter la Preview, préserver les logs expurgés, nettoyer les fixtures et suivre le rollback de `KJORA-ROADMAP-LAUNCH.md`.
- Une validation locale ou Preview ne vaut jamais autorisation Production.

## Séquence supervisée OPERATIONS-03

### Testable maintenant, sans fournisseur

1. Ouvrir `/app/documents`, laisser le mois vide puis choisir explicitement un autre mois.
2. Vérifier devise unique, compteurs, absence de conversion et absence d'écriture avant/après.
3. Prévisualiser un brouillon, l'approuver ou le reporter; ne pas mettre en file si l'envoi est désactivé.
4. Ouvrir `/administration/operations` et vérifier les quatre états factuels. Une configuration complète sans preuve fournisseur reste `attention_required`.
5. Examiner les aperçus fictifs email/WhatsApp : aucun appel réseau, adresse ou numéro complet.
6. Parcourir candidature, suivi, connexion et tableau partenaire en FR et EN.

### Nécessite une configuration Preview externe

- Supabase Preview jetable pour replay SQL, pgTAP, concurrence et parcours authentifiés multi-rôles.
- Stripe Test pour confirmer Checkout, Portal, webhook signé et événements hors ordre.
- Domaine Resend vérifié, DNS SPF/DKIM/DMARC et destinataire de développement explicitement autorisé.
- Cron Preview avec secret dédié; un secret présent sans exécution observée ne vaut pas preuve opérationnelle.

### Différé

- WhatsApp/Meta reste `disabled`; aucun token ni numéro fournisseur n'est requis pour ce pilote.
- Les listes Admin partenaires (attributions, campagnes, récompenses, audit) attendent une RPC bornée dédiée.
- Production, Live, DNS, domaine personnalisé, paiement et communication réels attendent des autorisations séparées.

## Historique Supabase

`20261001090000_pilot_month_end_africa_preview.sql` est considéré aligné sur KJORA Dev et ne doit pas être modifié. Les écarts historiques antérieurs sont inventoriés seulement; aucun `db pull`, `db push`, `migration repair` ou `db reset` n'est autorisé par ce runbook.

## Validation supervisée du lot 04

1. Rejouer toutes les migrations sur une base jetable puis appliquer `20261002120000_pilot_resilience_whatsapp_manual_04.sql`; lancer toute la suite pgTAP.
2. Prouver les refus anon, cross-Organization, capability absente, consentement absent/retiré et document non approuvé. Seul l'événement append-only d'ouverture peut être ajouté.
3. Inspecter Cache Storage hors ligne : aucune page privée, API, PDF, contrat ou document.
4. Avec des fixtures, cliquer « Ouvrir WhatsApp », examiner `wa.me`, fermer sans envoyer; vérifier qu'aucun statut `sent/delivered/read` n'existe.
5. Changer le numéro et prouver la perte de `verified` et l'abandon de l'ancien destinataire.
6. Ne définir aucune variable Meta : l'adapter officiel reste `disabled`.

Rollback Preview seulement : révoquer les nouvelles RPC, supprimer trigger/table d'événements puis colonnes additives après conservation des preuves. Jamais sur Dev/Production sans mandat séparé.

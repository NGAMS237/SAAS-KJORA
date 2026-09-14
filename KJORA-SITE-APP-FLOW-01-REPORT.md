# KJORA — SITE-APP-FLOW-01.3 — Rapport de validation SQL et Preview

## Base, périmètre et sécurité

- Dépôt : `NGAMS237/SAAS-KJORA`.
- Branche : `codex/site-app-flow-01`.
- SHA de base : `5103bc1a71f1a4858121bc64c2f56e37151d9c70`.
- Projet Supabase de développement vérifié : `KJORA`
  (`alvheiwlfzuefljcfrtv`, région `eu-west-3`, PostgreSQL 17).
- EXPORT-01 est préservé. Aucun fichier Stripe ou SASPAY n’est modifié.
- Aucun `db reset`, force-push, merge, DNS, paiement, webhook externe ou
  changement Production n’est utilisé par ce lot.

## Sauvegarde avant migration

Les six tables de développement autorisées, leur structure utile, leurs
contraintes, politiques, grants et fonctions concernées ont été exportés sans
écrire de donnée en clair sur disque. Le contenu est protégé par Windows DPAPI
`CurrentUser` et ne peut être déchiffré que par le compte Windows autorisé.

- Chemin :
  `%LOCALAPPDATA%\Temp\kjora-backups\site-app-flow-01-3-20260912\pre-migration-snapshot.json.dpapi`
- Date UTC : `2026-09-12T12:27:57.9884338Z`.
- Taille : `98 774 octets`.
- SHA-256 :
  `B90F5FDBF3218561095A0452CF4115D764FF3FD526DA9EA4EEC8C9E834F538A9`.
- Test de déchiffrement et de structure, sous le compte Windows autorisé :
  **PASS**.

La procédure exacte est conservée hors Git et hors OneDrive dans le même
dossier temporaire (`RESTORE.md`, `restore-snapshot.ps1` et rollback SQL).
Elle déchiffre et construit la restauration en mémoire, puis transmet le SQL à
la CLI par l’entrée standard. La sauvegarde ne sera supprimée qu’après
validation complète et confirmation explicite de l’utilisateur.

## État Git/Supabase avant migration

L’inventaire distant contient 9 Organizations, 9 profils (tous CM/XAF),
9 plans, 11 memberships, 3 états d’onboarding et 1 abonnement gratuit XAF.
Seuls des agrégats non sensibles ont été journalisés. L’utilisateur confirme qu’il
s’agit de données de développement.

Les noms fonctionnels des migrations historiques correspondent largement,
mais plusieurs horodatages Git et distants diffèrent. Une migration distante
`align_01_advisor_fixes` n’a pas de fichier local correspondant; Git contient
également les corrections EXPORT-01 postérieures attendues. Par conséquent,
un `supabase db push` global est interdit pour ce lot. Si les gates éphémères
passent, seule la migration additive
`20260911210927_site_app_flow_canada_intent.sql` sera appliquée isolément.

Un point de sécurité préexistant et hors périmètre a été signalé séparément
pour revue; aucun détail exploitable n’est reproduit dans ce rapport public
à la branche privée. Ce lot ne le corrige pas et ne le présente pas comme une
régression SITE-APP-FLOW.

## Revue fonctionnelle et sécurité

- La devise immobilière reste `organization_profiles.currency_code`; aucune
  écriture du lot ne la remplace.
- Le pays Billing est validé côté serveur : `CA → CAD`, `CM → XAF`; aucune
  devise libre n’est acceptée depuis l’URL.
- Plan, cycle, pays, locale et source sont persistés. Une nouvelle intention
  valide remplace atomiquement l’ancienne; une entrée invalide ne l’efface pas.
- L’intention n’est jamais un entitlement et ne modifie pas le plan effectif.
- L’Organization provient du contexte serveur. La préparation exige
  `billing.manage` et sérialise la première création d’abonnement sur la ligne
  Organization.
- Les RPC sont `SECURITY DEFINER`, avec `search_path = ''`, références
  qualifiées, retrait de `PUBLIC`/`anon` et exécution par `authenticated`.
- Découverte reste gratuite et sans carte. Un marché d’abonnement payant
  existant ne change pas silencieusement.
- Le parcours commercial ajouté est entièrement FR/EN; aucune affirmation
  n’est faite sur un bilinguisme intégral de l’application historique.
- Décision de traçabilité : l’URL commerciale est une intention non fiable et
  ne confère aucun droit; la reprise exige une persistance contrôlée; le pays
  de facturation SaaS et la devise des biens restent distincts; le premier
  abonnement est sérialisé avant préparation Billing.

## Validation SQL éphémère

Une CI dédiée crée une pile Supabase locale PostgreSQL 17 sans secret distant,
applique toutes les migrations historiques sur une base neuve, injecte des
fixtures pré-migration, applique uniquement la migration Canada, puis vérifie :

- backfills CAD→CA et XAF→CM;
- refus CA/XAF et CM/CAD;
- grants, `anon`, `billing.manage` et isolation Organization;
- remplacement atomique, cycle annuel et reprise;
- Découverte Canada en CAD sans carte ni activation payante;
- maintien de la devise immobilière XAF;
- changement de marché payant soumis au support;
- concurrence sur la première préparation d’abonnement;
- présence et sécurité de la RPC EXPORT-01;
- suite pgTAP historique complète.

Résultat distant de cette CI : **FAIL** — [run 34756668352](https://github.com/NGAMS237/SAAS-KJORA/actions/runs/34756668352),
sur le commit `89257789871b9f0363312ed4918e7242a3def367`. Le démarrage de la
pile locale a appliqué les premières migrations, puis s’est arrêté sur
`20260826200000_lot_6a_domain_events_deny_policy.sql` avec SQLSTATE `42710` :
la politique `domain events are internal only` existe déjà, car la migration
historique `20260826190000_lot_6a_properties_units.sql` la crée aussi. Les
fixtures, la migration Canada, les tests pgTAP et le test de concurrence
n’ont pas été exécutés. Les erreurs temporaires de quota d’images Docker
observées au début ont été surmontées; elles ne sont pas la cause finale.
Les deux documents de contexte sont inchangés par rapport au SHA de base;
seuls les 28 autres fichiers ont été poussés.
Le projet KJORA n’est pas utilisé par cette CI.

## Réparation ciblée 01.3.1 — politique historique Lot 6A

Les définitions dans `20260826190000_lot_6a_properties_units.sql` et
`20260826200000_lot_6a_domain_events_deny_policy.sql` sont identiques :
table `private.domain_events`, politique permissive `FOR SELECT TO authenticated`,
`USING (false)`, sans `WITH CHECK` (non applicable au SELECT). Elles interdisent
la lecture directe des événements internes, en défense supplémentaire du schéma
privé non exposé et de l’absence de grant de table. La seconde migration ajoute
seulement un commentaire descriptif. Sa création est désormais gardée par une
vérification explicite dans `pg_catalog.pg_policy`; la première création reste
inchangée. Il s’agit uniquement d’une réparation de rejouabilité historique,
sans modification du projet Supabase distant. Le test pgTAP ajouté vérifie
qu’une reconstruction laisse exactement une politique avec le refus et la RLS.

La CI initiale 34756668352 reste FAIL avant la reconstruction.
La première nouvelle CI [34757570666](https://github.com/NGAMS237/SAAS-KJORA/actions/runs/34757570666)
sur `9ffb7d2829dbd5520452f1b497aa44d75f77e893` a validé la reconstruction
complète, les fixtures et l'application de la migration Canada. Son test pgTAP
Canada a échoué à 2/31, uniquement sur les assertions 9 et 10 qui comparaient
la sérialisation textuelle PostgreSQL de `proconfig` plutôt que sa valeur
`search_path=""`. Les assertions sont corrigées pour inspecter directement
les éléments du tableau de configuration, sans changer les fonctions. Le test
de concurrence et la suite pgTAP historique n'ont pas encore été lancés.
La CI suivante [34757838934](https://github.com/NGAMS237/SAAS-KJORA/actions/runs/34757838934)
sur `7406ccc03c2550aa81c7462dbc78c54063629765` confirme à nouveau
reconstruction, fixtures et migration Canada PASS, puis **31/31 pgTAP Canada
PASS**. Elle échoue au démarrage du script de concurrence : la fixture réinsère
`organization_plans`, déjà créé par le trigger de création d'Organization
(`organization_plans_pkey`), puis le teardown tente de supprimer le dernier
Owner (`last_owner_protected`). Le test n'a donc pas atteint ses huit requêtes
concurrentes. La fixture ne réinsère plus le forfait; les deux teardowns CI
désactivent ce trigger précis seulement durant une transaction locale de
suppression des données de test, puis le réactivent avant `COMMIT`. La protection
reste inchangée dans les migrations et dans toute base réelle.
Contrôles locaux de ce correctif CI : syntaxe Bash PASS via Git Bash;
`git diff --check` PASS; scan anti-secrets des seules lignes ajoutées PASS.
Le DSN `postgres/postgres` du script est une valeur factice locale préexistante,
pas une connexion au projet KJORA. La sauvegarde DPAPI reste présente hors Git.
La CI [34838042746](https://github.com/NGAMS237/SAAS-KJORA/actions/runs/34838042746)
sur `af5aca24e05e2c2a2e1499cd55001fd69eed7356` valide reconstruction,
fixtures, migration Canada, pgTAP Canada 31/31, huit appels concurrents et
nettoyage des fixtures. Le premier test de la suite historique échoue avant
assertions car il suppose qu'`auth.users` possède déjà une ligne; la base
éphémère propre n'en a aucune. Ce test historique crée désormais un utilisateur
fictif dans sa transaction uniquement si nécessaire; son `ROLLBACK` final
retire cette donnée. Aucune donnée métier réelle ni migration n'est modifiée.
Validation locale de la réparation : comparaison statique des deux instructions
de création et de la garde PASS (une création initiale, seconde conditionnelle);
TypeScript PASS; ESLint PASS (un avertissement préexistant); tests Node 424/424
PASS; build Webpack PASS, 69/69 pages statiques générées; `git diff --check`
PASS; scan anti-secrets du lot PASS. Le nouveau test pgTAP doit encore être
exécuté dans la CI SQL éphémère.

## Validations locales

- TypeScript : **PASS** — `npm run typecheck`, code 0.
- ESLint : **PASS** — code 0, aucune erreur; un avertissement préexistant dans
  `src/core/analytics/events.ts` (directive `no-console` inutilisée).
- Tests Node : **PASS — 424/424**, 0 échec, 0 ignoré.
- Build Next.js 16.3.4 Webpack : **PASS** — compilation, TypeScript et
  génération statique 69/69 réussis, code 0.
- `git diff --check` : **PASS**. Les avertissements LF/CRLF Windows ne sont pas
  des erreurs de diff.
- Contrôle anti-secrets : **PASS** — aucune signature de secret détectée.
- `.env.local`, `.vercel`, `node_modules`, `.next`, `supabase/.temp`, journaux
  et ZIP sont ignorés/non suivis. `.env.example` est un gabarit historique sans
  valeur secrète.
- Stripe/SASPAY : **PASS** — aucun fichier correspondant dans le diff.
- EXPORT-01 : **PASS statique et Node**.

## Inventaire du commit corrigé — 28 fichiers

### Modifiés — 16

- `.gitignore`
- `src/app/(internal)/app/billing/page.tsx`
- `src/app/api/billing/route.ts`
- `src/app/api/onboarding/route.ts`
- `src/app/connexion/page.tsx`
- `src/app/onboarding/organization/page.tsx`
- `src/app/page.tsx`
- `src/core/auth/callback-diagnostics.ts`
- `src/core/auth/login-form.tsx`
- `src/core/billing/billing-view.tsx`
- `src/core/billing/server.ts`
- `src/core/onboarding/onboarding-state.ts`
- `src/core/onboarding/plan-intent.ts`
- `src/core/organization/organization-onboarding-form.tsx`
- `src/core/routing/context-resolver.ts`
- `tests/align-02-routing-onboarding.test.ts`

### Ajoutés — 12

- `.github/ci/site-app-flow-cleanup.sql`
- `.github/ci/site-app-flow-concurrency.sh`
- `.github/ci/site-app-flow-pre-migration.sql`
- `.github/workflows/site-app-flow-ephemeral-sql.yml`
- `KJORA-SITE-APP-FLOW-01-REPORT.md`
- `docs/product/KJORA-SITE-APP-INTEGRATION-CONTRACT-v0.2.md`
- `src/core/onboarding/server.ts`
- `supabase/.gitignore`
- `supabase/config.toml`
- `supabase/migrations/20260911210927_site_app_flow_canada_intent.sql`
- `supabase/tests/database/site_app_flow_canada_intent.test.sql`
- `tests/site-app-flow-canada.test.ts`

## État des phases distantes

- Premier commit local `306a20154f75a68fc4965b032b94677cca2b7fc5`
  remplacé par un amendement excluant les deux documents de contexte.
- Commit corrigé et poussé sans force :
  `89257789871b9f0363312ed4918e7242a3def367` sur
  `origin/codex/site-app-flow-01`. Aucun merge vers `main`.
- CI SQL éphémère : FAIL avant les fixtures et avant la migration Canada;
  aucune CI n’est déclarée PASS.
- Le contrôle du commit local confirme qu'aucun fichier AppData, snapshot,
  script de restauration, rollback ou `RESTORE.md` n'y figure.
- Migration KJORA : non exécutée.
- Vérification SQL distante : non exécutée.
- Preview Vercel : non créée.
- Navigateur authentifié : non exécuté.
- Administration : aucune route `/administration` n’existe dans ce produit;
  le parcours Admin est donc non applicable, sauf environnement différent.

## Gates

HISTORICAL POLICY DEFINITIONS : IDENTIQUES

MIGRATION REPLAYABILITY FIX : PASS — garde PostgreSQL et CI de reconstruction

EPHEMERAL FULL REBUILD : PASS — runs 34757570666 et 34757838934

CANADA MIGRATION IN CI : PASS — runs 34757570666 et 34757838934 après fixtures

PGTAP : PASS Canada 31/31; suite historique FAIL au premier test (fixture absente), correctif en attente de CI

CONCURRENCY TEST : PASS — run 34838042746, huit appels concurrents

READY FOR KJORA DEV MIGRATION : NON

BACKUP : PASS

EPHEMERAL SQL TESTS : FAIL — pile bloquée par migration historique; assertions non exécutées

LOCAL VALIDATIONS : PASS

COMMIT : 89257789871b9f0363312ed4918e7242a3def367

PUSH : PASS — branche dédiée, sans force

KJORA SUPABASE MIGRATION : NON EXÉCUTÉ

REMOTE SQL VERIFICATION : NON EXÉCUTÉ

VERCEL PREVIEW : NON CRÉÉE

BROWSER OWNER FLOW : NON EXÉCUTÉ

BROWSER ADMIN FLOW : NON APPLICABLE

READY FOR USER TESTING : NON

READY FOR PRODUCTION : NON

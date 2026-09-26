# ADMIN-BILLING-OPS-01 — Admin utile pour vendre

**Statut : implémentation locale terminée, validée, NON déployée. En attente d'autorisation de Blaise avant tout commit/push/migration distante.**

---

## 1. Contexte et objectif

Ce lot donne à Blaise un moyen manuel, sécurisé et traçable d'administrer la
situation commerciale des premières Organizations payantes depuis la console
`/administration` : ouvrir la fiche d'une Organization, comprendre sa
situation, activer temporairement ou manuellement un forfait, offrir un
forfait à un partenaire/promoteur, enregistrer un paiement reçu hors Stripe,
voir l'échéance de l'avantage, et conserver un historique complet de chaque
intervention.

Le périmètre est volontairement limité à ce qui est nécessaire pour
administrer les premiers clients payants : pas de suppression, pas
d'archivage, pas de changement Stripe direct, pas de remboursement, pas
d'email automatique, pas de newsletter/parrainage/graphiques avancés/support
dans ce lot.

## 2. Modèle choisi — quatre sources de vérité, jamais confondues

| Source | Table | Rôle | Écrite par ce lot ? |
|---|---|---|---|
| Abonnement **réellement** enregistré | `organization_subscriptions` (ALIGN-03) | Vérité de facturation réelle ; seule table qu'un futur provider automatisé (Stripe/Mobile Money) pilotera | **Jamais** |
| Forfait **effectif** (entitlements) | `organization_plans` (ALIGN-01) | Droits d'accès réels d'une Organization | Oui, via la fonction déjà existante `private.assign_organization_plan(...)` — jamais par écriture directe |
| Avantage commercial **temporaire** | `public.commercial_interventions` (**nouvelle table**) | Cadeau, paiement hors ligne, promotion, partenariat, correction commerciale | Oui — seule nouvelle table de ce lot |
| Trace de chaque action | `public.billing_events` (ALIGN-03, réutilisé) | Audit, déjà lu par la console (`admin_recent_events`) | Oui — événements `admin_commercial_*` |

**Pourquoi `commercial_interventions` et pas une deuxième table d'audit ni
`administrative_audit_log`** : cette dernière table (Lot 5C) est strictement
tenant-scopée — sa RLS est conditionnée à `private.has_capability(...,
'audit.view')`, donc au rôle Owner d'une Organization, et sa contrainte
`action` est fermée sur des actions de gestion de membres. La réutiliser
aurait fait dépendre une action platform_admin du modèle RBAC par
Organization — ce que le mandat interdit explicitement (« aucun droit
administratif ne dépend du rôle Owner »). `billing_events` est déjà lue par
`admin_recent_events` (ADMIN-01) et accepte n'importe quel `event_type` : y
ajouter un préfixe `admin_commercial_*` évite d'inventer une seconde table
d'audit.

**Garantie de non-confusion, par construction :**
- Un forfait offert n'écrit **jamais** dans `organization_subscriptions` →
  il ne peut donc jamais apparaître comme un paiement Stripe réussi.
- La table `commercial_interventions` ne porte **pas de colonne `provider`
  du tout** → un paiement hors ligne ne peut structurellement jamais valoir
  `provider = 'stripe'`.
- À l'expiration ou à la révocation, le forfait effectif normal est
  recalculé comme `coalesce(organization_subscriptions.plan, 'decouverte')`
  — exactement ce qu'implique la facturation réelle, sans mémoriser un
  instantané séparé du forfait précédent (donnée dupliquée et potentiellement
  périmée). Aucune ligne n'est jamais supprimée : le statut passe à
  `expired`/`revoked`, l'historique reste intégral.
- Une incohérence forfait effectif / abonnement enregistré n'est signalée
  que si **rien** ne l'explique (pas d'intervention manuelle active) — un
  écart expliqué par un cadeau actif est normal et voulu, jamais présenté
  comme une anomalie.

## 3. Nouvelles tables

### `public.commercial_interventions`
Une seule ligne par intervention, jamais supprimée. Colonnes clés :
`intervention_type` (`complimentary`/`offline_payment`/`promotion`/`partnership`/
`support_adjustment`), `reason_code` (liste fermée), `admin_note` (obligatoire,
3–1000 caractères), `granted_plan` (`decouverte`/`essentiel`/`avance`/`patrimoine`
— **`sur_mesure` volontairement exclu**, un Sur mesure restant un devis
commercial validé ailleurs, jamais un octroi manuel improvisé), `starts_on`,
`ends_on`, `currency`/`amount_minor`/`manual_reference` (uniquement pour
`offline_payment`), `status` (`active`/`expired`/`revoked`), `created_by`,
`revoked_at`/`revoked_by`/`revoke_reason`, `extended_at`/`extension_count`,
`idempotency_key`.

Contraintes SQL (défense en profondeur, pas seulement applicative) :
- date de fin obligatoire pour `complimentary`/`promotion`/`partnership` ;
- devise + montant positif obligatoires, et uniquement pour `offline_payment` ;
- aucune donnée de montant/devise/référence pour les autres types ;
- une révocation exige toujours horodatage + acteur + motif ;
- jeton d'idempotence unique par Organization.

RLS activée, **zéro policy** (même posture que `platform_admins` en ADMIN-01) :
`revoke all on public.commercial_interventions from anon, authenticated;` —
aucun accès direct, même en lecture, même pour un platform_admin. Tout passe
par les RPC ci-dessous.

## 4. Nouvelles RPC (6)

Toutes `security definer`, `set search_path = ''`, révoquées de `public`/`anon`,
accordées uniquement à `authenticated`. Chacune appelle
`private.assert_platform_admin()` en première ligne, sans branche
conditionnelle ni égard au rôle du membre courant (aucune dépendance au rôle
Owner ni à une capacité RBAC de tenant).

1. **`admin_get_organization_detail(target_organization_id)`** — fiche complète
   en lecture seule. Renvoie `{found:false}` pour un identifiant inexistant
   (jamais d'exception). Calcule `effectivelyExpired` à la lecture (l'avantage
   peut être encore `active` en base mais déjà échu) et `planBillingMismatch`
   (uniquement si aucune intervention active ne l'explique).
2. **`admin_grant_commercial_intervention(...)`** — « Accorder un forfait ».
   Verrouille la ligne Organization (`for update`), valide type/forfait/motif/
   note/dates, exige une date de fin pour les 3 types concernés, exige
   devise+montant positifs pour `offline_payment` (le serveur **décide seul**
   des valeurs retenues — jamais celles du client au-delà de ce que le type
   autorise), refuse une seconde intervention active, gère l'idempotence
   (rejeu du même jeton → `already_recorded`, jamais une seconde ligne), écrit
   l'intervention + appelle `private.assign_organization_plan` + écrit l'audit
   `billing_events`, le tout dans la même transaction PL/pgSQL.
3. **`admin_revoke_commercial_intervention(...)`** — « Révoquer l'avantage ».
   Exige un motif, ne supprime jamais la ligne (passe à `revoked`), idempotent
   sur une intervention déjà inactive (`not_active`), restaure le forfait
   effectif calculé à partir de l'abonnement réellement enregistré.
4. **`admin_extend_commercial_intervention(...)`** — « Prolonger ». Exige un
   motif et une nouvelle date de fin strictement postérieure à l'actuelle,
   conserve l'historique (`extension_count`).
5. **`admin_reconcile_expired_interventions()`** — maintenance, idempotente,
   fait passer `active` → `expired` pour toute intervention dont `ends_on` est
   dépassée et restaure le forfait effectif. **Prête à l'emploi mais non
   câblée** sur un cron (voir §9, risques).
6. **`admin_commercial_intervention_counters()`** — compteurs pour la vue
   d'ensemble (Étape 7).

## 5. Page fiche Organization

Route `/administration/organizations/[organizationId]`, protégée par le même
layout `platform_admin` que le reste de la console (aucune garde locale
ajoutée — double barrière déjà assurée par le layout + les RPC elles-mêmes).
Affiche : nom, statut, date de création, propriétaire principal et son
courriel (**uniquement sur cette page sécurisée, jamais dans la liste**),
nombre de membres actifs/propriétés/unités, forfait effectif, abonnement
enregistré (cycle, devise, statut, fournisseur générique seulement),
avantage manuel actif avec échéance, avertissement d'incohérence si non
expliquée, historique administratif récent (20 derniers événements
`admin_commercial_*`). Le nom d'Organization dans la liste `/administration/
organizations` est désormais un lien vers cette fiche.

N'expose jamais : référence fournisseur complète, moyen de paiement, secret,
jeton, contenu brut de webhook, rôle de service, ni aucune donnée d'une autre
Organization.

## 6. Actions (Étape 4)

- **Accorder un forfait** : formulaire (type, forfait, motif normalisé, note
  obligatoire, dates, devise+montant+référence uniquement pour paiement hors
  ligne) → résumé clair avant validation → case à cocher de confirmation
  explicite obligatoire (bouton de validation désactivé tant qu'elle n'est
  pas cochée).
- **Révoquer l'avantage** : uniquement si une intervention est active, motif
  obligatoire, même confirmation explicite, ne supprime jamais la ligne.
- **Prolonger** : nouvelle date de fin, motif obligatoire, historique
  conservé (compteur de prolongations).

Pas de suppression, archivage, changement Stripe direct, remboursement ni
email automatique ajoutés — conformément au mandat.

## 7. Audit

Chaque mutation écrit une ligne `billing_events` (`event_type` préfixé
`admin_commercial_*`) dans la **même transaction** que la mutation elle-même
— jamais dans un second appel séparé. Contient acteur, Organization ciblée,
action, état avant/après utile, motif, horodatage, identifiant d'intervention.
Aucune donnée sensible de paiement n'y transite. Visible sur la fiche
Organization (section « Historique »).

## 8. Compteurs (Étape 7)

Ajoutés à la vue d'ensemble (`/administration`), coût faible (une RPC de
comptage supplémentaire) : interventions actives, gratuités actives
(cadeau/promotion/partenariat confondus), paiements hors ligne actifs,
interventions expirant sous 30 jours. Pas de graphique dans ce lot.

## 9. Gestion de l'expiration

Double mécanisme volontairement simple :
- **Lecture immédiate** : `admin_get_organization_detail` calcule
  `effectivelyExpired` à chaque lecture (`ends_on < current_date`), donc la
  fiche affiche toujours l'état réel, même si la réconciliation physique n'est
  pas encore passée.
- **Réconciliation physique** : `admin_reconcile_expired_interventions()`
  fait passer `active` → `expired` et restaure le forfait effectif. **Cette
  RPC n'est PAS câblée sur un cron Vercel dans ce lot** — le câbler serait une
  modification de déploiement, hors du périmètre autorisé pour ce lot (aucun
  changement Vercel n'est permis avant l'autorisation de Blaise). Elle est
  prête à être appelée par un cron existant ou manuellement par un
  platform_admin dès que le déploiement sera autorisé à évoluer.

## 10. Sécurité (Étape 5/6)

- Chaque RPC : `perform private.assert_platform_admin();` en première ligne,
  `set search_path = ''`, aucun droit `anon`/`public`.
- Chaque Server Action revérifie `is_platform_admin_self()` côté application
  **avant** tout appel RPC (double barrière), et ne relaie jamais
  `error.message` (potentiellement un détail SQL) au client — seul le code
  Postgres (`42501`) distingue un refus d'un échec.
- Idempotence : jeton unique par Organization, contrainte SQL +
  lookup-before-insert.
- Concurrence : verrou de ligne (`for update`) sur l'Organization ciblée pour
  chaque mutation.
- Aucune SQL dynamique (`EXECUTE format(...)` etc.) dans les 6 RPC.
- Aucune colonne de moyen de paiement ni de référence fournisseur
  sélectionnée (vérifié par test — voir §12).

## 11. Fichiers modifiés / créés

**Nouveaux :**
- `supabase/migrations/20260926120000_admin_billing_ops_01_commercial_interventions.sql`
- `src/app/administration/organizations/[organizationId]/page.tsx`
- `src/modules/platform-admin/commercial-ops-actions.ts`
- `tests/admin-billing-ops-01.test.ts`

**Modifiés :**
- `src/modules/platform-admin/server.ts` (+172 lignes — types + lecture RPC)
- `src/modules/platform-admin/views.tsx` (+631/-4 lignes — fiche Organization,
  dialogues de confirmation, formulaires, compteurs)
- `src/modules/platform-admin/copy.ts` (+287 lignes — dictionnaire bilingue)
- `src/app/globals.css` (+76 lignes — classes de la fiche Organization et des
  dialogues de confirmation)
- `src/app/administration/page.tsx` (+10/-4 lignes — compteurs d'interventions)

**Non touchés par ce lot** (divergence de fin de ligne CRLF/LF pré-existante,
zéro différence de contenu avec `--ignore-all-space`, constatée mais non
corrigée pour rester strictement dans le périmètre du mandat) :
`supabase/tests/database/rls_admin_01_1_ux_quick_wins.test.sql`,
`supabase/tests/database/rls_admin_01_platform_admin.test.sql`.

## 12. Tests exécutés

### Node/TypeScript — `tests/admin-billing-ops-01.test.ts`
**44/44 tests passés.** Convention identique à `admin-01-platform-console
.test.ts` (invariants de source sur le SQL/TS livré + comportement exécuté),
couvrant : garde `assert_platform_admin` sur les 6 RPC, `search_path` figé,
absence de droit `anon`, absence de SQL dynamique, indépendance vis-à-vis du
rôle Owner, distinction gratuité/paiement/abonnement réel, contraintes de
date de fin et de montant par type, exclusion de `sur_mesure`, non-suppression
à la révocation, idempotence et verrouillage de concurrence, refus explicite
d'une Organization inexistante, audit dans la même transaction, absence de
confiance dans les valeurs client, isolation inter-Organizations, absence de
fuite de moyen de paiement (couche SQL et TypeScript), double barrière des
Server Actions, lien de navigation depuis la liste, formulaires (date de fin
conditionnelle, champs paiement hors ligne conditionnels, case de confirmation
obligatoire), états vides et incohérence, libellés bilingues complets
(types/motifs/événements/outcomes), non-régression du layout ADMIN-01 et de
l'absence de garde dupliquée sur la nouvelle page.

Régression complète : les **539 tests** du dépôt (toutes suites confondues)
passent après ce lot, exécutés via `npm ci` puis `node --test` dans une copie
isolée du worktree (contournement de l'instabilité `EINVAL` déjà documentée
du montage OneDrive pour `npm test`/`npm run build`).

### pgTAP — **NON EXÉCUTÉ**
Aucun Supabase éphémère (Docker/Podman) n'est disponible dans ce bac à sable
(déjà confirmé lors du correctif IMPORT-01 de cette même session : `npx
supabase start` échoue faute de moteur de conteneurs). Conformément à
l'instruction du mandat de ne jamais déclarer un PASS pgTAP non réellement
exécuté, aucune suite `.test.sql` n'a été écrite pour ce lot à ce stade — la
liste complète exigée par l'Étape 8 (platform_admin autorisé ; Owner/
collaborateur/locataire/anonyme refusés ; Organization inexistante refusée ;
type/période invalides refusés ; date de fin requise par type ; montant/devise
requis pour paiement hors ligne ; double soumission idempotente ; audit dans
la même transaction ; révocation non destructive ; absence de fuite
inter-Organizations ; absence d'exposition directe de table ; cadeau distinct
d'un paiement ; paiement hors ligne distinct de Stripe ; expiration
correctement interprétée ; non-régression ADMIN-01/ADMIN-01.1) est
**documentée ici comme restant à écrire et à exécuter contre un Supabase
éphémère réel**, dès qu'un tel environnement sera disponible (CI GitHub
Actions existante, ou poste de Blaise). C'est la seule case du mandat non
entièrement remplie à ce stade, et elle est signalée explicitement plutôt que
maquillée.

## 13. Validation gate (locale)

| Commande | Résultat |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS** — 0 erreur (après correction d'un rétrécissement de type `detail` dans 2 gestionnaires de fermeture) |
| `npm run lint` (`eslint .`) | **PASS** — 0 erreur (après déplacement de l'ouverture/fermeture de `<dialog>` d'un accès pendant le rendu vers un `useEffect`, règle `react-hooks/refs`) |
| `npm test` (`node --test`) | **PASS** — 539/539 |
| `npx next build --webpack` | **PASS** — build de production complet, nouvelle route `/administration/organizations/[organizationId]` listée comme dynamique (ƒ) |
| `git diff --check` (fichiers de ce lot) | **PASS** — 0 erreur d'espace/fin de ligne |
| Recherche de secrets (`service_role`, `SUPABASE_SERVICE`, `sk_live`, `sk_test`, clé privée) | **PASS** — aucune occurrence dans les fichiers de ce lot |

Toutes les commandes ont été exécutées dans une copie temporaire du worktree
(`/tmp`, `npm ci` complet) plutôt que directement sur le chemin monté
OneDrive, en raison de l'instabilité `EINVAL` déjà documentée de ce montage
pour `npm test`/`npm run build` — méthode identique à celle utilisée pour le
correctif IMPORT-01 de cette même session.

## 14. Risques et limites connus

- **pgTAP non exécuté** (voir §12) — seule case non entièrement remplie.
- **Réconciliation d'expiration non câblée sur un cron** — la RPC existe et
  est idempotente, mais son câblage sur un déclencheur périodique est un
  changement de déploiement explicitement hors périmètre de ce lot. Tant
  qu'elle n'est pas câblée, une intervention expirée reste correcte à
  l'affichage (calcul en lecture) mais n'est physiquement révisée que lors
  d'un appel manuel ou d'un futur câblage.
- **`sur_mesure` exclu des octrois manuels** par choix délibéré (documenté en
  commentaire de migration) : un Sur mesure reste un devis commercial validé
  ailleurs, jamais un octroi manuel improvisé depuis cette console. Si Blaise
  souhaite un jour l'autoriser, cela nécessite une décision explicite (pas un
  simple retrait de contrainte).
- **Décalage de fin de ligne CRLF/LF pré-existant** sur deux fichiers pgTAP
  non liés à ce lot (voir §11) — constaté, non modifié, sans impact sur ce
  lot.

## 15. Procédure de rollback

Ce lot est entièrement additif et n'a encore rien été appliqué nulle part :
- **Local (non commité)** : `git checkout -- .` puis `git clean -fd` dans le
  worktree annule l'intégralité des changements de fichiers de travail listés
  au §11 sans aucun risque, puisque rien n'a été commité.
- **Si un jour commité puis appliqué sur KJORA Dev** : la migration étant
  strictement additive (aucune table/colonne/policy existante modifiée ou
  supprimée), un rollback consiste à supprimer la table
  `commercial_interventions` et les 6 fonctions créées par cette migration
  (`drop table`/`drop function`), sans toucher à `organization_subscriptions`,
  `organization_plans` ni `billing_events` (dont seules de nouvelles lignes
  `admin_commercial_*` auraient été ajoutées — elles peuvent être supprimées
  par un simple `delete where event_type like 'admin_commercial_%'` si
  souhaité, sans effet sur l'historique ADMIN-01 existant).

## 16. Étapes nécessaires avant application sur KJORA Dev

1. Autorisation explicite de Blaise (point d'arrêt de ce mandat).
2. Écrire et exécuter la suite pgTAP complète contre un Supabase éphémère réel
   (CI GitHub Actions existante), avant toute application sur KJORA Dev.
3. Appliquer la migration sur KJORA Dev (jamais en Production directement).
4. Décider si/quand câbler `admin_reconcile_expired_interventions()` sur un
   déclencheur périodique (changement de déploiement Vercel séparé).
5. Vérification manuelle en conditions réelles par Blaise (accorder/prolonger/
   révoquer un forfait de test, confirmer l'absence de fuite visuelle de
   données sensibles).

---

## RAPPORT FINAL

- **BASE SHA** : `86db16101ec206d74e3d55f1df261521c637de04` (tip de
  `claude/admin-01-secure-base`, incluant le correctif IMPORT-01 déjà commité
  et poussé plus tôt dans cette session ; ce SHA diffère du commit
  `73ba79f18c9b76addf09a87d1399468cf173f2f7` initialement cité par le mandat,
  celui-ci ayant été dépassé entretemps par ce correctif sur la même branche
  base — signalé ici par transparence)
- **BRANCH** : `claude/admin-billing-ops-01` (créée localement depuis la base
  ci-dessus ; aucun commit n'y a encore été fait — tous les changements sont
  actuellement non commités dans le répertoire de travail)
- **MODEL CHOISI** : quatre sources de vérité distinctes — abonnement réel
  (`organization_subscriptions`, jamais écrit), forfait effectif
  (`organization_plans`, seul champ modifié, via la fonction existante),
  avantage commercial temporaire (nouvelle table `commercial_interventions`),
  audit (`billing_events` réutilisé, préfixe `admin_commercial_*`)
- **NOUVELLES TABLES** : `public.commercial_interventions` (1)
- **NOUVELLES RPC** : `admin_get_organization_detail`,
  `admin_grant_commercial_intervention`,
  `admin_revoke_commercial_intervention`,
  `admin_extend_commercial_intervention`,
  `admin_reconcile_expired_interventions`,
  `admin_commercial_intervention_counters` (6)
- **PAGE FICHE ORGANIZATION** : `/administration/organizations/[organizationId]`
  — créée, protégée par le layout `platform_admin` existant, liée depuis la
  liste des Organizations
- **OCTROI MANUEL** : implémenté (« Accorder un forfait »), résumé + case de
  confirmation explicite obligatoire, serveur seul décideur des valeurs
  retenues
- **PAIEMENT HORS LIGNE** : implémenté, devise+montant+référence optionnelle,
  structurellement jamais `provider = 'stripe'` (colonne absente)
- **GESTION DE L'EXPIRATION** : calcul en lecture (`effectivelyExpired`) +
  RPC de réconciliation idempotente prête mais non câblée sur un cron (hors
  périmètre déploiement de ce lot)
- **RÉVOCATION** : implémentée, non destructive, motif obligatoire,
  restauration du forfait effectif normal
- **AUDIT** : événements `billing_events` (`admin_commercial_*`) écrits dans
  la même transaction que chaque mutation
- **SÉCURITÉ** : `assert_platform_admin()` sur les 6 RPC, `search_path` figé,
  aucun droit `anon`, double barrière Server Action + RPC, idempotence,
  verrouillage de ligne, aucune SQL dynamique
- **TESTS NODE** : 44/44 (nouveau fichier) + 539/539 (suite complète du dépôt)
  — **PASS**
- **TESTS PGTAP** : **NON EXÉCUTÉ** (aucun Supabase éphémère disponible dans
  ce bac à sable) — reste à écrire et exécuter avant application sur KJORA Dev
- **TYPECHECK** : **PASS**
- **LINT** : **PASS**
- **BUILD** : **PASS** (`npx next build --webpack`)
- **FICHIERS MODIFIÉS** : `src/modules/platform-admin/server.ts`,
  `src/modules/platform-admin/views.tsx`, `src/modules/platform-admin/copy.ts`,
  `src/app/globals.css`, `src/app/administration/page.tsx`
- **FICHIERS CRÉÉS** :
  `supabase/migrations/20260926120000_admin_billing_ops_01_commercial_interventions.sql`,
  `src/app/administration/organizations/[organizationId]/page.tsx`,
  `src/modules/platform-admin/commercial-ops-actions.ts`,
  `tests/admin-billing-ops-01.test.ts`
- **MIGRATIONS CRÉÉES** :
  `20260926120000_admin_billing_ops_01_commercial_interventions.sql` (1,
  additive, non appliquée)
- **PRODUCTION MODIFIÉE** : NON
- **SUPABASE DEV MODIFIÉ** : NON
- **READY FOR REVIEW** : **OUI**
- **PROCHAINE AUTORISATION REQUISE** : autorisation explicite de Blaise pour
  (a) committer et pousser cette branche, (b) écrire/exécuter la suite pgTAP
  contre un Supabase éphémère, (c) appliquer la migration sur KJORA Dev,
  (d) décider du câblage du cron de réconciliation d'expiration.

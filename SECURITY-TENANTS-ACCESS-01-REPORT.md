# KJORA — SECURITY-TENANTS-ACCESS-01 — Rapport assaini

Date du contrôle : 2026-09-16

Dépôt : `NGAMS237/SAAS-KJORA`

Branche : `codex/security-tenants-access-01`
SHA de base propre : `827e75ede90df366581bffeccf7445fc0620c5ba`

## Clôture préalable

Le rapport SITE-APP-FLOW-01 a été assaini, committé puis poussé sans force sur
`codex/site-app-flow-01`. SHA obtenu :
`827e75ede90df366581bffeccf7445fc0620c5ba`.

Au moment de cette clôture, un seul fichier était encore modifié localement,
et non les sept annoncés dans le contexte initial : le rapport du lot. Aucun
changement sans rapport n'a été inclus.

## Audit

La cause racine est la migration historique
`20260910120000_fix_tenants_select_grant.sql`. Elle a accordé au rôle
`authenticated` un droit de lecture au niveau de la table entière. En
PostgreSQL, ce droit rend inopérante la frontière antérieure qui limitait la
lecture directe à une projection de cinq colonnes non privées.

La politique RLS historique reste utile et correctement bornée à
l'Organization et à la capability `tenant.view`, mais elle contrôle les lignes,
pas les colonnes d'une ligne autorisée. La fuite ne provient donc ni d'une vue,
ni d'une RPC, ni d'un défaut d'isolation inter-Organization : elle résulte du
grant global ajouté pour réparer un lecteur applicatif.

Catégories privées concernées : coordonnées, profil professionnel, métadonnées
d'identité et notes internes. Aucune valeur privée n'est reproduite ici.

### Consommateurs inventoriés

- Les listes de biens, logements, locations et paiements lisent seulement
  l'identifiant et le nom d'affichage ; le grant par colonnes initial leur suffit.
- Le détail et la liste des locataires utilisent déjà des RPC bornées par
  `tenant.view` / `tenant.manage`.
- Documents financiers avait besoin d'une adresse de contact pour la préparation
  d'un partage ; ce lecteur est déplacé vers une projection `receipt.share`
  limitée aux locataires effectivement affichés (maximum 200).
- Import avait besoin du nom et des coordonnées pour la détection des doublons ;
  ce lecteur est déplacé vers une projection `data_import.manage`, limitée à
  l'Organization active et à 5 000 lignes.
- Export avait besoin des champs explicitement inclus dans l'export demandé ;
  ce lecteur est déplacé vers une projection `data_export.manage` qui revérifie
  aussi l'entitlement `exports_standard`.
- Le portail locataire continue d'utiliser ses RPC et scopes dédiés. Il ne reçoit
  aucun accès administratif direct.
- Les fonctions SQL historiques qui lisent la table sont des traitements internes
  ou des RPC `SECURITY DEFINER` avec contrôles de capability/portail ; aucune vue
  exposant les catégories privées n'a été trouvée.
- Aucun rôle ou parcours applicatif `platform_admin` n'est implémenté dans ce
  dépôt. Aucun accès direct de ce type n'a donc été ajouté ou simulé. Une future
  administration devra passer par un service serveur séparé et testé.
- `service_role` reste réservé aux traitements serveur explicitement autorisés ;
  aucun jeton de service n'est présent dans le code navigateur ou dans ce lot.

## Correction préparée

Une migration additive, sans modification des migrations historiques, retire le
grant de table et restaure la projection directe non privée. Trois RPC
spécialisées remplacent les lecteurs légitimes. Elles utilisent des références
qualifiées, `SECURITY DEFINER`, `search_path = ''`, des contrôles de capability
et d'Organization, et retirent l'exécution à `PUBLIC` et `anon`.

La politique RLS existante n'est ni supprimée ni élargie. Aucun droit n'est
accordé au portail locataire. Aucune migration n'a été appliquée à Supabase
KJORA.

## Fichiers du lot

- `.github/workflows/site-app-flow-ephemeral-sql.yml`
- `src/modules/documents/server.ts`
- `src/modules/data-import/server.ts`
- `src/modules/data-export/server.ts`
- `supabase/migrations/20260914120000_security_tenants_access_01.sql`
- `supabase/tests/database/security_tenants_access.test.sql`
- `tests/security-tenants-access.test.ts`
- `SECURITY-TENANTS-ACCESS-01-REPORT.md`

## Tests et validations

| Contrôle | Résultat |
| --- | --- |
| TypeScript | PASS |
| ESLint | PASS, 0 erreur ; 1 avertissement antérieur hors lot |
| Tests Node | PASS, 430/430 |
| Build Next.js Webpack | PASS, 69/69 pages générées |
| `git diff --check` | PASS |
| Test statique du plan pgTAP | PASS, 24 assertions déclarées / 24 présentes |
| Tests pgTAP du nouveau lot | NON EXÉCUTÉS |
| Reconstruction Supabase éphémère | NON EXÉCUTÉE |
| Régression Canada 31/31 | NON EXÉCUTÉE sur ce correctif |
| Test de concurrence | NON EXÉCUTÉ sur ce correctif |
| Régression EXPORT-01 SQL | NON EXÉCUTÉE sur ce correctif |

La machine ne dispose ni de Docker, ni de PostgreSQL/`psql`, ni d'une copie
locale du CLI Supabase. Le téléchargement du CLI n'apporterait pas le moteur
Docker requis. Blaise a donc autorisé le 2026-09-16 un commit et un push de
validation strictement limités à cette branche, afin de déclencher la pile
Supabase éphémère. Les verdicts SQL restent négatifs tant que cette CI n'est pas
réellement terminée avec succès.

Le test SQL préparé couvre le refus `anon`, l'absence de grant global, le refus
des colonnes privées, les projections Owner/collaborateur, l'isolation entre
Organizations, le portail, les RPC historiques et `service_role`. Le workflow
est prêt à exécuter la reconstruction complète, les tests Canada, la concurrence
et la suite historique dès qu'un mécanisme de validation éphémère autorisé peut
recevoir la branche.

## Contrôles de périmètre

- Aucun fichier Stripe ou SASPAY modifié.
- Aucun fichier `.env*`, `.next`, `.vercel`, archive, journal, snapshot ou script
  de restauration ajouté au lot.
- La sauvegarde DPAPI reste hors Git, hors OneDrive et n'a pas été lue, déplacée
  ou supprimée.
- Aucun secret ou motif de clé détecté dans le diff du lot.
- Aucun merge, aucune Preview, aucun DNS et aucune Production.

## Verdict

ROOT CAUSE : IDENTIFIÉE

DIRECT PRIVATE COLUMN ACCESS : NON BLOQUÉ — correction écrite mais SQL non exécuté

LEGITIMATE APP FLOWS : FAIL — validation SQL éphémère manquante

CROSS-TENANT ISOLATION : FAIL — nouveau test préparé mais non exécuté

FULL EPHEMERAL REBUILD : FAIL

PGTAP : FAIL

CANADA FLOW REGRESSION : FAIL

LOCAL VALIDATIONS : PASS

READY FOR CODEX REVIEW : OUI

READY FOR REMOTE SECURITY MIGRATION : NON

READY FOR KJORA DEV MIGRATION : NON

## Prochain gate réel

Committer et pousser sans force les huit fichiers autorisés, attendre la CI
complète, puis consigner ses résultats exacts. Aucun merge et aucune migration
distante ne sont autorisés.

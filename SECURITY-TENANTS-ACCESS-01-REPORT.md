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
| Tests Node | PASS, 431/431 |
| Build Next.js Webpack | PASS, 69/69 pages générées |
| `git diff --check` | PASS |
| Test statique du plan pgTAP | PASS, 24 assertions déclarées / 24 présentes |
| Tests pgTAP du nouveau lot | PASS, 24/24 |
| Suite pgTAP hors Canada | PASS, 735/735 |
| Reconstruction Supabase éphémère | PASS |
| Régression Canada | PASS, 31/31 |
| Test de concurrence | PASS |
| Régression EXPORT-01 | PASS |

### CI éphémère

- Run `35091461329` : FAIL.
- Validations applicatives : PASS.
- Reconstruction complète, fixtures pré-migration et migration Canada : PASS.
- Tests Canada et contrôle d'accès : PASS.
- Test de concurrence : PASS.
- Suite historique exécutée jusqu'au nouveau test : 711 assertions historiques
  PASS avant l'arrêt.
- Test sécurité : arrêt après 7/24 assertions, sans assertion en échec. La fixture
  tentait d'insérer un plan déjà initialisé automatiquement par le parcours
  Canada. Correction : rendre cette préparation compatible avec le plan existant
  au moyen d'un upsert explicite. Il s'agit d'une correction de fixture ; la
  migration de sécurité n'a pas échoué.

- Run `35092385349` : PASS. Cette exécution a validé 430/430 tests Node,
  la reconstruction complète, Canada 31/31, la concurrence, 711 assertions
  historiques et les 24/24 assertions du lot de sécurité.
- Run final `35093246107` : PASS sur le SHA
  `1cb48077c6fc1c66bcb52a6378dbcf129638a21c`.
- Le run final ajoute une preuve applicative explicite : aucun chemin direct
  `platform_admin` n'existe dans la base ou le navigateur, et les deux usages de
  clé privilégiée existants restent confinés à des routes serveur. Il valide
  431/431 tests Node, Canada 31/31 et 735/735 assertions pgTAP hors Canada,
  dont SECURITY-TENANTS-ACCESS-01 24/24.
- Total final exécuté : 1 197 tests/assertions (431 Node + 766 pgTAP), plus le
  test de concurrence séparé. Aucun test ignoré, annulé ou interrompu.
- Lien : `https://github.com/NGAMS237/SAAS-KJORA/actions/runs/35093246107`.

La machine ne dispose ni de Docker, ni de PostgreSQL/`psql`, ni d'une copie
locale du CLI Supabase. Le téléchargement du CLI n'apporterait pas le moteur
Docker requis. Blaise a donc autorisé le 2026-09-16 un commit et un push de
validation strictement limités à cette branche, afin de déclencher la pile
Supabase éphémère. Le run final s'est terminé avec succès.

Le test SQL exécuté couvre le refus `anon`, l'absence de grant global, le refus
des colonnes privées, les projections Owner/collaborateur, l'isolation entre
Organizations, le portail, les RPC historiques et `service_role`. Il confirme
aussi les contrôles `auth.uid()`, Organization et capability, les limites SQL,
les entitlements applicables, le `search_path` vide et l'absence d'EXECUTE pour
`PUBLIC` et `anon` sur les nouvelles RPC.

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

DIRECT PRIVATE COLUMN ACCESS : BLOQUÉ

LEGITIMATE APP FLOWS : PASS

CROSS-TENANT ISOLATION : PASS

FULL EPHEMERAL REBUILD : PASS

PGTAP : PASS

CANADA FLOW REGRESSION : PASS

LOCAL VALIDATIONS : PASS

READY FOR CODEX REVIEW : OUI

READY FOR REMOTE SECURITY MIGRATION : OUI

READY FOR KJORA DEV MIGRATION : NON

## Prochain gate réel

Soumettre séparément une autorisation de migration Supabase KJORA avec procédure
de sauvegarde et retour arrière. Ce rapport ne constitue pas cette autorisation.
Aucun merge et aucune migration distante ne sont autorisés dans ce lot.

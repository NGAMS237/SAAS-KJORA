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

## Correction appliquée au projet de développement

La migration additive, sans modification des migrations historiques, retire le
grant de table et restaure la projection directe non privée. Trois RPC
spécialisées remplacent les lecteurs légitimes. Elles utilisent des références
qualifiées, `SECURITY DEFINER`, `search_path = ''`, des contrôles de capability
et d'Organization, et retirent l'exécution à `PUBLIC` et `anon`.

La politique RLS existante n'est ni supprimée ni élargie. Aucun droit n'est
accordé au portail locataire.

Le 2026-09-16, Blaise a autorisé séparément l'application de la seule migration
`20260914120000_security_tenants_access_01.sql` au projet Supabase KJORA de
développement `alvheiwlfzuefljcfrtv`. Elle a été appliquée une fois avec la CLI
Supabase 2.117.0 et la commande documentée `migration up --linked`, depuis un
workdir temporaire hors Git et hors OneDrive. Ce workdir alignait les 38 versions
déjà présentes à distance et exposait une seule version en attente. Aucun
`db push`, `--include-all`, rejeu historique ou migration Canada n'a été utilisé.

Le HEAD a été placé temporairement, sans reset, sur le SHA validé exact
`1cb48077c6fc1c66bcb52a6378dbcf129638a21c`. Le hash SHA-256 de la migration
validée et de sa copie temporaire était identique :
`3A4A8A3ADD68FD97EC12D76BF47EF6219A98083E5A16D10CEDA59E5DB9781C57`.
Après les contrôles, le worktree est revenu sur la branche de rapport.

### Sauvegardes et retour arrière

- Sauvegarde DPAPI existante revalidée sous le compte Windows de Blaise : PASS.
  Chemin :
  `C:\Users\Veraluz\AppData\Local\Temp\kjora-backups\site-app-flow-01-3-20260912\pre-migration-snapshot.json.dpapi` ;
  taille : 98 774 octets ; SHA-256 :
  `B90F5FDBF3218561095A0452CF4115D764FF3FD526DA9EA4EEC8C9E834F538A9`.
- Snapshot DPAPI ciblé des métadonnées pré-migration créé et testé en mémoire :
  `C:\Users\Veraluz\AppData\Local\Temp\kjora-backups\security-tenants-access-01-20260916\pre-security-migration-metadata.json.dpapi` ;
  taille : 1 238 octets ; SHA-256 :
  `1DA03522ED5C8B1268A84DB0FAC388E87157F2496111C2532C5889DA822D9EBF`.
- Rollback ciblé préparé hors Git :
  `C:\Users\Veraluz\AppData\Local\Temp\kjora-backups\security-tenants-access-01-20260916\rollback-security-tenants-access-01.sql` ;
  SHA-256 :
  `23A42242F7E7D3F5CDC332A67F348904ADDFAB3B18CC5B6E4FA70565ED6D5FE0`.
- Aucun contenu déchiffré n'a été conservé sur disque. Aucune ligne privée n'a
  été imprimée. L'ancienne sauvegarde n'a pas été supprimée. Le rollback n'a pas
  été utilisé.

### État distant vérifié

Avant migration, `authenticated` disposait encore du SELECT global sur les 15
colonnes de `public.tenants`; `anon` et `PUBLIC` n'avaient aucun SELECT, RLS
était active et les trois RPC cibles étaient absentes. Le projet comptait 9
Organizations et 11 locataires.

Après migration :

- la version `20260914120000` apparaît exactement une fois dans l'historique,
  sous le nom `security_tenants_access_01`;
- `authenticated` n'a plus de SELECT au niveau table et ne peut lire directement
  que `id`, `organization_id`, `full_name`, `created_at`, `updated_at`;
- `anon` et `PUBLIC` ne disposent d'aucun SELECT et ne peuvent exécuter aucune
  des trois RPC;
- les trois signatures attendues existent, sont `SECURITY DEFINER`, ont
  `search_path = ''`, vérifient `auth.uid()`, Organization et capability;
- la projection Documents borne les identifiants à 200, Import est borné à
  5 000, et Export revérifie `exports_standard`;
- le parcours Owner autorisé a lu 1 bien, 4 logements et 4 locataires dans sa
  seule Organization; les projections Documents, Import et Export ont chacune
  retourné les 4 lignes autorisées;
- un tableau de 201 identifiants a été refusé logiquement, une Organization
  étrangère a retourné zéro ligne dans les quatre chemins, un collaborateur sans
  capability a obtenu zéro ligne Import/Export, et un Owner sans entitlement a
  obtenu zéro ligne Export;
- un compte portail actif a obtenu zéro ligne via les nouvelles RPC et aucun
  nouveau droit administratif;
- `service_role` conserve son accès serveur existant; aucun droit navigateur ni
  chemin `platform_admin` n'a été ajouté;
- les comptes restent à 9 Organizations et 11 locataires. La migration ne
  contient aucune écriture de données métier;
- les colonnes Canada `billing_country` et `billing_country_intent` étaient
  absentes avant et après : la migration Canada n'a pas été appliquée et aucune
  devise, souscription ou intention n'a été modifiée.

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
| Préflight distant | PASS |
| Sauvegarde DPAPI existante | PASS, déchiffrement en mémoire |
| Migration distante sécurité | PASS, une application |
| Historique distant | PASS, version présente exactement une fois |
| Tests distants Owner et capability | PASS |
| Isolation inter-Organization distante | PASS |
| Données distantes préservées | PASS, 9 Organizations / 11 locataires avant et après |
| Advisors Supabase | AVERTISSEMENTS, analysés ci-dessous |

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

### Validation distante et advisors

Les contrôles distants ont été exécutés dans des transactions sans mutation de
données métier. Le refus réel d'`anon` a produit l'erreur PostgreSQL attendue
`42501 permission denied`. Les parcours autorisés et refusés ont été vérifiés
uniquement par des nombres et booléens; aucun identifiant utilisateur, contenu
locataire ou valeur privée n'a été journalisé.

Les advisors Supabase ont retourné :

- sécurité : 12 informations `rls_enabled_no_policy`, 85 avertissements
  `authenticated_security_definer_function_executable` et 1 avertissement de
  protection des mots de passe compromis;
- performance : 10 informations de clés étrangères non indexées et 66 index
  signalés comme inutilisés;
- trois des 85 avertissements `SECURITY DEFINER` correspondent aux trois nouvelles
  RPC. Ils sont attendus parce que l'appel par `authenticated` est intentionnel;
  leur `search_path`, leurs grants et leurs contrôles d'identité, Organization,
  capability, limite et entitlement ont été vérifiés en base et par pgTAP;
- aucune alerte de performance ne cible les nouveaux objets. Les autres alertes
  concernent des objets ou réglages qui existaient avant ce lot et ne sont pas
  attribuables à cette migration.

Le connecteur disponible n'exposait pas les journaux Postgres/API. La sortie CLI
de migration ne contient aucune erreur et tous les contrôles SQL post-migration
ont réussi, hormis le refus `anon` volontaire. Cette limite d'observabilité est
consignée sans transformer un contrôle non disponible en PASS.

## Contrôles de périmètre

- Aucun fichier Stripe ou SASPAY modifié.
- Aucun fichier `.env*`, `.next`, `.vercel`, archive, journal, snapshot ou script
  de restauration ajouté au lot.
- Les sauvegardes DPAPI et le rollback ciblé restent hors Git et hors OneDrive.
  Leur déchiffrement a été vérifié en mémoire; aucun fichier n'a été supprimé.
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

REMOTE PREFLIGHT : PASS

DPAPI BACKUP REVALIDATED : PASS

REMOTE SECURITY MIGRATION : PASS

MIGRATION HISTORY : PASS

DIRECT PRIVATE ACCESS : BLOQUÉ

CROSS-TENANT TEST : PASS

LEGITIMATE FLOWS : PASS

SUPABASE ADVISORS : AVERTISSEMENTS

ROLLBACK USED : NON

REMOTE DATA PRESERVED : OUI

READY FOR KJORA DEV MIGRATION : OUI

READY FOR CANADA MIGRATION : OUI

READY FOR PREVIEW : NON

READY FOR PRODUCTION : NON

## Prochain gate réel

La migration de sécurité autorisée est terminée. La migration Canada, tout merge,
Preview, DNS et Production restent hors périmètre et nécessitent une autorisation
séparée. Aucune sauvegarde ne doit être supprimée sans confirmation de Blaise.

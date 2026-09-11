# KJORA — REPOSITORY-STABILIZATION-01 — Rapport

Date du contrôle : 2026-09-11

Dépôt : `NGAMS237/SAAS-KJORA`

Branche de travail : `codex/repository-stabilization-01`

Branche distante de référence : `origin/main`

SHA de départ et HEAD non committé : `9742403c7c4c09c6d282b692c8a8cc2776bac034`

Projet Supabase inspecté : `alvheiwlfzuefljcfrtv` (`KJORA`)

## Conclusion

La divergence EXPORT-01 entre Git et le schéma Supabase déjà appliqué est reproduite dans une branche locale dédiée. Les deux migrations historiques manquantes ont été ajoutées avec leurs instructions SQL observées dans `supabase_migrations.schema_migrations`, et `readContractsSummary` utilise désormais la RPC `list_contracts_for_export` avec le paramètre `target_organization_id`.

L'audit complémentaire REPOSITORY-STABILIZATION-01.1 démontre que plus aucun code applicatif ne dépend d'un `SELECT` direct sur `public.lease_contracts`. Une migration additive est donc nécessaire pour annuler proprement le grant historique sans réécrire l'historique : `20260911153254_close_lease_contracts_direct_select.sql`. Elle révoque `SELECT` à `authenticated`, `anon` et `PUBLIC`, mais conserve `service_role`. Cette migration est seulement préparée dans Git; elle n'a pas été appliquée à Supabase.

À la clôture technique de REPOSITORY-STABILIZATION-01.1, aucun commit, push, merge, déploiement, paiement, webhook externe ou changement Production n'avait été effectué. REPOSITORY-STABILIZATION-01.2 autorise ensuite un unique commit et le push non forcé de la branche dédiée; son SHA et la confirmation du push sont remis séparément après l'opération Git.

## État initial et isolation

Quatre worktrees ont été inventoriés avant la modification :

| Worktree | Branche | HEAD initial | État |
| --- | --- | --- | --- |
| `C:\Users\Veraluz\OneDrive\Documents\ChatGPT\SAAS KJORA` | `main` | `9742403c7c4c09c6d282b692c8a8cc2776bac034` | 1 fichier modifié et 1 migration non suivie, tous deux liés à EXPORT-01 |
| `C:\Users\Veraluz\OneDrive\Documents\ChatGPT\COCKPIT KJEMO STUDIOS\kjora-billing-stripe-ca-01-worktree` | `codex/billing-stripe-ca-01` | `16e94b7d990f0de3a5cf2b89fb368ae60b5029c4` | 7 fichiers suivis modifiés, 17 chemins non suivis |
| `C:\Users\Veraluz\OneDrive\Documents\ChatGPT\COCKPIT KJEMO STUDIOS\kjora-billing-saspay-africa-01-worktree` | `codex/billing-saspay-africa-01` | `16e94b7d990f0de3a5cf2b89fb368ae60b5029c4` | 13 fichiers suivis modifiés, 33 chemins non suivis |
| `C:\Users\Veraluz\OneDrive\Documents\ChatGPT\COCKPIT KJEMO STUDIOS\kjora-repository-stabilization-01-worktree` | `codex/repository-stabilization-01` | `9742403c7c4c09c6d282b692c8a8cc2776bac034` | worktree dédié créé depuis `main` |

Le worktree principal n'a pas été écrasé : son état final reste exactement `M src/modules/data-export/server.ts` et `?? supabase/migrations/20260910195812_export_01_contracts_summary_rpc.sql`. Aucun worktree n'a été supprimé, déplacé ou réinitialisé.

## Fichiers du lot

Fichiers applicatifs modifiés :

- `src/modules/data-export/server.ts`
  - ajout d'un type local minimal `ContractSummaryRow` ;
  - remplacement de la lecture directe de `lease_contracts` par `supabase.rpc("list_contracts_for_export", { target_organization_id: organizationId })` ;
  - conservation du format de résumé déjà consommé par l'export.
- `tests/data-export.test.ts`
  - preuve statique de la migration de grant historique ;
  - preuve que `readContractsSummary` emploie la RPC et non une lecture directe de `lease_contracts` ;
  - contrôle exhaustif de la source applicative contre toute réintroduction de `.from("lease_contracts")` ;
  - contrôles du cloisonnement Organization, des capacités, du forfait, des colonnes minimales et des grants de la RPC.
- `supabase/tests/database/rls_contracts_signatures.test.sql`
  - plan porté de 43 à 51 assertions ;
  - refus direct pour `authenticated`, `anon` et `PUBLIC` ;
  - refus de la RPC à `anon`, `PUBLIC`, un rôle sans permission et une autre Organization ;
  - succès attendu pour l'Owner autorisé et non-régression des RPC contrats/signatures existantes.

Migrations ajoutées :

- `supabase/migrations/20260910191705_fix_lease_contracts_select_grant.sql`
- `supabase/migrations/20260910195812_export_01_contracts_summary_rpc.sql`
- `supabase/migrations/20260911153254_close_lease_contracts_direct_select.sql`

Document ajouté :

- `KJORA-REPOSITORY-STABILIZATION-01-REPORT.md`

Aucun fichier Stripe ou SASPAY n'a été modifié dans la branche de stabilisation.

## Comparaison Git / Supabase

L'inspection Supabase a été strictement limitée aux métadonnées de migrations, à la définition de fonction et aux privilèges. Aucune ligne métier n'a été lue ou modifiée.

### Migration `20260910191705_fix_lease_contracts_select_grant`

- Présente dans `supabase_migrations.schema_migrations`.
- Instruction observée : `grant select on public.lease_contracts to authenticated;`.
- Reproduite dans Git sous le même identifiant et le même nom.
- État actuel constaté : le rôle `authenticated` possède bien `SELECT` sur `public.lease_contracts`.
- Le contrôle a aussi constaté l'absence de politique RLS directe sur cette table. Le grant seul ne constitue donc pas le chemin applicatif de lecture inter-organisations.

### Migration `20260910195812_export_01_contracts_summary_rpc`

- Présente dans `supabase_migrations.schema_migrations`.
- Reproduite dans Git sous le même identifiant et le même nom.
- La définition réelle de `public.list_contracts_for_export(target_organization_id uuid)` a été recoupée avec `pg_get_functiondef`.
- La fonction est `stable`, `security definer` et fixe `search_path` à une valeur vide.
- Elle exige `data_export.manage`, contrôle la fonctionnalité de forfait `exports_advanced`, filtre sur `organization_id` et ne retourne que les champs nécessaires au résumé des contrats.
- ACL observée : exécution pour `postgres`, `authenticated` et `service_role`; aucun droit `anon` ou `public`.
- Le code applicatif appelle effectivement cette RPC avec `target_organization_id: organizationId`.

Les instructions des deux fichiers versionnés correspondent aux instructions historiques observées. Aucune migration n'a été exécutée sur Supabase pendant ce lot.

### Migration corrective locale `20260911153254_close_lease_contracts_direct_select`

- Créée avec le CLI Supabase, nom horodaté généré par l'outil.
- Instruction unique : `revoke select on table public.lease_contracts from authenticated, anon, public;`.
- Ne modifie aucune migration historique.
- Ne révoque aucun privilège de `service_role`.
- N'ajoute aucune policy, vue, fonction, donnée ou droit.
- Non appliquée au projet Supabase.

## Audit exhaustif de `lease_contracts`

### Code applicatif

Aucun `.from("lease_contracts")` ou équivalent avec quotes simples ne subsiste dans `src`, `tests` ou `scripts`.

Les accès applicatifs sont tous des RPC :

- EXPORT-01 : `list_contracts_for_export` dans `src/modules/data-export/server.ts` ;
- contrats internes : `get_lease_contracts` et `get_lease_contract` ;
- portail locataire : `list_my_tenant_portal_contracts` et `get_my_tenant_portal_contract` ;
- signatures : `get_lease_contract_signatures` ;
- finalisation : `finalize_lease_contract`.

Les routes de téléchargement utilisent ces services RPC puis Storage avec une URL signée; elles ne lisent pas la table directement.

### SQL, fonctions, vues et signatures

Les migrations 6F créent et manipulent la table exclusivement dans des fonctions privilégiées. L'état réel de la base contient 16 fonctions dont la définition référence `lease_contracts` :

- fonctions publiques avec `EXECUTE` pour `authenticated` seulement : `generate_lease_contract`, `get_lease_contracts`, `get_lease_contract`, `validate_lease_contract`, `sign_lease_contract_owner`, `send_lease_contract`, `list_my_tenant_portal_contracts`, `get_my_tenant_portal_contract`, `sign_lease_contract_tenant`, `finalize_lease_contract`, `cancel_lease_contract`, `get_lease_contract_signatures`, `list_contracts_for_export` ;
- fonctions privées : `private.can_access_contract_document_path`, `private.can_write_contract_document_path`, `private.write_contract_audit`.

Toutes les 16 sont `SECURITY DEFINER` avec `search_path=""`. Les fonctions publiques observées refusent `anon` et `PUBLIC`; les fonctions privées ne sont pas une surface de lecture directe. Le trigger `lease_contracts_protect_integrity` continue de protéger l'immutabilité des contrats finalisés.

Aucune vue ne référence `lease_contracts`, ni dans Git ni dans `pg_views` sur la base observée.

Les contrôles métier restent portés par les RPC :

- fonctions internes : `private.has_capability(..., 'contract.manage')` ou `data_export.manage` ;
- portail : accès actif, utilisateur courant, Tenant et Lease concordants ;
- export : permission `data_export.manage`, entitlement `exports_advanced`, filtre strict `organization_id = target_organization_id` et sept colonnes de résumé seulement ;
- Storage : chemins reliés à l'Organization et au contrat via les fonctions privées dédiées.

### Grants, RLS et PostgREST

État Supabase observé avant application de la migration corrective :

- schéma `public` utilisable par `authenticated`, `anon`, `PUBLIC` et `service_role` ;
- table dans le schéma exposé `public` ;
- RLS activée, non forcée ;
- zéro policy sur `public.lease_contracts` ;
- `authenticated` possède `SELECT` à cause de la migration historique ;
- `anon` et `PUBLIC` ne possèdent pas `SELECT` ;
- `service_role` conserve ses privilèges de service.

Avec zéro policy, RLS bloque actuellement les lignes pour un appel client ordinaire, mais le grant maintient inutilement la table dans sa surface accessible et rendrait toute future policy immédiatement exploitable. La migration corrective ferme la surface au niveau objet; les RPC `SECURITY DEFINER` continuent de fonctionner avec les droits de leur propriétaire et leurs contrôles explicites.

## Vérifications

| Contrôle | Résultat factuel |
| --- | --- |
| `npm run typecheck` | PASS — code de sortie 0 |
| `npm run lint` | PASS — code de sortie 0, 0 erreur, 2 avertissements préexistants et hors périmètre (`src/core/analytics/events.ts:61`, `src/core/billing/billing-view.tsx:22`) |
| Tests ciblés EXPORT-01 / accès contrats | PASS — 22/22 |
| `npm test` | PASS — 406/406 |
| pgTAP contrats/signatures | NON EXÉCUTÉ — 51 assertions écrites et plan cohérent; Docker absent et aucune exécution autorisée sur Production |
| `npx next build --webpack` | PASS — compilation, TypeScript, collecte des données et génération de 69 routes terminées |
| `git diff --check` avant rapport | PASS — code de sortie 0; seuls des avertissements informatifs LF/CRLF ont été affichés |
| Recherche de secrets | PASS — aucun motif de clé Stripe, Supabase, GitHub, Resend ou Upstash détecté dans le périmètre filtré |
| Artefacts interdits suivis | PASS — aucun `.env`, `.env.local`, `.vercel`, `node_modules`, `.next`, `out`, ZIP, journal ou `tsbuildinfo` trouvé par `git ls-files` |
| Migration EXPORT-01 dans Git | PASS |
| Utilisation de la RPC | PASS |
| Régression automatisée des exports | PASS — suite complète et 22 tests ciblés |
| Absence de modification Billing dans le lot | PASS |

Le build Webpack demandé confirme la compilabilité de la source. Le précédent résultat Turbopack de REPOSITORY-STABILIZATION-01 reste un incident environnemental historique lié à la jonction `node_modules`; il n'était pas le build demandé pour le correctif 01.1.

## Préservation des travaux Billing

### Stripe Canada

- Branche : `codex/billing-stripe-ca-01`
- HEAD : `16e94b7d990f0de3a5cf2b89fb368ae60b5029c4`
- État final revérifié : 7 fichiers suivis modifiés et 17 chemins non suivis.
- Fichiers suivis modifiés : `.env.example`, `package.json`, `project-context/DECISIONS.md`, `project-context/PROJECT_STATE.md`, `src/app/(internal)/app/billing/page.tsx`, `src/core/billing/billing-view.tsx`, `src/core/billing/provider-config.ts`.
- Chemins non suivis : `KJORA-BILLING-STRIPE-CA-01-REPORT-v0.1.md`, `KJORA-BILLING-STRIPE-CA-01-v0.1.zip`, `KJORA-STRIPE-CA-RUNBOOK-v0.1.md`, `KJORA-STRIPE-CA-TEST-EVIDENCE-v0.1.md`, `docs/architecture/KJORA-BILLING-STRIPE-CA-TEST-v0.1.md`, `scripts/provision-stripe-ca-test.mjs`, `src/app/api/billing/checkout/`, `src/app/api/billing/portal/`, `src/app/api/webhooks/`, `src/core/billing/stripe-catalog.ts`, `src/core/billing/stripe-client.ts`, `src/core/billing/stripe-server.ts`, `src/core/billing/stripe-signature.ts`, `src/core/billing/stripe-webhook.ts`, `supabase/migrations/20260909170000_billing_stripe_ca_test.sql`, `supabase/tests/database/rls_billing_stripe_ca_test.sql`, `tests/billing-stripe-ca.test.ts`.
- Archive récupérable existante et vérifiée : `KJORA-BILLING-STRIPE-CA-01-v0.1.zip`.
- Archive : 23 entrées, aucun chemin interdit, SHA-256 `2CE7F456435ABCB0A33CABEF59724BA77BEF547897CCD4956BC0CEF6AF3CC953`.

### SASPAY Afrique

- Branche : `codex/billing-saspay-africa-01`
- HEAD : `16e94b7d990f0de3a5cf2b89fb368ae60b5029c4`
- État final revérifié : 13 fichiers suivis modifiés et 33 chemins non suivis.
- Fichiers suivis modifiés : `.env.example`, `.gitignore`, `package.json`, `project-context/DECISIONS.md`, `project-context/PROJECT_STATE.md`, `src/app/(internal)/app/billing/page.tsx`, `src/app/api/billing/webhooks/[provider]/route.ts`, `src/core/billing/billing-view.tsx`, `src/core/billing/provider-capabilities.ts`, `src/core/billing/provider-config.ts`, `src/core/billing/provider-routing.ts`, `src/core/billing/provider.ts`, `tests/billing-providers.test.ts`.
- Chemins non suivis : `KJORA-BILLING-SASPAY-AFRICA-01-EVIDENCE.md`, `KJORA-BILLING-SASPAY-AFRICA-01-REPORT.md`, `KJORA-BILLING-SASPAY-AFRICA-01-RUNBOOK.md`, `KJORA-BILLING-SASPAY-AFRICA-01-SPEC.md`, `KJORA-BILLING-STRIPE-CA-01-REPORT-v0.1.md`, `KJORA-STRIPE-CA-RUNBOOK-v0.1.md`, `KJORA-STRIPE-CA-TEST-EVIDENCE-v0.1.md`, `docs/architecture/KJORA-BILLING-STRIPE-CA-TEST-v0.1.md`, `scripts/discover-saspay-live-contract.mjs`, `scripts/provision-stripe-ca-test.mjs`, `src/app/api/billing/checkout/`, `src/app/api/billing/portal/`, `src/app/api/billing/saspay/`, `src/app/api/webhooks/`, `src/core/billing/saspay-adapter.ts`, `src/core/billing/saspay-client.ts`, `src/core/billing/saspay-normalization.ts`, `src/core/billing/saspay-policy.ts`, `src/core/billing/saspay-server.ts`, `src/core/billing/saspay-signature.ts`, `src/core/billing/saspay-workflow.ts`, `src/core/billing/stripe-catalog.ts`, `src/core/billing/stripe-client.ts`, `src/core/billing/stripe-server.ts`, `src/core/billing/stripe-signature.ts`, `src/core/billing/stripe-webhook.ts`, `supabase/migrations/20260909170000_billing_stripe_ca_test.sql`, `supabase/migrations/20260910130000_billing_saspay_africa_pilot.sql`, `supabase/tests/database/rls_billing_stripe_ca_test.sql`, `tests/billing-saspay-africa.test.ts`, `tests/billing-stripe-ca.test.ts`.
- Archive récupérable existante et vérifiée : `KJORA-BILLING-SASPAY-AFRICA-01-source.zip`.
- Archive : 341 entrées, aucun chemin interdit, SHA-256 `67EAE725ABF827D10B8ECDAD7F19D2139941284AFB3415BE66EA950C34F81018`.

Ces branches n'ont été ni fusionnées ni modifiées. Stripe demeure séparé; SASPAY demeure désactivé et ne bloque pas le Canada.

## Preuves non obtenues

- Rejeu des migrations et scénario pgTAP de 51 assertions sur une base Supabase locale vierge : non exécutés; Docker n'est pas installé sur cet environnement.
- Appel fonctionnel de la RPC avec une session `authenticated` et de vraies données de contrat : non exécuté afin de ne pas accéder aux données métier Production.
- Validation manuelle navigateur d'un export réel : non exécutée, car elle aurait nécessité une session et des données métier.

## Attestations de clôture

- Aucun secret n'a été ajouté ou suivi.
- Aucune donnée métier Supabase n'a été consultée ou modifiée.
- Aucune migration distante n'a été appliquée.
- Aucun paiement ni webhook externe n'a été déclenché.
- Aucun site commercial ni fichier du Cockpit KJEMO n'a été modifié, hors création isolée de ce worktree applicatif dans le répertoire autorisé.
- Aucun merge, déploiement, DNS ou changement Production n'a été effectué. Le seul commit et le seul push autorisés par REPOSITORY-STABILIZATION-01.2 sont limités à `codex/repository-stabilization-01`.

Le lot technique 01.1 a été arrêté avant commit conformément à l'instruction alors en vigueur. La clôture Git 01.2 ne modifie ni la portée technique ni les environnements externes.

## Conclusion de validation

`LEASE_CONTRACTS DIRECT ACCESS : PASS`

La migration additive ferme le privilège objet des trois rôles clients; aucun accès applicatif direct restant n'a été trouvé.

`RPC ACCESS CONTROL : PASS`

La définition et les ACL réelles ont été inspectées en lecture seule; la migration versionnée conserve permission, Organization, forfait, projection minimale, `search_path` sûr et refus `anon/PUBLIC`. Les preuves statiques passent. Le scénario pgTAP correspondant est écrit mais son exécution reste explicitement non prouvée faute de Docker.

`READY FOR COMMIT : OUI`

Le code, la migration locale, les tests Node et le build demandé sont prêts pour revue et commit. Cette conclusion n'autorise ni l'application de la migration, ni un push, merge ou déploiement.

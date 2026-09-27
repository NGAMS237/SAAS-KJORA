# KJORA — REVENUE-LAUNCH-01 — Migrations : ordre, dépendances, rollback v0.1

**Statut :** livré localement (commits + patch v3), **non appliqué** sur KJORA Dev ni Production
**Date :** 2026-09-27 (v3)
**Portée :** les 5 migrations Revenue (facturation manuelle Afrique, rappels, extension Finance Admin, cycle de vie Admin, contacts commerciaux), dans leur forme finale nettoyée
**Hors portée :** toute exécution distante — ce document décrit un ordre et un plan de retour arrière, il n'en déclenche aucun
**Verdict officiel :** la CI Supabase éphémère réelle. Le rejeu décrit au §6 a été fait sur un cluster PostgreSQL 16 local reproduisant Supabase, qui reste une approximation.

---

## 1. Les 5 migrations Revenue

Une revue antérieure avait rapporté « 9 migrations Revenue » : c'était le nombre de **commits** de sous-lots, pas de **fichiers de migration**. La v2 avait ensuite ajouté une sixième migration « complément » qui redéfinissait des fonctions des cinq premières. La v3 l'a **supprimée** : chaque correction a été intégrée dans la migration qui possède la fonction concernée. Il reste exactement **5** migrations :

| # | Fichier | Sous-lot | Contenu final |
|---|---|---|---|
| 1 | `20260927150000_revenue_01b_manual_invoicing_africa.sql` | 01B | Primitives d'accès restreint (Organization suspendue), colonnes de règlement manuel, `due_on`, jetons d'idempotence, droits par colonne (aucune donnée sensible lisible par l'Owner), RLS de facturation, `get_billing_overview`, `list_billing_invoices` (colonnes sûres), émission et confirmation de facture manuelle |
| 2 | `20260927160000_revenue_01c_billing_reminders.sql` | 01C | Journal des rappels (dédoublonnage **par facture**), calcul des rappels (Organization active uniquement, fondé sur `due_on`), exécution dry-run par défaut |
| 3 | `20260927170000_revenue_01e_admin_finance_extension.sql` | 01E | `admin_finance_billing_extension` (nouvelle) ; `admin_finance_summary` (FINANCE-ADMIN-01) remplacée **une seule fois** : revenu attendu hors Organizations archivées, comptées à part |
| 4 | `20260927180000_revenue_01h_admin_lifecycle.sql` | 01H | Statut `archived`, `has_capability` strict, cycle de vie Organization/membre, notes Admin, compteurs et fiche Admin, contexte limité, export du propriétaire d'une Organization suspendue, portail locataire fermé si l'Organization n'est pas active |
| 5 | `20260927190000_revenue_01i_commercial_contacts.sql` | 01I | Contacts commerciaux, journal **immuable et versionné** des décisions de consentement, éligibilité marketing (formule unique), export Admin |

Aucune de ces migrations n'a été appliquée à un Supabase distant.

---

## 2. Ordre d'application et dépendances réelles

L'ordre est celui des noms de fichiers (horodatage croissant). Les dépendances ci-dessous sont celles réellement lues ou modifiées.

```
20260825180000_lot_5b_auth_organization.sql      is_active_member / is_organization_owner, organizations.status
20260826093143_lot_5c_membership_rbac.sql         private.has_capability (1re version), administrative_audit_log
20260831090000_lot_6e_tenant_portal_access.sql    private.has_active_tenant_portal_access (1re version)
20260908140000_align_03_billing_saas.sql          organization_subscriptions, billing_invoices, billing_events, RLS facturation
20260908141000_align_03_billing_rpcs.sql          get_billing_overview, list_billing_invoices (1res versions)
20260909180000_export_01_data_export.sql          data_exports, request_data_export, record_data_export_download
20260918120000_admin_01_platform_admin.sql        admin_platform_counters (1re version)
20260921120000_admin_01_1_ux_quick_wins.sql       admin_platform_counters (2e version)
20260926120000_admin_billing_ops_01_...sql        admin_get_organization_detail (version fiche complète)
20260927090000_finance_admin_01_read_model.sql    admin_finance_summary, finance_period_bounds
        │
        ▼
01B  remplace : 4 policies RLS facturation, get_billing_overview, list_billing_invoices
     crée     : has_restricted_capability, can_read_billing, can_export_organization_data,
                admin_issue_manual_invoice, admin_confirm_manual_invoice_payment
        ▼
01C  lit      : billing_invoices.due_on (01B)
     crée     : billing_reminder_log, compute_due_billing_reminders, admin_run_billing_reminders
        ▼
01E  lit      : billing_invoices (01B), billing_reminder_log + compute (01C), finance_period_bounds
     remplace : admin_finance_summary (FINANCE-ADMIN-01) — une seule fois
     crée     : admin_finance_billing_extension
        ▼
01H  lit      : has_restricted_capability / can_export_organization_data (01B)
     remplace : has_capability (lot_5c), has_active_tenant_portal_access (lot_6e),
                admin_platform_counters (ADMIN-01.1), admin_get_organization_detail (ADMIN-BILLING-OPS-01),
                request_data_export, record_data_export_download, policy data_exports (EXPORT-01)
     crée     : cycle de vie Admin, list_my_restricted_organizations, export_restricted_owner_source,
                list_my_unavailable_tenant_portal_organizations
        ▼
01I  lit      : organizations.status (dont 'archived', 01H), administrative_audit_log
     crée     : contacts commerciaux, journal de consentement, is_marketing_eligible, lectures Admin
```

Correction d'une erreur de la v2 : `admin_finance_billing_extension` est une fonction **nouvelle** de 01E, pas un remplacement d'une fonction de FINANCE-ADMIN-01. La seule fonction de FINANCE-ADMIN-01 remplacée est `admin_finance_summary`, en 01E, pour exclure les Organizations archivées du revenu attendu.

---

## 3. Remplacements : pourquoi ils sont sûrs

Règle de nettoyage v3 : **aucune fonction n'est définie deux fois dans la série Revenue** (test Node `revenue-lifecycle-matrix`). Les fonctions antérieures à Revenue ne sont remplacées qu'une fois, dans la migration qui porte la décision.

- `create or replace` avec une signature identique conserve les droits `grant` existants et prend effet immédiatement pour tous les appelants, RLS comprise.
- Changement de signature : toujours un `drop function` explicite avant la recréation. Cas concernés : `list_billing_invoices` (type de retour réduit aux colonnes sûres), `admin_issue_manual_invoice` (paramètre `p_due_on`), `admin_set_marketing_consent` (version et preuve). Ces deux dernières sont définies pour la première fois dans Revenue, donc sans ancienne signature à supprimer.
- Contraintes `check` remplacées (`organizations_status_check` en 01H, `administrative_audit_log_action_check` en 01H puis 01I) : `drop` et `add` dans la même transaction (chaque migration est enveloppée `begin;`/`commit;`). La nouvelle contrainte est **strictement plus permissive** : elle ne peut pas échouer sur une ligne existante, et aucune valeur historique d'audit ne devient invalide.
- Droits par colonne (01B) : `revoke select` puis `grant select (colonnes…)` sur `billing_invoices` et `billing_events`. Aucun code applicatif ne lit ces tables directement (vérifié par grep) : tout passe par des RPC.

---

## 4. Aucune valeur historique perdue

- **Aucun `delete from` et aucun `truncate`** dans les 5 migrations finales (test Node). En particulier, **aucune écriture dans `auth.sessions`** : la fonction `best_effort_revoke_sessions` a disparu. La désactivation d'un membre repose sur `memberships.status = 'revoked'`, lu à chaque requête.
- Les listes de valeurs `administrative_audit_log.action` ne font que s'étendre.
- Tables Revenue : colonnes ajoutées par `add column if not exists`, jamais supprimées. Le journal de consentement est protégé en écriture par un trigger : aucune mise à jour, aucune suppression, quel que soit le rôle.
- Historique de facturation : les factures et paiements confirmés restent comptés après l'archivage d'une Organization. C'est vérifié par pgTAP (`rls_revenue_lifecycle_matrix`, §3d). Les encours d'une Organization archivée sont retirés des compteurs normaux, mais comptés à part (`archived_open_by_currency`, `excluded_archived_subscriptions`) : jamais perdus en silence.

---

## 5. Plan de rollback : documenté, jamais exécuté

**Aucune commande ci-dessous n'a été lancée**, ni à distance ni en local. Principe : défaire migration par migration dans l'ordre **inverse** du §2, sans jamais toucher une migration antérieure à Revenue, et **sans jamais supprimer de données** pour rendre un rollback possible. Si une donnée existante bloque le retour arrière (contrainte, table non vide), c'est un signal d'arrêt et une décision humaine, jamais une raison d'effacer.

1. **01I** : `drop function` des 5 RPC contacts et de `is_marketing_eligible`. Supprimer `organization_commercial_contacts`, puis `organization_marketing_consent_events`, **seulement si ces tables sont vides**. Les preuves de consentement ont une valeur juridique : ne jamais les effacer sans décision explicite. Retirer les deux valeurs `contact.*` de la contrainte d'audit seulement si aucune ligne ne les utilise.
2. **01H** :
   - recréer `has_capability`, `has_active_tenant_portal_access`, `request_data_export`, `record_data_export_download` et la policy `data_exports` dans leur version antérieure ;
   - recréer `admin_platform_counters` (version ADMIN-01.1) et `admin_get_organization_detail` (version ADMIN-BILLING-OPS-01) ;
   - `drop function` des RPC propres à 01H ; supprimer `admin_organization_notes` si vide ;
   - revenir à `check (status in ('active','suspended'))`, **impossible tant qu'une Organization est archivée** (comportement voulu : la restaurer d'abord).
3. **01E** : recréer `admin_finance_summary` (version FINANCE-ADMIN-01), puis `drop function admin_finance_billing_extension`.
4. **01C** : `drop function` des deux fonctions de rappel, puis supprimer `billing_reminder_log` (journal d'idempotence uniquement, sans contenu métier).
5. **01B** :
   - recréer `list_billing_invoices`, `get_billing_overview` et les 4 policies dans leur version ALIGN-03 ;
   - rétablir `grant select` complet sur `billing_invoices` et `billing_events` (**réexpose la note interne Admin à l'Owner** : à éviter tant que des factures manuelles existent) ;
   - `drop function` des RPC 01B et des primitives restreintes ;
   - les colonnes additives de `billing_invoices` ne sont supprimées que si elles sont vides.

---

## 6. Rejeu complet vérifié (local, jamais distant)

Toutes les migrations du dépôt (49 fichiers, de `lot_5b` à `01I`) ont été rejouées **depuis une base vide** sur un cluster PostgreSQL 16 local éphémère. Ce cluster reproduit l'amorce Supabase : rôles `anon`/`authenticated`/`service_role`, schémas `auth`/`storage`, privilèges par défaut. Aucune erreur. Les **26 fichiers pgTAP** du dépôt passent ensuite. Le script de contrôle échoue aussi sur un écart entre `plan()` et le nombre d'assertions réellement exécutées.

Deux fichiers hors périmètre, **`rls_documents_notifications`** et **`rls_tenant_portal`**, échouaient tant que l'amorce locale n'accordait pas sur `storage.objects` les droits que Supabase accorde par défaut. Une fois ces droits ajoutés à l'amorce (et non au dépôt), ils passent. Ces échecs sont donc très probablement liés à la reproduction locale incomplète des permissions Supabase sur `storage.objects`. Les migrations REVENUE-LAUNCH-01 ne modifient pas cette table. La cause doit être confirmée par la CI Supabase éphémère réelle, qui fait foi.

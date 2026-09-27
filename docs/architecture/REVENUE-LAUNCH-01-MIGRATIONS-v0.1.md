# KJORA — REVENUE-LAUNCH-01 — Migrations : ordre, dépendances, rollback v0.1

**Statut :** livré localement (commits + patch), **non appliqué** sur KJORA Dev ni Production
**Date :** 2026-09-27
**Portée :** les migrations Revenue (facturation manuelle Afrique, rappels, extension Finance Admin, cycle de vie Admin, contacts commerciaux) et leur complément de cohérence globale
**Hors portée :** toute exécution réelle — ce document décrit un ordre et un plan de retour arrière, il n'en déclenche aucun

---

## 1. Correction du décompte — 5 migrations Revenue, pas 9

Une revue antérieure de ce mandat avait rapporté « 9 migrations Revenue ». C'était une confusion entre **commits** (9, un par sous-lot y compris des commits de correction) et **fichiers de migration SQL** réellement ajoutés. Il y en a exactement **5** :

| # | Fichier | Sous-lot |
|---|---|---|
| 1 | `20260927150000_revenue_01b_manual_invoicing_africa.sql` | 01B — Facturation manuelle Afrique |
| 2 | `20260927160000_revenue_01c_billing_reminders.sql` | 01C — Rappels automatiques |
| 3 | `20260927170000_revenue_01e_admin_finance_extension.sql` | 01E — Extension Finance Admin |
| 4 | `20260927180000_revenue_01h_admin_lifecycle.sql` | 01H — Cycle de vie Admin |
| 5 | `20260927190000_revenue_01i_commercial_contacts.sql` | 01I — Contacts commerciaux |

Le complément de cohérence globale (objet de ce document) ajoute une **sixième** migration, postérieure aux 5 ci-dessus :

| # | Fichier | Contenu |
|---|---|---|
| 6 | `20260927200000_revenue_complement_01_lifecycle_coherence.sql` | Compteur `organizations_archived`, garde de statut sur la facturation manuelle et les rappels, signal d'incohérence provider, statut/éligibilité marketing dans les contacts commerciaux, suppression du `delete` direct dans `auth.sessions` |

Aucune de ces 6 migrations n'a été appliquée à un Supabase distant (Dev ou Production) à ce stade.

---

## 2. Ordre d'application et dépendances réelles

L'ordre est celui des noms de fichiers (horodatage croissant) — `supabase db push`/`migration up` les applique dans cet ordre lexicographique, jamais un autre. Les dépendances ci-dessous sont les dépendances **fonctionnelles réelles** (ce qu'une migration lit ou modifie d'une précédente), pas seulement l'ordre chronologique de livraison.

```
20260826093143_lot_5c_membership_rbac.sql              (private.has_capability créée)
        │
        ▼
20260908140000_align_03_billing_saas.sql                (organization_subscriptions, billing_invoices,
        │                                                 billing_events créées)
        ▼
20260918120000_admin_01_platform_admin.sql               (admin_platform_counters, admin_list_organizations,
        │                                                  admin_get_organization_detail — 1re version)
        ▼
20260921120000_admin_01_1_ux_quick_wins.sql               (admin_platform_counters — remplacée : recherche/filtres)
        │
        ▼
20260926120000_admin_billing_ops_01_commercial_interventions.sql
        │                                                  (admin_get_organization_detail — remplacée : fiche complète ;
        │                                                   commercial_interventions créée)
        ▼
20260927090000_finance_admin_01_read_model.sql            (admin_finance_billing_extension — dépendance déjà
        │                                                   existante avant Revenue, JAMAIS touchée par Revenue)
        ▼
20260927150000_revenue_01b_manual_invoicing_africa.sql    (01B — dépend de organization_subscriptions,
        │                                                   billing_invoices, billing_events, billing_prices,
        │                                                   admin_platform_admins)
        ▼
20260927160000_revenue_01c_billing_reminders.sql          (01C — dépend de 01B : billing_invoices.status,
        │                                                   organization_subscriptions.grace_*)
        ▼
20260927170000_revenue_01e_admin_finance_extension.sql    (01E — REMPLACE admin_finance_billing_extension
        │                                                   [Finance Admin 01], en y ajoutant les agrégats 01B/01C
        │                                                   sans toucher aux agrégats préexistants — voir §4)
        ▼
20260927180000_revenue_01h_admin_lifecycle.sql            (01H — REMPLACE private.has_capability [lot_5c] pour
        │                                                   y ajouter organizations.status = 'active' ; ajoute
        │                                                   organizations.status = 'archived' — dépendance
        │                                                   partagée par TOUT le schéma, voir §5)
        ▼
20260927190000_revenue_01i_commercial_contacts.sql        (01I — dépend de organizations, organization_profiles,
        │                                                   memberships, auth.users ; indépendante de 01B/01C/01E/01H)
        ▼
20260927200000_revenue_complement_01_lifecycle_coherence.sql
                                                            (Complément — REMPLACE admin_platform_counters
                                                             [ADMIN-01.1], admin_issue_manual_invoice [01B],
                                                             private.compute_due_billing_reminders [01C],
                                                             admin_run_billing_reminders [01C],
                                                             admin_get_organization_detail [ADMIN-BILLING-OPS-01],
                                                             admin_list_commercial_contacts /
                                                             _for_export [01I],
                                                             private.best_effort_revoke_sessions [01H])
```

**Dépendance la plus importante à comprendre** : `20260927090000_finance_admin_01_read_model.sql` (« Finance Admin 01 ») **existait avant** REVENUE-LAUNCH-01 et sa fonction `admin_finance_billing_extension` a été **remplacée** (jamais recréée depuis zéro) par 01E, puis n'a plus été touchée depuis (ni par 01H, ni par 01I, ni par le complément). C'est délibéré : le complément vérifie explicitement par pgTAP (`rls_revenue_complement_01_lifecycle_coherence.test.sql`, §3d) qu'une facture réglée par une Organization désormais archivée reste comptée par cette fonction — aucun filtre de statut n'y a jamais été ajouté, et ça reste vrai après le complément.

---

## 3. Ce que chaque migration remplace (`create or replace`) et pourquoi c'est sûr

PostgreSQL ne permet de changer la signature (paramètres/type de retour) d'une fonction qu'en la supprimant d'abord (`drop function`). Un simple `create or replace` avec une signature identique, en revanche, préserve tous les privilèges déjà accordés (`grant`) — jamais besoin de les réaccorder — et devient visible instantanément pour tout appelant existant, RLS incluse.

| Migration | Fonction remplacée | Signature | Sûr par... |
|---|---|---|---|
| ADMIN-01.1 | `admin_platform_counters` | inchangée | ajout de clés jsonb uniquement |
| ADMIN-01.1 | `admin_list_organizations` | **changée** (+2 params) | `drop function` explicite d'abord (l'ancienne signature à 2 paramètres serait sinon injoignable via PostgREST, qui ne résout jamais une surcharge) |
| 01H | `private.has_capability` | inchangée | ajout d'une clause `and o.status = 'active'` ; non-régression vérifiée par grep sur toutes les fixtures pgTAP/Node existantes (aucune n'attend un accès réussi pour `status = 'suspended'`) |
| 01E | `admin_finance_billing_extension` | inchangée | tous les agrégats Finance Admin 01 préexistants sont conservés à l'identique ; seuls de nouveaux agrégats (`manual_invoicing`, `reminders`) sont ajoutés à l'objet jsonb renvoyé |
| Complément | `admin_platform_counters` | inchangée | ajout de `organizations_archived` / `organizations_requiring_provider_action` uniquement |
| Complément | `admin_issue_manual_invoice` | inchangée | garde ajoutée en tête de fonction, avant toute autre validation |
| Complément | `private.compute_due_billing_reminders` | inchangée | jointure + clause de statut ajoutées à chacune des 5 branches du `union all` |
| Complément | `admin_get_organization_detail` | inchangée | ajout d'une clé jsonb (`providerActionRequired`) |
| Complément | `admin_list_commercial_contacts_for_export` | **changée** (+2 colonnes de retour) | `drop function` explicite d'abord, même raison qu'ADMIN-01.1 |
| Complément | `admin_list_commercial_contacts` | inchangée (retourne `jsonb`) | ajout de deux clés dans les lignes de l'objet renvoyé |
| Complément | `private.best_effort_revoke_sessions` | inchangée | corps simplifié en no-op (voir §6) |

**Remplacement de contraintes** (`check`) : la seule contrainte remplacée par les migrations Revenue est `organizations_status_check` (01H, `alter table ... drop constraint ... add constraint ... check (status in ('active','suspended','archived'))`). Un `drop`/`add` de contrainte `check` sur PostgreSQL est **atomique dans la même transaction** (chaque migration est déjà enveloppée `begin;`/`commit;`) : soit les deux opérations réussissent, soit aucune — aucune fenêtre où la table serait temporairement sans contrainte. La nouvelle contrainte est **strictement plus permissive** (ajoute `'archived'` sans retirer `'active'`/`'suspended'`) : elle ne peut donc jamais échouer sur une ligne déjà existante (voir aussi `administrative_audit_log_action_check`, remplacée deux fois selon le même schéma additif par 01H puis 01I, jamais restrictive).

---

## 4. Aucune valeur historique d'audit perdue

Vérifié pour chacune des 6 migrations :

- **Aucun `delete`** n'apparaît dans aucune des 6 migrations, sur aucune table (`grep -c "^\s*delete from" *.sql` = 0 pour les 6 fichiers Revenue + complément). Les seules suppressions dans tout le mandat étaient l'ancien `delete from auth.sessions` (01H, `best_effort_revoke_sessions`) — précisément ce que le complément retire (§6 ci-dessous).
- **Aucun `truncate`** nulle part.
- `administrative_audit_log.action` (contrainte `check`) est étendue de façon strictement additive à chaque migration qui y touche (01H ajoute 8 valeurs, 01I en ajoute 2) : aucune valeur existante n'est retirée, donc aucune ligne d'audit déjà écrite ne devient invalide rétroactivement.
- `billing_invoices`, `billing_events`, `billing_reminder_log`, `organization_subscriptions`, `admin_organization_notes` : toutes des tables **additives** (nouvelles colonnes avec `add column if not exists`, jamais de colonne supprimée) ou entièrement nouvelles. Une ligne insérée par une version antérieure du schéma reste lisible à l'identique après chaque migration suivante.
- Le complément (§3d de son propre en-tête) est le seul à **vérifier explicitement par pgTAP** qu'une facture réglée avant l'archivage d'une Organization reste comptée dans l'historique de facturation après son archivage — la garantie n'est donc pas seulement déclarée, elle est testée pour de vrai (voir `rls_revenue_complement_01_lifecycle_coherence.test.sql`).

---

## 5. Plan de rollback — documenté, jamais exécuté

**Aucune commande ci-dessous n'a été lancée sur un Supabase distant, ni même sur le cluster PostgreSQL local éphémère utilisé pour valider ce mandat.** Ce plan sert de référence si un retour arrière devait un jour être décidé par une personne humaine, après revue.

Principe général : revenir en arrière migration par migration, dans l'ordre **inverse** de celui du §2, en ne touchant jamais une migration antérieure à REVENUE-LAUNCH-01 (Finance Admin 01, ADMIN-01/01.1, lot_5c, ALIGN-03).

### 5.1 Complément (`20260927200000`)

Réversible par un `create or replace` inverse (recoller le corps des 7 fonctions à leur version 01B/01C/01H/01I/ADMIN-01.1 précédente) — **aucun `drop table`, aucune perte de données possible**, puisque le complément n'a créé aucune table ni colonne. Seule exception : `admin_list_commercial_contacts_for_export` a changé de signature (retour) ; un rollback complet exigerait de la `drop function` puis `create` avec l'ancienne signature à 9 colonnes (sans `organization_status`/`marketing_eligible`).

### 5.2 01I (`20260927190000`)

```sql
-- Réversible seulement si organization_commercial_contacts est vide ou que sa perte est acceptée :
drop function if exists public.admin_list_commercial_contacts_for_export();
drop function if exists public.admin_list_commercial_contacts(integer, integer, text);
drop function if exists public.admin_set_marketing_consent(uuid, boolean, text);
drop function if exists public.admin_upsert_organization_contact(uuid, text, text, text);
drop table if exists public.organization_commercial_contacts;
-- Retirer 'contact.updated'/'contact.marketing_consent_changed' de administrative_audit_log_action_check
-- SEULEMENT si aucune ligne existante ne les utilise (sinon la contrainte échoue à la création — signal
-- de sécurité correct, jamais à contourner par un DELETE de lignes d'audit).
```

### 5.3 01H (`20260927180000`)

La migration la plus sensible à défaire : `private.has_capability` reviendrait à sa version lot_5c (sans le filtre `organizations.status = 'active'`), et `organizations.status` perdrait la valeur `'archived'` — **impossible tant qu'une seule ligne `organizations.status = 'archived'` existe** (la contrainte `check` inverse échouerait, ce qui est le comportement voulu : jamais de perte silencieuse d'information en revenant en arrière). Une Organization déjà archivée devrait d'abord être restaurée (`admin_restore_organization`) avant ce rollback.

```sql
create or replace function private.has_capability(...) as $$ ... (version lot_5c, sans o.status) ... $$;
drop function if exists public.admin_suspend_organization(uuid, text);
-- ... (une drop function par RPC 01H) ...
drop table if exists public.admin_organization_notes;
alter table public.organizations drop constraint organizations_status_check;
alter table public.organizations add constraint organizations_status_check check (status in ('active', 'suspended'));
alter table public.organizations drop column suspended_at, drop column archived_at, drop column status_reason;
```

### 5.4 01E, 01C, 01B (`20260927170000`, `160000`, `150000`)

Même principe, dans l'ordre inverse : `admin_finance_billing_extension` reviendrait à sa version Finance Admin 01 (perdant les agrégats `manual_invoicing`/`reminders`, jamais les agrégats préexistants) ; `billing_reminder_log` et les colonnes additives de `billing_invoices`/`organization_subscriptions` (01B) seraient supprimées **seulement si vides** — sinon, comme au §5.3, le rollback doit être précédé d'une décision humaine explicite sur le sort des données déjà écrites, jamais d'un `delete` automatique.

### 5.5 Ce que ce plan ne fait délibérément jamais

- Aucune étape n'exécute quoi que ce soit contre KJORA Dev ou Production — ce document reste une référence écrite.
- Aucune étape ne supprime une ligne de données applicatives (facture, paiement, membership, note) pour rendre un rollback de schéma possible : si des données existantes bloquent un rollback (contrainte, table non vide), c'est un signal d'arrêt, jamais une raison de les effacer.
- Aucun appel fournisseur réel n'est impliqué à aucune étape.

# Gate E2E Découverte — Données de test créées en Production

**Date :** 2026-09-08
**Projet Supabase :** `alvheiwlfzuefljcfrtv`
**Déploiement testé :** `https://saas-kjora.vercel.app` (commit `de0e315`)
**Objet :** traçabilité des données créées pendant la validation réelle du tunnel Site → Découverte.

> Aucune donnée de test n'a été supprimée. Ce document existe pour que la suppression, si elle est décidée, soit un acte explicite et vérifiable.

---

## 1. Comptes de test créés

Deux utilisateurs réels ont été créés via le vrai parcours d'inscription (Magic Link), avec des adresses jetables lisibles le temps du test.

| # | Email | `user_id` | Créé le |
|---|---|---|---|
| 1 | `kjora-e2e-1788894013@uberip.com` | `2f34c1d6-3bcc-4e19-842e-95776ebe0f34` | 2026-09-08 19:03:45 UTC |
| 2 | `kjora-e2e-avance-1788894920@uberip.com` | `a3e0c4fe-6c5b-466b-8c23-34a10c176a31` | 2026-09-08 19:15:50 UTC |

Les boîtes jetables associées ne sont plus accessibles et n'ont pas vocation à l'être.

---

## 2. Organizations créées

| # | `organization_id` | Nom | Plan effectif | Intention | Onboarding |
|---|---|---|---|---|---|
| 1 | `8f0fd23a-1830-4bc1-9349-82c9d4d7d717` | E2E Gate Decouverte | `decouverte` | `decouverte` | `completed` |
| 2 | `74df3229-3951-4647-bb00-b1b1c8ff27d4` | E2E Intention Avance | `decouverte` | `avance` | `rent_method` |

L'Organization 2 a été volontairement laissée à l'étape `rent_method` : le test §6 ne portait que sur l'intention payante, et s'arrêter là limite le volume de données de test.

---

## 3. Données métier créées

| Ressource | Org 1 | Org 2 |
|---|---:|---:|
| Biens (`properties`) | 1 — « Immeuble E2E Gate », Douala Bonapriso | 0 |
| Logements (`units`) | 1 — « Appartement A1 », 120 000 XAF | 0 |
| Baux (`leases`) | 0 | 0 |
| Paiements (`payments`) | 0 | 0 |
| Échéances (`dues`) | 0 | 0 |
| Écritures Ledger | 0 | 0 |
| Documents financiers | 0 | 0 |
| Contrats | 0 | 0 |

**Point important :** aucun bail, paiement, échéance, écriture comptable ni document n'a été créé. Il n'existe donc **aucune écriture soumise à une obligation de rétention légale ou comptable** au sens de D-140 §8.2. C'est ce qui rend une suppression envisageable sans conflit avec la politique produit.

---

## 4. Impact sur les compteurs Production

| Compteur | Avant | Après |
|---|---:|---:|
| Organizations | 6 | 8 |
| Memberships actifs | 8 | 10 |
| Paiements | 7 | 7 (inchangé) |

Aucune donnée client réelle n'a été lue, modifiée ou supprimée.

---

## 5. Méthode de nettoyage proposée — à exécuter uniquement sur décision explicite

### 5.1 Option recommandée — suspension (réversible, conforme D-080)

La politique produit privilégie l'archivage à la suppression physique. Cette option neutralise les Organizations de test sans rien détruire :

```sql
begin;
update public.organizations
set status = 'suspended'
where id in (
  '8f0fd23a-1830-4bc1-9349-82c9d4d7d717',
  '74df3229-3951-4647-bb00-b1b1c8ff27d4'
);
-- Vérifier avant de valider :
select id, status from public.organizations
where id in ('8f0fd23a-1830-4bc1-9349-82c9d4d7d717','74df3229-3951-4647-bb00-b1b1c8ff27d4');
commit;
```

Effet : les deux Organizations disparaissent du contexte applicatif (le context resolver les exclut) tout en restant auditables.

### 5.2 Option suppression complète — irréversible

À n'utiliser que si tu veux effacer toute trace des comptes de test.

L'ordre est imposé par les contraintes : `properties` et `units` référencent `organizations` en `on delete restrict`, donc l'Organization ne peut pas partir tant que ses ressources existent. `onboarding_states` et `memberships` partent en cascade depuis `auth.users`.

```sql
begin;

-- 1. Ressources métier des Organizations de test
delete from public.units
where organization_id in ('8f0fd23a-1830-4bc1-9349-82c9d4d7d717','74df3229-3951-4647-bb00-b1b1c8ff27d4');

delete from public.properties
where organization_id in ('8f0fd23a-1830-4bc1-9349-82c9d4d7d717','74df3229-3951-4647-bb00-b1b1c8ff27d4');

-- 2. Plan, memberships, profil
delete from public.organization_plans
where organization_id in ('8f0fd23a-1830-4bc1-9349-82c9d4d7d717','74df3229-3951-4647-bb00-b1b1c8ff27d4');

delete from public.memberships
where organization_id in ('8f0fd23a-1830-4bc1-9349-82c9d4d7d717','74df3229-3951-4647-bb00-b1b1c8ff27d4');

delete from public.organization_profiles
where organization_id in ('8f0fd23a-1830-4bc1-9349-82c9d4d7d717','74df3229-3951-4647-bb00-b1b1c8ff27d4');

-- 3. Organizations
delete from public.organizations
where id in ('8f0fd23a-1830-4bc1-9349-82c9d4d7d717','74df3229-3951-4647-bb00-b1b1c8ff27d4');

-- 4. Utilisateurs (onboarding_states part en cascade)
delete from auth.users
where email in ('kjora-e2e-1788894013@uberip.com','kjora-e2e-avance-1788894920@uberip.com');

-- 5. Contrôle AVANT commit — doit renvoyer 6 organizations et 0 résidu
select
  (select count(*) from public.organizations)                                as organizations,
  (select count(*) from auth.users where email like 'kjora-e2e-%')           as users_test,
  (select count(*) from public.onboarding_states os
     join auth.users u on u.id=os.user_id where u.email like 'kjora-e2e-%')  as onboarding_test;

-- commit;   -- ne décommenter qu'après lecture du contrôle ci-dessus
rollback;    -- comportement par défaut : ne rien détruire
```

Le script est volontairement livré avec `rollback;` actif. Il faut un geste délibéré — commenter le `rollback` et décommenter le `commit` — pour qu'il détruise quoi que ce soit.

### 5.3 Ce qu'il ne faut pas faire

- Ne pas supprimer par `email like 'kjora-e2e-%'` sans vérifier d'abord la liste retournée.
- Ne pas toucher aux 6 Organizations préexistantes : RESIDENCE VERALUZ, residence pola, residence pauline, Residence pola, Immeuble Axel, STQ-BAT.
- Ne pas exécuter de `delete` sur `payments`, `dues`, `ledger_entries` ou `financial_documents` : ces tables sont append-only par décision produit (D-103), et de toute façon aucune ligne de test n'y figure.

---

## 6. Décision en attente

Aucune action de nettoyage n'est requise pour la santé de la Production. Les deux Organizations de test sont inertes : plan Découverte, aucun encaissement, aucun document.

Choix possibles :

1. **Ne rien faire** — les conserver comme jeu de test permanent pour les prochains gates.
2. **Suspendre** (§5.1) — les sortir du périmètre applicatif, réversible.
3. **Supprimer** (§5.2) — effacement complet, irréversible.

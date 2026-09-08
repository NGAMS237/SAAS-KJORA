# KJORA — Architecture Billing SaaS v0.1

**Statut :** ALIGN-03 — couche canonique livrée, aucun provider branché
**Date :** 2026-09-08
**Portée :** abonnement, cycle, états, factures, upgrade/downgrade, grâce, blocage, réactivation, abstraction provider
**Hors portée :** Stripe, CamPay, Flutterwave, PayUnit, ElyonPay, checkout réel, webhook réel, débit réel, remboursement réel, KJORA Collect → **ALIGN-04**

---

## 1. Trois domaines financiers étanches

```
Loyer          Locataire  →  Propriétaire     payments / dues / ledger_entries / financial_documents
Abonnement     Organization → VERALUZ SARL    organization_subscriptions / billing_invoices
KJORA Collect  (futur)                        encore un autre domaine
```

**Aucun rapprochement n'est permis entre ces domaines.** Contrôles automatisés :

- aucune clé étrangère du billing vers `payments`, `dues`, `ledger_entries`, `financial_documents` (pgTAP) ;
- aucun `insert`/`update`/`delete` du billing vers ces tables (tests Node sur le SQL) ;
- une facture SaaS n'est jamais un `financial_document`, et réciproquement.

---

## 2. Plan effectif vs plan souscrit

| | Table | Rôle |
|---|---|---|
| **Plan effectif** | `organization_plans` (ALIGN-01) | Gouverne les entitlements et les quotas. **Seule vérité.** |
| **Plan souscrit** | `organization_subscriptions.plan` | Ce que le client a demandé et payé. |

Le billing **ne duplique pas** les entitlements. Il ne peut pas non plus activer un plan payant : `request_plan_change` écrit `pending_plan`, jamais `organization_plans`. L'activation exige une confirmation de paiement vérifiée, livrée par ALIGN-04.

---

## 3. États et transitions

```
free ─────────► active ─────────► payment_failed ──► grace ──► billing_blocked
 │                │  ▲                    │            │              │
 │                │  └────────────────────┴────────────┘              │
 │                ▼                                                    ▼
 │        cancellation_scheduled ──► cancelled ◄──────────── reactivation_pending
 └────────────────────────────────────────────────────────────────────┘
```

| État | Accès métier | Sens |
|---|---|---|
| `free` | complet | Découverte : ni provider, ni carte, ni facture |
| `active` | complet | Abonnement réglé |
| `payment_failed` | complet | Échec constaté, relances en cours |
| `grace` | complet + avertissement | Tolérance de 7 jours |
| `billing_blocked` | **lecture seule** | Grâce expirée |
| `cancellation_scheduled` | complet | Fin programmée à l'échéance |
| `cancelled` | aucun | Période terminée |
| `reactivation_pending` | complet + avertissement | Retour, nouveau cycle |

`ALLOWED_TRANSITIONS` (`src/core/billing/model.ts`) est la référence : toute transition absente est un défaut.

---

## 4. Prix canoniques

Stockés en **unité mineure** : XAF sans décimale, CAD en centimes.

| Plan | XAF / mois | XAF / an | CAD / mois | CAD / an |
|---|---:|---:|---:|---:|
| Découverte | 0 | 0 | 0 | 0 |
| Essentiel | 5 900 | 59 000 | 14,99 | 149,90 |
| Avancé | 12 900 | 129 000 | 31,99 | 319,90 |
| Patrimoine | 24 900 | 249 000 | 61,99 | 619,90 |
| Sur mesure | devis | devis | devis | devis |

Annuel = **12 mois pour le prix de 10**, vérifié par test. **EUR et USD ne sont pas canonisés** et n'existent nulle part dans le code.

Le catalogue vit dans `public.billing_prices` : le devis est calculé en base, jamais transmis par le client.

---

## 5. Upgrade — prorata

```
crédit  = prix ancien plan × jours restants / jours de période
charge  = prix nouveau plan × jours restants / jours de période
montant = max(0, charge − crédit)
```

Le plancher à zéro traduit la règle « aucun remboursement automatique ».

**Exemple vérifié** — Avancé → Patrimoine, mensuel XAF, 15 jours restants sur 30 :
crédit 6 450, charge 12 450, **montant dû 6 000**.

L'upgrade enregistre une intention et renvoie le devis. **Rien n'est débité, rien n'est activé.**

---

## 6. Downgrade

Autorisé uniquement si l'usage actuel tient déjà dans les quotas du plan visé. Sinon : refus explicite listant chaque quota bloquant, avec valeur actuelle et limite.

**Aucune donnée n'est jamais supprimée ni archivée pour faire de la place.** Vérifié par test sur le SQL.

Un downgrade accepté est programmé pour la fin de la période déjà réglée.

---

## 7. Échec de paiement, grâce, blocage

| Moment | Fait |
|---|---|
| J0 | Échec constaté → `payment_failed` |
| J0, J+1, J+3, J+6 | Créneaux de relance (`RETRY_OFFSET_DAYS`) |
| J0 → J+7 | `grace` : accès complet + avertissement |
| J+7 non réglé | `billing_blocked` |

Les créneaux sont **préparés, jamais exécutés** : aucun provider n'est appelé dans ce lot.

---

## 8. Blocage — double verrou

**Verrou base (incontournable).** Le trigger `billing_blocked_insert_guard` refuse toute création de donnée métier sur 20 tables, et `billing_blocked_update_guard` toute modification de la vérité financière et contractuelle sur 9 tables. Il s'applique quel que soit l'appelant : RPC `SECURITY DEFINER` compris, appel REST direct compris.

**Verrou serveur (ergonomique).** `requireActiveCapability` renvoie `402` sur une capacité mutante lorsque l'Organization est bloquée, pour que l'interface explique au lieu de laisser survenir une erreur brute.

**Restent ouverts pendant le blocage :**

- Abonnement & facturation — c'est de là que le blocage se résout ;
- compte et profil ;
- support ;
- surfaces légales ;
- lecture de toutes les données existantes ;
- session et consultation du portail locataire, qui devient ainsi lecture seule sans être coupé.

**Aucune donnée n'est supprimée.** Le portail devient lecture seule parce que `contract_signatures` et `financial_documents` sont verrouillés, pas parce qu'on lui retire l'accès.

---

## 9. Réactivation

Nouveau cycle uniquement. **Aucun mois suspendu n'est facturé rétroactivement, aucune pénalité.** Les marqueurs de grâce et d'échec sont effacés à la demande de réactivation.

---

## 10. Factures

`billing_invoices` : numéro unique, Organization, plan, cycle, devise, montant en unité mineure, période, statut (`draft` / `open` / `paid` / `void` / `uncollectible`), date d'émission, date de règlement, référence provider.

Émetteur : **STE VERALUZ SARL** (D-143). Marque : KJEMO Studios. Produit : KJORA.

> Le format de facture **n'est pas encore validé fiscalement**. Aucune conformité n'est revendiquée avant revue juridique.

---

## 11. Abstraction provider

`src/core/billing/provider.ts` définit `BillingProviderAdapter` — **types uniquement, registre vide**.

Opérations : `createCheckout`, `createSubscription`, `cancelSubscription`, `retryPayment`, `fetchPaymentStatus`, `verifyWebhook`, `refund?` (optionnel : tous les providers ne remboursent pas).

Invariants imposés à tout futur adaptateur :

- aucun secret ne franchit la frontière serveur ;
- toute opération est idempotente par `idempotencyKey` ;
- un webhook rejoué est sans effet grâce à `providerEventId` (index unique en base) ;
- un plan payant n'est activé qu'après vérification du paiement ;
- seuls marque et 4 derniers chiffres d'un moyen de paiement sont stockés — jamais le numéro complet, contrainte SQL à l'appui.

---

## 12. Notifications

Dix événements définis dans `events.ts` : rappels J-7 / J-3 / J-1, succès, échec, ouverture de grâce, suspension imminente, blocage, annulation programmée, réactivation.

`channel.ts` décide de l'envoi : **si le canal transactionnel n'est pas configuré, l'événement est journalisé et aucun envoi n'est tenté.** On ne produit jamais un faux email.

---

## 13. Sécurité

- RLS sur les quatre tables ; lecture réservée aux porteurs de `billing.view`.
- **Aucune policy d'écriture client** : tout passe par des RPC `SECURITY DEFINER`, `search_path = ''`, `anon` révoqué.
- L'Organization vient toujours du contexte serveur, jamais du corps de requête.
- Le client n'envoie aucun montant.
- `billing.view` et `billing.manage` sont réservées à `organization_owner`.
- Journal `billing_events` de chaque changement d'état, avec l'acteur.

---

## 14. Administration plateforme — non livrée

Aucun rôle d'administrateur plateforme n'existe : D-025 fixe six rôles internes tenant-scoped et interdit tout rôle personnalisé au MVP. Créer un tel axe d'autorisation est une extension de l'architecture d'autorisation, pas un détail de facturation.

Ce lot livre donc les **données de diagnostic** (état, échéances, tentatives, factures, références provider, journal d'événements) exposées par RPC et lisibles par l'Organization Owner. La surface d'exploitation côté VERALUZ SARL et son modèle d'autorisation **restent à traiter dans un lot dédié**.

---

## 15. Statut

**ALIGN-03 = DONE — déployé en Production le 2026-09-08. Aucun provider branché, aucun débit possible.**

Migrations Production : `align_03_billing_saas` (20260908224111), `align_03_billing_rpcs` (20260908224204), `align_03_advisor_fixes`.

Gate de sortie : 315/315 tests Node, `tsc --noEmit`, ESLint et build confirmés, **39/39 assertions pgTAP contre le schéma réellement déployé**, cycle de vie complet vérifié en transaction annulée, Advisors sans nouvelle catégorie, zéro résidu de test.

Le verrou est **inerte** à la mise en service : aucune ligne `organization_subscriptions` n'existe, donc toutes les Organizations sont en `free`.

**ALIGN-04 = NEXT — provider selection and real payment integration.**

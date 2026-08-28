# Kjora — Payments, Allocations et corrections v0.1

> Lot 6C2 — **TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE**, le 2026-08-27.

## 1. Vérité financière

Un `Payment` constate uniquement de l’argent réellement reçu. Une `PaymentAllocation` explique quelle part de ce Payment couvre quelle Due. Les échéances restent des obligations attendues et le Ledger reste la chronologie financière explicable. Aucun champ de solde ou de crédit n’est modifiable directement.

Le solde interne conserve la convention 6C1 : `crédits - débits`. L’UI traduit toujours ce résultat en **Solde dû**, **Crédit disponible** ou **À jour**.

## 2. Payment

`public.payments` porte `organization_id`, `tenant_id`, `lease_id`, montant entier XAF, date réelle de réception, moyen, référence externe facultative, note, acteur, timestamps et état. Les moyens sont `cash`, `mtn_momo`, `orange_money`, `bank_transfer` et `other`.

La référence interne est générée sous la forme `PAY-AAAA-NNNNNN`. La clé d’idempotence est unique dans l’Organization et liée à une empreinte du contenu : rejouer la même intention retourne le même Payment ; réutiliser la clé avec un contenu différent est refusé.

Le statut transactionnel `recorded` n’est qu’un état interne à la RPC. Une confirmation réussie expose `confirmed`; une annulation compensatoire expose `reversed`. Aucun brouillon utilisateur n’est créé.

## 3. PaymentAllocation

`public.payment_allocations` relie un Payment à une ou plusieurs Dues du même Lease et du même Tenant. Chaque ligne conserve le total ainsi que sa ventilation stable en loyer, charges récurrentes, dépôt et ajustement. La contrainte impose :

`allocation = loyer + charges + dépôt + ajustement`.

L’ordre interne d’une Due est loyer, charges, dépôt, ajustement. Une allocation ne dépasse ni le reliquat de la Due ni le montant encore disponible du Payment.

## 4. Allocation automatique et manuelle

Par défaut, `confirm_payment` couvre les Dues périodiques exigibles à la date de réception, de la plus ancienne à la plus récente. Le dépôt et les échéances futures ne sont jamais sélectionnés automatiquement.

Avant confirmation, l’utilisateur autorisé peut modifier la proposition et cibler explicitement une Due future déjà générée ou une Due de dépôt. Aucune période lointaine n’est créée pour absorber un paiement. Tout reliquat non alloué devient un crédit Payment dans le Ledger et sera consommé par le mécanisme 6C1 lorsque les obligations périodiques apparaissent.

## 5. Crédit

Le crédit global est dérivé de deux provenances distinctes :

- `opening_credit`, issu du prépaiement documenté du Lease et jamais présenté comme Payment ;
- crédit de Payment, correspondant au montant confirmé non alloué.

Les projections appliquent ces crédits aux Dues `periodic` et `initial_prorata`, jamais automatiquement au dépôt. Elles exposent séparément crédit d’ouverture résiduel, crédit Payment résiduel, total disponible, périodes couvertes et reliquat de chaque Due.

## 6. Confirmation atomique et concurrence

`public.confirm_payment` vérifie `auth.uid()`, `payment.record`, le Lease, le tenant, les Dues, les montants, la date, la clé d’idempotence et les relations organization-scoped. Une transaction unique crée le Payment, ses allocations, l’écriture Ledger crédit et les événements `PAYMENT_RECORDED`, `PAYMENT_ALLOCATION_CONFIRMED`, puis `PAYMENT_COMPLETED`.

Un verrou transactionnel consultatif par `Organization + Lease`, les verrous de lignes Due et les contraintes uniques sérialisent les confirmations concurrentes. Toute erreur annule l’ensemble.

Les paiements antidatés sont autorisés à partir du 1er janvier 2000 et jusqu’à `current_date`. `ledger_statement` recalcule le running balance selon `occurred_on`, puis l’ordre métier et les timestamps ; `created_at` ne remplace jamais la date financière.

## 7. Correction et reversal

Les valeurs financières confirmées, allocations et Ledger sont append-only. Une erreur de montant, tenant, référence ou allocation utilise la stratégie MVP la plus simple : reversal complet du Payment original, puis nouveau Payment correct si nécessaire.

`public.reverse_payment` est réservé à `payment.correct`, accordée uniquement à `Organization Owner`. Un motif de 3 à 500 caractères est obligatoire. La fonction conserve le Payment et ses allocations, marque l’original `reversed`, ajoute une écriture Ledger débit du même montant et produit `PAYMENT_REVERSED`. Une seconde annulation est refusée.

Gestionnaire, encaisseur et comptable conservent `payment.correction.request` pour un futur workflow ; aucune correction directe ne leur est accordée dans 6C2.

## 8. RLS et exposition

Les deux tables activent RLS. `payment.view` autorise Owner, gestionnaire, encaisseur et comptable. Gardien, consultation, non-membre, autre Organization et `anon` ne lisent aucune ligne. `payment.record` autorise Owner, gestionnaire et encaisseur. Les RPC sont `SECURITY DEFINER`, `search_path` vide, retirées à `PUBLIC`/`anon` et revérifient toutes les capacités et relations.

Le portail locataire reste fermé jusqu’au modèle `TenantPortalAccess` du Lot 6E. Aucun Payment 6C2 n’est exposé publiquement.

## 9. UI

La page Paiements liste les encaissements réels avec filtres période, locataire, moyen et statut. Le workflow Nouveau paiement suit quatre étapes : Location, saisie, allocation, confirmation. Le détail Payment montre référence, moyen, acteur, allocations, crédit créé, snapshots Ledger et reversal éventuel.

Les détails Tenant et Location affichent les paiements réels et liens contextuels. Échéances et état de compte reprennent allocations, paiements et reversals depuis les projections. Reçu, quittance, PDF, email et notifications restent des placeholders honnêtes du Lot 6C3.

## 10. Déploiement

Migration appliquée en Production : `20260827230000_lot_6c2_payments_allocations.sql` (`lot_6c2_payments_allocations`). Elle ne contient aucun backfill de Payment et n’a créé aucun paiement fictif. Les 55 assertions 6C2 et les régressions 5B–6C1 totalisent 265 assertions Production réussies dans des transactions annulées ; aucune donnée de test ne persiste. Les advisors ne relèvent aucun défaut RLS, clé étrangère ou exposition anonyme introduit par le lot.

# KJORA — Dues, Charges et Ledger v0.1

## Périmètre

Le Lot 6C1 construit la vérité attendue : échéances, ventilation loyer/charges, dépôt séparé, crédit d’ouverture documenté et Ledger. Il ne crée aucun paiement, allocation, reçu, quittance, email ou notification.

## Modèle

`Lease` porte le contrat. `lease_financial_terms` versionne les changements futurs. `Due` porte une obligation et snapshotte ses montants. `ledger_entries` expose chaque débit/crédit. Les vues dérivent statut, restant, périodes couvertes et solde ; aucun champ `balance` arbitrairement éditable n’existe.

Le solde comptable est `crédits - débits` : positif = crédit locataire, négatif = dette. L’interface présente toujours une qualification textuelle.

Le total périodique affiché sur une Location est une donnée contractuelle fixe, ventilée en loyer + charges ; il ne représente jamais une réserve qui diminue. La consommation dans le temps est expliquée séparément par le crédit disponible, les périodes couvertes, le reliquat et la prochaine échéance non couverte.

## Calendrier et génération

Les périodicités avancent par 1, 3, 6 ou 12 mois. Le jour limite est borné au dernier jour valide du mois, même si le contrat MVP limite déjà la saisie à 1–28. `notice_date` est calculée en jours calendaires par `due_date - J-X`.

`private.generate_lease_dues` est idempotente grâce à `(organization_id, lease_id, generation_key)`, limitée à 240 périodes et sûre à relancer. Le job `kjora-generate-dues-daily` s’exécute chaque jour à 00:15 UTC via `pg_cron`. Il prépare les données de rappel J+10 mais n’envoie rien.

Dans l’interface, le calendrier est formulé en langage naturel (`Le 10 de chaque mois`, `Prochaine échéance : 10 septembre 2026`, `Avis prévu le 5 septembre 2026`). `J-X` reste une règle interne et contractuelle, pas le libellé principal destiné au propriétaire.

## Prorata

Les jours de début et de fin sont inclus. Le ratio `jours occupés / jours calendaires de la période` s’applique séparément au loyer et aux charges, puis chaque composante est arrondie au XAF le plus proche. Une correction manuelle conserve son motif contractuel.

Si une sortie est connue avant génération, la dernière Due est proratisée directement. Si elle est connue après génération, l’ancienne Due reste intacte et une correction débit/crédit append-only explique le nouveau net. Toute période déjà générée après la fin est conservée comme `cancelled` et neutralisée par une correction Ledger.

## Crédit d’ouverture

À l’activation, un montant `initial_prepayment_amount_xaf` supérieur à zéro crée une ligne `opening_credit` avec la provenance `leases.initial_prepayment_amount_xaf` et `is_payment = false`. Le moteur peut alors expliquer les périodes entièrement couvertes, le reliquat, la dernière période prépayée et la prochaine échéance non couverte sans fabriquer de paiement.

## Sécurité

Les tables ont RLS et des relations tenant-scoped. `due.view` autorise Owner, gestionnaire, encaisseur et comptable. Gardien, consultation, non-membre, autre Organization et rôle `anon` ne voient rien. Les écritures passent par les fonctions contrôlées ou le job privé ; les clients ne peuvent ni insérer ni modifier la vérité financière.

Le portail réel n’est pas exposé en 6C1 faute de `TenantPortalAccess`, prévu en 6E. Les projections 6C1 seront réutilisées par ce portail sans copie de données.

## Validation Production

La migration et ses durcissements append-only sont appliqués au projet KJORA. Le job quotidien unique a fait évoluer naturellement Production à 3 baux actifs, 17 Dues et 29 lignes Ledger au contrôle du 27 août 2026. Ces volumes sont un instantané opérationnel, pas un invariant ; aucun Payment n’existait avant l’activation distincte de 6C2.

Les suites pgTAP 5B à 6C1 totalisent 210 assertions réussies avec rollback. Les RPC publics de génération et de programmation de termes sont intentionnellement `SECURITY DEFINER`, refusés à `anon` et contrôlés par `lease.manage`. Les avis d’index inutilisés sont attendus immédiatement après création ; les index de relations et de lecture chronologique restent nécessaires.

## Extension Lot 6C2 — paiements réels

Le Lot 6C2 ajoute `payments` et `payment_allocations` sans modifier les Dues historiques. Un Payment confirmé ajoute une ligne Ledger crédit ; ses allocations réduisent explicitement le restant des Dues. Le montant non alloué reste un crédit Payment et la projection 6C1 l’applique ensuite aux obligations périodiques, sans l’assimiler au crédit d’ouverture.

L’allocation automatique cible uniquement les Dues périodiques exigibles, dans l’ordre chronologique. Le dépôt et les Dues futures demandent une sélection explicite. Dans chaque Due, la ventilation stable est loyer puis charges ; le dépôt reste une obligation séparée.

Un Payment `reversed` cesse de contribuer aux allocations et au crédit disponible. Son écriture Ledger initiale reste intacte et une ligne `payment_reversal` de sens inverse restaure la position financière. Les running balances restent recalculables par date financière, y compris pour un Payment antidaté.

Voir `PAYMENTS-ALLOCATIONS-v0.1.md` pour les RPC, l’idempotence, les verrous de concurrence et le RBAC. Aucun reçu, quittance, PDF ou message n’est produit par 6C2.

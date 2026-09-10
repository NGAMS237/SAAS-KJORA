# KJORA — Migration de données (IMPORT-01) — v0.1

Statut : implémenté, gate technique local complet vert (tests, tsc, ESLint, build), migration Production appliquée et vérifiée sur le projet Supabase KJORA (`alvheiwlfzuefljcfrtv`), gate SQL transactionnel de 57 assertions pgTAP vert contre le schéma Production réel. Code applicatif non encore poussé sur `main` / non encore déployé sur Vercel (voir PROJECT_STATE.md — commit/push en attente d'identité Git). Aucun import réel de donnée client n'a eu lieu.

## 1. Objectif

Permettre à un propriétaire/gestionnaire qui utilisait déjà Rentila, un fichier Excel ou un CSV de reprendre son parc (biens, logements, locataires, baux) dans KJORA **sans ressaisie complète** et **sans fabriquer un faux historique financier**. Le principe central : KJORA n'assume jamais qu'un client qui migre "part de zéro" — on importe sa **situation réelle au jour de la migration**.

Exemple canonique : un bail a démarré en mars 2023, le locataire est toujours en place, le loyer actuel est connu, 3 mois sont impayés, et la migration a lieu en 2026. KJORA enregistre la vraie date de début, l'unité, le locataire, le loyer réel — et une dette d'ouverture de 3 mois — **sans** recréer 42 lignes de paiement fictives depuis mars 2023.

## 2. Modèle : situation d'ouverture (loyer)

Trois situations possibles à la date de migration, portées par un unique champ `opening_situation` par ligne importée :

- **À jour** (`even`) : aucun arriéré. KJORA calcule le nombre d'échéances déjà "écoulées" depuis le début réel du bail jusqu'à aujourd'hui, et crée un crédit d'ouverture qui les couvre exactement.
- **Dette d'ouverture** (`debt`, montant en XAF) : le locataire doit un arriéré. KJORA calcule le montant total attendu sur les échéances écoulées, puis crée un crédit d'ouverture égal à (attendu − dette déclarée) — ce qui laisse exactement le solde déclaré comme restant dû.
- **Crédit d'ouverture** (`credit`, montant en XAF) : le locataire a payé d'avance. KJORA crée un crédit d'ouverture égal à (attendu sur les échéances écoulées + avance déclarée), qui couvre les échéances futures d'autant.

**Mécanisme technique** : ce "crédit d'ouverture" n'est pas une nouvelle mécanique — c'est le champ `leases.initial_prepayment_amount_xaf`, déjà en Production depuis le Lot 6C1. En le renseignant à la création du bail, le trigger existant crée automatiquement une ligne `ledger_entries` de type `opening_credit`, que la vue `dues_with_status` applique aux échéances périodiques les plus anciennes d'abord. IMPORT-01 réutilise ce mécanisme tel quel — **aucune fonction, trigger ou vue financière existante n'est modifiée**.

Le nombre d'échéances "déjà écoulées" est calculé en **reproduisant exactement** la boucle de génération de `private.generate_lease_dues` (mêmes règles de date d'échéance, même `notice_date`, ancrées sur la date réelle du jour — pas sur la date de migration déclarée), afin que le crédit d'ouverture calculé corresponde à l'échéance que le moteur va réellement générer. Une différence d'un jour dans cette logique produirait un solde d'ouverture faux.

**Règle absolue (§14 du cahier des charges)** : IMPORT-01 ne crée **jamais** de ligne dans `public.payments`. Une dette ou un crédit d'ouverture n'est pas un paiement historique — c'est un mouvement d'ouverture explicite, identifiable comme tel dans le grand livre.

## 3. Modèle : dépôt de garantie

Le dépôt de garantie est **toujours strictement séparé** du loyer — un crédit d'ouverture loyer ne peut jamais couvrir le dépôt, et réciproquement. Quatre statuts possibles (`deposit_situation.status`) :

- `not_required` : aucun dépôt exigé pour ce bail.
- `due` : dépôt exigé, rien n'a encore été payé.
- `partial` : dépôt exigé, un montant partiel a déjà été payé (`paid_amount_xaf`, strictement entre 0 et le montant requis).
- `paid` : dépôt exigé et intégralement payé.

**Mécanisme technique** : quand un montant a déjà été payé (`partial` ou `paid`), IMPORT-01 crée une `Due` de type `adjustment` (crédit), avec `adjusted_due_id` pointant explicitement sur la `Due` de dépôt de ce bail — exactement le même mécanisme déjà utilisé en Production par `cancel_lease_future_dues` pour les ajustements de sortie. Ce ciblage explicite (par `adjusted_due_id`, et par le filtre `kind in ('periodic','initial_prorata')` dans `dues_with_status` pour l'application du crédit d'ouverture loyer) garantit qu'un crédit ne peut jamais "fuiter" d'un domaine financier vers l'autre — vérifié par un scénario de gate dédié (voir §7).

## 4. Niveaux d'import

L'import est progressif : un fichier peut ne contenir que des biens et logements (niveau 1), ajouter les locataires (niveau 2), les baux (niveau 3), ou la situation financière d'ouverture complète (niveau 4). Le moteur ne force jamais un niveau supérieur : un dépôt ou une situation d'ouverture absents du fichier sont traités comme "à jour" / "non requis" par défaut.

## 5. Format de fichier et architecture de mapping

Formats acceptés : `.csv` et `.xlsx` (jamais `.xlsm` avec macros). Le fichier est un tableau plat, **une ligne = un bail** (le bien, le logement et le locataire de chaque ligne sont résolus/dédupliqués côté serveur par empreinte).

Le moteur de mapping colonnes → champs KJORA (`src/modules/data-import/mapping.ts`) est **générique** : un `ImportPreset` est une simple fonction qui propose un mapping par défaut à partir des en-têtes détectés. Le preset `kjora_native` reconnaît notre propre modèle téléchargeable. **Aucun preset Rentila n'a été codé** : le cahier des charges (§6, §29) interdit explicitement de deviner un format Rentila supposé. Un futur `ImportPreset` Rentila viendra s'ajouter à la liste `PRESETS` sans changer le moteur ni le format de sortie (`MappedRow`), une fois qu'un export Rentila réel aura été inspecté.

Le modèle téléchargeable `KJORA-IMPORT-TEMPLATE.xlsx` (`/api/data-import/template`) contient des colonnes documentées et des exemples **fictifs uniquement**.

## 6. Assistant en 7 étapes

1. **Importer le fichier** — sélection du fichier + date de migration.
2. **Contenu détecté** — nombre de lignes, confirmation.
3. **Correspondance des colonnes** — mapping proposé automatiquement, ajustable ligne par ligne.
4. **Vérification** — chaque ligne est classée valide / avertissement / erreur (voir §7 ci-dessous) ; une ligne en erreur ne peut pas être importée.
5. **Doublons potentiels** — pour chaque correspondance probable avec un bien/logement/locataire déjà existant, l'utilisateur choisit explicitement : associer à l'existant, ou créer quand même comme nouveau. Aucune fusion automatique silencieuse.
6. **Aperçu final** — récapitulatif complet ; **aucune écriture n'a encore eu lieu**.
7. **Import** — un seul appel, transactionnel, à `commit_data_import`.

Les étapes 1 à 6 n'appellent que `/api/data-import/preview`, qui ne fait **aucune écriture** — elle lit seulement le contexte existant de l'Organization pour détecter doublons et quotas. Seule l'étape 7 appelle `/api/data-import/commit`.

## 7. Validation

Détectées avant tout import (`src/modules/data-import/validation.ts` + vérifications côté serveur dans `server.ts`) : bien manquant, logement inconnu, locataire sans nom, e-mail invalide, loyer négatif ou nul, date de début invalide, bail sans logement, doublon probable (bien/locataire, par empreinte normalisée + distance de Levenshtein sur petites variations orthographiques), locations concurrentes incompatibles sur la même unité, dette/crédit incohérent, dépôt payé supérieur au dépôt requis.

Le contrôle de cohérence dette/crédit affiché dans l'assistant est une **estimation calendaire à titre d'avertissement** ; le contrôle **exact et bloquant**, aligné sur le moteur d'échéances réel, est fait par la RPC `commit_data_import` elle-même au moment de la validation finale (défense en profondeur : même si l'assistant affichait un mauvais avertissement, l'écriture réelle resterait protégée).

Locations concurrentes : protégées nativement par la contrainte d'exclusion PostgreSQL `leases_active_period_no_overlap` déjà en Production (aucune logique applicative dupliquée) — vérifié par un scénario de gate dédié.

## 8. Identifiant d'import, idempotence, transaction

Chaque import crée une ligne `data_imports` (organisation, utilisateur, source, nom de fichier, empreinte SHA-256 du fichier, compteurs) et une ligne `data_import_rows` par ligne traitée — **sans aucune donnée personnelle** (pas de nom, téléphone ou e-mail dans l'audit). Le fichier brut n'est jamais conservé.

**Idempotence** : réimporter exactement le même fichier (même empreinte SHA-256, même Organization) ne rejoue rien — la RPC retourne immédiatement `already_imported: true`. Au niveau de chaque entité (bien/logement/locataire), une table `data_import_fingerprints` (empreinte normalisée → identifiant) empêche la recréation d'un doublon même à travers deux fichiers différents référençant la même entité.

**Transaction** : tout l'import est un seul appel à une fonction PostgreSQL — donc une seule transaction. Toute erreur (validation, doublon, quota, conflit de location) annule l'intégralité des écritures déjà faites dans cet appel : aucune Organization ne peut se retrouver "à moitié importée". Vérifié en direct : un import de 2 biens sur un plan limité à 1 échoue avec `PLAN_PROPERTY_LIMIT_REACHED`, et **zéro** bien ne reste en base après l'échec.

## 9. Quotas et RBAC

Le quota du plan est vérifié et affiché **avant** l'import (étape 4, avec lien "Voir les offres") ; il est aussi appliqué de façon incontournable par les triggers déjà en Production (`enforce_property_quota`, `enforce_active_unit_quota`), qui s'exécutent pour tout `INSERT` quel que soit l'appelant — y compris cette fonction `security definer`. Aucun import partiel ne peut donc jamais contourner un quota.

L'accès est protégé par une nouvelle capability `data_import.manage`, accordée par défaut au seul `organization_owner` (deny by default) ; un Manager ne l'obtient que si elle lui est explicitement accordée via la gestion des rôles.

## 10. Sécurité fichier

MIME/extension/taille (5 Mo max)/nombre de lignes (500 lignes métier, 5000 lignes de parsing) vérifiés avant tout traitement. Les fichiers `.xlsm` (macros) sont explicitement refusés. Le contenu n'est **jamais exécuté** : le parseur XLSX désactive explicitement l'évaluation de formules et le VBA (SheetJS, options `cellFormula: false`, `bookVBA: false`) ; toute valeur commençant par `=`, `+`, `-` ou `@` est neutralisée avant tout affichage (protection contre l'injection CSV/formule). Aucune récupération d'URL externe n'est jamais déclenchée à partir du contenu d'un fichier importé.

## 11. Historique Rentila (non fait, volontairement)

Un futur import optionnel de l'historique complet des dus/paiements passés (au-delà de la simple situation d'ouverture) reste possible, mais n'est **pas** dans le périmètre d'IMPORT-01.

## 12. Fichiers

- Migration : `supabase/migrations/20260909160000_import_01_data_migration.sql` (tables `data_imports`/`data_import_rows`/`data_import_fingerprints`, RPCs `commit_data_import`/`list_data_imports`, capability `data_import.manage`).
- Backend : `src/modules/data-import/{model,csv,xlsx,security,mapping,normalize,validation,dedup,commit-payload,server}.ts`.
- API : `src/app/api/data-import/{preview,commit,history,template}/route.ts`.
- UI : `src/app/(internal)/app/parametres/import/page.tsx`, `src/modules/data-import/wizard-view.tsx`, entrée dans `src/app/(internal)/app/parametres/page.tsx`.
- Tests : `tests/data-import.test.ts` (26 scénarios Node) et `supabase/tests/database/import_01_data_migration.test.sql` (57 assertions pgTAP, rollback).

## 13. Décision — modèle de classeur XLSX (feuille unique conservée)

Le modèle téléchargeable expose maintenant 7 feuilles : `Import` (seule feuille lue par `parseXlsx()`, format plat "une ligne = un bail", position figée en premier), cinq feuilles de référence non lues (`Biens`, `Logements`, `Locataires`, `Locations`, `Situation d'ouverture` — vocabulaire métier, aide au remplissage) et `Lisez-moi`. Décision volontaire : le moteur d'ingestion reste le format plat déjà testé (pgTAP + Node) plutôt que de migrer vers un vrai classeur relationnel à onglets liés. Une évolution vers un modèle multi-feuilles réellement lié est explicitement hors scope d'IMPORT-01 et laissée à une décision future (voir `DECISIONS.md`).

## 14. Checklist — premier import supervisé réel (préparée, **NON exécutée**)

Cette checklist est livrée prête à l'emploi pour le premier import d'un vrai client (probablement migration Rentila). **Aucune étape n'a été exécutée dans ce lot** : aucune vraie donnée client n'a été importée, conformément à la contrainte explicite du cahier des charges IMPORT-01.

1. **Export Rentila** — exporter les données réelles du client depuis Rentila (biens, logements, locataires, baux, situation financière courante) dans le format natif disponible (CSV/Excel).
2. **Copie brute conservée** — sauvegarder une copie intacte du fichier exporté avant toute manipulation (traçabilité, rejouabilité en cas d'erreur de mapping).
3. **Inspection des colonnes réelles** — ouvrir l'export et lister exactement les en-têtes de colonnes réels produits par Rentila (ils n'ont jamais été supposés dans IMPORT-01 — voir §5).
4. **Preset Rentila (si utile)** — si le mapping manuel s'avère répétitif ou source d'erreur, écrire un `ImportPreset` dédié dans `mapping.ts` à partir des en-têtes réels observés à l'étape 3 (sans changer le moteur ni `MappedRow`) ; sinon, mapping manuel via l'assistant à l'étape 3 du wizard.
5. **Conversion au format plat KJORA** — transposer l'export Rentila (souvent multi-feuilles ou multi-tables) vers le format plat "une ligne = un bail" attendu par `parseXlsx()`/`parseCsv()`, ou construire le preset de l'étape 4 pour le faire automatiquement.
6. **Dry-run (étapes 1 à 6 du wizard uniquement)** — importer le fichier jusqu'à l'étape 6 "Aperçu final" **sans jamais déclencher l'étape 7**. Vérifier : nombre de lignes détecté correct, mapping des colonnes correct, aucune ligne en erreur bloquante inattendue.
7. **Validation ligne par ligne des doublons** — pour chaque correspondance probable (bien/logement/locataire) proposée à l'étape 5 du wizard, décider explicitement association à l'existant vs création — ne jamais laisser une fusion automatique implicite.
8. **Contrôle quota** — vérifier que le plan de l'Organization cliente a une capacité suffisante (biens actifs, logements actifs) pour absorber l'import ; ajuster le plan avant l'import si nécessaire pour éviter un rollback complet en étape 7.
9. **Contrôle tenant-par-tenant de la situation d'ouverture** — pour chaque bail, vérifier manuellement avec le client : la date de début réelle du bail, le statut déclaré (à jour / dette / crédit) et le montant associé, le statut du dépôt de garantie (non requis / dû / partiel / payé) et le montant déjà perçu. Ces montants doivent venir d'une source fiable (relevé Rentila, confirmation du client) — jamais d'une estimation.
10. **Sauvegarde préalable** — s'assurer qu'un point de restauration Production (sauvegarde Supabase) récent existe avant l'étape 7 réelle, par précaution supplémentaire au-delà de la garantie transactionnelle déjà offerte par `commit_data_import`.
11. **Import réel supervisé** — déclencher l'étape 7 (`commit_data_import`) en présence d'une personne qui supervise, sur un fichier déjà validé aux étapes 6 à 9 ci-dessus.
12. **Rapport post-import** — après l'import réel, produire un rapport court : nombre de biens/logements/locataires/baux créés, montant total des crédits/dettes d'ouverture générés, dépôts créés, éventuelles lignes rejetées et pourquoi, confirmation qu'aucune ligne `payments` n'a été créée par l'import (uniquement des `ledger_entries`/`dues` d'ouverture).

**Ne pas exécuter ce premier import réel maintenant** — cette checklist est une préparation, pas une exécution.

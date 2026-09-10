# KJORA — Export de données, envoi de documents et gating des offres (EXPORT-01) — v0.1

Statut : implémenté (code applicatif + migration écrite), migration **non appliquée en Production** dans ce lot (décision assumée, cf. §9). Gate technique local (tests/tsc/ESLint/build) non exécuté dans ce lot : le sandbox shell de la session était indisponible. Aucun commit/push, aucune donnée réelle exportée ou envoyée.

## 1. Objectif

Trois volets livrés ensemble :

- **EXPORT-01** : un propriétaire/gestionnaire autorisé peut exporter, en lecture seule, les données de son Organization au format CSV, XLSX ou ZIP (XLSX + documents PDF).
- **Document Delivery** : rendre explicite l'envoi de documents financiers par email — plus de bouton silencieusement désactivé, des modals clairs quand l'email est absent ou le service indisponible.
- **Feature Gating UX** : remplacer les redirections brutales par des modals d'upgrade en place, distinctes des modals de quota déjà existantes.

## 2. EXPORT-01 — formats et portée

Trois formats, un seul niveau d'entitlement décidant du format disponible :

- **CSV** — un seul scope à la fois (`properties`, `units`, `tenants`, `leases`, `dues`, `payments`, `payment_allocations`, `credits`, `deposits`, `account_statements`). Nécessite `exports_standard` (offre Essentiel et plus).
- **XLSX** — plusieurs scopes en feuilles séparées d'un même classeur (les 10 scopes ci-dessus, hors documents/contrats). Nécessite `exports_standard`.
- **ZIP** — le classeur XLSX complet + les PDF des documents financiers et contrats (jusqu'à 300 documents), plus un `manifest.json`. Nécessite `exports_advanced` (offre Avancé et plus).

Ces deux entitlements (`exports_standard`, `exports_advanced`) existaient déjà dans `PLAN_FEATURES` (`src/core/entitlements/model.ts`) sans jamais avoir été câblés à une fonctionnalité réelle — EXPORT-01 est leur premier usage, conformément à la contrainte de ne pas inventer de nouvelle règle d'entitlement.

## 3. Lecture strictement en lecture seule

Aucune écriture de donnée métier n'a lieu pendant un export. Chaque lecteur de scope (`src/modules/data-export/server.ts`) utilise `createSupabaseServerClient()` — le client authentifié de l'utilisateur, jamais un client `service_role` — de sorte que l'isolation entre Organizations repose sur les politiques RLS déjà en place sur chaque table, pas sur une logique applicative nouvelle. Le fichier n'est jamais persisté : chaque téléchargement régénère le contenu à la volée à partir des paramètres enregistrés (`format`, `scope`, plage de dates) au moment de la demande.

## 4. Sécurité du contenu

- **Neutralisation des injections CSV/XLSX** : toute valeur commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot est préfixée d'une apostrophe avant écriture (`sanitizeForDisplay`, réutilisée telle quelle depuis IMPORT-01 — une seule source de vérité pour les deux directions).
- **PDF dans le ZIP** : jamais rendus publics — récupérés via URL signée à durée de vie de 120 secondes sur un bucket privé, jamais via un lien permanent.
- **Aucune donnée d'authentification** (mot de passe, jeton, secret) n'apparaît dans un export : les lecteurs de scope ne sélectionnent que des colonnes métier explicites, jamais `select *`.

## 5. RBAC et journal d'audit

Nouvelle capability `data_export.manage`, deny-by-default, seedée uniquement pour `organization_owner` — même politique que `data_import.manage`. Elle reste utilisable même quand la facturation de l'Organization est bloquée (`CAPABILITIES_ALLOWED_WHEN_BLOCKED`), car l'export est un accès en lecture seule à ses propres données ("lecture intégrale" — même philosophie qu'ALIGN-03).

Chaque demande d'export est journalisée dans `public.data_exports` (organisation, demandeur, format, scope, plage de dates, nombre de lignes par scope, statut, date/nombre de téléchargements) — **jamais** le contenu du fichier ni de donnée personnelle. Deux RPC `SECURITY DEFINER` (`request_data_export`, `record_data_export_download`) revérifient la capability et l'entitlement de plan **côté base**, en plus de la vérification côté serveur Next.js — défense en profondeur, même schéma que `commit_data_import`.

## 6. Interface

`Paramètres → Mes données → Exporter` (`/app/parametres/export`) : sélecteur de format, sélecteur de scope (liste déroulante pour CSV, cases à cocher pour XLSX), plage de dates optionnelle, bouton de préparation, puis un panneau de résultat (nombre de lignes total, taille estimée, détail par scope, lien de téléchargement) et un historique des 50 derniers exports. Cliquer sur ZIP sans l'entitlement `exports_advanced` ouvre `FeatureUpgradeModal` au lieu de changer de format — porte proactive, avant tout appel serveur.

## 7. Document Delivery — envoi explicite

Le bouton renommé **« Envoyer par email »** (`src/modules/documents/views.tsx`, `DocumentRow`) reste toujours cliquable ; son comportement dépend de deux conditions vérifiées côté client puis revérifiées côté serveur :

1. **Email locataire absent** (`document.tenantEmail` nul) → modal **« Adresse email manquante »** — « Aucune adresse email n'est renseignée pour ce locataire. » — avec un bouton *Ajouter l'email* qui ouvre la fiche locataire à `?focus=email` (le formulaire s'ouvre déjà en édition, champ email pré-focalisé) et un bouton *Annuler*.
2. **Service d'envoi indisponible** (`KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED` désactivé) → modal **« Envoi par email indisponible »** — « L'envoi automatique n'est pas encore disponible. Vous pouvez télécharger le PDF et l'envoyer manuellement. » — avec un bouton *Télécharger le PDF* (même lien que le bouton PDF existant) et un bouton *Fermer*.
3. Sinon → mise en file réelle (`queue_financial_document_email`), avec message de confirmation distinct ("Envoi programmé à ‹email›").

Les erreurs renvoyées par l'API (`/api/financial-documents`, action `queue_email`) sont mappées en messages utilisateur clairs (`friendlyDeliveryError`) — jamais un code Postgres brut. Côté serveur, l'action vérifie désormais `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED` **avant** d'appeler le RPC : sans cette garde, une demande pouvait rester indéfiniment "pending" sans que le worker cron ne la traite ni ne la signale en échec.

**Les contrats restent hors de ce périmètre** : `send_lease_contract` n'insère qu'une notification in-app scoppée à l'accès portail du locataire — aucun canal email n'existe pour les contrats, par choix délibéré déjà acté (D-134/D-137/D-138). Étendre "Envoyer par email" aux contrats aurait nécessité de créer un nouveau canal, hors périmètre de ce lot.

## 8. Feature Gating UX

Deux modals, rôles disjoints :

- **`QuotaLimitModal`** (existante, **inchangée**) : réactive — se déclenche après une réponse serveur de dépassement de quota (nombre de biens, collaborateurs, etc.).
- **`FeatureUpgradeModal`** (nouvelle, `src/core/entitlements/feature-upgrade-modal.tsx`) : proactive — se déclenche côté client, avant tout appel serveur, quand l'entitlement de plan est déjà connu au chargement de la page. Toujours : rappel qu'aucune donnée n'est modifiée, bouton *Continuer ici* qui ferme simplement la modal (aucune navigation forcée), et un vrai lien *Voir les offres* vers `/app/billing`.

Câblée sur les deux points d'entrée actionnables identifiés : la carte Contrats et la carte Export dans Paramètres (`FeatureEntryCard`), et le CTA de génération de contrat sur la fiche de location (`ContractEntryLink`, qui remplace un CTA auparavant silencieusement masqué quand l'entitlement manquait). Un indicateur premium discret (`PremiumBadge`, icône de cadenas + offre minimale) accompagne chaque CTA verrouillé.

Les surfaces déjà basées sur un quota — collaborateurs, biens/logements, Organizations supplémentaires — ne sont **pas** touchées : elles continuent d'utiliser `QuotaLimitModal`, car un dépassement de quota n'est pas un manque de fonctionnalité.

## 9. Décision : migration non appliquée en Production dans ce lot

Contrairement à IMPORT-01, la spécification de ce lot ne demandait pas explicitement le déploiement en Production. La migration `20260909180000_export_01_data_export.sql` est écrite, revue et couverte par des tests statiques (`tests/data-export.test.ts`), mais reste en attente d'application — aucune table ni fonction EXPORT-01 n'existe donc encore en Production à ce stade. L'application effective (et le gate pgTAP transactionnel contre le schéma réel qui doit l'accompagner) est un prérequis avant toute utilisation réelle.

## 10. Limites connues (v0.1)

- Le ZIP est produit avec un writer maison (méthode STORE, sans compression) : pas de dépendance externe ajoutée, mais des fichiers plus volumineux qu'avec un ZIP compressé.
- Le ZIP plafonne à 300 documents financiers/contrats ; au-delà, seuls les 300 premiers sont inclus (le manifeste le précise).
- Aucun export planifié/récurrent : chaque export est une demande explicite et ponctuelle.
- Le format CSV n'accepte qu'un seul scope à la fois (pas de fusion multi-tableaux hors XLSX/ZIP).

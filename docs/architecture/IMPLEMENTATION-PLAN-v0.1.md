# Kjora — Plan d’implémentation v0.1

> Mise à jour 2026-08-28 : le **Lot 6C3** est testé et déployé selon D-108 à D-117. Aucun backfill des 5 Payments antérieurs et aucun email réel n’ont été exécutés ; validation fonctionnelle Blaise en attente.

> Jalon 2026-08-27 : la **Visual Direction v2A** a été implémentée sur les tokens globaux et trois écrans pilotes (Dashboard, détail Locataire, détail Location), selon D-091. À ce jalon, v2B et 6C1 étaient non commencés.

> Mise à jour 2026-08-26 : le Lot 6B Locataires + Locations et son patch 6B.1 UX / préparation financière sont **TERMINÉS / TESTÉS / DÉPLOYÉS — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE** selon D-086 à D-090. Le Lot 6A conserve séparément sa validation fonctionnelle en attente ; 6C1 reste non commencé.

> Gate 2026-08-26 : PIN et Lot 5C sont **TERMINÉS / TESTÉS / VALIDÉS**. D-081 a autorisé 6B sans valider rétroactivement 6A. Le prochain gate est la validation fonctionnelle Blaise du Lot 6B ; ne pas démarrer 6C1 avant autorisation distincte.

> Statut : **PLAN VALIDÉ PAR BLAISE — D-072 à D-077**  
> Portée : ordre de développement futur en petits lots testables  
> Important : ce document ne démarre ni le Lot 5 ni une implémentation

## 1. Objectif

Obtenir rapidement une application manipulable, puis ajouter la sécurité tenant et la boucle métier par incréments démontrables. Chaque lot doit produire un résultat testable par Blaise et une preuve automatisée proportionnée au risque.

## 2. Principes de livraison

- Un seul lot actif à la fois.
- Critères de sortie vérifiés avant le lot suivant.
- Aucune feature tenant-scoped sans test Org A/Org B, non-membre et rôle insuffisant.
- Aucune action sensible sans test de permission à la confirmation.
- Aucun raccourci temporaire qui désactive RLS en environnement partagé.
- Données de démonstration fictives, jamais de données réelles de locataires.
- Versions verrouillées et dépendances minimales après validation de la stack.
- Mobile-first et FR/EN vérifiés dans chaque tranche visible.
- Feature flags pour masquer une capacité incomplète sans créer une seconde architecture.

## 3. Gates avant implémentation

| Gate | Décision | État / effet |
|---|---|---|
| G-01 | D-072 — Next.js/TypeScript/PWA et trajectoire Capacitor | **SATISFAITE** pour préparer 5A |
| G-02 | D-073 — frontière serveur/RLS/outbox + worker | **SATISFAITE** ; runtime du worker choisi à l’implémentation |
| G-03 | D-074 — LOCAL/DEV, STAGING, PRODUCTION et Vercel recommandé | **SATISFAITE** conceptuellement ; aucune ressource créée |
| G-04 | D-075 — Supabase Auth, session persistante, PIN verrou rapide/appareil | **SATISFAITE** pour préparer 5B |
| G-05 | D-077 — périodes Lease sans chevauchement par Unit | **SATISFAITE** pour préparer 6B |
| G-06 | D-076 — abstraction `PhoneOtpProvider`, fournisseur non choisi | **DIFFÉRÉE** : choix obligatoire avant 6E, sans bloquer 5A–6D |

Aucun projet Supabase, déploiement ou secret ne doit être créé avant autorisation explicite du lot qui le nécessite.

## 4. Séquence proposée

| Lot futur | Résultat principal | Première démonstration |
|---|---|---|
| 5A | Coque PWA navigable, thèmes/tokens, FR/EN, routes permissionnées simulées sans faux droit | Application manipulable sur téléphone très tôt |
| 5B | Auth réelle + Organization autonome | Créer un compte et un tenant vide |
| 5C | Membership/RBAC + isolation RLS | Deux Organizations, rôles et refus démontrables |
| 6A | Property + Unit | Créer maison/immeuble et unités |
| 6B | Tenant + Lease | Créer locataire et activer bail |
| 6C1 | Dues + Charges + Ledger | Échéancier et vérité comptable dérivée |
| 6C2 | Payments + Allocation + Tenant credit | Encaissements, allocations et crédit locataire |
| 6C3 | Documents + Notifications + Receipts + Statements | Artefacts privés et communications |
| 6D | Dashboard + notifications + Activity/Audit | Visibilité opérationnelle et effets asynchrones |
| 6E | Tenant Portal minimal | Locataire invité consulte ses mêmes vérités métier |

## 5. Lot 5A — Bootstrap application, navigation et design tokens

### Objectif

Créer la coque technique web/PWA et l’expérience mobile-first validée sans connecter de données métier réelles.

### Dépendances

- D-072 et D-073 confirmées.
- Architecture UX Lot 3 validée.
- Design tokens confirmés D-018 à D-020.

### Contenu

- structure du monolithe par Core/modules ;
- coques interne et portail séparées ;
- navigation interne `Accueil / Biens / Locataires / Paiements / Activité` ;
- navigation portail `Accueil / Loyers / Reçus / Compte` ;
- Organization active représentée dans la coque interne ;
- catalogues FR/EN et formats XAF ;
- thèmes clair/sombre et tokens, sans design haute fidélité supplémentaire ;
- états génériques vide/chargement/erreur/refus ;
- manifest PWA et stratégie de service worker limitée ;
- harness de tests et contrôle qualité.

Les données affichées sont des fixtures de test clairement identifiées, pas une fausse couche métier durable.

### Critères de sortie

- Navigation mobile conforme à D-069/D-070.
- Aucune route interne accessible depuis la coque portail.
- Aucun cinquième onglet portail ; notifications par entrée légère.
- FR/EN basculables sans changer le contexte.
- Thèmes clair/sombre lisibles.
- Aucun module MVP OUT visible.
- Structure de dépendance Core/modules contrôlée.

### Ce que Blaise pourra tester

- Installer/ouvrir la PWA de développement autorisée ;
- parcourir les deux coques sur téléphone et desktop ;
- changer FR/EN et thème ;
- vérifier l’Organization active, les menus secondaires et les états communs.

### Tests obligatoires

- tests de navigation par coque ;
- tests de rendu FR/EN ;
- tests d’accessibilité essentiels ;
- tests responsive téléphone/desktop ;
- test empêchant l’import direct interdit entre modules ;
- contrôle qu’aucun secret ou endpoint de production n’est présent.

## 6. Lot 5B — Auth + Organization

### Objectif

Établir l’identité interne, les appareils/PIN, la récupération et la création d’une Organization autonome vide.

### Dépendances

- 5A validé.
- D-074 et D-075 confirmées.
- Projet/environnement Supabase autorisé explicitement dans ce futur lot.

### Contenu

- Supabase Auth email OTP/lien sécurisé ;
- User Identity globale ;
- premier/nouvel appareil, Device Authorization et PIN de verrou rapide selon D-075 ;
- registre Session Authorization, révocation et contexte Organization actif ;
- récupération et révocation ;
- Organization, Profile, Branding, Settings ;
- pays Cameroun, XAF, FR/EN, fuseau ;
- logo facultatif en Storage privé ;
- création d’une Organization supplémentaire vide ;
- première couche RLS Organization.

### Critères de sortie

- AC-AUTH-001 à AC-AUTH-009 réussis.
- AC-ORG-001 à AC-ORG-007 réussis selon les responsabilités déjà disponibles.
- Supabase Auth reste l’authentification principale ; le PIN ne crée/remplace aucune session Auth et ne réalise ni récupération ni preuve forte.
- Le PIN n’est jamais stocké en clair, résiste à la force brute et ne fonctionne que sur un appareil déjà vérifié.
- Une Organization B ne reçoit aucune donnée de A.
- L’absence de logo ne bloque aucun flow.
- Aucun `service_role` dans le client.

### Ce que Blaise pourra tester

- créer/vérifier un compte ;
- créer puis utiliser le verrou PIN sur un appareil déjà vérifié sans créer une seconde identité Auth ;
- récupérer l’accès et révoquer un appareil ;
- créer A puis B et constater deux tenants vides ;
- compléter profil/logo et vérifier l’identité Organization active.

### Tests obligatoires

- OTP/lien expiré et throttling ;
- PIN incorrect/verrouillage/révocation ;
- aucune Organization avant identité validée ;
- RLS A/B sur Organization/Profile/Branding/Settings ;
- Storage logo A inaccessible à B ;
- aucun partage d’utilisateur ou secret avec VERALUZ.

## 7. Lot 5C — Membership, RBAC et isolation

> État au 2026-08-26 : modèle, capabilities, RLS, invitations, protections Owner, audit et UI Équipe implémentés ; validation automatisée locale et distante réussie ; email transactionnel configuré et parcours réel validé par Blaise. Le Lot 5C est **TERMINÉ / TESTÉ / VALIDÉ** et son gate est satisfait.

### Objectif

Rendre l’application réellement multi-utilisateur et sûre avant d’ajouter les données locatives.

### Dépendances

- 5B validé.
- Matrice de rôle D-040.
- Stratégie RLS Lot 4 validée.

### Contenu

- Membership et six rôles fixes ;
- capabilities côté serveur/base ;
- invitation interne 7 jours, relance et révocation ;
- transfert du dernier Owner ;
- sélecteur Organization et recalcul des capacités ;
- politique de session/Membership révoqué ;
- matrice automatisée Org A/Org B/non-membre/rôle insuffisant ;
- Audit administratif minimal Owner.

### Critères de sortie

- AC-RBAC-001 à AC-RBAC-010 réussis.
- Encaisseur → membres = REFUS.
- Consultation → paiement = REFUS, même si le module paiement n’est pas encore actif.
- Owner A/Consultation B n’hérite aucun droit.
- Le dernier Owner ne peut être retiré avant transfert.
- Membership révoqué ne permet aucune nouvelle lecture/action.

### Ce que Blaise pourra tester

- inviter chaque rôle ;
- accepter, relancer et révoquer ;
- changer A/B et observer une navigation différente ;
- tenter des accès directs interdits ;
- consulter l’audit Owner.

### Tests obligatoires

- matrice complète rôles × capacités ;
- A/B, non-membre et rôle insuffisant pour chaque ressource Core ;
- invitation expirée/réutilisée ;
- révocation en cours de session ;
- concurrence sur transfert du dernier Owner ;
- vérification que l’UI masquée n’est pas le seul contrôle.

À la sortie de 5C, Kjora dispose d’un premier socle tenant manipulable et sécurisé.

## 8. Lot 6A — Property + Unit

> Statut de sortie : **TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE**. Implémentation limitée à Property + Unit ; aucune table Tenant/Lease réelle n’a été ajoutée.

### Objectif

Implémenter le premier module métier et éprouver le pattern module + RLS + event.

### Dépendances

- 5C validé.
- Contrats modules/Core validés.

### Contenu

- Property et Unit tenant-scoped ;
- maison avec Unit « Maison entière » préremplie ;
- immeuble multi-unités ;
- vacance ;
- listes/recherche/pagination mobile ;
- `PROPERTY_CREATED`, Activity/Audit minimal ;
- aucun Maintenance ou Expenses.

### Critères de sortie

- AC-PROP-001 à AC-PROP-005 et AC-UNIT-001 à AC-UNIT-005 réussis.
- Relations Property/Unit cross-tenant impossibles.
- Gardien/lecture voient seulement le périmètre validé.
- L’event possède `organization_id` et ne crée aucune communication par défaut.

### Ce que Blaise pourra tester

- état vide ;
- créer maison puis Unit automatique ;
- créer immeuble et plusieurs Units ;
- comparer Owner, gestionnaire et lecture ;
- tentative d’ouvrir un bien B depuis A.

### Tests obligatoires

- domaine Property/Unit ;
- RLS par rôle et A/B ;
- contraintes relationnelles ;
- pagination/recherche limitée au tenant ;
- event idempotent et Activity tenant-scoped.

### Validation fonctionnelle encore requise

- persistance après refresh et reconnexion ;
- maison avec Unit unique « Maison entière » ;
- immeuble avec plusieurs Units, dont Chambre et superficie facultative ;
- modification et archivage non destructif ;
- comparaison Owner, gestionnaire et lecture ;
- refus d’un accès direct Org A → ressource Org B.

## 9. Lot 6B — Tenant + Lease

> Statut de sortie : **TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE**. Migrations KJORA `20260826190157` et `20260826192408`, commits `42f9691` et `f4dcc72`, 64 tests Node et 40 assertions pgTAP 6B réussis ; 148 assertions distantes avec régressions. Le Lot 6A reste en attente de validation fonctionnelle séparée.

### Objectif

Créer le dossier locataire minimal et activer un Lease sur une Unit explicite.

### Dépendances

- 6A validé.
- D-077 confirmée avant l’invariant d’occupation.

### Contenu

- Tenant avec nom + téléphone ou email ;
- fiche Tenant réelle : nom complet, téléphone/email avec au moins un contact, langue, profession, pièce d’identité facultative et notes internes ;
- photo en placeholder ; aucun Storage ou scan d’identité au Lot 6B ;
- minimisation des contacts par rôle ;
- Lease brouillon, résumé, activation et clôture explicite ;
- destination centrale `Locations` et liens Tenant/Property/Unit ;
- loyer hors charges, charges récurrentes, total dérivé, dépôt séparé et avance initiale descriptive ;
- périodicité, jour d’exigibilité, génération J-X et proratas calendaires entrée/sortie ;
- `TENANT_CREATED` et `LEASE_ACTIVATED` ;
- aucun accès portail implicite ;
- aucun cotitulaire, e-signature ou bibliothèque juridique.

### Critères de sortie

- AC-TEN-001 à AC-TEN-005 réussis.
- AC-LEASE-001 à AC-LEASE-006 réussis ; AC-LEASE-005 refuse tout chevauchement de périodes sur une Unit conformément à D-077.
- Un bail futur est accepté seulement s’il commence après la fin du bail précédent.
- Unit/Tenant/Lease toujours dans la même Organization.
- Un seul titulaire Tenant au MVP.
- Activation transactionnelle et event unique.

### Ce que Blaise pourra tester

- créer un locataire avec téléphone ou email ;
- constater l’absence de portail automatique ;
- créer/enregistrer/reprendre un brouillon ;
- activer et clôturer un Lease ;
- comparer les contacts visibles par rôle.

### Tests obligatoires

- validation minimale et données personnelles ;
- RLS A/B et projection gardien/consultation ;
- activation concurrente et invariant d’occupation validé ;
- events non dupliqués ;
- aucune donnée Tenant recopiée dans Lease.

### Patch 6B.1 — UX / préparation financière avant 6C1

Ce patch reste dans le Lot 6B et ne crée aucune vérité financière 6C.

- loyer mensuel de référence facultatif sur Unit, y compris « Maison entière » lors de la création d’une maison ;
- préremplissage modifiable du loyer contractuel du Lease sans lien de réécriture vers l’Unit ;
- dépôt et montant prépayé séparés ; périodes complètes et reliquat calculés, jamais saisis comme vérité principale ;
- jour limite 1–28, avis contrôlé J-1/2/3/4/5/7/10 avec J-5 par défaut et rappel global tous les 10 jours ;
- prorata mensuel loyer + charges avec formule lisible ;
- clôture du Lease via confirmation dédiée, date effective et motif facultatif ;
- vues Locations liste/cartes et hiérarchie de surfaces ajustée en clair/sombre ;
- placeholders financiers très visibles dans Tenant, sans fausse valeur avant 6C ;
- même exigence de dette/crédit explicable documentée pour le futur portail.

Critères de sortie : migration additive Unit/Lease, RLS A/B conservée, calculs purs testés, confirmation de fin obligatoire, tests Node/TypeScript/ESLint/build et pgTAP passants. Le prochain vrai lot demeure 6C1.

## 10. Lot 6C1 — Dues + Charges + Ledger

### Objectif

Générer les échéances et charges effectives-datées depuis le Lease, puis établir le Ledger comme source de vérité financière sans réécrire l’historique.

### Dépendances

- 6B validé.
- 6B validé.
- Règles d’échéancier, prorata et modifications effectives-datées validées.

### Contenu

- génération Due depuis le calendrier du Lease ;
- charges et évolutions de loyer effectives-datées ;
- prorata calendaire d’entrée/sortie avec correction motivée ;
- Ledger tenant-scoped et statuts d’échéance dérivés ;
- règles Cameroun de génération J-X et retard ;
- aucun Payment, Receipt, document ou notification dans 6C1.

### Critères de sortie

- AC-DUE-001 à AC-DUE-008 réussis.
- Les AC-DUE pertinentes sont réussies et le Ledger reste cohérent sous concurrence.
- Aucune réécriture d’une période financière passée.
- Aucun Payment ou Receipt créé prématurément.

### Ce que Blaise pourra tester

- voir échéance à venir/due/en retard ;
- vérifier le prorata et le total loyer + charges ;
- appliquer un futur changement de loyer sans modifier les périodes passées ;
- consulter le Ledger dérivé.

### Tests obligatoires

- calculs de montant/état/date ;
- concurrence et idempotence de génération ;
- RLS A/B et permissions ;
- historique effectif-daté immuable.

## 11. Lot 6C2 — Payments + Allocation + Tenant credit

### Objectif

Enregistrer l’argent réellement reçu, l’allouer explicitement à une ou plusieurs Dues et gérer crédit/reversal sans réécrire l’historique.

### Dépendances

- 6C1 validé.
- Frontière serveur/idempotence disponible.

### Contenu

- Payment et PaymentAllocation ;
- paiements totaux/partiels et quatre moyens manuels ;
- multi-allocation, surpaiement et crédit locataire dérivé ;
- résumé/confirmation et anti-double soumission ;
- transaction atomique, verrou par Lease et idempotence tenant-scoped ;
- reversal complet Owner avec motif, Ledger compensatoire et historique conservé ;
- `PAYMENT_RECORDED` puis `PAYMENT_COMPLETED` ;
- aucun Receipt ou document réel dans 6C2.

### Critères de sortie

- cas partiel, exact, surpaiement, multi-échéances, paiements multiples, crédit existant, idempotence et reversal passants ;
- RLS Owner/gestionnaire/encaisseur/comptable et refus gardien/consultation/Org B/anon/direct UUID ;
- aucun Payment ou allocation de test persistant en Production ;
- Node, TypeScript, ESLint, build, pgTAP et advisors verts ;
- Vercel Production `Ready`, puis validation fonctionnelle Blaise en attente.

## 12. Lot 6C3 — Documents + Notifications + Receipts + Statements

### Objectif

Produire les artefacts privés et communications à partir des vérités financières validées.

### Dépendances

- 6C2 validé.
- Storage privé, outbox et worker validés.

### Contenu

- `payment_receipt` après `PAYMENT_COMPLETED`, distinct de la `rent_receipt` par période intégralement soldée ;
- avis d’échéance J-X et états de compte issus respectivement de Due et Ledger ;
- snapshots immuables, bucket privé et liens signés 120 secondes ;
- invalidation compensatoire sans suppression après reversal ;
- notifications internes capability-scoped ;
- alertes idempotentes de dernière période prépayée et crédit affecté insuffisant à J-X ;
- outbox email, worker Resend serveur-only, trois essais 5/30/120 minutes ;
- démarrage Production sans backfill et avec tous les emails automatiques désactivés.

### Gate Production

Gate franchi le 28 août 2026 : migrations principale et hardening advisors appliquées, 61 pgTAP transactionnels réussis et réglages email restés à `false`. Aucun document historique ni message n’a été backfillé.

## 13. Lot 6D — Dashboard, Activity et Audit

> Statut au 30 août 2026 : **TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE**. Migration `20260830125630_lot_6d_dashboard_activity_audit.sql` appliquée au seul projet KJORA et 35 assertions pgTAP réussies avec rollback. Aucun email, backfill ni accès portail/public activé.

### Objectif

Donner la visibilité propriétaire et fiabiliser le traitement asynchrone du monolithe.

### Dépendances

- 6C validé.
- D-073 et outbox + worker validés.

### Contenu

- read model dashboard mois courant ;
- attendu, encaissé Completed, restant, retards, activité récente ;
- outbox/dispatcher/retry/idempotence ;
- Notifications in-app ;
- Activity ;
- Audit Owner ;
- Communications métier séparées ;
- monitoring minimal du backlog et des échecs ;
- aucun Reporting avancé.

### Critères de sortie

- AC-DASH-001 à AC-DASH-007 réussis.
- AC-NOT-001 à AC-NOT-008 réussis.
- AC-TRACE-001 à AC-TRACE-006 réussis.
- Event rejoué sans duplication logique.
- Worker indisponible sans rollback métier.
- Aucun signal B visible en A.

### Ce que Blaise pourra tester

- dashboard vide puis alimenté ;
- changement de période ;
- notification vers ressource ;
- séparation Notification/Activity/Audit/email ;
- simulation d’échec email et reprise.

### Tests obligatoires

- projections financières ;
- droits par rôle ;
- outbox, retry, dead letter et idempotence ;
- langues des notifications ;
- révocation après notification ;
- charge/pagination sur chronologies synthétiques.

### Gate Production préparé

- six RPC authentifiées : dashboard, activité, état lu/non lu, lecture globale des notifications, Audit Owner filtrable et santé opérationnelle ;
- extension du journal administratif existant aux futurs reversals Payment et invalidations Document via le Domain Event existant ;
- aucun nouveau read model financier, aucune table parallèle, aucun index nouveau, aucun job nouveau ;
- `PUBLIC` et `anon` révoqués, `authenticated` soumis à `auth.uid()`, Organization et capabilities ;
- aucune modification de Due, Payment, Allocation, Ledger, Document, Storage, email ou portail ;
- aucun backfill.

## 14. Lot 6E — Tenant Portal minimal

> Statut au 1er septembre 2026 : **TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE**. Les 62/62 pgTAP transactionnels passent avec rollback et les Advisors ne signalent aucun niveau critique. Le téléphone OTP reste bloqué par D-076.

### Objectif

Ouvrir une lecture locataire sûre des mêmes Lease, Dues, Payments et Receipts.

### Dépendances

- 6D validé.
- D-076 confirmée comme décision différée ; fournisseur `PhoneOtpProvider` choisi avant de démarrer l’implémentation téléphone de 6E.
- Tous les tests RLS internes stables.

### Contenu

- Tenant Portal Access et Portal Lease Access ;
- invitation/relance/révocation Owner/gestionnaire ;
- OTP/lien email préparé ; téléphone OTP différé jusqu’au choix `PhoneOtpProvider` ;
- abstraction `PhoneOtpProvider` sans logique métier liée au fournisseur choisi ;
- sessions 30 jours et PIN local facultatif de confort selon D-130, sans remplacement de Supabase Auth ;
- accueil, Loyers, Reçus, Compte et centre notifications léger ;
- paiements en lecture ;
- reçus privés consultables/téléchargeables ;
- multi-Lease/multi-Organization avec sélection explicite ;
- historique lecture seule après fin du bail ;
- journal d’accès 12 mois et vue interne synthétique.

### Critères de sortie

- AC-TPA-001 à AC-TPA-008 réussis.
- AC-TPAUTH-001 à AC-TPAUTH-010 réussis.
- AC-TPREAD-001 à AC-TPREAD-008 réussis.
- AC-TPREC/TPNOT/TPLOG/TPISO réussis.
- Aucun Membership créé.
- Tenant A → Tenant B et Org B = REFUS.
- Aucune copie de vérité métier ou URL publique de reçu.

### Ce que Blaise pourra tester

- inviter par téléphone/email ;
- activer, revenir sans PIN et révoquer ;
- consulter attendu/payé/restant, paiements et reçus ;
- passer entre plusieurs baux et Organizations sans agrégation ;
- voir l’historique après clôture ;
- vérifier l’état synthétique côté Owner/gestionnaire.

### Tests obligatoires

- durées invitation/OTP/lien/session ;
- nouvel appareil et changement de canal ;
- matrice Tenant A/A2/B et lien profond ;
- lecture depuis la même donnée que l’interne ;
- accès Receipt/Storage ;
- rétention journal 12 mois ;
- aucune route interne, mutation financière ou partage public.

## 15. Gate de release MVP après 6E

Avant toute mise en production future :

- tous les AC du MVP applicables passent ;
- revue RLS de chaque table/vue/fonction/bucket ;
- matrice A/B/non-membre/rôle insuffisant complète ;
- revue secrets, dépendances et headers ;
- sauvegarde/restauration testée ;
- monitoring outbox/Auth/Storage opérationnel ;
- accessibilité, FR/EN, téléphone/desktop et PWA testés ;
- politique de rétention et mentions de conformité validées ;
- aucun module MVP OUT activé.

Cette gate n’est pas un lot de développement lancé par le présent document.

## 16. Définition de « terminé » pour chaque lot futur

- objectif démontrable atteint ;
- critères fonctionnels référencés passants ;
- tests automatisés et scénarios négatifs passants ;
- aucun secret ni donnée réelle dans le dépôt ;
- documentation/decision log mis à jour après validation de Blaise ;
- régression des lots antérieurs exécutée ;
- limites et blocages explicités ;
- aucun travail du lot suivant commencé implicitement.

## 17. Risques de séquencement

| Risque | Prévention |
|---|---|
| Construire le domaine avant l’isolation | 5C précède toute donnée métier |
| Retarder les tests RLS | Matrice A/B obligatoire dès 5B/5C et à chaque module |
| Créer un faux portail séparé | 6E lit les modules existants, aucune table copie |
| Duplications email/event | Outbox/idempotence validées avant 6D |
| Bloquer tard sur OTP téléphone | `PhoneOtpProvider` validé ; fournisseur concret sélectionné avant 6E conformément à D-076 |
| Bloquer Lease sur occupation | Invariant sans chevauchement déjà confirmé par D-077 |
| Surarchitecture | Un serveur web, un projet Supabase par environnement, un worker logique ; séparation seulement mesurée |

## 18. Prochaine action proposée

Faire valider visuellement la **Visual Direction v2B** par Blaise sur Dashboard, Biens, Unit, Locataire, Location, Équipe, Paramètres, Connexion, clair/sombre et mobile.

Faire valider par Blaise le parcours réel invitation → Auth → portail → révocation sur Vercel Production avant tout statut `VALIDÉ`. Ne démarrer aucun nouveau lot dans cette intervention.

Le patch post-6E ajoute une entrée Notifications légère et un verrou PIN portail facultatif ; sa migration Production et ses 75 assertions pgTAP sont passées, tandis que sa validation fonctionnelle par Blaise reste attendue. Le futur module **Messages** reste une capacité séparée à concevoir ultérieurement : il ne doit dépendre ni du centre de notifications, ni de l’Activity, ni de l’Audit, et n’est pas commencé par ce patch.

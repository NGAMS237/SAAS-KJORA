# Kjora — Événements, notifications et audit v0.1

> Version : v0.1  
> Statut du document : **VALIDÉ PAR BLAISE — Lot 1**  
> Portée : contrat fonctionnel conceptuel uniquement  
> Hors portée : code, schéma technique, SQL, RLS, choix d'infrastructure, configuration d'un fournisseur et déploiement

## 1. Statut des sources et gouvernance

Les décisions D-021 à D-028 validées par Blaise sont inscrites dans `project-context/DECISIONS.md`, puis répercutées dans `PROJECT_CONTEXT.md` et `PROJECT_STATE.md`. Le présent document est aligné sur cette source de vérité.

En conséquence :

- les éléments marqués **CONFIRMÉ** ci-dessous reprennent les décisions approuvées du registre, notamment D-005, D-008, D-010 et D-021 à D-028 ;
- tout choix nouveau est marqué **PROPOSITION** ou **À VALIDER** ;
- les propositions O-005 à O-007 et les questions non tranchées gardent leur statut ;
- aucune décision au-delà des arbitrages D1–D8 n'est introduite.

### Légende

- **CONFIRMÉ** : décision approuvée par Blaise et inscrite dans `DECISIONS.md`.
- **PROPOSITION** : solution de travail recommandée, réversible et non encore approuvée.
- **À VALIDER** : question ou frontière qui exige une décision de Blaise.

## 2. Objectif et principes

Ce document définit le contrat fonctionnel minimal entre les faits métier produits par Kjora et leurs usages possibles : notification dans l'application, communication externe, fil d'activité, audit et réaction d'un autre module.

Principes directeurs :

- **CONFIRMÉ — Les événements métier sont au cœur des notifications et communications.**
- **CONFIRMÉ — Chaque Organization est un tenant autonome.** Ses événements, notifications, activité, audit et communications sont tenant-scoped et portent explicitement l'organisation concernée.
- **CONFIRMÉ — L'architecture est composée d'un Core et de modules métier indépendants.** **PROPOSITION O-005 —** Le système événementiel est placé dans le Core et transporte des contrats publics sans connaître les détails internes des modules producteurs.
- **CONFIRMÉ — Un module défaillant ne doit pas rendre l'application entière inutilisable.** **PROPOSITION O-006 —** La défaillance d'un canal de communication est traitée comme un échec localisé.
- **PROPOSITION O-006 — Une panne de communication ne doit pas annuler une opération métier déjà réussie.**
- **PROPOSITION O-005 — Aucun module métier ne dépend directement d'un fournisseur externe de communication.**
- **PROPOSITION — Un événement décrit un fait achevé et observable, formulé au passé.** Il ne commande ni un canal, ni un destinataire, ni un texte à envoyer.
- **PROPOSITION — Chaque consommateur décide indépendamment s'il doit agir**, selon les permissions, préférences, politiques de communication et données courantes.

## 3. Séparation des responsabilités

### 3.1 Événement métier

**PROPOSITION.** Un événement métier est la trace structurée d'un changement significatif déjà accepté par le module qui en est propriétaire. Il porte juste assez de contexte pour identifier le fait et le rattacher à une organisation. Il ne contient pas le rendu d'un message et évite les données personnelles non nécessaires.

Règle fondamentale : **un événement métier est un fait, pas une instruction d'envoyer un email**.

Ainsi, `PAYMENT_RECORDED` signifie qu'un paiement a été saisi/enregistré sans nécessairement être confirmé. Ce fait peut intéresser l'audit, le fil d'activité, une notification et une communication éventuelle, mais il n'autorise pas le reçu final. Seul `PAYMENT_COMPLETED` signifie effectivement encaissé/confirmé et permet à Receipts de produire le reçu final.

### 3.2 Notification dans l'application

**PROPOSITION.** Une notification in-app est une information adressée à un ou plusieurs utilisateurs autorisés de l'organisation. Elle est dérivée d'un événement, peut avoir un état lu/non lu et peut proposer un lien vers la ressource concernée. Elle n'est ni la preuve définitive du fait métier, ni le journal d'audit.

Le choix des destinataires est fait au moment de la consommation, à partir des memberships, rôles et permissions alors applicables. L'événement ne doit pas embarquer une liste d'adresses ou contourner l'autorisation tenant.

### 3.3 Communication externe

**PROPOSITION.** Une communication externe est un effet optionnel, localisé et soumis à une politique de canal, par exemple un email transactionnel. Elle possède son propre état de traitement et ses propres règles de retry. Le module métier ne contacte pas directement le fournisseur externe. Lorsqu'elle représente l'organisation, elle utilise le profil et le branding du tenant actif.

**À VALIDER.** Les destinataires admissibles, le consentement requis, les préférences utilisateur et les communications obligatoires ne sont pas encore décidés dans les sources officielles.

### 3.4 Fil d'activité

**PROPOSITION.** Le fil d'activité est une chronologie lisible par un humain des faits utiles à l'exploitation quotidienne d'une organisation. Il peut reformuler un événement dans la langue de l'utilisateur. Il ne remplace pas l'audit : il peut être filtré, synthétisé ou limité aux activités pertinentes pour le produit.

### 3.5 Audit

**PROPOSITION.** L'audit conserve une trace fiable permettant de répondre à « qui a fait quoi, dans quelle organisation, sur quelle ressource et quand ? ». Il est distinct des notifications et du fil d'activité, et son accès est soumis à autorisation. Une entrée d'audit ne doit pas dépendre de l'envoi réussi d'un message.

**À VALIDER.** La durée de conservation, le niveau de détail, les exigences d'inaltérabilité et les actions qui doivent obligatoirement être auditées devront être définis avec les contraintes juridiques et opérationnelles applicables.

### 3.6 Comparaison synthétique

| Élément | Finalité | Source de vérité du métier | Destinataire humain | Peut échouer sans annuler le métier |
|---|---|---:|---:|---:|
| Événement métier | Décrire un fait et le rendre disponible | Non ; il reflète l'état possédé par le module | Non directement | Sans objet après acceptation du fait ; la garantie de remise reste à définir |
| Notification in-app | Attirer l'attention d'un utilisateur autorisé | Non | Oui | Oui — **PROPOSITION** |
| Communication externe | Informer hors de l'application | Non | Oui | Oui — **PROPOSITION O-006** |
| Fil d'activité | Rendre les changements compréhensibles dans le temps | Non | Oui | Oui — **PROPOSITION** |
| Audit | Apporter une trace de contrôle | Non, mais constitue une preuve opérationnelle | Sur consultation autorisée | **À VALIDER** selon le niveau de garantie requis |

## 4. Contrat conceptuel commun

### 4.1 Enveloppe minimale proposée

L'enveloppe décrit des champs logiques, sans imposer de format de stockage, de protocole ou de technologie.

| Champ logique | Statut | Rôle fonctionnel |
|---|---|---|
| Identifiant d'événement | **PROPOSITION — obligatoire** | Identifiant unique permettant de reconnaître un doublon et de corréler les traitements. |
| Type d'événement | **PROPOSITION — obligatoire** | Nom stable du fait, choisi dans le catalogue approuvé. |
| Version du contrat | **PROPOSITION — obligatoire** | Permet de faire évoluer la signification ou les données minimales sans interprétation ambiguë. |
| Identifiant d'organisation | **CONFIRMÉ — obligatoire**, dérivé de D-005/D-028 | Établit la portée tenant du fait et interdit un traitement hors de l'organisation concernée. |
| Identifiant de l'acteur | **PROPOSITION — conditionnel** | Identifie l'utilisateur ou le processus à l'origine du fait ; reste vide lorsque le fait est produit par un traitement planifié sans utilisateur. |
| Type et identifiant de l'entité principale | **PROPOSITION — obligatoire** | Désigne la ressource métier principalement affectée sans exposer ses détails internes. |
| Date et heure de survenue | **PROPOSITION — obligatoire** | Indique quand le fait métier s'est produit, indépendamment du moment de sa consommation. |
| Données factuelles minimales | **PROPOSITION — conditionnel** | Apporte seulement les valeurs nécessaires aux consommateurs prévus : montant, devise, échéance ou statut, selon l'événement. |
| Contexte pays et langue | **PROPOSITION — conditionnel** | Fige le contexte utile lorsque son évolution pourrait modifier l'interprétation ; la langue du message final est choisie au moment de la consommation. |
| Identifiant de corrélation | **PROPOSITION — recommandé** | Regroupe les faits appartenant à une même action ou un même parcours, sans créer de dépendance entre modules. |
| Identifiant de causalité | **PROPOSITION — conditionnel** | Relie un fait dérivé au fait qui l'a déclenché, pour comprendre la chaîne et éviter les boucles. |
| Révision de l'entité | **PROPOSITION — conditionnel** | Aide un consommateur à reconnaître un traitement arrivé dans le désordre lorsque le domaine le nécessite. |

**PROPOSITION —** L'enveloppe ne contient ni secret, ni jeton, ni justificatif complet, ni adresse de fournisseur, ni donnée personnelle sans nécessité explicite. Elle fournit les données minimales nécessaires aux consommateurs Core : Notifications, Communications et Audit ne consultent jamais directement un module métier. Un autre module métier peut, si son contrat l'exige, consulter le contrat public du producteur sous contrôle de l'organisation et des permissions.

### 4.2 Règles de production et de consommation

- **PROPOSITION — Le module propriétaire produit le fait seulement après réussite de son opération métier.**
- **PROPOSITION — Un consommateur ne modifie jamais rétroactivement le fait reçu.** Il crée son propre résultat ou, si nécessaire, un nouveau fait.
- **PROPOSITION — Les consommateurs sont indépendants.** L'échec de l'un ne bloque pas les autres.
- **PROPOSITION — Les destinataires ne sont pas figés dans l'événement.** Chaque consommateur vérifie l'organisation, l'accès courant et la politique applicable avant d'agir.
- **PROPOSITION — Les messages sont rendus en français ou en anglais au moment de la communication**, selon les préférences disponibles ; ces deux langues sont **CONFIRMÉES** dans le brief.
- **PROPOSITION — Les montants conservent explicitement leur devise.** La devise initiale XAF est **CONFIRMÉE** dans le brief, mais aucune règle variable propre au Cameroun n'est inscrite en dur dans le contrat principal.

## 5. Catalogue minimal v0.1

**CONFIRMÉ — Catalogue v0.1 de 10 événements.** Il est volontairement limité à la boucle produit « Bien → Unité → Locataire → Contrat → Loyer attendu → Paiement → Reçu → Visibilité propriétaire ». La présence d'un événement ne confirme pas un envoi externe automatique.

Dans la colonne « audit », « élevé » signifie qu'une trace est fortement recommandée pour comprendre une action sensible ou financière ; cela ne fixe pas encore une politique légale de conservation.

| Événement | Producteur conceptuel | Consommateurs possibles | Portée organisation | Importance audit | Communication possible | Données minimales nécessaires |
|---|---|---|---|---|---|---|
| `PROPERTY_CREATED` | Module Properties | Audit, fil d'activité, Notifications | `organization_id` obligatoire | Moyenne | Non par défaut ; notification interne optionnelle | Identifiant du bien, identifiant de l'acteur, date de création |
| `TENANT_CREATED` | Module Tenants | Audit, fil d'activité | `organization_id` obligatoire | Moyenne | Non par défaut | Identifiant du dossier locataire, identifiant de l'acteur, date de création ; aucune coordonnée personnelle dans l'événement |
| `LEASE_ACTIVATED` | Module Leases | Audit, fil d'activité, Notifications, Communications, Rent/Dues | `organization_id` obligatoire | Élevée | Oui, selon destinataire, consentement et politique **À VALIDER** | Identifiants du contrat, du bien ou logement et du dossier locataire, dates d'effet, devise, identifiant de l'acteur |
| `RENT_DUE_CREATED` | Module Rent/Dues/Schedules | Audit, fil d'activité, Notifications, Communications | `organization_id` obligatoire | Élevée | Oui si la politique de rappel le prévoit | Identifiants de l'échéance et du contrat, date d'échéance, montant attendu, devise, période concernée |
| `RENT_DUE_SOON` | Module Rent/Dues/Schedules, par évaluation temporelle | Notifications, communications, fil d'activité optionnel | `organization_id` obligatoire | Faible à moyenne | Oui, principal usage candidat | Identifiant de l'échéance, date d'échéance, montant restant, devise, règle de rappel appliquée |
| `RENT_OVERDUE` | Module Rent/Dues/Schedules, après constat d'un solde restant à l'échéance | Notifications, communications, fil d'activité, audit | `organization_id` obligatoire | Élevée | Oui, sous politique de relance | Identifiant de l'échéance, date d'échéance, montant restant, devise, date du constat |
| `PAYMENT_RECORDED` | Capacité Payments du module Payments & Receipts | Audit, fil d'activité, Notifications, Communications | `organization_id` obligatoire | Élevée | Optionnelle ; signale une saisie, pas une confirmation finale | Identifiants du paiement et de l'échéance, montant, devise, date, méthode/provider, référence facultative, référence de preuve facultative, acteur et état de confirmation |
| `PAYMENT_COMPLETED` | Capacité Payments du module Payments & Receipts | Audit, fil d'activité, Notifications, Communications, Rent/Dues, Receipts | `organization_id` obligatoire | Élevée | Oui, selon politique ; constate l'encaissement/confirmation | Identifiants du paiement et de l'échéance, montant confirmé, devise, date d'achèvement, méthode/provider, acteur, confirmation et origine manuelle ou intégrée sans donnée secrète |
| `RECEIPT_GENERATED` | Capacité Receipts du module Payments & Receipts, uniquement après `PAYMENT_COMPLETED` | Audit, fil d'activité, Notifications, Communications | `organization_id` obligatoire | Élevée | Oui, pour rendre le reçu disponible ou l'envoyer selon la politique | Identifiants du reçu et du paiement ; référence d'artefact/document tenant-scoped si utilisée ; date de génération, langue, version ou numéro métier si applicable |
| `DOCUMENT_SHARED` | Module Documents, après confirmation du partage | Audit, fil d'activité, Notifications éventuelles | `organization_id` obligatoire | Élevée | Non pour exécuter le partage : ce fait constate un partage déjà réalisé | Identifiant du document, catégorie, identifiant ou classe du destinataire, canal effectivement utilisé, date et résultat du partage ; aucune adresse brute sauf nécessité validée |

### 5.1 Sémantique des événements temporels

- **PROPOSITION — `RENT_DUE_SOON` est émis une seule fois par règle de rappel et par échéance**, lorsque l'échéance impayée entre dans la fenêtre configurée.
- **PROPOSITION — `RENT_OVERDUE` est émis lors du premier constat qu'une échéance arrivée à terme conserve un solde.** Une relance répétée est un effet de communication, pas une répétition automatique du fait initial.
- **À VALIDER — La fenêtre « bientôt dû », la définition exacte du retard, les jours non ouvrés et les éventuels délais de grâce** relèvent de la configuration pays ou organisation ; aucune valeur camerounaise variable n'est figée ici.
- **PROPOSITION — Avant d'envoyer une communication différée**, le consommateur vérifie que l'échéance est encore concernée afin d'éviter un rappel devenu obsolète après paiement.

### 5.2 Frontière Payments / Receipts validée

- **CONFIRMÉ — D-023 :** `PAYMENT_RECORDED` constate une saisie acceptée par Kjora, sans affirmer une confirmation définitive.
- **CONFIRMÉ — D-023 :** `PAYMENT_COMPLETED` constate que le paiement est effectivement encaissé/confirmé.
- **CONFIRMÉ — D-023 :** une opération manuelle immédiatement confirmée produit les deux événements successivement ; ils ne sont pas fusionnés.
- **CONFIRMÉ — D-023 :** Payments possède la source de vérité du paiement ; Receipts possède le reçu dérivé. Ce sont deux capacités séparées dans le même module au MVP.
- **CONFIRMÉ — D-023 :** seul `PAYMENT_COMPLETED` autorise le reçu final et `RECEIPT_GENERATED` ; le reçu ne modifie jamais le paiement source.

### 5.3 Mobile Money au MVP et évolution prévue

- **CONFIRMÉ — D-027 :** espèces, MTN Mobile Money, Orange Money et virement sont enregistrés manuellement au MVP.
- **CONFIRMÉ — D-027 :** une saisie Mobile Money conserve méthode/provider, référence facultative, preuve facultative, date, montant, acteur et confirmation.
- **CONFIRMÉ — D-027 :** aucune intégration automatique MTN/Orange n'est incluse au MVP.
- **CONFIRMÉ — D-027 :** l'évolution prévue conserve la séquence transaction reçue → `PAYMENT_RECORDED`, confirmation fournisseur → `PAYMENT_COMPLETED`, puis `RECEIPT_GENERATED`.

### 5.4 Événements sans communication par défaut

`PROPERTY_CREATED` et `TENANT_CREATED` sont retenus surtout pour l'audit et la visibilité interne. **PROPOSITION — Ils ne créent pas de communication externe par défaut**, afin de limiter le bruit et de garder le catalogue centré sur une utilité produit réelle.

## 6. Flux fonctionnel et comportement en cas d'échec

### 6.1 Flux nominal proposé

1. Le module propriétaire valide et réussit l'opération métier.
2. Il produit le fait avec son identifiant unique et son `organization_id`.
3. Le Core d'événements rend ce fait disponible à ses consommateurs sans connaître leurs détails internes.
4. Audit, activité, notification, communication ou autre module évaluent chacun leur propre réaction.
5. Chaque effet conserve un résultat indépendant : produit, ignoré car non pertinent, reporté ou en erreur.
6. Une erreur d'effet secondaire est suivie et reprise sans transformer le succès métier initial en échec.

Ce flux est **PROPOSITION**. La manière technique de garantir la remise entre les étapes 2 et 3 appartient à un lot d'architecture technique ultérieur.

### 6.2 Idempotence

**PROPOSITION.** Chaque consommateur reconnaît l'identifiant d'événement et traite plusieurs livraisons du même fait comme une seule intention fonctionnelle. Les effets sensibles disposent aussi d'une clé métier naturelle : un même paiement ne doit pas générer plusieurs reçus actifs ni provoquer plusieurs envois identiques au même destinataire pour le même événement et le même canal.

L'idempotence s'applique indépendamment à chaque consommateur : le succès de l'audit ne prouve pas le succès de la communication, et inversement.

### 6.3 Retry et reprise

**PROPOSITION.** Une erreur transitoire déclenche des tentatives espacées et limitées pour le consommateur concerné. Une erreur permanente ou des tentatives épuisées placent l'effet en attente d'examen, avec un motif exploitable, sans réécrire l'événement initial.

Avant une nouvelle tentative de notification ou de communication, le consommateur vérifie :

- que le destinataire a toujours accès à l'organisation ;
- que la préférence et la politique de canal permettent encore l'envoi ;
- que l'information n'est pas devenue trompeuse ou obsolète ;
- qu'un effet équivalent n'a pas déjà réussi.

**À VALIDER.** Le nombre de tentatives, leur durée, les délais d'escalade et le responsable opérationnel de la reprise seront définis ultérieurement.

### 6.4 Non-blocage du métier

- **PROPOSITION O-006 — L'échec du canal de communication n'annule pas une opération métier réussie.**
- **PROPOSITION — L'échec d'une notification ou du fil d'activité suit la même règle.**
- **PROPOSITION — Un retard de génération de reçu n'annule pas le paiement**, mais il doit être visible et repris, car le reçu appartient à la boucle produit attendue.
- **À VALIDER — Le niveau de garantie de l'audit.** Si certaines actions exigent une trace durable immédiate, le futur design technique devra assurer cette exigence sans rendre la disponibilité d'un fournisseur de communication nécessaire au métier.

### 6.5 Doublons, ordre et faits concurrents

**PROPOSITION.** Aucun consommateur ne suppose un ordre global parfait. Il s'appuie sur la date de survenue, la ressource concernée et, si nécessaire, sa révision. Lorsqu'un fait ancien arrive après un fait récent, le consommateur peut conserver la trace historique mais doit vérifier l'état courant avant de produire une action visible ou une communication.

## 7. Tenant, autorisation et confidentialité

- **CONFIRMÉ — D-028 :** chaque événement, notification, activité, trace d'audit, communication et document associé appartient à une seule Organization autonome.
- **PROPOSITION — Un consommateur refuse tout traitement dont l'organisation est absente, inconnue ou incompatible avec la ressource visée.**
- **PROPOSITION — L'accès aux notifications, au fil d'activité et à l'audit est contrôlé côté serveur ou base**, et jamais uniquement par un filtrage d'interface.
- **PROPOSITION — Un utilisateur non membre ne reçoit ni ne consulte les effets internes de l'organisation.** Un éventuel destinataire externe, tel qu'un locataire, relève d'un contrat de communication distinct et **À VALIDER**.
- **PROPOSITION — Les identifiants remplacent les noms, emails, téléphones et pièces personnelles dans l'événement** lorsque ces données ne sont pas indispensables au fait.
- **PROPOSITION — Les contenus de message sont construits au dernier moment dans la langue autorisée**, avec les données minimales accessibles au consommateur et le branding de l'Organization concernée ; ils ne sont pas stockés comme vérité dans l'événement.
- **À VALIDER — La séparation entre rôle système et rôle d'organisation**, ainsi que la matrice finale des permissions, conditionneront qui peut consulter l'audit et certaines activités financières.

## 8. Observabilité fonctionnelle minimale

**PROPOSITION.** Sans imposer d'outil, l'exploitation doit pouvoir distinguer pour chaque consommateur :

- fait reçu ou non encore pris en charge ;
- effet produit ;
- effet ignoré avec raison fonctionnelle ;
- effet en attente de retry ;
- effet définitivement en erreur et nécessitant une intervention ;
- date du dernier essai et corrélation avec le fait d'origine.

Cette visibilité ne doit pas révéler de secret ni exposer de donnée personnelle excessive. **À VALIDER — Les alertes opérationnelles, responsabilités de support et objectifs de délai** appartiennent au futur cadrage technique et opérationnel.

## 9. Questions restant ouvertes après le Lot 1

1. **À VALIDER — Destinataires :** les communications concernent-elles seulement les membres d'une organisation, ou aussi les locataires en tant que destinataires externes ?
2. **À VALIDER — Rappels :** quelles règles configurables définissent « bientôt dû », « en retard », les répétitions et les délais de grâce ?
3. **À VALIDER — Audit :** quelles actions sont obligatoirement auditées, qui peut consulter les traces et combien de temps faut-il les conserver ?
4. **À VALIDER — Documents :** quel contrat d'artefact tenant-scoped relie Receipts à Documents, et quels canaux de partage sont retenus ?
5. **À VALIDER — Garantie de remise :** quel niveau de garantie est requis pour l'audit et la génération de reçu lorsque le traitement d'un événement est temporairement indisponible ?

## 10. Vérification documentaire du cadrage

| Critère | Résultat v0.1 |
|---|---|
| Événement distinct d'une instruction de communication | Couvert |
| Notifications, communications, activité et audit séparés | Couvert |
| Catalogue volontairement minimal | Couvert : 10 événements |
| Producteur, consommateurs, tenant, audit, communication et données minimales documentés | Couvert pour les 10 événements |
| Envelope conceptuelle sans schéma technique | Couvert |
| Idempotence, retry, ordre et non-blocage abordés | Couvert conceptuellement |
| Portée tenant explicite | Couvert par `organization_id` obligatoire |
| Questions non tranchées préservées | Couvert par les marqueurs **À VALIDER** |
| Cohérence avec les décisions officielles | Couvert : D-023, D-027 et D-028 intégrées ; O-005 à O-007 préservées comme propositions |
| Absence de code, SQL, secret, fournisseur configuré et déploiement | Couvert |

**Statut final de ce document : VALIDÉ PAR BLAISE — Lot 1. Les questions résiduelles marquées À VALIDER ne sont pas tranchées.**

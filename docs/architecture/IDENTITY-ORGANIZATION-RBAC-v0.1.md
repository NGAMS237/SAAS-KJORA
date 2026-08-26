# Kjora — Identité, organisations et RBAC v0.1

> Lot : **Lot 1 — Architecture fonctionnelle v0.1**  
> Nature : **modèle conceptuel uniquement**  
> Statut du document : **VALIDÉ PAR BLAISE — Lot 1**  
> Hors périmètre : schéma de données, SQL, politiques RLS, implémentation Auth et matrice finale des permissions

## 1. Objectif

Ce document décrit le modèle conceptuel suivant :

`User -> Organization -> Membership -> Role -> Permissions`

Sa lecture fonctionnelle est : une identité globale (`User`) n'obtient un accès à une organisation (`Organization`) qu'au travers d'une appartenance (`Membership`). Cette appartenance porte un rôle d'organisation (`Role`), auquel sont rattachées des capacités (`Permissions`).

Le modèle doit :

- isoler strictement les organisations ;
- permettre la délégation à des utilisateurs locaux ;
- permettre plusieurs appartenances et plusieurs administrations d'organisations indépendantes ;
- imposer une seule organisation active par action, sans agrégation inter-organisation au MVP ;
- distinguer le contrôle du compte Kjora de la propriété juridique des immeubles ;
- permettre plus tard une application des permissions côté serveur et côté base, indépendamment de l'interface.

## 2. Statuts et références de gouvernance

Les statuts employés dans ce document sont :

- **CONFIRMÉ** : décision déjà approuvée et enregistrée ;
- **PROPOSITION** : structure recommandée pour la v0.1, sans valeur de décision officielle ;
- **À VALIDER** : choix volontairement laissé ouvert à Blaise.

Décisions et questions officielles utilisées :

| Référence | Statut | Application dans ce document |
|---|---|---|
| D-005 | **CONFIRMÉ** | L'isolation des organisations devra être imposée côté base, et non uniquement par l'interface. |
| D-006 | **CONFIRMÉ** | Les rôles prévus sont : propriétaire, gestionnaire, encaisseur, gardien, comptable et consultation. |
| D-021 | **CONFIRMÉ** | Un User peut avoir plusieurs Memberships ; chaque action utilise une seule Organization active, sans agrégation ni permission héritée entre organisations au MVP. |
| D-022 | **CONFIRMÉ** | Un utilisateur peut administrer plusieurs Organizations ; `Organization Owner` contrôle le compte Kjora et ne prouve pas la propriété juridique des immeubles. |
| D-025 | **CONFIRMÉ** | Six rôles fixes, capacités explicites, refus par défaut, un rôle principal par Membership, aucun rôle personnalisé au MVP et actions sensibles réservées. |
| D-026 | **CONFIRMÉ** | Email + OTP/lien sécurisé pour l'identité, le nouvel appareil et la récupération ; PIN 6 chiffres limité à l'accès quotidien sur appareil autorisé. |
| D-028 | **CONFIRMÉ** | Chaque Organization est un tenant autonome possédant ses accès, données, documents, événements, paramètres et identité organisationnelle. |

## 3. Principes directeurs

1. **CONFIRMÉ — l'organisation est la frontière tenant.** Toute donnée métier appartient à une organisation indépendante.
2. **CONFIRMÉ — l'accès ne dépend pas du filtrage de l'interface.** Les contrôles devront être appliqués côté serveur/base en plus de l'interface.
3. **CONFIRMÉ — l'identité est séparée de l'accès tenant.** Un utilisateur peut exister globalement sans disposer d'un accès à une organisation.
4. **CONFIRMÉ — l'appartenance est la source d'accès tenant.** Un utilisateur authentifié sans membership actif dans l'organisation ciblée est traité comme non-membre.
5. **CONFIRMÉ — refus par défaut.** L'absence d'une capacité explicitement accordée au rôle ne donne aucun droit.
6. **CONFIRMÉ — le rôle est évalué dans le contexte de l'organisation active.** Un rôle obtenu dans Org A ne produit aucun droit dans Org B.
7. **CONFIRMÉ — l'ownership du compte est contextuel.** Un User peut être `Organization Owner` dans plusieurs Organizations, sans que ce rôle soit une preuve de propriété juridique des immeubles.

## 4. Modèle conceptuel

### 4.1 Vue d'ensemble

| Concept | Statut | Responsabilité conceptuelle | Ne doit pas devenir |
|---|---|---|---|
| `User` | **CONFIRMÉ** | Représenter l'identité globale d'une personne et ses préférences globales strictement nécessaires. | Un conteneur de droits tenant ou un propriétaire implicite de toutes ses données. |
| `Organization` | **CONFIRMÉ** | Représenter le tenant autonome, son profil, son branding, ses paramètres et la frontière d'isolation des données. | Un simple filtre d'interface ou une preuve de propriété juridique. |
| `Membership` | **CONFIRMÉ** | Relier un utilisateur à une organisation et porter l'état de son accès ainsi qu'un rôle principal d'organisation. | Une autorisation transversale réutilisable dans d'autres organisations. |
| `Role` | Structure et noms **CONFIRMÉS** ; attribution détaillée **À VALIDER** | Regrouper des capacités explicites dans le contexte d'une organisation. | Une liste de droits supposée à partir du seul intitulé du rôle. |
| `Permission` | Nomenclature **PROPOSITION** | Exprimer une capacité métier vérifiable, par exemple voir un paiement ou gérer un membre. | Une autorisation appliquée uniquement par masquage d'un bouton. |

### 4.2 `User` — identité globale

**CONFIRMÉ — D-026** — `User` représente une personne reconnue par le système, indépendamment de toute organisation. Email + OTP ou lien sécurisé établissent l'identité, vérifient un nouvel appareil et permettent la récupération. Le PIN à 6 chiffres sert uniquement à l'accès quotidien sur un appareil déjà autorisé ; il n'est pas une preuve forte autonome. Throttling, limites de tentatives, verrouillage, révocation d'appareil et nouvelle vérification forte pour certaines actions sensibles sont requis conceptuellement. La biométrie est hors MVP.

Une identité globale :

- ne reçoit pas automatiquement l'accès à une organisation ;
- ne porte pas un rôle « propriétaire », « gestionnaire » ou autre de manière globale ;
- peut avoir zéro membership actif ;
- n'accède aux données métier qu'après détermination d'une organisation cible et vérification d'un membership actif dans celle-ci.

Cette séparation évite qu'un droit accordé dans Org A soit réutilisé par erreur dans Org B.

### 4.3 `Organization` — frontière tenant

**CONFIRMÉ** — chaque Organization est un tenant autonome et toute donnée tenant-scoped appartient à une organisation.

**CONFIRMÉ** — l'organisation est le contexte explicite de toute opération métier. Elle possède indépendamment ses Memberships, utilisateurs autorisés, rôles, données métier, documents, événements, notifications, activité, audit, paramètres et identité organisationnelle. `Organization`, `Organization Profile`, `Organization Branding` et `Organization Settings` restent conceptuellement séparés. Le fait qu'une personne soit authentifiée ne suffit jamais à déterminer l'organisation autorisée.

Un User peut rejoindre plusieurs organisations et être `Organization Owner` dans plusieurs d'entre elles. Cette capacité d'administration ne modélise pas la copropriété juridique : le modèle reste compatible avec biens familiaux, sociétés, indivisions, successions, mandataires et copropriétés sans inventer leurs règles légales.

### 4.4 `Membership` — accès d'un utilisateur à une organisation

**CONFIRMÉ** — un membership matérialise l'association entre un `User` et une `Organization`. Conceptuellement, il permet de connaître :

- l'utilisateur concerné ;
- l'organisation concernée ;
- l'état d'accès, par exemple invité, actif, suspendu ou révoqué ;
- le rôle d'organisation utilisé pour évaluer les capacités ;
- les informations minimales de traçabilité de l'invitation et des changements d'accès.

Les états cités sont une **PROPOSITION de vocabulaire**, pas un schéma final.

Un membership non actif ne doit pas produire les mêmes droits qu'un membership actif. Sa présence ne vaut jamais autorisation universelle : elle est évaluée uniquement pour son organisation.

**CONFIRMÉ — D-025** — au MVP, chaque Membership porte un seul rôle principal parmi les six rôles fixes. Les rôles combinables et personnalisés sont hors MVP.

### 4.5 `Role` et `Permissions`

**CONFIRMÉ — D-006** — les six rôles prévus sont :

- propriétaire ;
- gestionnaire ;
- encaisseur ;
- gardien ;
- comptable ;
- consultation.

Leur structure est confirmée : capacités explicites, refus par défaut, aucune permission inter-organisation, gestion des membres et paramètres sensibles réservée à `Organization Owner`, et aucune correction financière silencieuse. L'attribution détaillée de chaque capacité non tranchée par D-025 reste **À VALIDER**.

**PROPOSITION** — un rôle regroupe des permissions exprimées par capacité métier. Une permission répond à la question « cette appartenance peut-elle effectuer cette action dans cette organisation ? ». Le titre humain du rôle ne remplace pas cette vérification.

## 5. Administration multi-ownership et propriété juridique

**CONFIRMÉ — D-022** — l'administration d'une organisation est représentée par un Membership auquel le rôle `propriétaire` / `Organization Owner` est attribué. Le même User peut avoir ce rôle dans plusieurs Organizations indépendantes. Ce rôle contrôle le compte Kjora du tenant ; il ne constitue jamais une preuve de propriété juridique d'un bien.

Chaque Membership et chaque capacité restent propres à leur Organization. Il n'existe au MVP ni permission héritée, ni agrégation de données, ni tableau de bord consolidé entre Organizations.

**PROPOSITION** — une organisation doit conserver au moins un chemin d'administration propriétaire valide afin d'éviter un tenant orphelin. Les règles précises de transfert, retrait ou copropriété restent hors périmètre.

## 6. Utilisateur invité

**CONFIRMÉ** — un utilisateur invité ne voit que les organisations auxquelles il appartient.

**PROPOSITION** — l'invitation crée ou prépare un accès limité à une organisation précise. Avant activation, elle ne donne aucun accès métier normal. Après acceptation, le membership actif et son rôle déterminent les capacités disponibles.

Conséquences conceptuelles :

- une invitation à Org A ne donne aucun accès à Org B ;
- le destinataire doit être rattaché à la bonne identité globale avant activation ;
- une invitation expirée, révoquée ou non acceptée ne doit pas être interprétée comme un membership actif ;
- le rôle demandé par l'invitation ne doit pas contourner les contrôles de permission du serveur/base.

Le canal d'envoi, la durée de validité et le mécanisme d'acceptation sont hors périmètre et **À VALIDER** dans les lots concernés.

## 7. Changement d'organisation

**CONFIRMÉ — D-021** — l'utilisateur choisit une organisation active parmi celles pour lesquelles il possède un membership actif. Le changement d'organisation modifie le contexte tenant ; il ne fusionne ni les rôles, ni les données, ni les permissions. Chaque action s'exécute dans une seule organisation active.

À chaque changement de contexte :

1. l'organisation demandée est identifiée ;
2. le membership actif de l'utilisateur dans cette organisation est vérifié ;
3. le rôle et ses capacités sont évalués pour cette organisation seulement ;
4. toute ressource manipulée doit appartenir à la même organisation ;
5. l'action sensible peut être enregistrée dans l'audit conceptuel.

**PROPOSITION** — l'interface peut mémoriser une organisation active pour simplifier l'usage, mais cette préférence n'est jamais une preuve d'autorisation.

## 8. Tenant scope et `organization_id`

**CONFIRMÉ** — toute donnée métier appartient à une organisation.

**CONFIRMÉ — D-028** — chaque ressource tenant-scoped porte conceptuellement un `organization_id` qui identifie son tenant. Ce principe couvre notamment profil, branding, paramètres, memberships, rôles, propriétés, unités, locataires, contrats, échéances, paiements, reçus, dépenses, maintenances, documents/fichiers, événements, notifications, activité, audit et rapports.

Règles conceptuelles :

- le `organization_id` d'une ressource ne doit jamais être déduit seulement de l'écran actuellement affiché ;
- l'organisation de la ressource doit correspondre à l'organisation autorisée pour l'opération ;
- une relation métier ne doit pas relier silencieusement des ressources de deux organisations ;
- une référence connue ou devinée dans Org B ne donne aucun accès à un membre d'Org A ;
- les exports, recherches, agrégats et rapports doivent conserver la même frontière tenant ;
- les exceptions éventuelles doivent être explicites, revues et auditées ; aucune exception métier n'est proposée dans ce lot.

L'identité globale `User` n'est pas une donnée métier tenant-scoped. Son existence ne permet toutefois jamais d'accéder aux ressources d'une organisation sans membership autorisé.

## 9. Principe d'autorisation côté serveur et base

**CONFIRMÉ** — les permissions devront être appliquées côté serveur/base en plus de l'interface. L'isolation future en base est imposée par la décision D-005.

**PROPOSITION** — toute opération tenant-scoped doit vérifier conceptuellement les quatre conditions suivantes :

1. l'identité de l'utilisateur est établie ;
2. l'utilisateur possède un membership actif dans l'organisation ciblée ;
3. le rôle de ce membership contient la capacité requise ;
4. la ressource ciblée appartient à la même organisation.

Si une condition manque, l'accès est refusé. L'interface peut masquer une action non disponible pour améliorer l'expérience, mais ce masquage n'est pas un contrôle de sécurité.

Ce document ne définit aucune politique RLS réelle, aucun schéma et aucun mécanisme d'authentification.

## 10. Rôle système versus rôle d'organisation

### Rôles d'organisation

**CONFIRMÉ** — les six rôles D-006 sont des rôles utilisés dans le contexte d'une organisation. Un même intitulé dans deux organisations ne crée aucun lien entre leurs données.

### Rôle système éventuel

**À VALIDER** — l'existence de rôles système ou plateforme n'est pas confirmée.

**PROPOSITION** — si un rôle système devient nécessaire ultérieurement, il doit être séparé des rôles d'organisation :

- il sert à des fonctions de plateforme clairement définies, pas à la gestion métier quotidienne d'un tenant ;
- il n'accorde pas implicitement un accès transversal aux données des organisations ;
- tout accès exceptionnel de support devrait être explicite, limité et auditable ;
- il ne peut pas être obtenu par simple modification d'un rôle d'organisation.

Aucun rôle système concret ni aucune de ses permissions n'est défini dans cette v0.1.

## 11. Nomenclature de permissions par capacité

**PROPOSITION — nomenclature seulement.** La forme recommandée est `<domaine>.<action>`, avec des noms stables, compréhensibles et indépendants des écrans. La liste ci-dessous sert à structurer le prochain travail ; elle ne constitue ni une matrice finale, ni une attribution aux six rôles.

| Domaine | Capacités candidates |
|---|---|
| Organisation et membres | `organization.view`, `organization.manage`, `organization.settings.manage`, `member.view`, `member.manage` |
| Biens et unités | `property.view`, `property.manage`, `unit.view`, `unit.manage` |
| Locataires | `tenant.view`, `tenant.manage` |
| Contrats | `lease.view`, `lease.manage` |
| Loyers et échéances | `rent_due.view`, `rent_due.manage` |
| Paiements | `payment.view`, `payment.record`, `payment.manage` |
| Reçus | `receipt.view`, `receipt.generate`, `receipt.share` |
| Dépenses | `expense.view`, `expense.manage` |
| Maintenance | `maintenance.view`, `maintenance.manage` |
| Documents | `document.view`, `document.manage`, `document.share` |
| Reporting | `report.view` |
| Traçabilité | `activity.view`, `audit.view` |

Principes proposés pour faire évoluer cette nomenclature :

- `view` autorise la consultation sans supposer la modification ;
- `manage` regroupe provisoirement les mutations d'un domaine lorsque les séparer n'apporte pas encore de valeur validée ;
- une action sensible peut recevoir une capacité dédiée, comme `payment.record` ou `receipt.share` ;
- les capacités décrivent le métier et non un écran, un bouton ou un fournisseur technique ;
- toute nouvelle capacité doit rester tenant-scoped lorsqu'elle agit sur une ressource métier.

**CONFIRMÉ — D-025** — les capacités sont explicites, le refus par défaut s'applique, et `member.manage` ainsi que `organization.settings.manage` pour les paramètres sensibles sont réservées à `Organization Owner`. **À VALIDER** — la liste finale, le niveau de granularité et l'affectation détaillée des autres capacités aux six rôles.

## 12. Scénarios conceptuels obligatoires

### Scénario 1 — propriétaire de Org A

**CONFIRMÉ — D-025** — le rôle `propriétaire` / `Organization Owner` est retenu. Il gère les membres et les paramètres sensibles de son organisation ; ses autres permissions détaillées restent **À VALIDER**.

**PROPOSITION de fonctionnement** :

- User 1 possède un membership actif dans Org A avec le rôle `propriétaire` ;
- ses actions dans Org A sont évaluées selon les capacités qui seront attribuées à ce rôle ;
- sans membership distinct dans Org B, toute lecture ou action dans Org B est refusée ;
- son rôle dans Org A ne devient jamais un rôle global.

### Scénario 2 — gestionnaire de Org A

**CONFIRMÉ — D-025** — le rôle `gestionnaire` est retenu avec des capacités explicites et aucun droit implicite de gérer les membres ou paramètres sensibles. Ses permissions détaillées restent **À VALIDER**.

**PROPOSITION de fonctionnement** :

- User 2 possède un membership actif dans Org A avec le rôle `gestionnaire` ;
- le serveur/base vérifie la capacité demandée au lieu de déduire un accès complet du titre « gestionnaire » ;
- l'utilisateur reste non-membre de Org B tant qu'aucun membership actif distinct n'existe ;
- aucune capacité du propriétaire n'est héritée implicitement.

### Scénario 3 — encaisseur de Org A

**CONFIRMÉ — D-025** — le rôle `encaisseur` est retenu avec des capacités explicites. Ses permissions détaillées restent **À VALIDER**.

**PROPOSITION de fonctionnement** :

- User 3 possède un membership actif dans Org A avec le rôle `encaisseur` ;
- une demande d'enregistrement de paiement teste explicitement la capacité candidate `payment.record` ;
- le résultat dépendra de la future matrice validée, et non du nom du rôle seul ;
- même si l'action est autorisée dans Org A, elle reste refusée pour une ressource de Org B.

### Scénario 4 — utilisateur non membre

**PROPOSITION conforme à l'isolation confirmée** :

- User 4 est authentifié mais ne possède aucun membership actif dans Org A ;
- il ne peut ni lister ni consulter les ressources métier de Org A ;
- connaître l'identifiant d'une organisation ou d'une ressource ne change pas ce résultat ;
- l'interface et les contrôles serveur/base convergent vers un refus.

### Scénario 5 — utilisateur ayant accès à Org A et Org B

**CONFIRMÉ — D-021.** Ce scénario est le fonctionnement multi-organisation retenu :

- User 5 possède un membership distinct dans Org A et un autre dans Org B ;
- chaque membership peut porter un rôle différent ;
- le passage de A à B change le contexte tenant et déclenche une nouvelle évaluation des droits ;
- les permissions ne s'additionnent pas entre A et B ;
- une ressource de A n'apparaît pas dans les vues, recherches, rapports ou actions de B ;
- les opérations simultanées ou les liens profonds doivent toujours vérifier l'organisation de la ressource, pas seulement l'organisation affichée ;
- le MVP ne consolide ni tableaux de bord, ni agrégats entre A et B.

## 13. Risques conceptuels et garde-fous

| Risque | Statut du garde-fou | Garde-fou proposé |
|---|---|---|
| Fuite Org A vers Org B à cause du contexte d'interface | **PROPOSITION** | Vérifier membership, capacité et `organization_id` pour chaque opération côté serveur/base. |
| Rôle stocké globalement sur l'utilisateur | **PROPOSITION** | Porter le rôle dans le contexte du membership d'organisation. |
| Confusion entre `Organization Owner` et propriétaire juridique | **CONFIRMÉ** | Présenter le rôle comme contrôle du compte Kjora ; ne jamais l'utiliser comme preuve de propriété d'un immeuble. |
| Nom de rôle interprété comme permission automatique | **PROPOSITION** | Autoriser par capacités explicites ; refus par défaut. |
| Rôle système transformé en accès transversal | **PROPOSITION** | Séparer rôle système et rôle d'organisation ; accès exceptionnel explicite et auditable. |
| Invitation non acceptée donnant un accès | **PROPOSITION** | Distinguer invitation et membership actif. |
| Rapport ou export mélangeant plusieurs tenants | **PROPOSITION** | Appliquer le même tenant scope aux lectures, recherches, agrégats et exports. |

## 14. Points restant à valider après le Lot 1

1. **À VALIDER :** quelle attribution détaillée relie les six rôles fixes aux capacités non tranchées par D-025 ?
2. **À VALIDER :** un rôle système distinct sera-t-il nécessaire à la plateforme ?
3. **À VALIDER :** quelles règles de transfert empêchent une organisation de devenir orpheline d'`Organization Owner` ?

Ces validations ne sont pas remplacées par les propositions du présent document.

## 15. Critères d'acceptation de ce modèle v0.1

Le document est acceptable si :

- l'identité globale est distincte de l'accès tenant ;
- l'accès à une organisation passe par un membership actif ;
- les six rôles fixes et les règles RBAC de D-025 sont couverts sans inventer les attributions détaillées non validées ;
- toute ressource métier est conceptuellement rattachée à une organisation ;
- les permissions sont prévues côté serveur/base et pas uniquement dans l'interface ;
- Org A, Org B et l'utilisateur non membre sont explicitement isolés ;
- le modèle permet plusieurs Memberships et une organisation active par action, sans agrégation inter-organisation au MVP ;
- le modèle permet à un User d'administrer plusieurs Organizations sans présumer une propriété juridique ;
- la nomenclature de capacités est clairement marquée **PROPOSITION** ;
- l'attribution détaillée des capacités non tranchées et les rôles système restent explicitement **À VALIDER** ;
- le modèle Auth D-026 est reflété sans définir code, SQL, schéma de base ou implémentation technique.

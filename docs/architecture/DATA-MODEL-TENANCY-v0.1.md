# Kjora — Modèle de données conceptuel & tenancy v0.1

> Statut : **VALIDÉ PAR BLAISE — D-072 à D-077**  
> Portée : entités, responsabilités, relations et isolation conceptuelles ; aucun SQL, type physique ou migration

## 1. Vocabulaire sans ambiguïté

- **Organization** : tenant SaaS isolé.
- **Tenant** : locataire immobilier métier ; ce mot ne désigne jamais le tenant SaaS dans les noms fonctionnels.
- **User Identity** : identité globale authentifiée.
- **Membership** : autorisation interne d’une User Identity dans une Organization.
- **Tenant Portal Access** : autorisation externe distincte reliant une identité portail à un Tenant et à ses Lease(s).

Relation fondamentale :

`User Identity ≠ Membership ≠ Tenant ≠ Tenant Portal Access`.

Une même personne peut porter plusieurs Memberships et plusieurs accès portail, mais aucune de ces autorisations n’est déduite automatiquement de son identité ou de ses coordonnées.

## 2. Règles de tenancy

1. Toute donnée métier appartient à une Organization, sauf exception globale explicitement listée.
2. Toute table/collection tenant-scoped possède un `organization_id` direct, obligatoire et immuable après création.
3. Les relations entre ressources tenant-scoped exigent le même `organization_id`.
4. La répétition contrôlée de `organization_id` est une clé d’isolation, pas une copie de vérité métier.
5. Une référence ne recopie pas le dossier source : Lease référence Tenant et Unit ; Receipt référence Payment.
6. Une projection ou un artefact dérivé n’est jamais une seconde source éditable.
7. Le portail lit les mêmes Lease, Due, Payment et Receipt que l’espace interne.
8. Les identifiants sont opaques ; leur secret supposé ne remplace jamais RLS.

## 3. Données globales

| Entité | Responsabilité | Relations | `organization_id` | Propriétaire métier | Ne jamais dupliquer |
|---|---|---|---|---|---|
| User Identity | Identité authentifiée globale, canaux vérifiés, sujet Auth | Memberships, Device Authorizations, Tenant Portal Accesses | Non | Core Identity/Auth | Identité Auth dans chaque Organization |
| Auth Identity/Factor | Canal ou facteur géré par Auth : email, téléphone, OTP/lien | User Identity | Non | Fournisseur Auth/Core | Secrets, OTP ou tokens en clair dans le domaine |
| Country Configuration | Règles variables par pays : devise, langues, moyens, calendrier | Organization Settings, Rent Schedules | Non | Core Country Configuration | Règles Cameroun dans chaque module |
| Role Definition | Six rôles fixes du MVP | Capability assignments, Membership | Non ; référence globale versionnée | Core Authorization | Copie personnalisable par Organization |
| Capability Definition | Action atomique autorisable | Role Definition, contrôles serveur/RLS | Non ; référence globale versionnée | Core Authorization | Liste de capacités dans le JWT utilisateur comme seule vérité |
| Module/Feature Definition | Registre des modules et flags autorisés | Organization feature state futur | Non | Core Module Registry | État de module dispersé dans l’UI |

Les préférences personnelles comme la langue de l’utilisateur sont globales lorsque leur portée est le compte. Elles ne transportent aucun droit tenant.

`PhoneOtpProvider` est un port technique du Core Portal Auth, pas une entité métier ni une source de données. Il abstrait l’envoi/la vérification OTP téléphone ; son implémentation fournisseur reste différée avant le Lot 6E conformément à D-076.

## 4. Core Organization et autorisation interne

| Entité | Responsabilité | Relations | Scope | Propriétaire métier | Ne jamais dupliquer |
|---|---|---|---|---|---|
| Organization | Tenant SaaS, cycle de vie et identifiant racine | Profile, Branding, Settings, Memberships, toutes ressources | Tenant-scoped par sa propre clé | Core Organizations | Une Organization par module |
| Organization Profile | Identité publique/opérationnelle : nom, nom légal, coordonnées | Organization | `organization_id` unique | Core Organizations | Profil dans Receipt ou Communication comme source éditable |
| Organization Branding | Logo et réglages de marque tenant | Organization, File Asset logo | `organization_id` unique | Core Organizations | Fichier logo dans chaque document |
| Organization Settings | Pays, devise, langue, fuseau, réglages documentaires | Organization, Country Configuration | `organization_id` unique | Core Organizations/Common Settings | Devise/fuseau dans les modules comme configuration concurrente |
| Membership | Lien User Identity ↔ Organization, rôle principal, état | User Identity, Organization, Role Definition | `organization_id` obligatoire | Core Memberships | Identité globale ou matrice complète de rôle |
| Membership Invitation | Invitation interne 7 jours, rôle proposé, état, usage | Organization, inviter, destinataire, Membership après acceptation | `organization_id` obligatoire | Core Memberships | Token brut, permission active avant acceptation |
| Owner Transfer | Workflow garantissant au moins un Owner | Organization, Membership source/cible | `organization_id` obligatoire | Core Memberships/Authorization | Ownership juridique du bien |

### Invariants

- Un seul rôle principal par Membership au MVP.
- Aucun rôle personnalisé.
- Une Organization conserve au moins un Membership Owner actif.
- Une invitation n’accorde aucun accès avant acceptation.
- Le rôle d’un Membership ne vaut jamais dans une autre Organization.

## 5. Identité locataire et portail

| Entité | Responsabilité | Relations | Scope | Propriétaire métier | Ne jamais dupliquer |
|---|---|---|---|---|---|
| Tenant | Dossier du locataire immobilier : nom et contact minimum | Organization, Leases, Tenant Portal Access | `organization_id` obligatoire | Module Tenants | User Identity, Membership, états financiers |
| Tenant Portal Access | Autorisation portail, statut actif/révoqué/historique | User Identity ou identité portail, Tenant, Organization, Lease Accesses | `organization_id` obligatoire | Core Portal Authorization / Tenants | Lease, Due, Payment ou Receipt |
| Portal Lease Access | Liste explicite des Lease(s) consultables par un accès | Tenant Portal Access, Lease | `organization_id` obligatoire | Core Portal Authorization | Copie du Lease ou du Tenant |
| Portal Invitation | Invitation 7 jours par téléphone/email, état et usage | Tenant Portal Access, Organization, canal masqué | `organization_id` obligatoire | Core Portal Auth | OTP, lien ou token brut ; Membership |
| Portal Access Log | Faits minimaux de sécurité conservés 12 mois | Tenant Portal Access, session/appareil | `organization_id` obligatoire | Core Portal Security | Audit métier ou détails techniques exposés à l’Organization |

### Invariants

- Un contact Tenant ne crée aucun accès.
- Seuls Owner et gestionnaire administrent Tenant Portal Access.
- Un accès ne lit qu’un Tenant et ses Lease(s) explicitement reliés.
- Une identité peut accéder à plusieurs Organizations, mais chaque accès et chaque sélection sont isolés.
- Fin de Lease : accès fonctionnel historique lecture seule selon les ressources encore conservées.

## 6. Biens et locations

| Entité | Responsabilité | Relations | Scope | Propriétaire métier | Ne jamais dupliquer |
|---|---|---|---|---|---|
| Property | Bien immobilier et repère/localité/type | Organization, Units | `organization_id` obligatoire | Module Properties | Units ou contrats dans un champ embarqué |
| Unit | Espace louable explicite | Property, Leases | `organization_id` obligatoire | Module Units | Profil Property ; modèle parallèle « Property directement louable » |
| Lease | Contrat entre une Unit et un Tenant unique au MVP | Unit, Tenant, Rent Schedule, Dues | `organization_id` obligatoire | Module Leases | Dossier Tenant, profil Unit, paiements ou reçus |
| Rent Schedule | Règle de génération : montant, devise, périodicité, dates/exigibilité | Lease, Country Configuration, Dues | `organization_id` obligatoire | Module Rent/Dues/Schedules | Dues déjà générées ; phrases localisées |
| Rent Due | Échéance individuelle attendue et état dérivé | Lease, Rent Schedule, Payment Allocations | `organization_id` obligatoire | Module Rent/Dues/Schedules | Somme encaissée comme vérité indépendante des allocations |

### Invariants

- Toute location suit Property → Unit → Lease.
- Une maison entière possède une Unit explicite.
- Lease référence une Unit et un Tenant de la même Organization.
- Les périodicités MVP restent mensuelle, trimestrielle, semestrielle et annuelle.
- **CONFIRMÉ — D-077 :** les périodes de deux Leases d’une même Unit ne se chevauchent jamais. Un Lease futur est autorisé lorsqu’il commence après la fin du précédent.
- Les états À venir/Dû/Partiel/Payé/En retard sont dérivés des dates et paiements confirmés.

## 7. Paiements et reçus

| Entité | Responsabilité | Relations | Scope | Propriétaire métier | Ne jamais dupliquer |
|---|---|---|---|---|---|
| Payment | Source de vérité du paiement, méthode, montant, date, acteur, état Recorded/Completed | Organization, Tenant/Lease contextuel, Allocations, preuve, Receipt | `organization_id` obligatoire | Capacité Payments | Solde Due, contenu du reçu, confirmation fournisseur simulée |
| Payment Allocation | Affectation d’un montant de Payment à une Rent Due | Payment, Rent Due | `organization_id` obligatoire | Capacité Payments | Payment ou Due complet |
| Payment Proof | Métadonnée d’une preuve facultative | Payment, File Asset privé | `organization_id` obligatoire | Capacité Payments | Objet Storage ou Payment |
| Payment Correction Request | Signalement motivé sans mutation du paiement | Payment, demandeur, état de demande | `organization_id` obligatoire | Capacité Payments | Paiement corrigé ou event de remboursement |
| Receipt | Reçu métier dérivé après Payment Completed | Payment, artefact File Asset, consultation portail | `organization_id` obligatoire | Capacité Receipts | Payment source ou montant éditable concurrent |

### Payment Allocation recommandée

**RETENU LOT 4 :** conserver une entité d’allocation même si le MVP affecte chaque paiement à une seule échéance. Elle rend explicite la somme allouée, facilite les paiements partiels et évite de placer une référence fragile directement dans Payment. Au MVP : exactement une allocation par paiement, une seule Due cible, montant positif et inférieur ou égal au restant.

Le paiement réparti sur plusieurs échéances reste MVP OUT ; l’entité ne l’active pas dans l’UX ou les règles.

### Receipt et artefact

Receipt conserve l’identité du reçu, sa version, sa date de génération et la référence d’artefact. L’artefact peut être une représentation immuable du reçu au moment de la génération, mais Payment reste la source de vérité et aucun champ financier du Receipt n’est éditable indépendamment.

## 8. Signaux, communication et traçabilité

| Entité | Responsabilité | Relations | Scope | Propriétaire métier | Ne jamais dupliquer |
|---|---|---|---|---|---|
| Domain Event | Fait métier passé, versionné et immuable | Aggregate, Organization, actor, outbox deliveries | `organization_id` obligatoire | Core Domain Events ; contenu produit par module | Phrase FR/EN, secret, dossier métier complet |
| Outbox Delivery | État technique de distribution par consommateur | Domain Event, consumer, tentatives | `organization_id` obligatoire | Core Event Dispatcher | Event métier comme payload modifiable |
| Notification | Message in-app adressé et état lu/non lu | Domain Event, destinataire, ressource | `organization_id` obligatoire | Core Notifications | Vérité métier ou Activity/Audit |
| Activity Entry | Chronologie humaine d’un fait autorisé | Domain Event, acteur, ressource | `organization_id` obligatoire | Core Activity | Audit ou communication |
| Audit Entry | Trace append-only d’action sensible/résultat | Actor, Organization, resource, correlation | `organization_id` obligatoire | Core Audit | Journal technique brut, Notification, Portal Access Log |
| Communication | Intention/résultat métier de communication | Domain Event ou commande autorisée, destinataire logique | `organization_id` obligatoire | Core Communications | Email/phone non nécessaires dans l’event |
| Delivery Attempt | Tentative fournisseur, résultat, erreur minimisée | Communication, provider reference | `organization_id` obligatoire | Core Communications | Secret fournisseur ou contenu métier complet |
| Dashboard Projection | Read model attendu/encaissé/restant/retards/activité | Dues, Payments Completed, Activity | `organization_id` obligatoire | Application/Projection | Nouvelle source financière éditable |

Notification, Activity, Audit, Communication et Domain Event ont des cycles de vie séparés. Supprimer ou lire une notification ne modifie aucune autre entité.

## 9. Fichiers, appareils et sessions

| Entité | Responsabilité | Relations | Scope | Propriétaire métier | Ne jamais dupliquer |
|---|---|---|---|---|---|
| File Asset | Métadonnée canonique d’un objet privé : catégorie, chemin, type, taille, hash, statut | Organization, ressource propriétaire, Storage object | `organization_id` obligatoire sauf futur asset produit global | Core Storage/Documents | Fichier binaire en base, URL permanente publique |
| Device Authorization | Appareil interne vérifié/autorisé, état de révocation et protection du verrou rapide | User Identity, sessions | Global par identité ; contexte tenant jamais embarqué comme droit | Core Identity/Security | PIN brut, session Auth, Membership, permission tenant |
| Auth Session | Session émise par le fournisseur Auth | User Identity, Device Authorization | Global ; aucune capacité métier | Supabase Auth/Core Identity | Rôle ou Organization active comme autorisation permanente |
| Session Authorization | Registre applicatif de session : identifiant fournisseur, appareil, état actif/révoqué, contexte Organization actif | Auth Session, User Identity, Device Authorization, Membership | Global par session ; référence une seule Organization active à la fois | Core Identity/Authorization | Token, rôle, Membership ou données tenant |
| Portal Session/Device | Session portail au plus 30 jours et état de révocation | User Identity, Tenant Portal Access, Portal Access Log | `organization_id` si liée à un accès ; sélection explicite par contexte | Core Portal Security | PIN locataire, données Lease/Payment |

Le navigateur conserve seulement les identifiants/jetons nécessaires via des mécanismes sécurisés adaptés au web/PWA. Supabase Auth reste l’identité/session principale. Le PIN n’est qu’un verrou rapide sur appareil déjà vérifié : il ne crée ni ne remplace la session Auth, n’est jamais stocké en clair et doit résister à la force brute. Session Authorization ne remplace pas Supabase Auth ; elle permet au serveur et au chemin d’autorisation de refuser une session/appareil révoqué et de borner chaque action à une Organization autorisée. Keychain/Keystore et biométrie ne concernent qu’une éventuelle trajectoire Capacitor future.

## 10. Invitations

Deux types restent séparés :

| Type | Crée après acceptation | Durée | Administrateur | Scope |
|---|---|---:|---|---|
| Membership Invitation | Membership interne avec rôle fixe | 7 jours | Owner | Organization |
| Portal Invitation | Tenant Portal Access activé, sans Membership | 7 jours | Owner ou gestionnaire | Organization + Tenant + Lease(s) |

Une relance invalide l’invitation active précédente correspondante. Les jetons sont à usage contrôlé, non conservés en clair et ne portent pas eux-mêmes l’autorisation finale.

## 11. Relations structurantes

| Parent | Enfant/lien | Cardinalité MVP | Contrainte |
|---|---|---|---|
| User Identity | Membership | 0..n | Organizations indépendantes |
| Organization | Membership | 1..n | Au moins un Owner actif |
| Organization | Property/Tenant | 0..n | Tenant-scoped |
| Property | Unit | 1..n | Unit explicite |
| Unit | Lease | 0..n | Périodes sans chevauchement — D-077 |
| Tenant | Lease | 0..n | Un Tenant titulaire par Lease au MVP |
| Lease | Rent Schedule | 1 | Périodicité validée |
| Lease | Rent Due | 0..n | Générées selon Schedule |
| Payment | Payment Allocation | 1 au MVP | Une Due cible, pas de multi-allocation UX |
| Payment | Receipt | 0..1 reçu actif | Seulement après Completed |
| Tenant Portal Access | Portal Lease Access | 1..n | Même Organization et Tenant |
| Domain Event | Outbox Delivery | 0..n | Une livraison logique par consommateur |

## 12. Indexation et volumes conceptuels

Sans fixer de SQL, prévoir :

- clé unique globale de chaque ressource ;
- index commençant par `organization_id` sur les listes et recherches tenant ;
- index Organization + statut/date pour Lease, Due, Payment, Notification, Activity, Audit et Event ;
- unicité tenant-scoped des repères nécessaires ;
- index des liaisons Portal Access + Lease ;
- pagination par curseur stable pour chronologies et gros historiques ;
- rétention/purge explicite pour journal portail, tentatives et données techniques ;
- partitionnement uniquement après mesure des tables volumineuses.

## 13. Données qui ne doivent jamais être dupliquées

- User Identity dans chaque Organization.
- Tenant en Membership interne.
- Lease, Due, Payment ou Receipt dans le portail.
- Payment dans Receipt ou Dashboard comme vérité éditable.
- Organization Profile/Branding comme copie modifiable dans chaque reçu.
- Fichier Storage dans une seconde bibliothèque documentaire.
- Rôle/capacités comme attribut utilisateur global.
- Domain Event dans Notification, Activity ou Audit comme objet mutable.
- Configuration pays dans chaque module.

Les projections, références et artefacts versionnés sont autorisés lorsqu’ils sont identifiés comme dérivés, reconstruisibles ou immuables selon leur finalité.

## 14. Contrôles de cohérence attendus

- Une relation cross-Organization est impossible même si deux IDs valides sont présentés.
- Changer l’Organization active ne déplace aucune donnée.
- Révoquer un Membership n’efface pas l’identité globale.
- Révoquer un Tenant Portal Access n’efface ni Tenant ni Lease.
- Un Payment Recorded ne contribue pas à l’encaissé confirmé.
- Un Receipt ne peut exister avant Payment Completed.
- Un portail multi-Organization ne révèle aucune autre relation à l’Organization consultée.
- Un objet Storage est rattaché à une métadonnée et une ressource du même tenant.
- Deux Leases d’une même Unit ne couvrent jamais simultanément la même période.

Ce modèle conceptuel est **VALIDÉ** pour le Lot 4. Aucun schéma physique n’est créé dans ce lot et le Lot 5A reste non commencé.

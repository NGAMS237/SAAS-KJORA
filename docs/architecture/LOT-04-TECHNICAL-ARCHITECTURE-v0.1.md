# Kjora — Lot 4 — Architecture technique & sécurité v0.1

> Statut : **VALIDÉ PAR BLAISE — D-072 à D-077**  
> Portée : fondations techniques conceptuelles avant développement  
> Interdictions appliquées : aucune implémentation, installation, migration, configuration Supabase, création d’environnement, clé ou déploiement

## 1. Objectif

Définir une architecture simple, testable et suffisamment robuste pour préparer le développement du MVP Kjora sans remettre en cause les décisions D-001 à D-077.

Le résultat recherché est un monolithe modulaire web/PWA qui :

- applique l’isolation par Organization à chaque couche ;
- sépare identité, Membership et Tenant Portal Access ;
- confie l’autorisation de données à la base/RLS, jamais à l’interface seule ;
- garde une seule vérité métier pour baux, échéances, paiements et reçus ;
- permet des traitements asynchrones fiables sans microservices ;
- reste exploitable à quelques centaines puis plusieurs milliers d’Organizations ;
- peut être enveloppé plus tard pour les stores sans réécrire le domaine.

## 2. Statuts de ce document

- **CONFIRMÉ** : décision enregistrée dans la source de vérité.
- **RETENU LOT 4** : détail d’architecture inclus dans le lot validé, sans constituer une décision métier supplémentaire.
- **DIFFÉRÉ** : choix d’implémentation explicitement reporté à la gate indiquée.

## 3. Architecture proposée

### 3.1 Vue logique

| Couche | Responsabilité | Règle d’isolation |
|---|---|---|
| Client web/PWA | Navigation, rendu FR/EN, formulaires, état local non autoritatif | Organization active visible ; aucune décision d’autorisation finale |
| Couche application serveur / BFF | Orchestration des commandes sensibles, validation d’entrée, transactions métier, génération de réponses adaptées au rôle | Session authentifiée, contexte Organization explicite et revérification des capacités |
| Supabase Auth | Identité globale, OTP/lien email, OTP téléphone portail selon fournisseur, sessions | Authentifie une identité ; n’accorde aucun droit métier seul |
| Postgres/Supabase | Source de vérité métier, contraintes, RLS, projections opérationnelles, outbox | `organization_id` sur toute donnée tenant-scoped et RLS par chemin d’autorisation |
| Supabase Storage | Logos, preuves, reçus et artefacts futurs privés | Chemin + métadonnée tenant-scoped + politiques Storage/RLS ; aucun bucket public |
| Worker asynchrone | Distribution d’événements, notifications, communications, retry | Traitement par `organization_id`, idempotence et secrets serveur seulement |
| Fournisseur de communication | Livraison Auth ou métier selon canal validé | Aucun accès direct aux données métier ; payload minimal et journal distinct |

### 3.2 Flux de commande sensible

1. Le client envoie l’intention avec la session et l’Organization active.
2. La couche serveur valide forme, état métier, identité, Membership/Tenant Portal Access et capacité.
3. La transaction écrit la vérité métier et le ou les Domain Events/outbox associés.
4. RLS et contraintes tenant empêchent toute relation cross-Organization.
5. La réponse confirme le résultat métier ; les notifications et communications sont traitées séparément.

Le navigateur peut lire directement certaines données à travers une session Supabase et des politiques RLS strictes. Les commandes financières, administratives, de sécurité ou multi-écritures passent par une frontière serveur explicite afin de garder une transaction et une vérification cohérentes.

## 4. Stack principale confirmée

| Élément | Choix principal | Pourquoi | Statut |
|---|---|---|---|
| Langage | TypeScript en mode strict | Une base cohérente pour UI, serveur, contrats et tests | **CONFIRMÉ — D-072** |
| Web | Next.js App Router + React | PWA mobile-first, rendu serveur/SPA selon écran, BFF intégré et écosystème maintenable | **CONFIRMÉ — D-072** |
| PWA | Manifest web, HTTPS et service worker limité aux besoins validés | Installation téléphone sans promettre un offline avancé | **CONFIRMÉ — D-072** |
| Stores futurs | Capacitor ajouté seulement si nécessaire après validation du web/PWA | Réutilise la même base applicative ; aucune seconde application | **CONFIRMÉ — D-072** |
| Backend | Supabase Postgres + Auth + Storage | Intégration à RLS et faible coût opérationnel | **CONFIRMÉ — D-073/D-074** |
| Serveur | Fonctions serveur Next.js pour les commandes sensibles/synchrones ; worker pour l’asynchrone | Évite d’exposer les secrets et garde le domaine dans le monolithe | **CONFIRMÉ — D-073** ; runtime du worker **DIFFÉRÉ** |
| Validation | Schémas TypeScript partagés, avec validation runtime côté serveur | Même contrat d’entrée sans faire confiance au client | **RETENU LOT 4** |
| i18n | Catalogues FR/EN typés, clés stables et rendu localisé hors Domain Events | Respecte D-003 et D-042 | **RETENU LOT 4** |
| Tests | Tests unitaires, intégration Postgres/RLS, composants, E2E navigateur et sécurité tenant | Critères D-016 et isolation systématique | **RETENU LOT 4** |

Les versions de packages seront choisies et verrouillées au démarrage de l’implémentation, après vérification des versions stables et guides officiels. Ce lot ne fixe aucun numéro de version.

### 4.1 Alternatives crédibles, résumées

| Alternative | Avantage | Pourquoi non recommandée en premier |
|---|---|---|
| Expo / React Native Web | Partage natif plus direct dès le départ | Ajoute des contraintes web/desktop et un runtime natif avant que les stores soient prioritaires |
| Vite SPA + API séparée | Frontend simple et découplé | Exige une couche serveur distincte plus tôt et augmente le nombre de surfaces à exploiter |
| Application native séparée | UX native maximale | Double la surface produit et contredit l’objectif web/PWA d’abord à faible coût |

La documentation officielle confirme que Next.js supporte les éléments PWA et que Capacitor peut être ajouté à une application web moderne. Les décisions D-072 à D-074 fixent le choix de Kjora ; les versions restent à sélectionner à l’implémentation.

## 5. Découpage du monolithe modulaire

### 5.1 Core

Les composants Core confirmés restent :

- Identity / Authentication ;
- Organizations ;
- Memberships ;
- Authorization / RBAC ;
- Country Configuration ;
- i18n ;
- Module Registry / Feature Flags ;
- Domain Event Core ;
- Notifications ;
- Communications ;
- Audit ;
- Common Settings.

Le Core ne dépend d’aucun module métier. Il expose des contrats stables, des abstractions d’identité/tenant, l’outbox et les services transversaux.

### 5.2 Modules métier actifs au MVP

- Properties ;
- Units ;
- Tenants ;
- Leases ;
- Rent / Dues / Schedules ;
- Payments & Receipts ;
- Documents limité aux artefacts contextuels validés, sans destination globale ;
- read model opérationnel du dashboard, distinct de Reporting avancé.

### 5.3 Modules retenus mais inactifs au MVP

- Expenses ;
- Maintenance ;
- Reporting avancé ;
- Conversations/chat ;
- E-Signature ;
- Payment Providers automatisés.

Ils ne reçoivent ni écran, ni table de production, ni traitement dans le premier MVP. Les frontières actuelles laissent seulement des points d’extension publics : commandes, événements, métadonnées d’artefact et feature flags.

### 5.4 Règles de dépendance

- Un module possède son modèle et ses invariants.
- Aucun module n’écrit directement dans les données internes d’un autre.
- Une dépendance synchrone utilise un contrat public étroit ; une réaction asynchrone utilise un Domain Event.
- Les consommateurs Core obtiennent les données minimales dans l’événement et ne lisent pas les tables métier privées.
- Aucune dépendance circulaire ; les événements ne servent pas à masquer une boucle synchrone.
- Le portail est une surface d’accès, pas une copie de modules métier.

## 6. Frontend et backend

### 6.1 Frontend

Le frontend suit l’architecture UX validée : cinq destinations internes et quatre portail. Il se structure par coque, domaine et flow, sans recopier les règles métier dans les composants.

Responsabilités autorisées :

- rendre les données déjà autorisées ;
- guider la saisie et afficher le résumé ;
- conserver un état local temporaire non autoritatif ;
- masquer les actions non pertinentes ;
- afficher refus, chargement et erreur réseau.

Responsabilités interdites :

- décider seul qu’un acteur a une capacité ;
- calculer la vérité financière finale ;
- choisir un `organization_id` pour contourner la session ;
- conserver un secret serveur ;
- transformer une réponse incertaine en succès.

### 6.2 Couche application serveur

Elle porte :

- commandes sensibles et multi-écritures ;
- résolution d’identité et de contexte ;
- vérification de Membership/capacité ou de Tenant Portal Access ;
- invariants financiers ;
- génération d’identifiants d’idempotence ;
- transaction métier + outbox ;
- création de liens de téléchargement temporaires ;
- appels aux fournisseurs via services serveur.

Elle ne devient pas une seconde base d’autorisation : la base applique aussi RLS et contraintes.

## 7. Usage proposé de Supabase

| Produit | Usage proposé | Non-usage MVP |
|---|---|---|
| Postgres | Vérité métier, contraintes, index tenant, RLS, projections, outbox | Aucun schéma partagé avec VERALUZ |
| Auth | Identité email/OTP/lien, téléphone OTP portail, sessions | Aucun rôle métier stocké dans des métadonnées utilisateur modifiables |
| Storage | Buckets privés et objets tenant-scoped | Aucun bucket public ou URL permanente |
| Edge Functions | Worker de communication/dispatch ou opérations privilégiées ciblées | Aucun éclatement de chaque module en fonction séparée |
| Realtime | Non requis au premier chemin critique | Pas d’abonnements globaux ou inter-tenant par défaut |
| Cron/Queue | Évaluation temporelle et retry si le mécanisme retenu est validé | Pas de plateforme distribuée prématurée |

La famille de projets Supabase Kjora est totalement séparée de VERALUZ. D-074 confirme des environnements sensibles isolés ; aucune création de projet ou configuration n’est effectuée dans ce lot.

## 8. Environnements

### 8.1 Topologie confirmée — D-074

- **LOCAL/DEV** : runtime local, tests/CI et données synthétiques ; aucun secret de production. Une base de test éphémère ou réinitialisable peut servir aux futurs tests RLS/E2E sans former un quatrième environnement sensible.
- **STAGING** : projet Supabase Kjora distinct, données fictives et configuration proche de production.
- **PRODUCTION** : projet Supabase Kjora dédié, accès restreints, sauvegardes et monitoring.

PRODUCTION ne partage jamais base, Auth, Storage, secrets ou `service_role` avec LOCAL/DEV, STAGING ou VERALUZ. Aucun secret n’est partagé entre environnements. Les previews web utilisent une configuration LOCAL/DEV ou STAGING contrôlée et ne pointent jamais vers PRODUCTION par défaut.

### 8.2 Hébergement

**CONFIRMÉ — D-074 :** Vercel est recommandé pour le frontend web. Les projets Supabase/environnements restent séparés selon la topologie confirmée. La région des données et les paramètres contractuels seront vérifiés avant tout déploiement futur.

## 9. Sécurité structurante

- RLS sur toute table tenant-scoped exposée, plus contraintes tenant sur les relations.
- Refus par défaut et capacités calculées depuis le Membership actif, pas depuis l’UI.
- Chemin portail distinct, lié à Organization + Tenant + Lease(s).
- `organization_id` direct et immuable sur les ressources tenant-scoped.
- Identifiants opaques utiles contre l’énumération, sans jamais remplacer RLS.
- Sessions/appareils révoqués refusés ; les opérations sensibles revérifient identité, contexte tenant et capacité.
- Registre applicatif de session/appareil et de contexte actif permettant au serveur et aux politiques d’autorisation de refuser un accès révoqué.
- Supabase Auth reste l’authentification principale et sa session peut persister.
- PIN interne de 6 chiffres utilisé seulement comme verrou rapide de Kjora sur un appareil déjà vérifié : il ne remplace ni ne crée une session Auth, n’est jamais stocké en clair, résiste à la force brute et n’est jamais un PIN locataire.
- Nouvel appareil/récupération : vérification forte ; action sensible : step-up possible. Keychain/Keystore et biométrie restent des possibilités Capacitor futures, hors MVP.
- Tokens d’invitation à durée limitée, usage contrôlé et stockage non réversible lorsque possible.
- Storage privé, téléchargement temporaire et journalisation minimale.
- `service_role`/clé secrète uniquement dans des workers ou serveurs privilégiés, jamais navigateur.
- Validation d’entrée, protection anti-double soumission et idempotence.
- Audit séparé des notifications et du journal d’accès portail.
- Aucune donnée d’une autre Organization dans messages, logs ou télémétrie utilisateur.

Les détails sont définis dans `RLS-AUTH-SECURITY-v0.1.md`.

## 10. Scalabilité sans surarchitecture

La même architecture couvre les paliers confirmés de 500, 2 000 puis 10 000+ Organizations. Ces paliers déclenchent des mesures et optimisations, pas un changement automatique de modèle ni une migration vers des microservices.

### 10.1 Dès le MVP

- indexer les chemins usuels par `organization_id` puis clé de filtre/date ;
- paginer listes, notifications, activité, audit et événements ;
- limiter les payloads et sélectionner seulement les colonnes nécessaires ;
- utiliser des contraintes qui empêchent les relations cross-tenant ;
- stocker les objets par préfixe tenant et catégorie ;
- traiter communications et projections lourdes hors transaction utilisateur ;
- mesurer latence, erreurs RLS, backlog outbox et échecs fournisseur ;
- archiver/purger selon politiques validées, dont journal portail 12 mois.

### 10.2 Quand la charge augmente

- optimiser requêtes et index à partir de mesures ;
- partitionner seulement les tables réellement volumineuses, probablement événements/audit/communications ;
- ajouter une file dédiée lorsque le débit outbox le justifie ;
- séparer un worker ou module seulement si ses contraintes d’échelle ou de disponibilité le démontrent.

Kubernetes, microservices, bus distribué externe, multi-région active-active et event sourcing complet ne sont pas proposés.

## 11. Stratégie de tests

- Unitaires : invariants de domaine, calcul des échéances, paiement partiel, capacités.
- Intégration : transactions, contraintes, projections et outbox.
- RLS : au moins Org A/Org B, non-membre, rôle insuffisant, portail A/B et session révoquée.
- Storage : lecture/écriture inter-tenant refusée et lien temporaire expiré.
- Contract tests : schéma/version des 10 événements et idempotence des consommateurs.
- E2E : flows mobile-first internes et portail, FR/EN, succès/refus/erreur réseau.
- Sécurité : ID guessing, invitation réutilisée, permissions retirées avant confirmation, double soumission.
- Performance : pagination et requêtes tenant-scoped sur volumes synthétiques représentant plusieurs milliers d’Organizations.

## 12. Décisions techniques confirmées

### Q-TECH-L4-01 — Stack client et trajectoire stores

**CONFIRMÉ — D-072.** Next.js + TypeScript + PWA mobile-first, Web/PWA d’abord. Capacitor peut être ajouté plus tard si les stores le justifient. Kjora conserve une seule base applicative et ne construit pas deux applications séparées.

### Q-TECH-L4-02 — Frontière serveur et asynchrone

**CONFIRMÉ — D-073.** PostgreSQL/Supabase RLS est la barrière fondamentale tenant. Les opérations ordinaires compatibles RLS peuvent employer la session utilisateur ; les opérations sensibles/orchestrées utilisent une frontière serveur. Les traitements asynchrones suivent outbox + worker, découplés de la transaction métier. Le runtime précis du worker est un choix d’implémentation non bloquant.

### Q-TECH-L4-03 — Environnements et hébergement

**CONFIRMÉ — D-074.** LOCAL/DEV, STAGING et PRODUCTION. PRODUCTION est isolé de STAGING/DEV et de VERALUZ pour base, Auth, Storage, secrets et `service_role`. Aucun secret inter-environnement. Vercel est recommandé pour le frontend ; les environnements Supabase sensibles sont séparés.

### Q-TECH-L4-04 — PIN interne et appareil autorisé

**CONFIRMÉ — D-075.** Supabase Auth email OTP/lien sécurisé porte l’identité et une session persistante. Le PIN déverrouille rapidement Kjora sur un appareil déjà vérifié ; il ne remplace jamais la session Auth, n’est jamais stocké en clair et est protégé contre la force brute. Nouvel appareil/récupération exigent une vérification forte ; un step-up est possible pour les actions sensibles. Keychain/Keystore et biométrie sont des trajectoires Capacitor futures, sans biométrie au MVP.

### Q-TECH-L4-05 — Fournisseur OTP téléphone portail

**CONFIRMÉ COMME DÉCISION DIFFÉRÉE — D-076.** Aucun fournisseur n’est choisi maintenant. Une abstraction `PhoneOtpProvider` porte le contrat téléphone → OTP sans couplage métier. Le choix réel doit être fait avant l’implémentation 6E. Email → OTP/lien sécurisé reste également supporté. Cette décision ne bloque ni 5A ni les lots métier propriétaires.

### Q-TECH-L4-06 — Contrats actifs concurrents

**CONFIRMÉ — D-077.** Les périodes de deux Leases d’une même Unit ne peuvent pas se chevaucher. Un bail courant et un bail futur commençant après la fin du précédent sont autorisés ; deux baux couvrant simultanément la même Unit sont refusés au MVP mono-titulaire.

## 13. Références techniques vérifiées

- [Next.js — guide officiel PWA](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Capacitor — documentation officielle](https://capacitorjs.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase — sécurisation des données](https://supabase.com/docs/guides/database/secure-data)
- [Supabase Storage — contrôle d’accès](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Edge Functions — authentification](https://supabase.com/docs/guides/functions/auth)

Ces références ont été consultées pour la faisabilité conceptuelle. Les versions et interfaces seront revérifiées avant toute implémentation.

## 14. Critères de sortie du Lot 4

- Les six décisions Q-TECH-L4 sont enregistrées sous D-072 à D-077 ; D-076 est différée jusqu’avant 6E sans bloquer 5A.
- Les cinq documents du lot restent cohérents entre eux et avec D-001 à D-077.
- Le modèle conceptuel différencie données globales et tenant-scoped.
- RLS, Storage privé, Auth, session/appareil, service_role et tests A/B sont spécifiés.
- Les 10 événements ont producteur, consommateurs et stratégie d’outbox.
- L’ordre d’implémentation obtient une application manipulable dès 5A et un premier tenant sécurisé dès 5C.
- Aucune installation, migration, configuration ou implémentation n’est réalisée.

Le Lot 4 est **VALIDÉ**. Le Lot 5A reste **NON COMMENCÉ** et exige une autorisation explicite distincte.

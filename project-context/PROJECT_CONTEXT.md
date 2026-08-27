# Kjora — Contexte officiel du projet

> Statut : source de vérité de travail  
> Nom commercial : **Kjora** (provisoire)  
> Marché initial : Cameroun  
> Dernière mise à jour : 2026-08-27 — Visual Direction v2A implémentée sur les trois écrans pilotes ; validation visuelle en attente

## 1. Vision

Kjora est un SaaS mobile-first de gestion locative destiné en priorité aux personnes et structures qui administrent des biens immobiliers, notamment à distance ou avec délégation à des personnes sur place.

Le Cameroun est le premier pays activé. L’architecture permet une extension progressive vers d’autres pays africains sans développer leurs spécificités avant validation.

La promesse produit est de permettre à l’`Organization Owner` de savoir simplement **ce que l’organisation gère, ce qui est dû, ce qui a été encaissé, ce qui est en retard, qui a effectué une action et ce qui nécessite son attention**.

`Organization Owner` désigne la personne qui contrôle le compte Kjora de l’organisation. Ce rôle ne prouve jamais que cette personne est juridiquement l’unique propriétaire des immeubles enregistrés.

## 2. Principes non négociables

- Mobile-first.
- Web/PWA d’abord, avec possibilité de publication ultérieure sur Google Play et App Store à partir d’une base de code commune.
- Multi-utilisateur et multi-tenant.
- Chaque Organization est un tenant autonome.
- Un User peut avoir plusieurs Memberships et administrer plusieurs Organizations indépendantes.
- Chaque action s’exécute dans une seule organisation active explicitement sélectionnée.
- Aucune agrégation, aucun tableau consolidé et aucun héritage de permission entre organisations au MVP.
- Toute donnée métier, tout document, fichier, événement, notification, activité, audit et paramètre organisationnel appartient à une organisation.
- Isolation des organisations imposée côté serveur/base, et dans une phase technique future par RLS, jamais uniquement dans l’interface.
- Tester systématiquement l’isolation entre au moins deux organisations, le non-membre et le rôle insuffisant.
- Le MVP utilise un monolithe modulaire Core + modules indépendants ; aucun microservice prématuré.
- Le modèle multi-tenant doit pouvoir évoluer vers 500, 2 000 puis 10 000+ organisations sans changer son fondement, sans optimisation prématurée.
- Aucune règle pays variable inscrite en dur dans la logique métier principale.
- Aucun secret réel dans les prompts, documents ou dépôts.
- Aucune clé `service_role` dans le navigateur.
- Travail par petits lots vérifiables avec critères d’acceptation avant développement.
- Toute décision métier importante nécessite validation de Blaise.
- Une règle validée ne peut pas être modifiée silencieusement ; les décisions remplacées restent historisées.
- Le locataire utilise un `Tenant Portal Access` distinct des Memberships internes et n’est jamais un rôle RBAC interne.
- Il existe une seule source de vérité métier pour les baux, échéances, paiements et reçus ; le portail n’en possède aucune copie indépendante.

## 3. Cible, pays, langues et devise

### Confirmé

- Cible principale : propriétaires immobiliers, administrateurs de biens, structures familiales ou sociétés gérant leur patrimoine.
- Marché initial : Cameroun, y compris gestion à distance et diaspora.
- Langues : français et anglais, avec changement simple.
- Les textes utilisateur sont internationalisables et ne sont pas inscrits en dur dans les composants métier.
- Devise initiale : XAF.
- Moyens initiaux : espèces, MTN Mobile Money, Orange Money et virement bancaire.

## 4. Architecture produit validée — Lot 1

### Architecture

Kjora suit une architecture **Core + modules indépendants** dans un **monolithe modulaire au MVP**. Le Core ne dépend d’aucun module métier. Une défaillance ou désactivation de module ne rend pas l’ensemble de l’application inutilisable.

Chaque bloc possède ses données conceptuelles. Les autres blocs utilisent uniquement des contrats publics ou des événements ; aucune lecture ou modification directe des détails internes d’un autre module et aucune dépendance circulaire.

### Core retenu

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

Organizations couvre conceptuellement des responsabilités distinctes :

- `Organization` : tenant et identité fonctionnelle du compte ;
- `Organization Profile` : nom commercial, nom légal, téléphone, email, adresse et informations publiques ;
- `Organization Branding` : logo et éléments utilisés par les documents et communications ;
- `Organization Settings` : pays, devise, langue, fuseau, informations de reçus/contrats, coordonnées ou informations de paiement et préférences organisationnelles.

Cette séparation est conceptuelle ; elle ne crée pas de microservices.

### Modules métier retenus

- Properties ;
- Units ;
- Tenants ;
- Leases ;
- Rent / Dues / Schedules ;
- Payments & Receipts ;
- Expenses ;
- Maintenance ;
- Documents ;
- Reporting.

Le dashboard simple du MVP utilise un **read model opérationnel** pour attendu, encaissé, restant, en retard et activité récente. Il ne dépend pas de Reporting avancé. Reporting avancé reste hors MVP.

Les frontières, contrats et dépendances validés sont détaillés dans les cinq documents du Lot 1 sous `docs/architecture` et `docs/product`.

## 5. Organisations, Memberships et RBAC

### Confirmé

- Une identité `User` est globale ; les droits métier sont évalués dans une Organization.
- Un User peut avoir plusieurs Memberships dans plusieurs Organizations.
- Une seule organisation est active pour une action donnée.
- Les données et permissions ne sont jamais fusionnées ou héritées entre organisations.
- Un utilisateur peut administrer plusieurs Organizations indépendantes.
- `Organization Owner` contrôle le compte Kjora du tenant sans présomption de propriété juridique des immeubles.
- Le modèle reste compatible avec biens familiaux, sociétés, indivisions, successions, mandataires et copropriétés.
- Un utilisateur invité ne voit que les organisations dans lesquelles il possède un Membership actif et autorisé.
- Les permissions sont appliquées côté serveur/base en plus de l’interface.
- Refus par défaut.
- Un rôle principal par Membership au MVP.
- Aucun rôle personnalisé au MVP.
- Aucune correction financière silencieuse.
- Gestion des membres et paramètres sensibles réservée à `Organization Owner`.

### Rôles fixes du MVP

- propriétaire / `Organization Owner` ;
- gestionnaire ;
- encaisseur ;
- gardien ;
- comptable ;
- consultation.

Les rôles sont reliés à des capacités explicites, par exemple `property.view`, `property.manage`, `payment.record`, `payment.view`, `receipt.share`, `member.manage` ou `audit.view`. La matrice fonctionnelle du Lot 2 est validée par D-040 :

- `Organization Owner` administre le tenant, ses membres et paramètres sensibles, gère la boucle locative, enregistre les paiements et consulte l’audit ;
- le gestionnaire gère la boucle locative quotidienne, enregistre les paiements et demande une correction, sans gérer membres, paramètres sensibles ou audit ;
- l’encaisseur enregistre les paiements et accède seulement au contexte nécessaire, sans gestion administrative ou contractuelle ;
- le gardien voit un contexte local minimal, sans finances ni dossier personnel complet du locataire ;
- le comptable consulte les données financières et peut demander une correction, sans enregistrer ou modifier directement un paiement ;
- le rôle consultation lit uniquement le périmètre explicitement accordé et n’obtient aucun contact personnel par implication.

Seuls `Organization Owner` et gestionnaire peuvent administrer un `Tenant Portal Access`. Ce droit externe ne transforme jamais le locataire en Membership ou en septième rôle.

### Mise en œuvre technique du Lot 5C

- `role_capabilities` est le registre technique unique des six rôles fixes et de leurs capabilities ; les écrans, routes serveur et fonctions base consomment ces mêmes identifiants au lieu de disperser des tests de chaînes de rôles.
- Une Membership relie un User global à une seule Organization et porte un rôle et un état. Les autorisations sont recalculées depuis une Membership `active` à chaque lecture/action serveur ; une Membership révoquée perd donc immédiatement ses droits même si la session Auth globale existe encore.
- Les invitations internes sont tenant-scoped, expirent après 7 jours et ne stockent qu’un hash SHA-256 du jeton aléatoire. Elles sont à usage unique ; relancer invalide l’invitation active précédente et l’acceptation exige l’identité email vérifiée correspondante.
- Les invitations utilisent la frontière serveur et l’email transactionnel séparé de l’email Auth. La clé fournisseur reste uniquement côté serveur ; aucun jeton d’invitation, secret ou `service_role` n’est exposé au navigateur ou conservé en clair en base.
- Les changements de rôle, révocations et transferts Owner passent par des opérations atomiques tenant-scoped et auditées. Une invitation ou un changement de rôle générique ne peut pas créer un Owner ; l’auto-révocation et la révocation directe d’un Owner sont refusées, et le transfert dédié promeut un User vérifié avant de rétrograder l’Owner courant.
- L’audit administratif minimal est distinct de l’activité métier et visible uniquement par Owner. Les actions couvertes sont invitation, relance, révocation d’invitation, acceptation, changement de rôle, révocation de membre et transfert Owner.
- L’Organization active pilote le contexte d’affichage et les données de démonstration, mais la base revérifie toujours la Membership et la capability. Connaître un UUID d’une autre Organization, Membership, invitation ou audit ne confère aucun accès.

## 6. Configuration par pays

L’architecture prévoit des configurations nationales pour :

- devise ;
- langue(s) ;
- fuseau horaire ;
- format téléphonique ;
- méthodes de paiement ;
- fournisseurs Mobile Money ;
- modèles de reçus et contrats ;
- règles fiscales et comptables ;
- fonctionnalités activées ;
- exigences de protection des données.

Aucune règle camerounaise susceptible de varier par pays n’est inscrite en dur dans la logique métier principale.

### Cameroun — configuration initiale confirmée

- français / anglais ;
- XAF ;
- espèces ;
- MTN Mobile Money ;
- Orange Money ;
- virement bancaire.
- `RENT_DUE_SOON` : 5 jours avant la date d’échéance ;
- `RENT_OVERDUE` : à partir du lendemain de la date d’échéance ;
- aucune période de grâce personnalisée par Organization au MVP ; le modèle reste compatible avec un override futur.

## 7. Authentification validée

### Utilisateurs internes

- Email avec OTP et lien sécurisé pour établir l’identité ; un mécanisme principal est présenté selon le contexte et l’autre sert d’alternative/récupération.
- OTP et lien expirent, sont à usage contrôlé et soumis au throttling.
- Même vérification forte pour un nouvel appareil et la récupération du compte.
- Supabase Auth porte l’identité principale et sa session peut persister.
- Le PIN à 6 chiffres verrouille ou déverrouille rapidement Kjora uniquement sur un appareil déjà autorisé ; il ne crée ni ne remplace la session Auth.
- Le PIN seul n’est jamais une authentification principale ni une preuve d’identité forte ; il n’est jamais stocké en clair et doit être protégé par limitation des tentatives, throttling et verrouillage.
- Au MVP, le PIN interne est facultatif, exactement composé de 6 chiffres et reste un `quick lock` purement local : une session Supabase valide doit déjà exister et le PIN ne crée, ne prolonge ni ne remplace cette session.
- Le PIN n’est jamais envoyé à Supabase, au serveur, aux logs ou aux outils de suivi. Le navigateur conserve seulement dans IndexedDB un sel cryptographiquement aléatoire, un verifier PBKDF2-SHA-256 et les paramètres nécessaires ; l’état de déverrouillage ne contient aucun PIN.
- Si le PIN est configuré, Kjora se verrouille après 5 minutes d’inactivité ou à la demande. Cinq erreurs suppriment le PIN local et forcent une authentification forte email OTP/lien sécurisé. La déconnexion Supabase supprime le PIN et l’état de déverrouillage locaux au MVP.
- Nouvel appareil et récupération exigent une vérification forte ; une action sensible peut demander un step-up authentication.
- Biométrie hors MVP.
- Une invitation de membre interne expire après 7 jours, peut être relancée et une nouvelle invitation invalide l’ancienne invitation active correspondante.
- Aucune permission tenant n’existe avant acceptation d’une invitation et vérification d’un Membership valide.

L’authentification établit l’identité ; elle n’accorde aucun droit métier sans Membership et capacité valides dans l’organisation active.

### Portail locataire

- Le portail accepte un téléphone ou un email vérifiable.
- Téléphone : OTP ; email : OTP ou lien sécurisé.
- Invitation portail : 7 jours ; OTP : 10 minutes ; lien sécurisé : 15 minutes.
- Jetons et liens sont invalidés après utilisation lorsque applicable.
- Session persistante : 30 jours maximum.
- Nouvelle vérification forte pour nouvel appareil, session expirée, changement sensible ou signal de risque.
- Aucun PIN locataire au MVP.
- Un changement de téléphone/email vérifie l’identité, l’ancien canal s’il est disponible, puis le nouveau canal ; sinon récupération sécurisée.
- Aucun accès à une donnée personnelle, un bail, un paiement ou un reçu sans authentification et `Tenant Portal Access` valide.

L’OTP téléphone est limité à l’authentification portail. Il n’autorise pas des SMS métier généraux ou marketing.

Le fournisseur OTP téléphone est une décision technique différée. Le portail dépend d’une abstraction `PhoneOtpProvider`, jamais d’un fournisseur concret dans le métier ; le choix doit être fait avant l’implémentation du Lot 6E et ne bloque pas les lots propriétaires.

## 8. Paiements et reçus

### Frontière validée

Payments et Receipts sont deux capacités séparées dans le même module au MVP.

- Payments possède le paiement, son état et ses allocations.
- Le paiement est la source de vérité métier.
- Receipts possède le reçu dérivé.
- Le reçu ne modifie jamais le paiement.
- Documents peut fournir un artefact tenant-scoped sans devenir propriétaire du reçu métier.

### Sémantique validée

- `PAYMENT_RECORDED` : paiement saisi ou enregistré, pas nécessairement définitivement encaissé.
- `PAYMENT_COMPLETED` : paiement reconnu comme effectivement encaissé ou confirmé.
- Seul `PAYMENT_COMPLETED` autorise la génération du reçu final.
- Une opération manuelle immédiatement confirmée peut produire `PAYMENT_RECORDED` puis `PAYMENT_COMPLETED` successivement dans la même opération métier.

Les paiements partiels appartiennent au MVP jusqu’au restant dû. Un montant supérieur au restant est bloqué avant confirmation. Crédit automatique, remboursement, transfert vers une autre échéance et workflow financier avancé sont hors MVP. Les corrections restent explicites, autorisées, motivées et auditées ; aucune modification ou suppression silencieuse après `PAYMENT_COMPLETED`.

`Organization Owner`, gestionnaire et encaisseur peuvent enregistrer un paiement après revérification tenant-scoped à la confirmation. Owner, gestionnaire, encaisseur et comptable peuvent demander une correction sans modifier directement le paiement source.

## 9. Mobile Money validé

Au MVP, espèces, MTN Mobile Money, Orange Money et virement bancaire sont enregistrés manuellement.

Pour Mobile Money, prévoir conceptuellement :

- provider / moyen ;
- référence facultative ;
- preuve facultative ;
- date ;
- montant ;
- acteur ayant enregistré ;
- confirmation.

Aucune intégration automatique MTN ou Orange au MVP.

L’évolution événementielle prévue est :

`transaction reçue → PAYMENT_RECORDED → confirmation fournisseur → PAYMENT_COMPLETED → RECEIPT_GENERATED`.

## 10. Événements, notifications, communications et audit

### Confirmé

- Les notifications et emails sont orchestrés autour d’événements métier.
- Un événement métier est tenant-scoped et décrit un fait passé.
- Le catalogue v0.1 contient : `PROPERTY_CREATED`, `TENANT_CREATED`, `LEASE_ACTIVATED`, `RENT_DUE_CREATED`, `RENT_DUE_SOON`, `RENT_OVERDUE`, `PAYMENT_RECORDED`, `PAYMENT_COMPLETED`, `RECEIPT_GENERATED`, `DOCUMENT_SHARED`.
- Les notifications in-app utiles, l’activité et l’audit minimal font partie du MVP.
- Les événements, notifications, activité et audit appartiennent indépendamment à l’organisation concernée.
- Les Domain Events restent non localisés ; une communication utilise la préférence du destinataire, puis la langue de l’Organization.
- L’audit métier MVP est visible uniquement par `Organization Owner` et reste distinct du journal d’accès portail.

### Propositions conservées pour la phase technique

- système événementiel dans le Core ;
- modules sans contact direct avec un fournisseur externe de communication ;
- échec email non bloquant pour une opération métier réussie ;
- retry indépendant et idempotent ;
- notifications, fil d’activité, historique des communications et audit séparés.

Les canaux SMS/WhatsApp ne sont pas confirmés.

## 11. Tenant autonome, profil et branding

Chaque Organization possède indépendamment :

- Memberships, utilisateurs autorisés et rôles ;
- biens, unités, locataires, contrats et échéances ;
- paiements et reçus ;
- documents et fichiers ;
- événements, notifications et communications ;
- activité et audit ;
- paramètres, profil et branding organisationnels.

Le profil/branding peut contenir :

- nom commercial ;
- logo ;
- nom légal ;
- téléphone ;
- email ;
- adresse ;
- pays ;
- devise ;
- langue ;
- fuseau horaire ;
- informations affichées sur les reçus et contrats ;
- coordonnées ou informations de paiement ;
- préférences organisationnelles.

Les documents et communications utilisent, lorsque pertinent, le branding de leur propre organisation. Un reçu d’Org A utilise les informations d’Org A ; un reçu d’Org B utilise celles d’Org B. Les fichiers et leur stockage restent tenant-scoped.

## 12. Portail locataire minimal validé

### Séparation des accès

`Internal Organization Membership` et `Tenant Portal Access` sont deux mécanismes distincts :

- le Membership porte l’un des six rôles internes et des capacités de gestion ;
- le `Tenant Portal Access` relie une identité locataire à un Tenant, une Organization, un ou plusieurs Leases autorisés et leurs ressources lisibles ;
- un contact locataire ne crée jamais automatiquement un accès ;
- seuls `Organization Owner` et gestionnaire peuvent inviter, relancer ou révoquer cet accès.

### Source unique de vérité

Le portail ne possède aucune copie métier indépendante. Lease, Rent/Dues, Payments et Receipts sont les mêmes vérités métier que celles consultées par l’Organization. Un montant affiché au propriétaire et au locataire provient de la même donnée autorisée ; seuls le contexte, les permissions et la présentation diffèrent.

### Expérience MVP

Le portail minimal inclut : invitation, activation/authentification, accueil, résumé du bail, échéances, attendu, payé, restant, retard, historique des paiements en lecture, reçus et notifications essentielles.

- Une identité ayant plusieurs baux dans la même Organization voit un accueil consolidé limité à cette Organization et sélectionne le bail/logement.
- Une identité ayant des accès dans plusieurs Organizations sélectionne explicitement l’accès ; aucune agrégation inter-Organization.
- Org A ne sait jamais que la même identité possède un accès chez Org B.
- Le locataire peut consulter et télécharger ses reçus ; aucun lien public ni partage public côté serveur au MVP.
- À la fin du bail, l’accès passe en historique lecture seule ; les anciens reçus restent visibles tant qu’ils existent selon la politique de rétention, sans copie portail.
- Notifications portail : échéance à venir, retard, paiement confirmé et reçu disponible.
- Langue : préférence du locataire, sinon langue de l’Organization.

### Journal d’accès et visibilité interne

Le journal d’accès portail est conservé 12 mois et trace, lorsque pertinent : invitation envoyée/ouverte/acceptée, OTP demandé/réussi/échoué, connexion réussie/échouée, nouvel appareil, révocation et expiration de session.

Owner et gestionnaire voient uniquement l’état opérationnel : non activé, invitation envoyée/acceptée, accès actif/révoqué, dernière connexion synthétique et état simple « reçu consulté ». Les détails techniques de sécurité et l’historique détaillé des consultations ne sont pas exposés.

### Isolation

- Un locataire de Org A ne peut lire aucune ressource d’un autre locataire de Org A sans liaison explicite autorisée.
- Aucun accès Org A ne révèle une ressource Org B.
- Une identité multi-Organization ne fusionne ni données, notifications, reçus, sessions fonctionnelles ni historique affiché.

## 13. MVP fonctionnel validé

Boucle :

`Bien → Unité → Locataire → Contrat → Échéance / loyer attendu → Paiement → Reçu → Visibilité propriétaire`.

### MVP IN confirmé

- paiements manuels ;
- paiements partiels avec règles minimales ;
- reçus ;
- délégation minimale ;
- notifications in-app utiles ;
- activité ;
- audit ;
- dashboard propriétaire simple par read model opérationnel ;
- français / anglais ;
- Cameroun ;
- XAF.
- portail locataire minimal défini au §12 ;
- onboarding Organization minimal : nom, pays configuré, langue et fuseau ;
- modèle uniforme Property → Unit → Lease avec Unit explicite ;
- locataire : nom et au moins téléphone ou email ;
- périodicités mensuelle, trimestrielle, semestrielle et annuelle, date de fin facultative et clôture explicite ;
- dashboard sur le mois courant par défaut avec navigation simple ;
- consultation, téléchargement et email contrôlé des reçus internes ; aucun reçu public.

### MVP OUT confirmé par les décisions du Lot 1

- intégration automatique MTN Mobile Money / Orange Money ;
- Reporting avancé ;
- biométrie.
- surpaiement, crédit automatique, remboursement, transfert et workflow financier avancé ;
- périodicité libre ;
- colocation/cotitulaires ;
- propriété juridique/copropriété ;
- portail : chat, maintenance, paiement en ligne, signature électronique et documents avancés ;
- partage public de reçu côté serveur et notifications configurables avancées.

Les autres fonctionnalités proposées hors MVP dans le Lot 1 restent à prioriser ultérieurement et ne sont pas automatiquement autorisées.

## 14. Supabase et stockage futurs

### Confirmé

- Utiliser le même compte Supabase que le propriétaire du projet.
- Créer ultérieurement un projet Supabase totalement distinct de VERALUZ.
- Aucun partage avec VERALUZ de tables, utilisateurs Auth, buckets, clés service, Edge Functions ou secrets.
- Chaque donnée métier et chaque fichier sont rattachés à une organisation.
- RLS obligatoire pour l’isolation future.
- `service_role` exclusivement côté serveur.
- Le stockage des fichiers est tenant-scoped.

Aucun projet réel, schéma SQL ou secret n’est créé à ce stade.

## 15. Resend et emails futurs

Même compte Resend possible que les autres projets, avec séparation stricte pour Kjora :

1. emails Auth : confirmation, invitation, changement d’adresse, réinitialisation ;
2. emails métier : reçus, rappels de loyers, impayés, rapports et communications transactionnelles validées.

Prévoir clés serveur séparées, domaines et journaux séparés, et aucun domaine définitif avant validation du nom commercial. Les communications utilisent le profil et le branding de l’organisation concernée.

## 16. Design et responsabilités des agents

### Confirmé

- Claude Design : maquettes, système visuel, prototypes.
- GPT Image : exploration visuelle et assets/concepts validés.
- ChatGPT : cadrage, architecture, documentation, analyse, coordination et spécification.
- Codex / Claude Code : développement selon lots validés et critères d’acceptation.
- Aucun agent n’est la mémoire unique du projet.
- Le contexte officiel est relu avant tout travail important.

### Direction visuelle officielle

- Direction : **Horizon & héritage**.
- Style : premium, moderne, épuré, rassurant.
- Touche africaine subtile ; jamais folklorique.
- Aucun gimmick visuel « IA ».
- Thèmes clair et sombre obligatoires.
- Structure : Ink/Navy pour la hiérarchie, Gold/Amber pour l’accent premium et Horizon Blue pour les informations.
- Sémantique : vert réservé aux états financiers positifs ; rouge réservé aux états négatifs et aux actions destructives.
- Surfaces : fond clair légèrement bleuté, cartes ivoire/blanc chaud ; fond sombre bleu-noir et surfaces bleu ardoise.
- UI : Inter ; titres et montants renforcés avec Inter Tight. Le serif reste réservé au wordmark Kjora.
- Référence active : `docs/design/KJORA-UI-SYSTEM-v2.md` et décision D-091. Le système v1 est conservé comme historique.
- v2A couvre seulement les tokens globaux, la navigation partagée si nécessaire et les écrans pilotes Dashboard, détail Locataire et détail Location. v2B et 6C1 restent non commencés.

## 17. Architecture UX validée — Lot 3

### Espace interne

La navigation interne centrale des six rôles utilise les destinations suivantes, affichées selon les permissions :

- Accueil ;
- Biens ;
- Locataires ;
- Locations ;
- Paiements ;
- Activité.

Équipe, profil, paramètres Organization, changement d’Organization et autres fonctions secondaires restent dans un espace secondaire adapté. L’Organization active est clairement identifiable sur toute vue tenant-scoped. Le changement de contexte remplace entièrement les données affichées et recalcule les permissions.

Units, Rent/Dues, Receipts et `Tenant Portal Access` restent atteints contextuellement depuis les destinations utiles. Les Leases disposent aussi d’une entrée centrale `Locations`, sans supprimer les liens contextuels depuis Tenant, Property et Unit.

### Portail locataire

La navigation mobile principale du `Tenant Portal` utilise :

- Accueil ;
- Loyers ;
- Reçus ;
- Compte.

Les notifications restent accessibles par une icône ou entrée légère dédiée et ne constituent pas un cinquième onglet. L’historique des paiements est accessible contextuellement depuis Accueil, Loyers ou Reçus selon le flow. Cette navigation reste exclusivement liée au `Tenant Portal Access` et ne crée aucun Membership interne.

### Fichiers et Documents

Le MVP ne possède aucune destination globale `Documents` ni bibliothèque documentaire parallèle :

- le reçu reste lié au paiement, à l’échéance et au locataire autorisé ;
- la preuve de paiement reste liée au paiement ;
- le logo reste dans les paramètres Organization ;
- le bail ou document essentiel reste dans le contexte du bail lorsque nécessaire.

Aucune donnée n’est dupliquée pour produire une vue documentaire. Un futur module Documents pourra fournir une vue transversale des mêmes ressources et artefacts tenant-scoped, sans devenir une nouvelle source de vérité.

### Mobile-first et desktop

Les 50 écrans fonctionnels du Lot 2 sont regroupés en flows courts orientés tâche. Les opérations sensibles gardent une séquence saisie → résumé → confirmation. Le desktop reprend la même architecture avec un rail et, lorsque pertinent, du maître-détail, sans capacité supplémentaire.

## 18. Architecture technique validée — Lot 4

### Stack et structure applicative

- Next.js + TypeScript + PWA mobile-first depuis une seule base applicative.
- Web/PWA d’abord ; Capacitor peut être ajouté plus tard pour les stores sans créer une seconde application.
- Monolithe modulaire : Core et modules gardent des contrats explicites ; aucune microarchitecture distribuée prématurée.
- Supabase fournit PostgreSQL, Auth et Storage dans un projet entièrement séparé de VERALUZ.

### Frontières et isolation

- PostgreSQL/Supabase RLS est la barrière fondamentale sur toute donnée tenant-scoped ; l’UI n’est jamais la seule défense.
- Toute requête tenant est bornée par l’Organization autorisée. L’Organization active pilote le contexte d’affichage, mais ne suffit jamais comme preuve d’autorisation.
- `Internal Organization Membership` et `Tenant Portal Access` suivent des chemins RLS distincts. Tenant A ne lit jamais Tenant B ; Org A ne lit jamais Org B, même pour une identité commune.
- Les opérations ordinaires compatibles RLS peuvent utiliser la session utilisateur. Les opérations sensibles ou orchestrées passent par une frontière serveur appropriée.
- Le navigateur ne reçoit jamais `service_role`, secret fournisseur ou URL privée permanente. Les objets Storage sont privés, tenant-scoped et délivrés après autorisation.

### Transactions, événements et communications

- La transaction métier persiste sa vérité et son outbox ; un worker traite ensuite les effets asynchrones.
- Les communications ne conditionnent jamais le succès d’un paiement, reçu, bail ou autre fait métier.
- Idempotence, retry, déduplication et tests d’isolation Org A/Org B sont obligatoires. Le runtime exact du worker est choisi à l’implémentation sans changer l’architecture.

### Environnements

- Trois niveaux : LOCAL/DEV, STAGING, PRODUCTION.
- PRODUCTION ne partage jamais base, Auth, Storage, secrets ou `service_role` avec STAGING/DEV ni VERALUZ ; aucun secret n’est partagé entre environnements.
- Vercel est recommandé pour le frontend web ; les environnements Supabase sensibles utilisent des projets isolés conformément à D-074.

### Invariant Lease

Une Unit ne peut avoir deux Leases dont les périodes se chevauchent. Un bail futur peut commencer après la fin du précédent ; deux baux simultanés sur la même Unit sont refusés au MVP mono-titulaire.

### Chaîne métier et préparation financière 6B

La chaîne officielle est `Organization → Property → Unit → Tenant → Lease → Due/Charge → Payment → PaymentAllocation → Receipt → Ledger → Owner visibility`.

Le Lot 6B persiste Tenant et Lease réels. Un Lease relie explicitement Organization, Tenant, Property et Unit ; ses états sont `draft`, `active` et `ended`. L’occupation est dérivée exclusivement des Leases actives et n’est jamais stockée comme booléen. Les montants de loyer hors charges, charges récurrentes, dépôt et prépaiement restent distincts. Le total périodique et les proratas calendaires sont dérivés ; une correction manuelle exige une justification.

Le patch 6B.1 ajoute un loyer mensuel de référence facultatif sur l’Unit. La maison le porte sur « Maison entière » et Property n’en devient jamais la source contractuelle. Le Lease reçoit cette valeur seulement comme préremplissage modifiable. Les périodes complètes couvertes et le reliquat du prépaiement sont des projections informatives depuis le montant périodique ; ils ne constituent ni Payment, ni allocation, ni crédit Ledger.

Pour le Cameroun MVP, le jour limite de paiement reste dans 1–28, J-5 est la valeur d’avis recommandée parmi J-1/2/3/4/5/7/10 et le rappel de retard est global tous les 10 jours. Le prorata calendaire mensuel inclut loyer et charges et expose sa formule. La fin d’un Lease actif passe par une confirmation dédiée avec date effective et motif facultatif.

Le dossier Tenant réserve une hiérarchie forte à `Solde actuel`, `Montant dû`, `Crédit disponible` et `Prochaine échéance`, mais affiche un état indisponible tant que 6C n’existe pas. Après 6C, l’espace interne et le portail qualifient toujours la valeur en dette, crédit ou à jour et donnent accès au détail, sans nombre signé ambigu.

La suite est découpée en `6C1 — Dues + Charges + Ledger`, `6C2 — Payments + Allocation + Tenant credit`, puis `6C3 — Documents + Notifications + Receipts + Statements`. Les changements futurs de loyer et charges y seront effectifs-datés, sans réécriture historique. 6B n’implémente aucun de ces sous-lots.

## 19. Inspiration et différenciation

Patterns retenus : organisation par domaines métier, suivi payé/partiel/en retard, reçus et rappels, historique de communications, préférences de notifications, dashboard orienté actions et suivi financier lisible.

Différenciation Kjora : simplicité, mobile-first, délégation locale, visibilité à distance, traçabilité et adaptation progressive aux marchés africains.

## 20. Nom

**Kjora** reste le nom de travail préféré mais provisoire. Ne pas figer le domaine ou le nom dans les intégrations ; maintenir le branding produit configurable jusqu’à validation commerciale. Le branding produit Kjora reste distinct du branding propre à chaque Organization.

## 21. Méthode de mise à jour

À chaque idée ou règle :

1. classifier en `CONFIRMÉ`, `HYPOTHÈSE`, `PROPOSITION` ou `REMPLACÉ` ;
2. si Blaise confirme, créer une entrée dans `DECISIONS.md` ;
3. mettre à jour ce contexte si la vision ou l’architecture change ;
4. conserver l’ancienne décision dans l’historique si elle est remplacée ;
5. ne commencer aucun lot sans critères d’acceptation et autorisation explicite.

## 22. État et prochaine étape

**Lot 1 — Architecture fonctionnelle v0.1 : VALIDÉ.**

**Lot 2 — Parcours et périmètre MVP : VALIDÉ.**

**Lot 3 — UX & architecture d’interface v0.1 : VALIDÉ.**

**Lot 4 — Architecture technique & sécurité v0.1 : VALIDÉ.**

**Lot 5A — Bootstrap application, navigation et design tokens : TERMINÉ ET TESTÉ — À VALIDER PAR BLAISE.**

**Lot 5B — Auth + Organization : TERMINÉ / TESTÉ / VALIDÉ.**

**Sous-lot PIN interne 6 chiffres : TERMINÉ / TESTÉ / VALIDÉ.**

**Lot 5C — Membership/RBAC + isolation : TERMINÉ / TESTÉ / VALIDÉ.** Blaise a confirmé le parcours fonctionnel réel Équipe/invitation et l’email transactionnel sur le déploiement Vercel ; le gate du Lot 6A est satisfait.

**Lot 6A — Property + Unit backend réel : TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE.** Les écrans Biens/Unités sont reliés à Supabase et bornés à l’Organization active ; maison → Unit « Maison entière », immeuble multi-unités, archivage non destructif, RBAC/RLS et `PROPERTY_CREATED` sont implémentés. Le commit `3746ef2` est sur `origin/main` et l’alias Vercel Production sert la nouvelle API. La photo reste un placeholder et Storage est différé.

**Lot 6B — Tenant + Lease backend réel : TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE.** Les écrans Locataires et Locations utilisent Supabase réel avec RLS, RBAC, contacts filtrés, occupation dérivée, exclusion des périodes effectives incompatibles — actives ou terminées — et préparation financière sans génération 6C. Les commits `42f9691` et `f4dcc72` portent l’application et le durcissement d’historique ; l’alias Vercel Production sert la nouvelle API. Le Lot 6A conserve séparément sa validation fonctionnelle en attente.

**Lot 6B.1 — PATCH UX / PRÉPARATION FINANCIÈRE : TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE.** D-086 à D-090 fixent le loyer de référence Unit, le prépaiement calculé, les règles calendaires, la future visibilité explicable du solde et l’autorisation Production, sans démarrer 6C1.

**Visual Direction v2A — DESIGN SYSTEM + 3 ÉCRANS PILOTES : IMPLÉMENTÉE / TESTÉE — VALIDATION VISUELLE BLAISE EN ATTENTE.** D-091 fixe la nouvelle direction et limite sa portée au Dashboard, au détail Locataire, au détail Location, aux tokens globaux et aux adaptations de navigation partagée nécessaires. Les indicateurs financiers indisponibles sont affichés honnêtement ; v2B et 6C1 restent non commencés.

**Lot 6C1 — Dues + Charges + Ledger : NON COMMENCÉ.** Son démarrage exige une autorisation distincte après validation fonctionnelle du Lot 6B.

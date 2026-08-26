# Kjora — Carte Core / modules v0.1

> Statut : **VALIDÉ PAR BLAISE — Lot 1**  
> Portée : responsabilités, données conceptuelles, contrats, événements et dépendances  
> Hors portée : code, schéma de données, infrastructure et choix définitif de stack

## 1. Base officielle et statuts

- **CONFIRMÉ — D-008 :** Kjora suit une architecture Core + modules indépendants.
- **CONFIRMÉ — D-005/D-021/D-028 :** le produit est multi-tenant ; chaque donnée tenant-scoped appartient à une organisation active et son isolation devra être imposée côté serveur/base.
- **CONFIRMÉ — D-002/D-003 :** pays, devise et langues variables relèvent d'une configuration extensible ; Cameroun, XAF et FR/EN sont initiaux.
- **CONFIRMÉ — D-010 :** notifications et emails sont orchestrés autour d'événements métier.
- **CONFIRMÉ — D-028 :** le MVP reste un monolithe modulaire ; le modèle doit pouvoir évoluer vers 500, 2 000 puis 10 000+ organisations sans changer son fondement multi-tenant et sans optimisation prématurée.
- **PROPOSITION — O-005 à O-007 :** placement du système événementiel dans le Core, absence de contact direct des modules avec un fournisseur de communication, reprise non bloquante et séparation notifications/activité/communications/audit.
- **CONFIRMÉ — validation du Lot 1 :** les douze capacités Core, les dix modules métier et leurs frontières v0.1 ci-dessous sont retenus. Les détails encore marqués **PROPOSITION** ou **À VALIDER** ne deviennent pas des décisions.

## 2. Règles de frontière proposées

1. **PROPOSITION — Dépendance orientée.** Les modules peuvent utiliser les contrats publics du Core ; le Core ne dépend d'aucun module métier.
2. **PROPOSITION — Propriétaire unique.** Un bloc est seul responsable de l'intégrité et de l'évolution de ses données conceptuelles. Un autre bloc n'en lit ni n'en modifie les détails internes.
3. **CONFIRMÉ — Tenant métier.** Toute ressource métier appartient à une organisation. **PROPOSITION —** Chaque contrat et événement métier porte explicitement ce contexte ; l'identité globale constitue l'exception non métier.
4. **PROPOSITION — Contrat avant donnée.** Une interaction directe n'utilise qu'un contrat public stable et minimal. Une réaction différée utilise un événement lorsque le consommateur n'a pas à bloquer le producteur.
5. **PROPOSITION — Pas de cycle.** Lorsqu'un retour d'information créerait une boucle, le bloc aval publie un fait que le bloc amont peut projeter sans dépendre de ses détails internes.
6. **PROPOSITION — Fournisseurs isolés.** Les modules ne contactent pas directement un fournisseur d'email, de push ou autre canal externe ; Communications porte l'adaptation de canal.
7. **PROPOSITION — Échec localisé.** L'échec d'une notification ou communication n'annule pas un fait métier réussi. Un module désactivé est retiré des parcours concernés sans rendre le Core indisponible.
8. **PROPOSITION — Références minimales.** Une référence à une entité d'un autre module comprend son identifiant et son organisation, sans recopier son dossier interne ; les snapshots métier nécessaires sont explicitement possédés par le consommateur.
9. **PROPOSITION — Reporting en lecture.** Reporting consomme des faits ou contrats de lecture ; il ne devient jamais propriétaire des données opérationnelles et ne les corrige pas.

## 3. Carte du Core

Dans les tableaux, « événement v0.1 » désigne le catalogue minimal du Lot 1. L'absence d'événement retenu n'interdit pas un futur fait de sécurité ou d'administration, qui devra être validé séparément.

| Capacité Core | Responsabilité et données conceptuellement possédées | Contrats publics exposés | Événements v0.1 possibles | Dépendances autorisées | Dépendances interdites |
|---|---|---|---|---|---|
| **Identity / Authentication** | Identité globale, vérification email par OTP ou lien sécurisé, appareils autorisés et état d'accès conceptuels. Le PIN à 6 chiffres sert seulement à l'accès quotidien sur un appareil déjà autorisé ; l'identité ne porte aucun droit métier. | Acteur authentifié, démarrage/fin d'accès, vérification de nouvel appareil, récupération, révocation et preuve de contexte suffisamment forte. | Aucun dans le catalogue métier v0.1. | Country Configuration, i18n et Domain Event Core ; orchestration future des messages Auth. | Modules métier ; Notifications/Communications comme dépendance directe ; rôle d'organisation global ; PIN considéré comme preuve forte autonome ; biométrie au MVP ; secret ou logique fournisseur exposée au client. |
| **Organizations** | Tenant autonome, statut, `Organization Profile`, `Organization Branding` et `Organization Settings`. Les profils peuvent porter nom commercial/légal, logo, contacts, adresse, pays, devise, langue, fuseau, affichage des reçus/contrats, informations de paiement et préférences. Memberships possède le lien utilisateur–organisation et Authorization l'attribution du rôle. | Créer/consulter une organisation autorisée ; obtenir son contexte, son profil, son branding et ses paramètres autorisés. | Aucun retenu en v0.1. | Identity, Country Configuration et Domain Event Core. | Audit/Notifications/Communications comme dépendances directes ; relation d'ownership dupliquée ; données métier des modules ; rôle `Organization Owner` interprété comme preuve juridique de propriété d'un immeuble. |
| **Memberships** | Lien User–Organization, invitation, statut d'appartenance, activation/révocation et rôle principal. Un User peut avoir plusieurs Memberships dans plusieurs Organizations. | Vérifier qu'un utilisateur est membre actif ; lister ses organisations autorisées ; sélectionner une seule organisation active par action. | Aucun retenu en v0.1. | Identity, Organizations et Domain Event Core. | Audit/Notifications/Communications comme dépendances directes ; données métier ; union de rôles ou de permissions entre organisations ; plusieurs rôles principaux au MVP. |
| **Authorization / RBAC** | Six rôles fixes d'organisation, capacités explicites et affectations via Membership : propriétaire / `Organization Owner`, gestionnaire, encaisseur, gardien, comptable, consultation. | Autoriser/refuser une capacité pour un acteur dans une organisation et sur un contexte donné, avec refus par défaut. | Aucun retenu en v0.1. | Identity, Organizations et Memberships. | Audit/Notifications/Communications comme dépendances directes ; décision fondée seulement sur l'UI ; permission inter-organisation ; rôle personnalisé au MVP ; correction financière silencieuse. |
| **Country Configuration** | Pays activés, devise, langues, fuseau, formats, méthodes de paiement, fournisseurs disponibles et règles variables référencées. | Résoudre la configuration applicable à une organisation et à une date/contexte. | Aucun retenu en v0.1. | Aucun module métier ; données de référence Core validées. | Règle fiscale/comptable ou Mobile Money non validée ; dépendance à un pays inscrite dans le métier principal. |
| **i18n** | Catalogue de libellés et règles de rendu localisées, sans textes métier figés dans les modules. | Résoudre un libellé FR/EN et les formats selon le contexte. | Aucun. | Country Configuration et préférences autorisées. | Logique métier, décision de paiement ou contenu de contrat juridique non validé. |
| **Module Registry / Feature Flags** | Catalogue des modules, état activé/désactivé et options par organisation/pays/environnement conceptuel. | Savoir si une capacité est disponible ; exposer la navigation fonctionnelle permise. | Aucun retenu en v0.1. | Organizations, Country Configuration, Common Settings, Authorization. | Données internes d'un module ; activation contournant une permission ; module obligatoire uniquement pour masquer une panne du Core. |
| **Domain Event Core** | Types d'événements approuvés, enveloppe, remise et état conceptuel de consommation. Il ne possède pas le fait métier sous-jacent. | Publier/consommer un fait tenant-scoped ; corrélation et déduplication conceptuelles. | Transporte les dix événements retenus du catalogue ; n'en produit aucun à la place des modules. | Aucune capacité fonctionnelle de niveau supérieur ; le producteur fournit un contexte tenant déjà validé. | Organizations, Audit, Notifications ou Communications comme dépendances ; modèles internes ; règle d'envoi d'un fournisseur ; transformation d'un événement en commande implicite. |
| **Notifications** | Notification in-app, destinataire autorisé et état lu/non lu. Common Settings possède les préférences de catégorie/canal. | Créer une notification à partir d'un fait ; lister/marquer les notifications autorisées. | Consomme des événements ; n'ajoute aucun fait métier v0.1. | Domain Event Core, Memberships, Authorization, i18n, Common Settings. | Préférences dupliquées ; fournisseur email/push direct ; vérité métier ; destinataire d'une autre organisation. |
| **Communications** | Intention de communication, canal, modèle, destinataire admissible, état et historique de traitement conceptuels. | Demander/planifier un message selon une politique ; consulter son résultat autorisé. | Consomme des événements ; les faits techniques d'envoi sont hors catalogue métier v0.1. | Domain Event Core, Memberships/Authorization lorsque le destinataire est membre, i18n, Country Configuration, Common Settings ; adaptateurs externes futurs côté serveur. | Dépendance aux détails internes d'un module ; secret dans le contrat ; fournisseur servant de source de vérité métier ; module contournant Communications pour appeler directement le fournisseur. |
| **Audit** | Trace de contrôle tenant-scoped : acteur, action/fait, entité, date et contexte minimal. | Enregistrer/consulter une trace selon permission ; politique de conservation **À VALIDER**. | Consomme les faits retenus ; ne publie pas de fait métier v0.1. | Identity, Organizations, Authorization, Domain Event Core. | Notification utilisateur ; modification rétroactive silencieuse ; accès inter-organisation. |
| **Common Settings** | Résolution des préférences transversales d'organisation et d'utilisateur : langue préférée, fuseau retenu, catégories de communication et présentation commune. Organizations reste propriétaire des `Organization Settings`. | Lire une préférence effective et sa provenance ; modifier une préférence autorisée. | Aucun retenu en v0.1. | Organizations, Memberships, Authorization, Country Configuration. | Duplication de la source `Organization Settings` ; paramètre métier propre à un module ; règle pays dupliquée ; secret ou configuration fournisseur sensible. |

### Frontières sensibles du Core

- **CONFIRMÉ — Organizations possède le tenant, son profil, son branding et ses paramètres ; Memberships possède l'accès au tenant ; Authorization décide une capacité.** Aucun de ces blocs ne remplace les deux autres.
- **PROPOSITION — Country Configuration définit ce qui peut varier par marché ; Common Settings choisit parmi les options autorisées pour une organisation ou un utilisateur.**
- **PROPOSITION — Notifications attire l'attention dans Kjora ; Communications gère un canal externe ; Audit conserve une trace de contrôle ; le fil d'activité est une vue utilisateur distincte.**
- **À VALIDER —** Le fil d'activité est-il une projection de Notifications, d'Audit ou une capacité Core autonome ? La proposition v0.1 le traite comme une projection de faits, sans en faire une nouvelle source de données.

### Ordre interne du Core proposé — sans cycle

Les capacités d'un niveau ne dépendent que des niveaux précédents ; aucune capacité précédente ne rappelle une capacité ultérieure :

1. Country Configuration et Domain Event Core ;
2. i18n ;
3. Identity / Authentication ;
4. Organizations ;
5. Memberships ;
6. Authorization / RBAC ;
7. Common Settings ;
8. Module Registry / Feature Flags ;
9. Notifications, Communications et Audit, consommateurs terminaux des faits.

**PROPOSITION —** Lorsqu'une capacité des niveaux 3 à 8 doit déclencher une notification, une communication ou un audit, elle publie un fait via Domain Event Core ; elle ne dépend pas du consommateur terminal. Les futurs événements d'accès ou d'administration ne sont pas ajoutés au catalogue métier de ce lot.

## 4. Carte des modules métier

| Module | Responsabilité et données conceptuellement possédées | Contrats publics exposés | Événements v0.1 possibles | Dépendances autorisées | Dépendances interdites |
|---|---|---|---|---|---|
| **Properties** | Bien immobilier : identité, libellé, localisation minimale, état et caractéristiques générales tenant-scoped. | Vérifier/résumer un bien autorisé ; références stables pour les autres modules. | `PROPERTY_CREATED`. | Core. | Units, Tenants, Leases, loyers, paiements ou reporting ; aucune donnée d'une autre organisation. |
| **Units** | Unité louable rattachée à un bien : référence, type, état locatif descriptif et caractéristiques propres. | Vérifier/résumer une unité ; lister les unités d'un bien autorisé. | Aucun retenu en v0.1. | Core ; contrat public Properties. | Locataire ou contrat courant comme vérité interne ; Payments ; Reporting. |
| **Tenants** | Dossier locataire tenant-scoped, identité de contact minimale, statut et préférences de communication autorisées. | Vérifier/résumer un dossier locataire pour un contrat ; obtenir un destinataire admissible sous permission. | `TENANT_CREATED`. | Core. | Contrat, dette ou paiement comme propriétés internes ; partage de PII par événement sans nécessité. |
| **Leases** | Contrat/bail : parties référencées, bien/unité, dates, conditions locatives validées, montant/devise/fréquence convenus et état. | Activer/consulter un contrat autorisé ; exposer les termes minimaux nécessaires à l'échéancier. | `LEASE_ACTIVATED`. | Core ; contrats publics Properties, Units et Tenants. | Lire les détails internes de ces modules ; dépendre de Rent ou Payments ; intégrer une règle pays variable en dur. |
| **Rent / Dues / Schedules** | Calendrier attendu, échéance, montant dû, devise, période, date et état de recouvrement projeté. | Créer/consulter une échéance ; exposer le solde attendu. | `RENT_DUE_CREATED`, `RENT_DUE_SOON`, `RENT_OVERDUE`. | Core, dont le catalogue d'événements, Country Configuration et contrat public Leases ; projection des paiements confirmés par `PAYMENT_COMPLETED` via le Core. | Dépendance directe à Payments ; détails internes de Payments ; communication externe directe ; cycle Rent↔Payments. |
| **Payments & Receipts** | Deux capacités séparées dans un même module. Payments possède le paiement, son moyen/provider déclaré, référence/preuve facultative, date, montant/devise, acteur, confirmation et allocations. Receipts possède le reçu dérivé, sa version et son lien d'artefact. | Enregistrer/consulter/allouer un paiement ; confirmer son encaissement ; signaler le règlement à Rent ; produire/consulter un reçu final après `PAYMENT_COMPLETED`. | `PAYMENT_RECORDED`, `PAYMENT_COMPLETED`, `RECEIPT_GENERATED`. | Core ; contrat public Rent/Dues ; contrat Documents optionnel pour l'artefact. | Reçu comme seconde source de vérité ; reçu final après seul `PAYMENT_RECORDED` ; fournisseur Mobile Money ou communication directe au MVP ; modification interne d'une échéance. |
| **Expenses** | Dépense tenant-scoped, catégorie, montant/devise, date, justificatif référencé et rattachement optionnel à un bien/unité. | Enregistrer/consulter une dépense ; exposer un résumé financier autorisé. | Aucun retenu en v0.1. | Core ; références publiques Properties/Units ; Documents optionnel. | Paiements de loyer ; Reporting comme propriétaire ; dépendance obligatoire à Maintenance. |
| **Maintenance** | Demande, incident, priorité, interventions, affectations, coûts estimés/réalisés référencés et état. | Signaler/suivre une intervention ; exposer son état autorisé. | Aucun retenu en v0.1. | Core ; références publiques Properties/Units ; Tenants et Documents optionnels. | Modifier un bail, une dépense ou un paiement ; fournisseur de communication direct. |
| **Documents** | Document général tenant-scoped, catégorie, version, artefact référencé, liens contrôlés et partage. Le reçu métier reste possédé par Receipts ; le rendu peut utiliser le branding de l'organisation. | Attacher/consulter/partager un document autorisé ; retourner une référence d'artefact tenant-scoped. | `DOCUMENT_SHARED`. | Core. | Devenir propriétaire d'un bail, paiement ou reçu métier ; stockage inter-tenant ; accès par simple URL sans contexte tenant. |
| **Reporting** | Définitions de vues/indicateurs avancés, projections et instantanés de lecture ; aucune donnée opérationnelle autoritative. Reporting avancé est hors MVP. | Présenter des rapports autorisés ; expliquer la fraîcheur et la provenance d'un indicateur. | Aucun fait métier retenu en v0.1. | Core ; événements et contrats de lecture publics des modules nécessaires. | Porter le dashboard opérationnel simple du MVP ; écrire dans un module source ; lire des détails internes ; corriger silencieusement une donnée métier. |

## 5. Matrice de dépendance proposée

Lecture : la **ligne dépend de la colonne**.

- `P` : contrat public direct autorisé ;
- `O` : contrat public optionnel ;
- `—` : aucune dépendance métier autorisée.

| Dépendant ↓ / Fournisseur → | Core | Prop. | Units | Tenants | Leases | Rent | Pay/Rec. | Expenses | Maint. | Docs | Reporting |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Core** | — | — | — | — | — | — | — | — | — | — | — |
| **Properties** | P | — | — | — | — | — | — | — | — | — | — |
| **Units** | P | P | — | — | — | — | — | — | — | — | — |
| **Tenants** | P | — | — | — | — | — | — | — | — | — | — |
| **Leases** | P | P | P | P | — | — | — | — | — | — | — |
| **Rent / Dues** | P | — | — | — | P | — | — | — | — | — | — |
| **Payments & Receipts** | P | — | — | — | — | P | — | — | — | O | — |
| **Expenses** | P | O | O | — | — | — | — | — | — | O | — |
| **Maintenance** | P | P | O | O | — | — | — | — | — | O | — |
| **Documents** | P | — | — | — | — | — | — | — | — | — | — |
| **Reporting** | P | O | O | O | O | O | O | O | O | O | — |

### Justification des liaisons sensibles

- **PROPOSITION — Leases → Properties/Units/Tenants :** un contrat valide les références par leurs contrats publics, puis possède les termes historiques nécessaires ; les changements ultérieurs d'une fiche ne réécrivent pas silencieusement le contrat.
- **PROPOSITION — Payments & Receipts → Rent :** le paiement vérifie l'échéance par un contrat public. Rent apprend ensuite les allocations via des faits, ce qui évite une boucle synchrone.
- **PROPOSITION — Aucun Rent → Payments :** Rent projette le solde à partir des faits `PAYMENT_*` déclarés dans le contrat neutre du Domain Event Core ; il ne dépend ni du contrat appelable ni des détails internes de Payments.
- **PROPOSITION — Documents sans dépendance inverse :** il accepte une référence d'entité opaque et autorisée ; il n'a pas à connaître la structure de chaque module.
- **PROPOSITION — Reporting comme puits :** il consomme les faits via Domain Event Core et, si nécessaire, des contrats publics de lecture optionnels ; aucun module ne dépend de ses projections pour réussir une opération.
- **PROPOSITION — Payments & Receipts → Documents :** le reçu peut utiliser Documents comme stockage/partage d'artefact tenant-scoped, sans lui céder la propriété du reçu métier. Le contrat d'artefact détaillé reste **À VALIDER**.

## 6. Dépendances explicitement interdites

1. **Core → module métier**, y compris pour savoir si une organisation contient un bien ou un paiement.
2. **Lecture ou écriture directe des détails internes d'un autre module**, même si les deux blocs partagent ultérieurement une infrastructure.
3. **Appel direct d'un module métier à un fournisseur d'email, push, SMS, WhatsApp ou Mobile Money** ; l'intégration automatique Mobile Money est hors MVP.
4. **Dépendance circulaire**, notamment Leases→Rent, Properties→Units, Tenants→Leases, Rent↔Payments en appels synchrones ou module opérationnel→Reporting.
5. **Confiance dans un identifiant sans organisation**, ou acceptation d'une ressource dont l'organisation diffère du contexte autorisé.
6. **Autorisation uniquement par affichage/masquage dans l'interface** ; la permission doit aussi être imposée côté serveur/base lors de la phase technique.
7. **Règle camerounaise variable dans le cœur d'un module**, si elle peut être résolue par Country Configuration.
8. **Secret, clé fournisseur ou détail de transport dans un contrat métier.**

## 7. Résilience et désactivation

| Situation | Comportement proposé |
|---|---|
| Module métier désactivé pour une organisation | Le registre le retire des actions/navigation concernées ; identité, organisations, memberships, réglages et autres modules autorisés restent accessibles. |
| Module indisponible temporairement | Les autres modules n'appellent pas ses détails internes. Une action qui exige son contrat public échoue localement avec un état explicite, sans rendre le Core indisponible. |
| Notifications indisponibles | Le fait métier reste réussi ; l'effet est marqué en attente/reprise selon O-006. |
| Communications externes indisponibles | Aucun rollback métier ; historique et reprise indépendants selon O-006. |
| Reporting indisponible | Les opérations et le dashboard opérationnel simple du MVP continuent ; seul le reporting avancé concerné signale son indisponibilité ou sa fraîcheur. |
| Documents indisponible | Les opérations sans document continuent. Une génération/consultation requise signale un échec local et récupérable ; le paiement déjà admis n'est pas annulé. |

## 8. Points restant à valider après le Lot 1

- **À VALIDER :** fil d'activité comme projection autonome et niveau de garantie de l'audit.
- **À VALIDER :** contrat détaillé entre Receipts et Documents pour l'artefact du reçu.
- **À VALIDER :** détails de rétention, reprise et garanties des effets événementiels.

## 9. Contrôle d'acceptation

- **SATISFAIT :** le Core ne dépend d'aucun module métier dans la matrice.
- **SATISFAIT :** chaque bloc précise responsabilité, données possédées, contrats, événements, dépendances autorisées et interdites.
- **SATISFAIT :** aucune dépendance circulaire n'est proposée.
- **SATISFAIT :** les interactions Rent/Payments et Documents/modules sont découplées par contrats/faits.
- **SATISFAIT :** l'organisation est explicite pour toute ressource métier et tout échange métier.
- **SATISFAIT :** aucun module métier ne dépend directement d'un fournisseur externe.
- **SATISFAIT conceptuellement :** panne de communication et désactivation de module ne rendent pas le Core inutilisable.
- **SATISFAIT :** les frontières v0.1, le monolithe modulaire, le multi-organisation, le multi-ownership, Payments/Receipts et le périmètre du dashboard sont inscrits dans la source de vérité après validation de Blaise.

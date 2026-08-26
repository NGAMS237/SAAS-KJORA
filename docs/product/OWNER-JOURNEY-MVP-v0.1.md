# Kjora — Parcours propriétaire et MVP v0.1

> Statut du document : **VALIDÉ PAR BLAISE — Lot 1**  
> Lot : **Lot 1 — Architecture fonctionnelle v0.1**  
> Portée : cadrage fonctionnel mobile-first, sans conception détaillée des écrans ni démarrage de la Phase 2  
> Dernière mise à jour : 2026-08-24

## 1. Objet et statut

**CONFIRMÉ — D-024**

Ce document décrit un parcours principal candidat permettant à un propriétaire, y compris à distance, de suivre un cycle locatif simple de bout en bout :

`Bien → Unité → Locataire → Contrat → Échéance / loyer attendu → Paiement → Reçu → Visibilité propriétaire`

Cette boucle et son périmètre MVP sont validés par D-024. Le document ne constitue pas une spécification détaillée du Lot 2, qui reste non commencé. Les éléments encore marqués `PROPOSITION` ou `À VALIDER` n'ont pas été tranchés par les décisions D1–D8.

## 2. Fondations confirmées utilisées

Les éléments suivants sont **CONFIRMÉS** et encadrent le parcours :

- Kjora est un SaaS de gestion locative mobile-first destiné en priorité aux propriétaires immobiliers.
- Le Cameroun est le premier marché ; le français et l’anglais sont pris en charge et la devise initiale est le XAF.
- Un User peut appartenir à plusieurs Organizations, mais chaque action utilise une seule organisation active et aucune permission n'est héritée entre organisations.
- Le rôle propriétaire / `Organization Owner` contrôle le compte Kjora de l'organisation ; il ne prouve pas la propriété juridique des immeubles.
- Chaque Organization est un tenant autonome avec son profil, son branding, ses paramètres, ses données, documents/fichiers, événements, notifications, activité et audit.
- Les six rôles fixes sont : propriétaire / `Organization Owner`, gestionnaire, encaisseur, gardien, comptable et consultation, avec capacités explicites et refus par défaut.
- Les moyens de paiement initiaux sont les espèces, MTN Mobile Money, Orange Money et le virement.
- Les notifications et communications importantes sont orchestrées autour d’événements métier.
- Les actions et données d’une organisation ne doivent jamais être visibles depuis une autre organisation sans accès autorisé.

Le MVP, le niveau manuel de Mobile Money et la structure RBAC sont validés. L'attribution détaillée des capacités non tranchées, les règles minimales des paiements partiels et certains canaux de partage restent **À VALIDER**.

## 3. Objectif utilisateur

**PROPOSITION**

En quelques étapes compréhensibles sur téléphone, le propriétaire doit pouvoir :

- enregistrer ce qu’il loue et à qui ;
- formaliser les conditions financières essentielles d’un contrat ;
- voir le loyer attendu pour une période ;
- savoir si un paiement a été enregistré, par qui et quand ;
- disposer d’un reçu cohérent avec ce paiement ;
- identifier rapidement ce qui est payé, attendu ou en retard ;
- déléguer certaines actions locales tout en gardant une visibilité fiable.

Le parcours privilégie des mots usuels — « bien », « locataire », « contrat », « loyer attendu », « paiement », « reçu » — et réserve le vocabulaire spécialisé aux explications contextuelles.

## 4. Vue d’ensemble mobile-first

**PROPOSITION**

Le parcours est progressif : chaque succès propose une seule prochaine action principale, sans imposer de remplir des informations qui ne sont pas nécessaires à l’étape courante.

| Étape | Question simple à laquelle l’utilisateur répond | Résultat visible | Prochaine action principale |
|---|---|---|---|
| 1. Bien | « Quel ensemble immobilier est géré ? » | Le bien est identifiable. | Ajouter une unité. |
| 2. Unité | « Quel espace est loué ? » | L'unité louable est rattachée au bien. | Ajouter un locataire. |
| 3. Locataire | « À qui est-ce loué ? » | Le locataire peut être associé à l'unité concernée. | Créer le contrat. |
| 4. Contrat | « Quelles sont les conditions essentielles ? » | Le contrat est enregistré puis activé. | Voir le prochain loyer attendu. |
| 5. Loyer attendu | « Combien est dû et pour quand ? » | Une obligation de paiement est visible avec un état clair. | Enregistrer un paiement. |
| 6. Paiement | « Qu’est-ce qui a été saisi puis confirmé comme reçu ? » | Le montant, la date, le moyen, la confirmation et l’auteur sont visibles. | Consulter le reçu après confirmation. |
| 7. Reçu | « Quelle preuve remettre ou conserver ? » | Un reçu final dérivé du paiement confirmé est disponible. | Partager ou revenir au suivi. |
| 8. Visibilité | « Qu’est-ce qui est payé, attendu ou en retard ? » | L'Organization Owner voit les éléments qui nécessitent son attention. | Ouvrir l’élément prioritaire. |

Sur mobile, l’organisation active doit toujours être identifiable. Le changement d'organisation sélectionne explicitement un autre contexte tenant ; il ne consolide ni données, ni rôles, ni permissions.

## 5. Parcours détaillé candidat

### 5.1 Enregistrer le bien puis l'unité

**PROPOSITION**

**But.** Identifier sans ambiguïté le bien, puis l'unité louable qui lui appartient. Bien et Unité restent deux étapes et deux responsabilités fonctionnelles distinctes.

**Données minimales proposées :**

- nom ou repère simple du bien ;
- ville ou localité ;
- type de bien parmi une liste courte ;
- unité concernée si le bien contient plusieurs unités ;
- organisation active, appliquée par le contexte d’accès et non choisie librement dans une autre organisation.

L’adresse détaillée, les photos, les équipements, la valeur du bien et les documents de propriété ne sont pas requis pour terminer cette première étape.

**Action déléguée proposée.** Le propriétaire ou un gestionnaire pourrait créer et compléter le bien. Un autre rôle pourrait transmettre une information locale, mais son droit de modification reste **À VALIDER** dans la future matrice de permissions.

**Retour mobile utile.** Après création, afficher le nom du bien, sa localité et un bouton principal « Ajouter un locataire ».

### 5.2 Enregistrer le locataire

**PROPOSITION**

**But.** Identifier la personne ou l’entité qui occupera le bien, sans collecter de données excessives.

**Données minimales proposées :**

- nom affiché ;
- au moins un moyen de contact lorsque disponible ;
- langue de communication préférée, si connue ;
- bien ou unité auquel le futur contrat doit être rattaché.

Les pièces d’identité, garants, contacts secondaires et justificatifs sont hors du minimum de cette étape et nécessitent un cadrage ultérieur sur la protection des données.

**Action déléguée proposée.** Le propriétaire ou un gestionnaire pourrait enregistrer le locataire. Les capacités exactes du gardien, du comptable et des autres rôles restent **À VALIDER**.

**Retour mobile utile.** Confirmer le locataire créé et proposer « Créer le contrat » sans renvoyer l’utilisateur vers une liste complexe.

### 5.3 Enregistrer et activer le contrat

**PROPOSITION**

**But.** Relier un locataire à un bien ou une unité et définir les conditions nécessaires au calcul du loyer attendu.

**Données minimales proposées :**

- bien ou unité ;
- locataire ;
- date de début ;
- montant du loyer en XAF ;
- fréquence du loyer ;
- date ou règle simple d’exigibilité ;
- statut brouillon ou actif.

La date de fin peut rester facultative lorsque le contrat le permet. La génération d’un contrat juridique complet, les clauses locales, la caution et les modèles réglementaires ne sont pas figés dans cette v0.1.

**Action déléguée proposée.** Le propriétaire ou un gestionnaire pourrait préparer le contrat. L’autorité permettant de l’activer ou de le modifier est **À VALIDER**.

**Retour mobile utile.** Avant activation, résumer en langage simple : bien, locataire, montant, fréquence et première date attendue. Après activation, afficher le premier loyer attendu.

### 5.4 Créer et suivre le loyer attendu

**PROPOSITION**

**But.** Matérialiser ce qui doit être payé pour une période donnée, indépendamment de ce qui sera réellement reçu.

**Données minimales proposées :**

- contrat concerné ;
- période ;
- montant attendu ;
- date d’exigibilité ;
- état lisible : à venir, attendu, partiellement payé, payé ou en retard.

La création du loyer attendu à partir d’un contrat actif est proposée comme automatisation de base de la boucle. Les règles complexes d’ajustement, pénalités, prorata et révision restent hors de cette v0.1.

**Action déléguée proposée.** Le propriétaire ou le gestionnaire pourrait vérifier le montant attendu. La création système ne doit pas empêcher une correction autorisée et tracée ; les droits et règles de correction restent **À VALIDER**.

**Retour mobile utile.** Montrer d’abord le montant et la date, puis l’action « Enregistrer un paiement ». Ne pas présenter l’absence de paiement avant l’échéance comme une erreur.

### 5.5 Enregistrer puis confirmer le paiement reçu

**CONFIRMÉ — D-023/D-027**

**But.** Enregistrer un fait réellement observé : un montant a été reçu pour un loyer attendu.

**Données minimales proposées :**

- loyer attendu concerné ;
- montant reçu ;
- date du paiement ;
- moyen de paiement : espèces, MTN Mobile Money, Orange Money ou virement ;
- provider / moyen Mobile Money lorsque concerné ;
- référence facultative lorsque le moyen utilisé en fournit une ;
- preuve facultative ;
- auteur de l’enregistrement, issu de l’identité connectée ;
- état de confirmation.

Au MVP, le paiement est saisi manuellement, y compris lorsqu’il a été réalisé par Mobile Money. Aucune intégration automatique MTN Mobile Money ou Orange Money n'est incluse.

La prise en charge d’un paiement partiel est incluse au MVP. Ses règles minimales détaillées — notamment solde restant, trop-perçu, correction et annulation — restent **À VALIDER** avant spécification.

**Action déléguée proposée.** L’encaisseur est le rôle candidat principal pour enregistrer un paiement reçu sur place ; le propriétaire ou le gestionnaire pourrait également le faire. Cette répartition ne constitue pas la matrice finale de permissions.

**Retour mobile utile.** Avant validation, récapituler montant, date, moyen, locataire et bien. Après succès, distinguer clairement « Paiement enregistré » de « Paiement confirmé » et afficher qui l’a enregistré. Une opération manuelle immédiatement confirmée produit successivement `PAYMENT_RECORDED`, puis `PAYMENT_COMPLETED`.

### 5.6 Produire le reçu

**CONFIRMÉ — D-023**

**But.** Fournir une preuve cohérente avec le paiement enregistré, sans ressaisir les mêmes informations.

**Données minimales proposées :**

- référence du reçu ;
- paiement source ;
- locataire et bien ou unité ;
- montant, date et moyen de paiement ;
- organisation émettrice ;
- date de génération.

Payments et Receipts sont deux capacités séparées dans le même module au MVP. Le paiement est la source de vérité ; le reçu en est dérivé, conserve un lien traçable vers lui et ne peut jamais le modifier. Seul `PAYMENT_COMPLETED` autorise le reçu final.

**Action déléguée proposée.** La génération suit un paiement confirmé. L'Organization Owner, le gestionnaire ou l'encaisseur pourrait ensuite consulter ou partager le reçu selon des permissions détaillées encore **À VALIDER**.

**Retour mobile utile.** Afficher « Reçu prêt » avec deux actions au maximum : consulter et partager. Le reçu utilise le logo et les informations de l'Organization active, et son artefact reste tenant-scoped. Le canal de partage externe exact n’est pas fixé ; aucun SMS ou WhatsApp n’est inclus automatiquement.

### 5.7 Donner de la visibilité au propriétaire

**PROPOSITION**

**But.** Permettre au propriétaire de comprendre la situation sans reconstruire lui-même l’historique.

**Informations prioritaires proposées :**

- total attendu pour la période ;
- total enregistré comme payé ;
- solde restant ;
- loyers en retard ou bientôt exigibles ;
- derniers paiements ;
- action récente et personne qui l’a effectuée ;
- accès direct aux reçus associés.

Il s’agit du dashboard opérationnel simple confirmé pour le MVP, produit par un read model opérationnel. Il ne dépend pas du module Reporting avancé, qui reste MVP OUT.

**Actions déléguées proposées.** Le comptable ou le rôle consultation pourrait disposer d’une vue en lecture seule ; le gestionnaire pourrait suivre les biens qui lui sont confiés. L’étendue et le filtrage exacts de ces accès restent **À VALIDER**.

**Retour mobile utile.** Afficher en premier ce qui requiert une action, puis les indicateurs essentiels. Éviter les graphiques décoratifs ou les fonctions ajoutées uniquement pour remplir l’écran.

## 6. Délégation locale

**CONFIRMÉ pour la structure RBAC — attribution détaillée À VALIDER**

Cette répartition sert uniquement à vérifier que la boucle peut fonctionner avec des acteurs locaux. Elle ne constitue pas la matrice finale des permissions.

| Rôle confirmé | Contribution candidate dans la boucle | Limite à préserver |
|---|---|---|
| Propriétaire / Organization Owner | Configure le compte et le cadre de gestion, gère les membres et paramètres sensibles, suit les loyers et consulte l’activité. | Contrôle le compte Kjora sans prouver la propriété juridique des biens ; ne voit que son organisation active. |
| Gestionnaire | Prépare les biens, locataires et contrats ; suit les loyers attendus. | Ses droits d’activation, correction et suppression restent **À VALIDER**. |
| Encaisseur | Enregistre un paiement reçu et retrouve le reçu associé. | Ne reçoit pas automatiquement le droit de modifier un contrat ou les paramètres de l’organisation. |
| Gardien | Peut signaler ou transmettre une information locale si cette capacité est retenue. | Aucun rôle artificiel n’est ajouté à la boucle uniquement pour l’occuper. |
| Comptable | Consulte les paiements et rapproche les informations autorisées. | La comptabilité avancée reste hors du MVP candidat. |
| Consultation | Lit les informations explicitement autorisées. | Aucune modification métier. |

Le contrôle d’accès repose sur un rôle principal par Membership, des capacités explicites et le refus par défaut. Les rôles personnalisés sont hors MVP ; aucune correction financière ne peut être silencieuse. Les contrôles doivent s'appliquer côté serveur/base, jamais uniquement dans l'interface.

## 7. Notifications utiles et sobres

**PROPOSITION**

Les notifications candidates doivent partir de faits métier et aider à agir. Elles ne doivent pas dupliquer chaque changement ni supposer qu’un email est toujours disponible.

| Fait utile | Destinataire candidat | Message utile | Action proposée |
|---|---|---|---|
| Contrat activé | Propriétaire, gestionnaire concerné | Le contrat est actif et la première échéance est connue. | Voir le contrat. |
| Loyer bientôt attendu | Rôle chargé du suivi, selon préférences | Un loyer arrive à échéance. | Voir le loyer. |
| Loyer en retard | Propriétaire et gestionnaire autorisé | Un montant reste dû après l’échéance. | Voir le détail. |
| Paiement enregistré | Propriétaire et acteurs concernés | Montant reçu, bien, locataire et auteur de la saisie. | Voir le paiement. |
| Reçu disponible | Acteur autorisé et, si retenu, locataire | Le reçu lié au paiement est prêt. | Consulter le reçu. |
| Échec d’une communication externe | Acteur responsable du suivi | L’opération métier a réussi, mais le message n’a pas été remis. | Réessayer la communication. |

Le centre in-app, les préférences, le fil d’activité, le retry indépendant et les canaux externes détaillés restent des **PROPOSITIONS**. Une panne de communication ne devrait pas annuler une opération métier déjà réussie ; ce comportement reste **À VALIDER** dans l’architecture détaillée.

## 8. Activité et audit utiles

**PROPOSITION**

Le propriétaire doit pouvoir distinguer l’information destinée à attirer son attention de la trace servant à expliquer ce qui s’est passé.

### Fil d’activité candidat

- bien créé ;
- locataire ajouté ;
- contrat activé ;
- loyer attendu créé ou passé en retard ;
- paiement enregistré ;
- reçu généré ou partagé.

### Trace d’audit candidate

Pour les actions sensibles, conserver conceptuellement : l’organisation concernée, l’acteur, l’action ou le fait, l’élément concerné et le moment. Les corrections d’un contrat ou d’un paiement doivent rester explicables.

L’audit est distinct des notifications : une notification peut être lue ou supprimée sans effacer la trace d’une action métier. Le niveau exact de rétention et les règles de correction ou d’annulation restent **À VALIDER**.

## 9. États essentiels du parcours

**PROPOSITION**

| Zone | État vide | Succès | Erreur ou blocage compréhensible |
|---|---|---|---|
| Biens | « Aucun bien enregistré » avec l’action « Ajouter un bien ». | Le bien apparaît avec sa prochaine étape. | Expliquer le champ à corriger sans effacer les autres saisies. |
| Locataires | « Aucun locataire pour ce bien » avec l’action d’ajout. | Le locataire est relié au bien sélectionné. | Signaler un contact invalide ou une absence de droit sans jargon technique. |
| Contrats | Aucun contrat actif ; proposer de reprendre un brouillon ou d’en créer un. | Résumé du contrat et première date attendue. | Montrer les informations manquantes avant activation. |
| Loyers attendus | Aucun loyer attendu ; expliquer si aucun contrat n’est actif. | Montant, échéance et état immédiatement visibles. | Si la génération échoue, ne pas présenter un montant incertain comme dû. |
| Paiements | Aucun paiement ; conserver l’état du loyer attendu. | Confirmation explicite avec montant, moyen, date et auteur. | En cas de connexion instable, éviter une double saisie et indiquer si l’enregistrement a réussi avant de proposer un nouvel essai. |
| Reçus | Aucun reçu tant qu’aucun paiement éligible n’existe. | Reçu consultable depuis le paiement et le loyer. | Distinguer « paiement enregistré » de « reçu ou partage indisponible ». |
| Visibilité | Guide de démarrage montrant la prochaine étape utile. | Synthèse payée/attendue/en retard et activité récente. | Afficher une section indisponible sans rendre tout le suivi inutilisable. |

Les états de chargement, le comportement hors ligne complet et la reprise détaillée après interruption seront spécifiés en Phase 2 ; ils restent **À VALIDER** dans ce lot.

## 10. Frictions probables et réponses candidates

**PROPOSITION**

| Friction pour un utilisateur peu technique | Réponse fonctionnelle candidate |
|---|---|
| Trop de champs dès le départ | Demander uniquement les données minimales et permettre de compléter plus tard. |
| Termes juridiques ou comptables difficiles | Employer un vocabulaire simple et expliquer les termes au moment utile. |
| Hésitation sur la prochaine étape | Présenter une action principale après chaque succès. |
| Réseau mobile instable | Préserver la saisie, afficher un état clair et éviter les doublons lors d’un nouvel essai. |
| Confusion entre loyer dû et argent reçu | Séparer visuellement « loyer attendu » et « paiement enregistré ». |
| Erreur de montant ou de locataire | Afficher un résumé avant confirmation et prévoir une correction autorisée et auditée. |
| Paiement Mobile Money sans intégration | Permettre une saisie manuelle simple avec référence facultative. |
| Doute sur l’action d’un délégué local | Afficher l’auteur et l’heure des actions importantes. |
| Bascule de langue | Garder le changement FR/EN accessible et les libellés cohérents. |
| Plusieurs organisations | Montrer clairement l’organisation active et ne jamais agréger données ou permissions entre tenants au MVP. |

## 11. MVP IN — VALIDÉ

**CONFIRMÉ — D-024**

Le MVP reste centré sur la boucle propriétaire validée :

- contexte d’organisation et accès tenant-scoped nécessaires à la boucle ;
- expérience mobile-first en français et en anglais ;
- configuration initiale Cameroun et XAF ;
- création simple d’un bien puis de son unité louable ;
- création d’un locataire avec données minimales ;
- enregistrement et activation des conditions essentielles d’un contrat ;
- création et suivi du loyer attendu à partir du contrat actif ;
- états à venir, attendu, partiellement payé, payé et en retard ; règles minimales détaillées des paiements partiels encore **À VALIDER** ;
- saisie manuelle des paiements en espèces, MTN Mobile Money, Orange Money et virement ;
- génération d’un reçu final dérivé d'un paiement confirmé ;
- consultation et partage simple du reçu par un canal validé ;
- dashboard opérationnel simple des montants attendus, encaissés, restants et en retard, avec activité récente, sans dépendance à Reporting avancé ;
- activité et audit minimaux des actions importantes ;
- notifications in-app minimales réellement utiles ;
- délégation minimale avec les six rôles fixes, un rôle principal par Membership, capacités explicites et refus par défaut ; attribution détaillée non tranchée **À VALIDER** ;
- états vide, succès et erreur nécessaires au parcours.

Cette liste confirme le périmètre. Elle ne fixe pas l'attribution détaillée des capacités ni les règles minimales des paiements partiels, qui exigent encore une spécification et validation ultérieures.

## 12. MVP OUT

Les exclusions explicitement confirmées sont indiquées comme telles. Les autres reports restent des propositions de séquencement et ne constituent pas de nouvelles décisions.

Sont proposés hors de ce premier MVP :

- comptabilité avancée, clôtures, fiscalité et exports comptables complexes ;
- automatisations complexes de relance, scénarios multiples et règles avancées ;
- SMS et WhatsApp ;
- activation d’autres pays que le Cameroun ;
- **CONFIRMÉ — D-027 :** intégration automatique MTN Mobile Money ou Orange Money et rapprochement automatique ;
- pénalités, indexation, prorata et règles avancées de régularisation ;
- contrats juridiques avancés et bibliothèque complète de modèles ;
- **CONFIRMÉ — D-025 :** rôles personnalisés et matrice de permissions configurable ;
- **CONFIRMÉ — D-024 :** reporting avancé ;
- dépenses, maintenance et gestion documentaire avancée lorsqu’elles ne sont pas strictement nécessaires à la boucle ;
- abonnements SaaS et fonctions commerciales non nécessaires au premier vertical fonctionnel ;
- **CONFIRMÉ — D-026 :** biométrie ; application native spécifique et modes hors ligne avancés restent des reports proposés.

Être placé dans le MVP OUT ne signifie pas qu’un élément est abandonné : il est reporté jusqu’à validation de sa valeur, de ses règles et de son ordre de mise en œuvre.

## 13. Points restant à valider avant toute spécification ultérieure

1. **À VALIDER — Permissions détaillées :** quelles capacités non tranchées par D-025 sont attribuées à chacun des six rôles fixes ?
2. **À VALIDER — Paiements partiels :** quelles règles minimales s’appliquent au solde restant, au trop-perçu, à la correction et à l’annulation ?
3. **À VALIDER — Partage :** quels canaux et destinataires sont admis pour un reçu tenant-brandé ?
4. **À VALIDER — Audit :** quelles actions sont obligatoires, quelle rétention et quels droits de consultation ?

## 14. Limite de ce document

Ce document ne démarre pas le **Lot 2 — Parcours et périmètre MVP**. Le Lot 2 reste la prochaine étape et demeure **NON COMMENCÉ**.

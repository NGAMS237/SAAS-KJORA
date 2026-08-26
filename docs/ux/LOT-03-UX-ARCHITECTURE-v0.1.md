# Kjora — Lot 3 — UX & architecture d’interface v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Base officielle : `PROJECT_STATE.md`, `DECISIONS.md`, `PROJECT_CONTEXT.md` et les trois livrables du Lot 2 cités dans le brief  
> Portée : architecture UX fonctionnelle mobile-first ; aucune maquette haute fidélité ni implémentation

## 1. Objectif

Transformer les 50 écrans fonctionnels validés du Lot 2 en une expérience cohérente où chaque capacité MVP est accessible avec peu de choix, dans la bonne Organization et avec les permissions du contexte courant.

Le Lot 3 décrit :

- les espaces d’expérience ;
- la navigation mobile principale et son adaptation desktop ;
- les flows qui regroupent les écrans fonctionnels ;
- les patterns, états et retours communs ;
- les arbitrages UX nécessaires avant une conception visuelle détaillée.

Il ne change aucune décision métier D-001 à D-068 et ne modifie pas les sources de vérité.

## 2. Principes UX

### 2.1 Une tâche avant un module

L’utilisateur entre par son objectif — comprendre la situation, créer un bien, enregistrer un paiement, retrouver un reçu — plutôt que par l’organigramme technique des modules.

### 2.2 Une seule Organization active

Sur tout écran tenant-scoped :

- le nom de l’Organization active est visible dans l’en-tête ;
- le changement d’Organization remplace entièrement le contexte affiché ;
- les permissions sont recalculées avant toute nouvelle lecture ou action ;
- aucun total, badge, notification ou résultat de recherche ne mélange deux Organizations.

### 2.3 Navigation courte, profondeur contextuelle

La navigation globale contient seulement les destinations fréquentes. Les unités appartiennent au détail d’un bien ; les contrats au contexte d’un locataire ou d’une unité ; les échéances et reçus au contexte locatif et financier. Cette profondeur conserve toutes les capacités sans ajouter un onglet global pour chaque module.

### 2.4 Une action principale par vue

Chaque écran ou étape mobile met en avant une action principale. Les actions secondaires restent dans la page, une feuille d’actions ou le menu contextuel de la ressource. Une action sensible garde son résumé et sa confirmation, conformément à D-044.

### 2.5 Montrer la vérité, pas un état éditable

Attendu, encaissé, restant et statut financier sont dérivés des données autorisées. Un badge « Payé » ne peut jamais devenir un raccourci de modification métier. Seul un paiement confirmé alimente l’encaissé et autorise un reçu final.

### 2.6 Progressivité et langage concret

- formulaires courts, découpés selon la tâche ;
- données indispensables d’abord, compléments ensuite ;
- XAF, dates, périodicités et statuts toujours explicites ;
- libellés d’action concrets : « Ajouter une unité », « Enregistrer un paiement », « Télécharger le reçu » ;
- FR/EN appliqués à l’interface sans localiser les Domain Events.

### 2.7 Permissions visibles sans illusion de sécurité

La navigation s’adapte au rôle. Une action non pertinente ou durablement interdite est masquée ; une action pertinente mais indisponible à cause de l’état métier est visible avec son explication. Un lien direct non autorisé produit toujours un refus sûr côté fonctionnel ; l’interface n’est pas la barrière de sécurité.

### 2.8 Mobile d’abord, desktop sans nouvelle logique

Le téléphone utilise piles verticales, listes, fiches, feuilles et étapes courtes. Le desktop peut utiliser un rail, du maître-détail et plusieurs panneaux, sans ajouter de donnée, permission ou action.

### 2.9 Séparation des signaux

`EVENT`, `NOTIFICATION`, `COMMUNICATION`, `ACTIVITY` et `AUDIT` conservent leurs finalités distinctes. Le centre d’attention ne remplace ni la chronologie humaine ni l’audit sensible.

### 2.10 Direction visuelle

Le futur mapping visuel appliquera la direction confirmée « Horizon & héritage » : premium, moderne, épurée et rassurante, touche africaine subtile, thèmes clair/sombre et aucun gimmick futuriste. Ce document ne crée ni composant graphique final ni nouvelle identité.

## 3. Architecture globale

| Espace | Population | Autorisation | Contexte actif | Destinations proposées |
|---|---|---|---|---|
| Accès global | Utilisateur interne avant sélection | Identité vérifiée | Compte, appareil, Organizations accessibles | Auth, récupération, appareils, langue, sélection Organization |
| Espace interne | Six rôles validés | `Internal Organization Membership` + capacité | Une Organization active | Accueil, Biens, Locataires, Paiements, Activité |
| Portail locataire | Locataire externe | `Tenant Portal Access` | Une Organization puis un bail/logement autorisé | Accueil, Loyers, Reçus, Compte ; notifications par entrée légère dédiée |

Les coques interne et portail sont séparées. Elles ne partagent ni navigation, ni droits, ni vocabulaire d’administration. Elles lisent néanmoins la même vérité autorisée pour Lease, Rent/Dues, Payments et Receipts.

## 4. Navigation proposée

### 4.1 Espace interne mobile

Barre principale proposée :

1. **Accueil** — dashboard complet ou accueil de rôle filtré ;
2. **Biens** — biens et unités ;
3. **Locataires** — dossiers, contrats et accès portail contextuels ;
4. **Paiements** — échéances, paiements et reçus selon permissions ;
5. **Activité** — notifications et activité ; audit séparé, visible seulement par Owner.

L’en-tête porte le sélecteur d’Organization active et l’accès au profil. Le menu de profil/Organization donne accès, selon permissions, à Équipe, profil Organization, paramètres, appareils, langue et audit.

### 4.2 Portail locataire mobile

Barre principale proposée :

1. **Accueil** — logement/bail sélectionné et situation essentielle ;
2. **Loyers** — échéances et paiements en lecture ;
3. **Reçus** — reçus autorisés, consultation et téléchargement ;
4. **Compte** — langue, coordonnées vérifiées, sessions/appareils et récupération.

Les notifications restent accessibles par une icône ou une entrée légère vers leur centre, sans cinquième onglet. L’historique des paiements reste contextuel depuis Accueil, Loyers ou Reçus selon le flow.

Le sélecteur d’accès/Organization ou de bail est visible seulement lorsqu’il existe plusieurs choix. Le profil donne accès à langue, sessions et changement de canal vérifié.

### 4.3 Fonctions contextuelles

| Fonction | Point d’accès principal |
|---|---|
| Units | Détail du bien |
| Lease | Détail du locataire ou de l’unité |
| Rent/Dues | Détail du bail et destination Paiements |
| Payment | Détail d’une échéance, puis historique Paiements |
| Receipt interne | Détail du paiement, de l’échéance ou du locataire autorisé |
| Tenant Portal Access | Détail du locataire |
| Preuve de paiement | Détail du paiement |
| Logo | Paramètres Organization |
| Bail/document essentiel | Contexte du bail lorsque nécessaire |
| Équipe | Espace secondaire de l’Organization, Owner uniquement |
| Paramètres | Espace secondaire de l’Organization, Owner uniquement pour les réglages sensibles |
| Audit | Activité / espace secondaire, Owner uniquement |

## 5. Règles mobile-first

- Largeur téléphone comme référence de conception et de test.
- Une liste devient des lignes/cartes lisibles ; un tableau n’est jamais l’unique expérience mobile.
- L’action principale reste proche du pouce et ne recouvre pas une information critique.
- Une création simple tient dans un écran ou une courte séquence ; une opération sensible utilise saisie → résumé → confirmation.
- Les champs sont regroupés par sens, avec clavier adapté au montant, OTP ou PIN.
- La progression est conservée visuellement lors des étapes ; un retour ne confirme ni ne perd silencieusement les données saisies.
- Les filtres fréquents utilisent des choix courts ; les filtres secondaires passent dans une feuille.
- Les montants sont alignés, lisibles et accompagnés de XAF ; la période active est toujours visible.
- Le logo Organization est facultatif ; une version texte fonctionnelle reste toujours disponible.
- Le changement de contexte n’est jamais caché dans un geste implicite.
- Les thèmes clair et sombre n’utilisent jamais la couleur seule pour transmettre un statut.

## 6. Couverture du MVP

Les 50 écrans fonctionnels du Lot 2 sont conservés et regroupés en 20 flows dans `MOBILE-SCREEN-FLOWS-v0.1.md`. L’architecture couvre :

- compte, appareils, PIN interne et récupération ;
- création et changement d’Organization ;
- dashboard adapté au rôle ;
- équipe, biens, unités, locataires, contrats, échéances, paiements et reçus ;
- notifications, activité, audit et langue ;
- administration, activation, session, consultation et historique du portail locataire.

## 7. Limites explicites

Ne sont pas conçus dans ce lot :

- Reporting avancé ou dashboard multi-Organization ;
- Maintenance ;
- conversations ou chat ;
- e-signature ;
- paiement en ligne ou automatisation Mobile Money ;
- rôles personnalisés ;
- documents avancés ou partage public de reçu ;
- correction financière effective, remboursement, transfert ou surpaiement ;
- maquette haute fidélité, composants implémentés ou fournisseur externe.

Les emplacements contextuels laissent de la place à de futures capacités sans afficher de routes ou d’écrans MVP OUT aujourd’hui.

## 8. Décisions UX confirmées

| ID | Décision confirmée | Effet |
|---|---|---|
| UX-L3-01 | Barre interne mobile à cinq destinations : Accueil, Biens, Locataires, Paiements, Activité. | Réduit la navigation globale tout en gardant la boucle MVP accessible. |
| UX-L3-02 | Barre portail à quatre destinations : Accueil, Loyers, Reçus, Compte. Les notifications utilisent une entrée légère dédiée ; l’historique des paiements reste contextuel. | Sépare le compte et les alertes, tout en évitant un cinquième onglet et un onglet Paiements redondant. |
| UX-L3-03 | Aucun espace global « Documents » au MVP. Reçu, preuve, logo et document essentiel de bail restent dans leur contexte métier, sans copie parallèle. | Évite de réintroduire les documents avancés et préserve une source unique. |
| UX-L3-04 | Sur desktop, rail latéral équivalent aux destinations mobiles, sans menu technique supplémentaire. | Préserve le même modèle mental et les mêmes permissions. |
| UX-L3-05 | Les actions globales de création passent par le contexte de la destination active ; pas de bouton « + » universel ambigu. | Réduit les choix et respecte les capacités du rôle. |

Les décisions UX-L3-01 à UX-L3-03 sont enregistrées comme D-069 à D-071. Les lignes UX-L3-04 et UX-L3-05 restent des règles de conception du lot, sans créer de décision métier supplémentaire.

## 9. Arbitrages clôturés par Blaise

### Q-UX-L3-01 — Navigation interne

**CONFIRMÉ — D-069.** Barre mobile `Accueil / Biens / Locataires / Paiements / Activité`. Équipe, profil, paramètres Organization, changement d’Organization et autres fonctions secondaires restent dans un espace secondaire adapté. L’Organization active demeure clairement identifiable.

### Q-UX-L3-02 — Navigation portail

**CONFIRMÉ — D-070.** Barre portail `Accueil / Loyers / Reçus / Compte`. Les notifications restent accessibles par une entrée légère dédiée sans devenir un cinquième onglet ; l’historique des paiements reste contextuel depuis Accueil, Loyers ou Reçus.

### Q-UX-L3-03 — Emplacement Documents

**CONFIRMÉ — D-071.** Aucune destination globale « Documents » au MVP. Reçu, preuve de paiement, logo et bail/document essentiel restent dans leurs contextes respectifs. Aucune donnée n’est dupliquée pour former une bibliothèque parallèle ; un futur module Documents pourra fournir une vue transversale des mêmes ressources.

## 10. Critères de validation du Lot 3

- Les 50 écrans fonctionnels sont couverts une fois dans le registre des flows.
- Toutes les capacités du Lot 2 restent accessibles aux acteurs autorisés.
- L’Organization active est visible et son changement remplace le contexte complet.
- La navigation varie par permissions sans servir de contrôle de sécurité unique.
- L’espace interne et le portail utilisent des coques et autorisations distinctes.
- Aucune vue ne fusionne deux Organizations ou deux locataires non reliés.
- Les montants internes et portail proviennent de la même vérité métier autorisée.
- Les statuts financiers sont dérivés, jamais librement éditables.
- Les parcours sensibles conservent résumé, confirmation et refus explicite.
- Le mobile constitue l’expérience de référence ; le desktop ne crée aucune capacité supplémentaire.
- Aucun écran MVP OUT, design haute fidélité ou choix technique n’est introduit.

## 11. État du lot

Le Lot 3 est **VALIDÉ PAR BLAISE**. Il n’autorise ni le démarrage du Lot 4 ni une implémentation.

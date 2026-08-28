# Kjora — Matrice d’expérience par rôle MVP v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Lot : **Lot 2 — Parcours et périmètre MVP**  
> Base confirmée : D-025, D-040 et D-049 à D-068

## 1. Limite de la matrice

D-040 valide l’attribution fonctionnelle proposée au Lot 2. Une cellule autorisée vaut uniquement dans l’Organization active et pour les données tenant-scoped que le rôle peut consulter. D-049 confirme que le locataire utilise un accès externe séparé et n’est jamais ajouté comme septième colonne RBAC.

## 2. Légende

- `M` : voir et modifier/créer dans le domaine, selon l’action explicite.
- `V` : voir l’écran et les informations autorisées, sans mutation.
- `C` : voir uniquement le contexte minimal nécessaire à une tâche autorisée, sans accès au dossier complet.
- `R` : enregistrer un paiement manuel après résumé et confirmation.
- `S` : partager un reçu selon le canal/destinataire validé.
- `D` : demander une correction, sans corriger directement.
- `U` : action globale permise à tout User vérifié, indépendamment de son rôle dans une autre Organization.
- `—` : écran/action invisible dans la navigation normale et refusé en accès direct.

Auth, langue et sélecteur des Organizations accessibles restent disponibles à tous les utilisateurs concernés ; ils ne confèrent aucun droit métier.

## 3. Matrice synthétique des écrans visibles

| Domaine d’écran | Organization Owner | Gestionnaire | Encaisseur | Gardien | Comptable | Consultation |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard opérationnel | V | V | C | C sans finance | V | V explicite |
| Profil Organization | M | C identité publique | C identité publique | C identité publique | C identité publique | C identité publique |
| Paramètres sensibles | M | — | — | — | — | — |
| Équipe / membres | M | — | — | — | — | — |
| Biens / unités | M | M | C pour paiement | V | V | V |
| Locataires | M | M | C pour paiement | C identité minimale | V | V explicite |
| Contrats | M | M | C pour paiement | C occupation minimale | V | V explicite |
| Échéances | V | V | V | — | V | V |
| Paiements | V/R | V/R | V/R | — | V | V explicite |
| Reçus | V/S | V/S | V/S | — | V | V explicite |
| Notifications | V pertinentes | V pertinentes | V pertinentes | V pertinentes | V pertinentes | V pertinentes |
| Activity | V | V | C actions financières | C actions locales | V | V explicite |
| Audit | V | — | — | — | — | — |
| Administration portail locataire | M | M | — | — | — | — |

Le dashboard `C` proposé pour l’encaisseur/gardien signifie un accueil de tâches ou contexte, pas le dashboard financier complet de l’Owner. La création éventuelle d’un écran distinct ou d’un dashboard filtré est une décision de regroupement d’écran, pas un droit implicite.

## 4. Matrice synthétique des actions

| Action | Owner | Gestionnaire | Encaisseur | Gardien | Comptable | Consultation |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Créer une Organization supplémentaire | U | U | U | U | U | U |
| Modifier profil/branding | M | — | — | — | — | — |
| Modifier paramètres sensibles | M | — | — | — | — | — |
| Inviter / révoquer un membre | M | — | — | — | — | — |
| Créer / modifier bien | M | M | — | — | — | — |
| Créer / modifier unité | M | M | — | — | — | — |
| Créer / modifier locataire | M | M | — | — | — | — |
| Créer brouillon de contrat | M | M | — | — | — | — |
| Activer / clôturer contrat | M | M | — | — | — | — |
| Modifier échéance | — | — | — | — | — | — |
| Enregistrer paiement total/partiel | R | R | R | — | — | — |
| Modifier directement paiement confirmé | — | — | — | — | — | — |
| Demander correction | D | D | D | — | D | — |
| Consulter reçu | V | V | V | — | V | V explicite |
| Télécharger / envoyer reçu par email | S | S | S | — | — | — |
| Marquer notification lue | M sur ses notifications | M sur ses notifications | M sur ses notifications | M sur ses notifications | M sur ses notifications | M sur ses notifications |
| Consulter audit | V | — | — | — | — | — |
| Inviter / relancer / révoquer accès portail | M | M | — | — | — | — |

Les cellules `—` sur la modification d’une échéance ou d’un paiement confirmé empêchent une correction silencieuse. Depuis D-103/D-105, seul Owner peut effectuer un reversal compensatoire motivé ; gestionnaire, encaisseur et comptable conservent uniquement la demande de correction.

## 5. Organization Owner / propriétaire

### Écrans visibles

- Tous les écrans Auth, appareils, langue et Organizations accessibles.
- Dashboard opérationnel complet du tenant actif.
- Profil/branding/settings, équipe, biens, unités, locataires, contrats, échéances, paiements, reçus, notifications et Activity.
- Audit métier.
- État opérationnel des accès portail locataire.

### Écrans invisibles

- Reporting avancé et dashboard consolidé multi-organisation.
- Éditeur de rôles personnalisés.
- Automatisation Mobile Money, remboursement, transfert ou annulation financière non validés.

### Informations visibles

- Toutes les informations MVP de l’Organization active, sous réserve des règles futures de minimisation de données.
- Aucun contenu d’une autre Organization tant qu’elle n’est pas sélectionnée et autorisée.

### Actions autorisées

- Créer/configurer une Organization ; modifier profil, branding et paramètres sensibles.
- Inviter et révoquer des membres avec un rôle fixe.
- Gérer biens, unités, locataires et contrats.
- Enregistrer des paiements manuels total/partiel/multi-échéances et effectuer un reversal compensatoire motivé.
- Consulter et partager les reçus.
- Inviter, relancer et révoquer un `Tenant Portal Access`.
- Consulter l’audit métier et l’état portail synthétique.

### Actions interdites

- Modifier ou supprimer silencieusement un paiement confirmé ; toute correction effective passe par reversal.
- Hériter d’un droit Owner d’une autre Organization.
- Traiter `Organization Owner` comme preuve juridique de propriété des biens.

### Notifications pertinentes

- Contrat activé, loyer bientôt dû, retard, paiement enregistré par un délégué, paiement confirmé, reçu généré, demande de correction.

## 6. Gestionnaire

### Écrans visibles

- Dashboard opérationnel du tenant actif.
- Biens, unités, locataires, contrats, échéances, paiements, reçus, notifications et Activity.
- Identité publique de l’Organization nécessaire aux documents et au contexte.
- État opérationnel portail des locataires administrés, sans détails techniques.

### Écrans invisibles

- Équipe/membres, paramètres sensibles, appareils d’autres utilisateurs, Audit par défaut, Reporting avancé.

### Informations visibles

- Données opérationnelles de gestion du tenant actif ; informations financières nécessaires au suivi.
- Aucun paramètre sensible ni permission d’une autre Organization.

### Actions autorisées

- Créer/modifier biens, unités et locataires.
- Préparer et activer un contrat.
- Enregistrer un paiement manuel total/partiel.
- Consulter et partager un reçu.
- Demander une correction sans mutation financière directe.
- Inviter, relancer et révoquer un `Tenant Portal Access`.

### Actions interdites

- Inviter/révoquer un membre.
- Modifier les paramètres sensibles.
- Corriger, annuler, rembourser ou transférer silencieusement un paiement.

### Notifications pertinentes

- Contrat activé, bientôt dû, retard, paiement enregistré/confirmé, reçu généré et demande de correction pertinente.

## 7. Encaisseur

### Écrans visibles

- Accueil de tâches/contexte limité, échéances, saisie/résumé/détail de paiement, reçu associé, notifications pertinentes.
- Contexte minimal bien/unité/locataire/contrat nécessaire pour éviter une saisie sur la mauvaise échéance.

### Écrans invisibles

- Dashboard financier global, équipe, settings, formulaires biens/locataires/contrats, Audit, Reporting et administration portail.

### Informations visibles

- Échéance, attendu, encaissé confirmé, restant, locataire affiché, bien/unité, paiements qu’il peut consulter et reçu associé.
- Contacts complets du locataire non visibles par défaut.

### Actions autorisées

- Enregistrer un paiement manuel total/partiel après résumé.
- Consulter le paiement et le reçu associé.
- Télécharger ou envoyer le reçu par email contrôlé.
- Demander une correction de sa saisie sans modifier le paiement.

### Actions interdites

- Gérer les membres ou paramètres.
- Créer/modifier bien, unité, locataire ou contrat.
- Modifier directement un paiement confirmé.
- Voir une autre Organization sans Membership actif et sélection explicite.

### Notifications pertinentes

- Paiement enregistré/confirmé, reçu généré et résultat d’une demande de correction.

## 8. Gardien

### Écrans visibles

- Accueil non financier, biens et unités en lecture, contexte d’occupation minimal, notifications locales pertinentes.

### Écrans invisibles

- Dashboard financier, équipe, settings, échéances financières, paiements, reçus, Audit, Reporting et administration portail.

### Informations visibles

- Nom/repère du bien et de l’unité, état vacant/occupé.
- Identité minimale du locataire nécessaire à l’activité, sans contact personnel implicite, dossier complet ou finance.

### Actions autorisées

- Aucune mutation dans la boucle validée du Lot 2 ; un futur signalement local reste hors de cette matrice tant qu’il n’est pas validé.

### Actions interdites

- Toute action financière, contractuelle, administrative ou de gestion des dossiers.

### Notifications pertinentes

- Aucune notification financière au MVP.

## 9. Comptable

### Écrans visibles

- Dashboard financier en lecture, biens/unités/locataires/contrats comme contexte, échéances, paiements, reçus et Activity.

### Écrans invisibles

- Équipe, paramètres sensibles, formulaires de mutation opérationnelle, Reporting avancé.

### Informations visibles

- Attendu, encaissé confirmé, restant, retards, paiements, moyens, références et reçus du tenant actif.
- Preuve de paiement seulement lorsqu’elle appartient au périmètre financier explicitement autorisé.

### Actions autorisées

- Consultation et rapprochement humain des informations visibles sans fonction comptable avancée.
- Demande de correction sans mutation directe.

### Actions interdites

- Enregistrer un paiement.
- Modifier paiement, contrat, échéance, membres ou paramètres.

### Notifications pertinentes

- Paiement confirmé, reçu généré et demande/résultat de correction.

## 10. Consultation

### Écrans visibles

- Dashboard, biens, unités, locataires, contrats, échéances, paiements, reçus et Activity en lecture tenant-scoped.

### Écrans invisibles

- Tous les formulaires de création/modification, équipe, settings sensibles, Audit par défaut, Reporting avancé.

### Informations visibles

- Informations opérationnelles seulement dans le périmètre explicitement accordé ; aucun contact personnel implicite. Finances et reçus ne sont visibles que si ce périmètre les inclut.

### Actions autorisées

- Ouvrir les écrans et ressources autorisés ; marquer ses notifications lues ; changer sa langue et son Organization active accessible.

### Actions interdites

- Créer, modifier, supprimer, enregistrer un paiement, partager un reçu, gérer un membre ou changer un paramètre sensible.

### Notifications pertinentes

- Notifications de lecture correspondant uniquement aux ressources qu’il est encore autorisé à voir.

## 11. Internal Organization Membership versus Tenant Portal Access

| Dimension | Internal Organization Membership | Tenant Portal Access |
|---|---|---|
| Population | Owner, gestionnaire, encaisseur, gardien, comptable, consultation | Locataire externe |
| Autorisation | Membership dans une Organization avec un rôle fixe | Accès séparé relié au Tenant, à l’Organization et aux Lease(s) autorisés |
| Rôle | Un des six rôles RBAC | Aucun rôle RBAC interne |
| Portée | Capacités de gestion ou lecture selon matrice | Lecture restreinte de ses propres locations et ressources |
| Administration | Owner gère l’équipe interne | Owner et gestionnaire gèrent l’accès portail |
| Source métier | Modules Lease, Rent/Dues, Payments, Receipts | Les mêmes modules, sans copie portail |
| Multi-Organization | Une Organization active et un Membership évalué | Sélection explicite d’accès, aucune agrégation ou révélation entre Organizations |
| Traçabilité | Activity et Audit métier ; Audit visible par Owner | Journal d’accès séparé 12 mois ; vue opérationnelle synthétique Owner/gestionnaire |

### Expérience du locataire portail

#### Écrans visibles

- Activation/vérification, connexion/récupération, sélecteur d’accès, accueil locataire, résumé du bail, échéances, historique des paiements, reçus, notifications et gestion de ses sessions/coordonnées.

#### Écrans invisibles

- Dashboard interne, équipe, paramètres Organization, biens/Unit en gestion, formulaires contrat/échéance/paiement, demandes de correction, Activity et Audit internes.

#### Informations visibles

- Logement et Lease(s) autorisés, attendu, payé confirmé, restant, statut, prochaine échéance, paiements en lecture, reçus et contacts autorisés.
- Aucune donnée d’un autre locataire, d’un autre accès ou d’une autre Organization.

#### Actions autorisées

- Activer/récupérer son accès, sélectionner Organization et bail autorisés, consulter ses données, télécharger un reçu, marquer ses notifications lues, gérer ses propres sessions et changer son canal après vérification.

#### Actions interdites

- Créer/modifier Lease, échéance, Payment ou Receipt ; enregistrer un paiement ; gérer des membres ou paramètres ; voir les détails techniques du journal ; créer un lien public de reçu.

#### Notifications pertinentes

- Échéance à venir, retard, paiement confirmé et reçu disponible, dans la préférence du locataire puis la langue de l’Organization.

## 12. Scénarios négatifs obligatoires

| ID | Étant donné | Lorsque | Alors |
|---|---|---|---|
| RBAC-NEG-01 | Encaisseur dans Org A | tente `member.manage` | **REFUS**, aucun changement Membership. |
| RBAC-NEG-02 | Consultation dans Org A | tente `payment.record` | **REFUS**, aucun event paiement. |
| RBAC-NEG-03 | Gestionnaire sans capacité sensible | modifie un paiement confirmé | **REFUS** direct ; demande seulement si validée. |
| RBAC-NEG-04 | Owner en A, consultation en B | agit avec B active | capacités Consultation seulement ; aucun héritage Owner. |
| RBAC-NEG-05 | Membre A | ouvre paiement/reçu B | **REFUS**, aucune donnée ou branding B. |
| RBAC-NEG-06 | Membership révoqué | réutilise un lien déjà ouvert | **REFUS** à la nouvelle action/lecture. |
| TPA-NEG-01 | Encaisseur, gardien, comptable ou consultation | administre un accès portail | **REFUS**, aucun changement `Tenant Portal Access`. |
| TPA-NEG-02 | Locataire A dans Org A | ouvre une ressource du locataire B de Org A | **REFUS**, aucune donnée B révélée. |
| TPA-NEG-03 | Locataire avec accès Org A | ouvre une ressource Org B | **REFUS**, aucune donnée ou existence détaillée révélée. |
| TPA-NEG-04 | Identité portail avec accès A et B | utilise A comme contexte | aucune donnée, notification ou droit de B ; Org A ignore l’accès B. |
| TPA-NEG-05 | Session expirée ou nouvel appareil | tente d’accéder sans nouvelle preuve | **REFUS** jusqu’à vérification ; aucun PIN locataire proposé. |
| TPA-NEG-06 | Locataire | demande à enregistrer un paiement ou créer un lien public de reçu | **REFUS**, aucun effet métier ou partage serveur. |

## 13. Décisions appliquées

- Q-L2-08, Q-L2-09, Q-L2-12, Q-L2-15, Q-L2-17 et Q-L2-20 sont appliquées par D-036, D-037, D-040, D-043, D-045 et D-048.
- D9 et Q-D9-01 à Q-D9-19 sont appliquées par D-049 à D-068.
- Le locataire reste absent des matrices à six colonnes et utilise exclusivement `Tenant Portal Access`.

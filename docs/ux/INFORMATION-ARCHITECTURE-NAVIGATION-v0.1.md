# Kjora — Architecture d’information et navigation v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Portée : espace interne et portail locataire mobile-first, sans maquette ni implémentation

## 1. Modèle d’information

Kjora présente trois niveaux qui ne doivent pas être confondus :

| Niveau | Contenu | Règle de contexte |
|---|---|---|
| Compte global | Auth, appareil, PIN interne, langue, Organizations/access portail accessibles | Aucun droit métier implicite |
| Organization active | Membership, rôle, données métier, notifications, activité, paramètres | Une seule Organization pour toute lecture ou action |
| Ressource contextuelle | Bien, unité, locataire, bail, échéance, paiement, reçu | Lien tenant-scoped et capacité vérifiés à chaque accès |

Le portail locataire emploie la même hiérarchie de contexte mais remplace le Membership interne par un `Tenant Portal Access` lié à l’Organization, au Tenant et aux Lease(s) autorisés.

## 2. Deux coques séparées

| Dimension | Espace interne | Portail locataire |
|---|---|---|
| Population | Six rôles internes | Locataire externe |
| Autorisation | Membership + rôle fixe + capacité | Tenant Portal Access + ressources reliées |
| Finalité | Gérer ou consulter selon rôle | Consulter sa situation locative |
| Navigation | Accueil, Biens, Locataires, Paiements, Activité | Accueil, Loyers, Reçus, Compte ; notifications par entrée légère dédiée |
| Paramètres | Compte + Organization selon capacités | Compte portail, sessions, canal, langue |
| Données financières | Selon matrice interne | Lecture de ses échéances/paiements confirmés/reçus |
| Traçabilité | Activity et Audit séparé | Journal d’accès non exposé ; état synthétique interne |

Aucun passage visuel ne transforme un locataire en membre interne. Si une même identité utilise les deux espaces, elle choisit explicitement le contexte d’accès avant d’afficher des données.

## 3. Espace interne — navigation mobile principale

### 3.1 Structure proposée

| Destination | Contenu de premier niveau | Contenu contextuel | Action principale possible |
|---|---|---|---|
| Accueil | KPIs autorisés, période, retards, tâches, activité récente | Détail indicateur, échéance, paiement, reçu | Ajouter un bien si vide ; sinon action pertinente au rôle |
| Biens | Liste et recherche de biens | Détail bien, unités, occupation, contrat depuis unité | Ajouter un bien ou une unité selon contexte/capacité |
| Locataires | Liste et recherche de locataires | Détail, contrats, accès portail | Ajouter un locataire ; créer contrat ; inviter portail |
| Paiements | Échéances et paiements selon capacités | Détail échéance, saisie, détail paiement, reçu, correction demandée | Enregistrer un paiement si autorisé |
| Activité | Notifications et fil d’activité | Ressource cible ; audit Owner dans espace distinct | Marquer lu, ouvrir la ressource |

La barre affiche uniquement les destinations dont le rôle possède une lecture utile. Son ordre reste stable pour les destinations présentes.

### 3.2 En-tête persistant

Sur toute vue tenant-scoped :

- sélecteur portant le nom ou repère de l’Organization active ;
- titre de la vue ;
- accès au profil et aux fonctions secondaires ;
- indicateur de notifications non lues du tenant actif si la destination Activité n’est pas immédiatement visible.

Le changement d’Organization ouvre une sélection explicite. Si un formulaire contient des données non confirmées, l’utilisateur choisit de rester ou d’abandonner avant le changement. Après sélection, l’ancien écran n’est jamais conservé avec les nouvelles permissions.

### 3.3 Espace secondaire

| Fonction | Visibilité |
|---|---|
| Mon profil et appareils | Utilisateur connecté |
| Langue FR/EN | Utilisateur connecté |
| Créer une autre Organization | Toute identité vérifiée |
| Profil Organization public | Lecture contextuelle selon rôle |
| Paramètres Organization sensibles | Owner uniquement |
| Équipe et invitations | Owner uniquement |
| Audit métier | Owner uniquement |
| Aide/à propos | Futur contenu non métier, sans nouvelle capacité |

Il n’existe aucune bibliothèque globale de documents au MVP. Les fichiers restent contextuels : reçu depuis paiement/échéance/locataire autorisé, preuve depuis paiement, logo depuis paramètres Organization et bail/document essentiel depuis le bail. Aucun de ces accès ne crée une copie parallèle.

## 4. Navigation adaptée aux six rôles

| Rôle | Barre mobile proposée | Accueil | Secondaire |
|---|---|---|---|
| Organization Owner | Accueil, Biens, Locataires, Paiements, Activité | Dashboard complet | Équipe, profil/settings Organization, appareils, langue, audit |
| Gestionnaire | Accueil, Biens, Locataires, Paiements, Activité | Opérations et KPIs autorisés | Profil public Organization en contexte, appareils, langue |
| Encaisseur | Accueil, Paiements, Activité | Tâches de paiement, sans dashboard financier global | Appareils, langue ; contexte bien/locataire seulement dans le flow paiement |
| Gardien | Accueil, Biens, Activité si pertinente | Contexte local sans finance | Appareils, langue ; identité locataire minimale seulement dans le contexte autorisé |
| Comptable | Accueil, Paiements, Activité | Dashboard financier en lecture | Appareils, langue ; biens/locataires/contrats accessibles comme contexte depuis la finance |
| Consultation | Destinations correspondant exactement au périmètre accordé | Lecture explicite seulement | Appareils, langue ; aucune extension implicite |

Règles :

- masquer une destination ne crée aucune permission et afficher une destination n’en élargit aucune ;
- un rôle limité atteint les ressources de contexte depuis sa tâche, sans obtenir les listes ou dossiers complets ;
- le gardien ne voit aucun onglet financier ;
- l’encaisseur ne voit ni Équipe, ni paramètres, ni administration portail ;
- l’audit reste invisible à tous sauf Owner.

## 5. Arborescence fonctionnelle interne

### 5.1 Accueil

- Organization et période active ;
- attendu, encaissé confirmé, restant et retards selon rôle ;
- activité récente autorisée ;
- raccourcis vers les ressources, pas vers Reporting avancé ;
- état vide guidant vers le premier bien pour Owner/gestionnaire.

### 5.2 Biens

- liste/recherche des biens ;
- détail bien ;
- unités du bien ;
- détail unité ;
- occupation et bail actif en contexte, selon permission.

### 5.3 Locataires

- liste/recherche des locataires ;
- détail locataire avec contacts filtrés ;
- contrats du locataire ;
- création/activation/clôture du bail ;
- administration de l’accès portail par Owner/gestionnaire.

### 5.4 Paiements

- vue par défaut centrée sur les échéances : en retard, dues, à venir et réglées ;
- recherche et filtres simples ;
- détail échéance ;
- saisie → résumé → confirmation du paiement ;
- détail paiement et demande de correction ;
- reçu, téléchargement et email contrôlé.

### 5.5 Activité

- onglet interne Notifications ;
- onglet interne Activité si la capacité existe ;
- accès Audit séparé pour Owner ;
- chaque entrée ouvre seulement une ressource encore autorisée dans l’Organization active.

## 6. Actions globales et contextuelles

### 6.1 Actions globales

Seules les actions indépendantes d’une ressource précise sont globales :

- changer d’Organization ;
- ouvrir profil/appareils/langue ;
- créer une Organization neuve ;
- consulter notifications/activité du contexte actif.

### 6.2 Actions contextuelles

| Contexte | Actions possibles selon permission |
|---|---|
| Liste des biens | Ajouter un bien |
| Détail bien | Modifier ; ajouter une unité |
| Détail unité | Modifier ; créer/ouvrir un contrat |
| Liste/détail locataire | Ajouter/modifier ; créer contrat ; administrer portail |
| Brouillon de contrat | Continuer ; abandonner ; revoir avant activation |
| Détail échéance | Enregistrer un paiement |
| Détail paiement | Voir reçu ; demander correction |
| Reçu | Télécharger ; envoyer par email contrôlé selon rôle |
| Preuve de paiement | Consulter depuis le paiement si le rôle y est autorisé |
| Logo | Ajouter, remplacer ou retirer depuis les paramètres Organization par Owner |
| Bail/document essentiel | Consulter depuis le bail lorsque la ressource existe et que le rôle y est autorisé |
| Membre | Révoquer ; transférer l’ownership avant dernier Owner |

Une action primaire flottante universelle n’est pas proposée : son sens changerait trop selon le rôle et l’écran.

## 7. Portail locataire — navigation

### 7.1 Barre mobile proposée

| Destination | Données visibles | Actions |
|---|---|---|
| Accueil | Organization/logement actifs, bail, attendu, payé, restant, statut, prochaine échéance | Changer de bail/accès, ouvrir le détail |
| Loyers | Échéances et paiements en lecture | Filtrer, ouvrir une échéance ou un paiement |
| Reçus | Reçus éligibles encore conservés | Ouvrir, télécharger |
| Compte | Langue, téléphone/email masqué, sessions/appareils personnels | Changer la langue, vérifier un nouveau canal, révoquer une session |

Le portail ne présente jamais d’action pour enregistrer un paiement, demander une correction, administrer un bail ou générer un lien public.

Les notifications ne sont pas un onglet principal. Une icône ou entrée légère ouvre le centre limité aux quatre catégories validées : échéance à venir, retard, paiement confirmé et reçu disponible. L’historique des paiements s’ouvre contextuellement depuis Accueil, Loyers ou Reçus.

### 7.2 Sélecteurs de contexte

- Un seul accès et un seul bail : contexte affiché, pas de sélecteur inutile.
- Plusieurs baux dans la même Organization : sélecteur de logement/bail, synthèse limitée à cette Organization.
- Plusieurs Organizations : sélection explicite de l’accès/Organization avant la sélection du bail ; remplacement complet des données.
- Un accès révoqué ou expiré disparaît de la navigation sans révéler le motif détaillé d’une autre Organization.

### 7.3 Compte portail

- préférence FR/EN ;
- téléphone/email masqué ;
- changement de canal avec vérifications confirmées ;
- sessions/appareils personnels et révocation ;
- aucune vue du journal technique ;
- aucune donnée d’une autre identité locataire.

### 7.4 Fin de bail

La coque demeure mais passe en mode historique lecture seule : bail terminé, paiements et reçus encore conservés. Les actions et notifications de bail actif disparaissent. Aucune copie portail ne prolonge les données.

## 8. Navigation desktop secondaire

Le desktop conserve la même architecture :

- rail gauche avec les destinations mobiles autorisées ;
- Organization active dans l’en-tête ;
- zone principale plus large ;
- panneau de détail ou maître-détail quand cela réduit les allers-retours ;
- espace secondaire accessible depuis le profil ;
- aucune destination ajoutée pour exposer les modules techniques.

Un grand tableau peut compléter une liste sur desktop, jamais devenir l’unique chemin fonctionnel.

## 9. Recherche, filtres et liens profonds

- Recherche locale au domaine courant : biens, locataires, échéances ou paiements ; pas de recherche globale inter-Organization au MVP.
- Filtres principaux visibles sous forme courte ; options secondaires dans une feuille.
- Tout résultat conserve l’Organization active et le périmètre du rôle.
- Un lien profond est résolu seulement après vérification du contexte et de l’autorisation.
- Si le lien appartient à une autre Organization accessible, l’utilisateur doit la sélectionner explicitement avant l’ouverture ; sinon refus sans révélation de données.

## 10. Vérification de couverture des écrans

| Groupe Lot 2 | Emplacement UX |
|---|---|
| SCR-AUTH-01 à 06 | Coque compte global |
| SCR-ORG-01 à 03 | Onboarding, sélecteur d’en-tête, espace secondaire |
| SCR-MEM-01 à 03 | Équipe Owner |
| SCR-DASH-01 | Accueil adapté au rôle |
| SCR-PROP-01 à 03, SCR-UNIT-01 à 03 | Biens et profondeur contextuelle |
| SCR-TEN-01 à 03 | Locataires |
| SCR-LEASE-01 à 04 | Depuis locataire/unité |
| SCR-DUE-01 à 02 | Paiements et bail |
| SCR-PAY-01 à 04, SCR-REC-01 à 02 | Paiements, échéance et reçu contextuel |
| SCR-NOTIF-01, SCR-ACT-01, SCR-AUD-01 | Activité et espace Owner |
| SCR-LANG-01 | Profil global |
| SCR-PORTAL-01 | Détail locataire interne |
| SCR-PORTAL-02 à 05 | Coque accès portail |
| SCR-PORTAL-06 à 12 | Coque portail locataire |

## 11. Arbitrages validés

Q-UX-L3-01 à Q-UX-L3-03 sont confirmées par D-069 à D-071. La navigation interne, la navigation portail et l’absence d’une destination Documents globale constituent la base validée du Lot 3.

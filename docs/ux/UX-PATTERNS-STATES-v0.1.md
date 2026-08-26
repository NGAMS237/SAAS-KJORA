# Kjora — Patterns UX et états v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Portée : règles fonctionnelles communes ; aucun composant implémenté, pixel ou maquette haute fidélité

## 1. Principes transversaux

- Toujours rendre visible le contexte actif : Organization interne ou accès/Organization et bail portail.
- Une page porte un objectif principal et une action primaire au plus.
- Les permissions filtrent l’expérience mais restent revérifiées au niveau fonctionnel.
- Les valeurs métier confirmées priment sur tout cache visuel, brouillon ou message.
- La couleur renforce un libellé, une icône et une valeur ; elle ne porte jamais seule le sens.
- Les patterns restent cohérents en FR/EN, thème clair/sombre et téléphone/desktop.
- Le portail et l’espace interne peuvent partager une grammaire visuelle, jamais leurs routes ou autorisations.

## 2. Cards KPI

### Usage

Afficher une petite sélection de valeurs opérationnelles : attendu, encaissé confirmé, restant, retards et activité récente.

### Règles

- Période active visible au-dessus du groupe.
- Libellé, montant XAF et éventuel nombre d’éléments.
- Une card ouvre la liste filtrée correspondante seulement si l’utilisateur y a accès.
- Aucune valeur remplacée par zéro lorsque sa source est indisponible ; afficher un état indisponible.
- Sur mobile : pile ou grille compacte de deux colonnes seulement si la lecture reste claire.
- Pour encaisseur et gardien : accueil adapté à leurs tâches, sans révéler les KPIs financiers interdits.

## 3. Listes

### Structure

Une ligne/carte contient : identité courte, information secondaire, statut, valeur utile et affordance d’ouverture. Les données répétées sont réduites mais le contexte nécessaire reste présent.

### Règles

- Tri par défaut pertinent et explicite.
- État vide au niveau de la liste, pas une table blanche.
- Chargement progressif sans déplacer l’action principale.
- Actions destructives ou sensibles jamais cachées dans un geste de balayage sans confirmation.
- Sur desktop, un tableau peut compléter la liste ; la version mobile reste la référence.

## 4. Recherche et filtres

- Recherche limitée au domaine et à l’Organization actifs.
- Champ de recherche visible sur les listes volumineuses : biens, locataires, échéances, paiements.
- Filtres fréquents sous forme de choix courts : statut, période, bien/logement.
- Filtres secondaires dans une bottom sheet ; compteur des filtres actifs.
- Action « Réinitialiser » et résumé des critères appliqués.
- Aucun résultat d’une autre Organization, même brièvement pendant le changement de contexte.
- Le portail filtre uniquement les baux et ressources explicitement autorisés.

## 5. Badges de statut

Un badge associe toujours :

- un libellé FR/EN ;
- une forme ou icône cohérente ;
- une sémantique visuelle lisible en clair/sombre ;
- une valeur dérivée ou un état de workflow défini.

Exemples non financiers : Brouillon, Actif, Clôturé, Vacant, Occupé, Invitation envoyée, Accès actif, Révoqué, Historique.

Un badge n’est pas un contrôle de saisie. Une mutation éventuelle passe par l’action métier autorisée.

## 6. Statuts financiers visuels

| Statut affiché | Condition fonctionnelle | Information obligatoire | Action éventuelle |
|---|---|---|---|
| À venir | Date d’échéance future et restant positif | attendu, payé confirmé, restant, date | Ouvrir ; afficher « bientôt dû » à J-5 au Cameroun sans changer arbitrairement le solde |
| Dû | Date d’échéance atteinte, pas encore au lendemain, restant positif | attendu, payé, restant, date | Enregistrer un paiement si autorisé |
| Partiellement payé | Au moins un paiement Completed alloué et restant positif ; le retard peut aussi être indiqué si la date est dépassée | attendu, payé confirmé, restant | Compléter le paiement si autorisé |
| Payé | Restant égal à zéro à partir de paiements Completed | attendu, payé confirmé, date de solde | Ouvrir paiement/reçu |
| En retard | À partir du lendemain de l’échéance avec restant positif | attendu, payé confirmé, restant, ancienneté/date | Enregistrer un paiement si autorisé |

Règles impératives :

- `PAYMENT_RECORDED` seul ne fait pas passer une échéance à Payé ;
- un paiement partiel ne masque jamais le restant ;
- « En retard » peut coexister avec l’information « partiellement payé » ; la priorité visuelle porte sur le retard et le détail conserve les deux faits ;
- aucun dropdown ne permet de choisir librement ces statuts ;
- une donnée incohérente produit un état d’erreur, pas un badge rassurant inventé ;
- le portail et l’espace interne dérivent leurs valeurs de la même vérité métier autorisée.

## 7. Formulaires

### Règles de base

- Champs indispensables avant facultatifs.
- Une question par groupe, labels persistants et exemples adaptés au Cameroun/XAF.
- Clavier approprié : email, téléphone, montant, OTP, PIN interne.
- Validation au bon moment : format pendant la saisie, règles métier avant le résumé, permissions à la confirmation.
- Valeurs facultatives clairement signalées ; preuve/logo non présent ne bloque pas une action qui ne l’exige pas.
- Sauvegarde de brouillon seulement lorsqu’elle est validée fonctionnellement, notamment pour le contrat.
- Un retour ne confirme jamais implicitement.

### Découpage mobile

- Bien/unité/locataire : écran court ou feuille lorsque le contexte parent est clair.
- Contrat : sections progressives avec résumé avant activation.
- Paiement : montant/date → moyen/référence/preuve → résumé → confirmation.
- Organization : minimum requis d’abord, profil complémentaire plus tard.

## 8. Bottom sheets et modales

### Bottom sheet

Adaptée aux choix courts et réversibles : filtres, moyen de paiement, langue, actions d’une ressource, sélection d’une Organization lorsque la liste est courte.

### Page ou modale de confirmation

Réservée à une décision qui doit rester lisible : paiement, activation/clôture de contrat, invitation/révocation, changement de contexte avec saisie en cours, révocation d’appareil/session.

Une feuille ne doit pas contenir un long formulaire caché, ni une action sensible sans contexte complet.

## 9. Confirmations et actions sensibles

| Action | Résumé avant confirmation | Après confirmation |
|---|---|---|
| Paiement | Organization, échéance, locataire, bien/unité, montant, date, moyen, acteur | État de traitement puis résultat vérifiable ; reçu seulement après Completed |
| Activation contrat | Unit, locataire, montant, périodicité, dates | Contrat actif et échéances exposées |
| Clôture contrat | Bail, date/effet connu | État clôturé ; portail historique selon décisions confirmées |
| Invitation membre | Organization, email, rôle, expiration 7 jours | Invitation en attente, aucune permission avant acceptation |
| Révocation membre | Identité, Organization, effet | Accès retiré ; dernier Owner protégé |
| Accès portail | Locataire, canal, Lease(s), Organization | Invitation/accès mis à jour sans Membership |
| Email reçu | Reçu, Organization, destinataire explicite | Succès ou échec communication indépendant |

Une action refusée affiche la raison utile sans dévoiler de politique interne, d’identifiant ou de données d’un autre tenant.

## 10. Empty states

Un état vide répond à trois questions : où suis-je, pourquoi est-ce vide, que puis-je faire ?

| Contexte | Message fonctionnel | Action autorisée |
|---|---|---|
| Organization sans bien | Aucun bien dans cette Organization | Ajouter un bien pour Owner/gestionnaire |
| Bien sans unité | Aucune unité enregistrée | Ajouter/préremplir une unité |
| Unité vacante | Aucun contrat actif | Créer un contrat si autorisé |
| Locataire sans contrat | Aucun bail associé | Créer un contrat si autorisé |
| Échéances absentes | Aucun loyer attendu pour le filtre/période | Changer le filtre ou ouvrir le bail |
| Reçus absents | Aucun paiement confirmé avec reçu disponible | Revenir aux paiements ; aucun CTA de création arbitraire |
| Notifications absentes | Rien ne requiert votre attention ici | Aucune action forcée |
| Portail historique sans reçu conservé | Aucun reçu encore disponible | Expliquer la disponibilité selon rétention sans copie |

Les rôles sans droit de création ne voient pas de CTA trompeur.

## 11. Loading

- Skeleton ou indicateur local reproduisant la structure attendue, sans fausse valeur.
- Bouton de confirmation bloqué pendant le traitement et libellé d’état explicite.
- Changement d’Organization : remplacer l’ancien contenu par un chargement neutre ; ne jamais l’afficher sous le nouveau nom.
- Paiement : distinguer « en cours de confirmation » d’un succès ; au retour réseau, vérifier l’état avant de proposer un nouvel envoi.
- Upload : progression, annulation si sûre, reprise/réessai explicite.

## 12. Erreurs

### Niveaux

- **Champ :** près de la donnée concernée, correction immédiate.
- **Section :** une partie indisponible sans masquer les autres données fiables.
- **Page :** ressource introuvable, inaccessible ou contexte invalide.
- **Action :** confirmation échouée, permission perdue ou règle métier bloquante.

### Contenu d’un message

- ce qui n’a pas abouti ;
- si une donnée métier a ou non été enregistrée ;
- action sûre suivante : corriger, réessayer, vérifier l’état ou revenir ;
- aucune donnée de l’Organization ou du locataire non autorisé.

## 13. Offline et erreur réseau — comportement conceptuel

- Bandeau « Hors connexion » non bloquant pour les lectures déjà affichées, avec fraîcheur visible.
- Aucune promesse d’un mode offline complet au MVP.
- Une action sensible requiert une confirmation réseau et métier ; l’interface ne montre jamais un paiement, une révocation ou une activation comme réussi sur la seule intention locale.
- Les données saisies peuvent rester visibles pendant la session afin de permettre le réessai, sans être présentées comme enregistrées.
- Après une coupure pendant confirmation, proposer « Vérifier l’état » avant « Réessayer » pour limiter les doublons.
- Aucun contenu d’une ancienne Organization n’est réutilisé après changement de contexte hors connexion.

## 14. Notifications

- Badge non lu limité au contexte actif.
- Dans le portail, une icône ou entrée légère ouvre le centre ; les notifications ne deviennent pas un cinquième onglet principal.
- Chaque notification porte un type rendu dans la langue courante, une date et une cible autorisée.
- Une notification n’embarque pas une phrase localisée dans le Domain Event.
- Ouvrir une notification revérifie l’accès à la ressource.
- Marquer lu/non lu ne modifie ni l’Event, ni Activity, ni Audit.
- Portail : seulement échéance à venir, retard, paiement confirmé et reçu disponible.
- Aucun centre configurable avancé ou SMS métier implicite.

## 15. Activity feed et Audit

### Activity

- Chronologie humaine de faits utiles ;
- acteur affiché seulement si permis ;
- accès à la ressource tenant-scoped ;
- filtres sobres par période/type si nécessaires.

### Audit

- Espace distinct visible uniquement par Owner ;
- actions sensibles administratives, de sécurité et d’intégrité financière ;
- pas de journal technique brut ;
- jamais fusionné avec le journal d’accès portail.

La vue portail interne reste synthétique : état d’accès, dernière connexion et « reçu consulté » seulement selon les décisions confirmées.

## 16. Permissions et refus

| Situation | Traitement UX |
|---|---|
| Action jamais permise au rôle | Masquée dans la navigation normale ; accès direct refusé |
| Action permise mais état métier incompatible | Visible désactivée avec explication et action possible |
| Permission retirée pendant le flow | Stopper avant confirmation, conserver une explication non sensible, retour sûr |
| Ressource autre Organization | Refus sans contenu, branding ou existence détaillée |
| Ressource autre locataire portail | Refus sans donnée de l’autre locataire |
| Session expirée | Revérification adaptée à la coque ; PIN interne seulement sur appareil autorisé, jamais portail |

Exemples obligatoires : encaisseur → Équipe refusé ; consultation → paiement refusé ; gestionnaire → correction financière directe refusée ; portail → route interne refusée.

## 17. Upload logo, preuve et artefact

### Logo Organization

- Facultatif pendant l’onboarding ; aperçu, remplacement et retrait depuis les paramètres autorisés.
- Validation de format/taille présentée sans imposer le logo.
- Reçu fonctionnel avec identité textuelle en l’absence de logo.

### Preuve de paiement

- Facultative pour les quatre moyens MVP.
- Afficher sélection, progression, succès/échec et possibilité de retirer avant confirmation.
- Toujours rattachée à l’Organization et au paiement concernés ; aucune visibilité au rôle non autorisé.

### Bail/document essentiel et reçu généré

- Consultation et téléchargement seulement après éligibilité.
- Email interne contrôlé sans lien public permanent.
- Portail : téléchargement uniquement ; partage éventuel par les fonctions de l’appareil.
- Un bail/document essentiel reste accessible depuis le contexte du bail lorsque nécessaire.

Aucun écran de bibliothèque de documents avancés n’est défini. Reçu, preuve, logo et bail/document essentiel restent rattachés à leur vérité métier ; une future vue Documents pourra les agréger sans en créer de copie.

## 18. Responsive desktop

- Rail latéral correspondant exactement aux destinations mobiles autorisées.
- En-tête avec Organization active et profil.
- Grilles KPI plus larges et panneaux maître-détail lorsque pertinents.
- Tableaux possibles pour comparer plusieurs lignes, avec alternative liste et ordre de lecture clair.
- Formulaires en deux colonnes seulement si l’ordre mobile reste évident.
- Modales limitées ; une opération longue ou sensible reste une page/étapes.
- Aucun hover requis pour découvrir une action essentielle.
- Aucun droit, champ ou fonction uniquement desktop.

## 19. Accessibilité et langage

- Cibles tactiles confortables et espacées ; actions critiques séparées.
- Contraste compatible avec thèmes clair/sombre ; statut jamais transmis par couleur seule.
- Ordre de lecture logique et labels accessibles pour icônes.
- Montants XAF, dates et fuseau affichés sans ambiguïté.
- Les textes s’adaptent à FR/EN sans troncature du sens ; les boutons portent un verbe.
- Les noms propres, références et données utilisateur ne sont pas traduits.

## 20. Contrôle de cohérence

- Aucun statut financier arbitrairement éditable.
- Aucun paiement affiché comme confirmé sans `PAYMENT_COMPLETED`.
- Aucun reçu final avant paiement confirmé.
- Aucune fusion entre notifications, communication, activité et audit.
- Aucune donnée inter-Organization pendant recherche, chargement ou changement de contexte.
- Aucun rôle interne ajouté pour le locataire.
- Aucun pattern de maintenance, chat, e-signature, paiement en ligne, Reporting ou documents avancés.
- Le mapping visuel final reste à appliquer dans un lot ultérieur autorisé.

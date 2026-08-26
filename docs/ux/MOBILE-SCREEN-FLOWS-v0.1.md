# Kjora — Flows d’écrans mobile v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Base : 50 écrans fonctionnels validés dans `SCREEN-INVENTORY-v0.1.md`  
> Principe : un écran fonctionnel peut devenir une page, une étape ou une feuille ; aucune capacité métier n’est supprimée

## 1. Convention commune

Chaque flow mobile suit, selon sa sensibilité :

- **simple** : point d’entrée → action courte → retour/succès ;
- **sensible** : saisie → résumé → confirmation explicite → résultat ;
- **lecture** : synthèse → détail → ressource reliée ;
- **refus** : aucune donnée sensible → message compréhensible → retour sûr.

Le nom de l’Organization active reste visible sur tout flow interne tenant-scoped. Le portail affiche l’accès/Organization et le bail/logement actifs. Changer ce contexte remplace la pile de données après contrôle des modifications non enregistrées.

## 2. Flows internes

### FLW-INT-01 — Création de compte et premier tenant

- **Point d’entrée :** accueil non authentifié ou invitation interne.
- **Écrans/étapes :** SCR-AUTH-01 → SCR-AUTH-02 → SCR-AUTH-03 → SCR-ORG-01 si aucun tenant, sinon Organization invitante.
- **Action principale :** vérifier l’email, autoriser le premier appareil, créer le PIN interne puis créer/ouvrir l’Organization.
- **Action secondaire :** changer de langue ; utiliser le mécanisme email alternatif ; compléter le profil plus tard.
- **Retour/navigation :** retour autorisé avant la vérification ; après création du tenant, Accueil devient racine.
- **Confirmation :** confirmation du PIN et résumé minimal de l’Organization.
- **Erreur :** format email, OTP/lien expiré, throttling, PIN non conforme, perte réseau ; aucune donnée tenant affichée.
- **Succès :** identité vérifiée, appareil autorisé, tenant neuf ou Membership accepté, contexte actif visible.

### FLW-INT-02 — Accès quotidien, nouvel appareil et récupération

- **Point d’entrée :** ouverture sur appareil connu, « PIN oublié » ou appareil inconnu.
- **Écrans/étapes :** SCR-AUTH-04 ; si nécessaire SCR-AUTH-05 → SCR-AUTH-02 → SCR-AUTH-03 ; gestion via SCR-AUTH-06.
- **Action principale :** déverrouiller par PIN sur appareil autorisé ou refaire une preuve forte.
- **Action secondaire :** changer de compte ; voir/révoquer ses appareils.
- **Retour/navigation :** succès vers dernière Organization encore autorisée ou sélecteur.
- **Confirmation :** révocation d’appareil et remplacement du PIN.
- **Erreur :** PIN incorrect/verrouillé, appareil révoqué, preuve expirée, Membership révoqué.
- **Succès :** session ouverte avec permissions recalculées ; appareil révoqué inutilisable avec son ancien PIN.

### FLW-INT-03 — Changement d’Organization, profil et langue

- **Point d’entrée :** nom de l’Organization active ou profil.
- **Écrans/étapes :** SCR-ORG-02 → nouvelle racine de navigation ; SCR-ORG-03 et SCR-LANG-01 depuis l’espace secondaire.
- **Action principale :** sélectionner l’Organization ou enregistrer sa préférence autorisée.
- **Action secondaire :** créer une Organization neuve ; compléter le profil ; gérer son langage.
- **Retour/navigation :** retour au contexte actuel si aucun choix ; après changement, remplacer toute la pile tenant.
- **Confirmation :** quitter un formulaire non enregistré ; paramètres sensibles Owner.
- **Erreur :** Membership révoqué, tenant inaccessible, données non enregistrées, permission insuffisante.
- **Succès :** nouveau contexte nommé, permissions et contenus entièrement recalculés, aucun reste visuel de l’ancien tenant.

### FLW-INT-04 — Dashboard / accueil de rôle

- **Point d’entrée :** onglet Accueil après connexion.
- **Écrans/étapes :** SCR-DASH-01 → détail d’un KPI, retard, paiement, reçu ou activité autorisé.
- **Action principale :** comprendre la période active et ouvrir le sujet prioritaire.
- **Action secondaire :** changer de période ; ajouter un bien dans l’état vide si autorisé.
- **Retour/navigation :** retour à l’Accueil avec période conservée.
- **Confirmation :** aucune pour la lecture ; toute action sensible ouverte suit son propre flow.
- **Erreur :** projection en chargement/indisponible, section refusée ; afficher les sections disponibles sans inventer de valeur.
- **Succès :** attendu, encaissé confirmé, restant, retards et activité adaptés au rôle.

### FLW-INT-05 — Création bien et unités

- **Point d’entrée :** onglet Biens ou état vide Accueil.
- **Écrans/étapes :** SCR-PROP-01 → SCR-PROP-02 → SCR-PROP-03 → SCR-UNIT-01 → SCR-UNIT-02 → SCR-UNIT-03.
- **Action principale :** créer un bien, puis son unité explicite.
- **Action secondaire :** rechercher, modifier, ajouter une autre unité, ouvrir le contrat actif.
- **Retour/navigation :** après création, revenir au détail du bien ; après unité, revenir à sa liste dans le bien.
- **Confirmation :** enregistrement du bien et de l’unité ; pas de confirmation financière.
- **Erreur :** requis absent, repère dupliqué, relation cross-tenant, connexion perdue.
- **Succès :** bien affiché, « Maison entière » préremplie si applicable, unités vacantes/occupées lisibles.

### FLW-INT-06 — Création et consultation locataire

- **Point d’entrée :** onglet Locataires, unité ou création de contrat.
- **Écrans/étapes :** SCR-TEN-01 → SCR-TEN-02 → SCR-TEN-03.
- **Action principale :** créer un locataire avec nom et téléphone ou email.
- **Action secondaire :** rechercher, modifier, créer un contrat, administrer l’accès portail si autorisé.
- **Retour/navigation :** succès vers le dossier ; retour au point d’origine possible pour sélectionner le locataire dans un contrat.
- **Confirmation :** résumé court avant création si plusieurs étapes.
- **Erreur :** contact absent/invalide, doublon potentiel à signaler sans décision automatique, refus tenant.
- **Succès :** dossier créé sans accès portail implicite.

### FLW-INT-07 — Équipe et délégation

- **Point d’entrée :** espace Organization secondaire, Owner seulement.
- **Écrans/étapes :** SCR-MEM-01 → SCR-MEM-02 ou SCR-MEM-03.
- **Action principale :** inviter avec un rôle fixe ou révoquer un Membership.
- **Action secondaire :** relancer une invitation en invalidant l’ancienne.
- **Retour/navigation :** retour à la liste avec états actualisés.
- **Confirmation :** invitation récapitulant Organization/rôle ; révocation ; transfert achevé avant dernier Owner.
- **Erreur :** email/rôle invalide, communication échouée, permission perdue, dernier Owner protégé.
- **Succès :** invitation 7 jours créée sans permission avant acceptation, ou accès révoqué.

### FLW-INT-08 — Invitation et administration du portail locataire

- **Point d’entrée :** dossier locataire.
- **Écrans/étapes :** SCR-PORTAL-01 sous forme de section puis feuille d’action pour inviter/relancer/révoquer.
- **Action principale :** choisir canal vérifiable et Lease(s), puis inviter.
- **Action secondaire :** relancer, révoquer, consulter l’état synthétique et la dernière connexion.
- **Retour/navigation :** retour au dossier locataire, sans basculer dans la coque portail.
- **Confirmation :** Organization, locataire, canal, baux autorisés et durée 7 jours ; révocation explicite.
- **Erreur :** canal absent, Lease d’un autre tenant, rôle non autorisé, communication échouée.
- **Succès :** Tenant Portal Access mis à jour, sans Membership interne ni copie métier.

### FLW-INT-09 — Création et activation du contrat

- **Point d’entrée :** dossier locataire ou détail unité.
- **Écrans/étapes :** SCR-LEASE-01 → SCR-LEASE-02 en courtes sections → SCR-LEASE-03 → SCR-LEASE-04.
- **Action principale :** associer Unit, locataire unique, montant, périodicité, dates, puis activer.
- **Action secondaire :** enregistrer le brouillon ; revenir modifier ; clôturer explicitement depuis le détail.
- **Retour/navigation :** retour vers le locataire ou l’unité d’origine ; le brouillon reste identifiable.
- **Confirmation :** activation et clôture explicites.
- **Erreur :** ressource cross-tenant, données manquantes, dates incohérentes, conflit ou permission perdue.
- **Succès :** Lease actif et échéances exposées ; aucune bibliothèque juridique avancée.

### FLW-INT-10 — Suivi des échéances

- **Point d’entrée :** Paiements, dashboard, bail ou notification.
- **Écrans/étapes :** SCR-DUE-01 → SCR-DUE-02 → paiement/reçu autorisé.
- **Action principale :** filtrer puis comprendre attendu, encaissé confirmé, restant et statut.
- **Action secondaire :** ouvrir le bail, les paiements associés ou démarrer l’enregistrement autorisé.
- **Retour/navigation :** retour à la liste avec filtres conservés.
- **Confirmation :** aucune pour la lecture.
- **Erreur :** projection indisponible, ressource refusée, montant incohérent ; ne jamais substituer une valeur supposée.
- **Succès :** état dérivé lisible : à venir, dû, partiel, payé ou en retard.

### FLW-INT-11 — Enregistrement d’un paiement total ou partiel

- **Point d’entrée :** détail d’une échéance avec restant positif.
- **Écrans/étapes :** SCR-PAY-01, regroupé en `montant/date` puis `moyen/référence/preuve` → SCR-PAY-02 résumé → SCR-PAY-03 résultat → SCR-REC-01 si éligible.
- **Action principale :** confirmer un paiement manuel.
- **Action secondaire :** revenir corriger la saisie ; abandonner avant confirmation.
- **Retour/navigation :** succès vers détail paiement puis reçu ; retour échéance avec chiffres recalculés.
- **Confirmation :** obligatoire, avec Organization, locataire, bien/unité, échéance, montant, date, moyen et acteur.
- **Erreur :** montant non positif ou supérieur au restant, échéance déjà soldée, preuve invalide, double soumission, permission perdue, réseau. Aucun succès affiché sans confirmation métier.
- **Succès :** `PAYMENT_RECORDED` puis `PAYMENT_COMPLETED` pour la saisie manuelle immédiatement confirmée ; restant mis à jour ; reçu autorisé seulement après Completed.

### FLW-INT-12 — Paiement partiel

- **Point d’entrée :** même détail d’échéance que FLW-INT-11.
- **Écrans/étapes :** SCR-PAY-01 → SCR-PAY-02 → SCR-PAY-03 → SCR-DUE-02.
- **Action principale :** confirmer un montant inférieur ou égal au restant.
- **Action secondaire :** utiliser le restant complet sans le dépasser.
- **Retour/navigation :** retour à l’échéance affichant le nouveau solde.
- **Confirmation :** même résumé financier complet que pour le paiement total.
- **Erreur :** dépassement bloqué avant confirmation ; surpaiement, crédit, remboursement ou transfert non proposés.
- **Succès :** badge « Partiellement payé », encaissé confirmé augmenté et restant strictement positif.

### FLW-INT-13 — Demande de correction

- **Point d’entrée :** détail paiement.
- **Écrans/étapes :** SCR-PAY-03 → SCR-PAY-04 → retour SCR-PAY-03.
- **Action principale :** saisir un motif et soumettre une demande.
- **Action secondaire :** annuler la demande avant soumission.
- **Retour/navigation :** paiement source toujours visible et inchangé.
- **Confirmation :** résumé du paiement concerné et du motif.
- **Erreur :** motif absent, doublon, rôle non autorisé, autre tenant.
- **Succès :** demande enregistrée ; aucune annulation, mutation, remboursement ou transfert exécuté.

### FLW-INT-14 — Reçu interne

- **Point d’entrée :** paiement Completed, échéance ou notification.
- **Écrans/étapes :** SCR-REC-01 → SCR-REC-02.
- **Action principale :** consulter puis télécharger ou envoyer par email contrôlé.
- **Action secondaire :** revenir au paiement ; retenter l’email si permis.
- **Retour/navigation :** retour au paiement/échéance sans perdre leur état.
- **Confirmation :** destinataire explicite et Organization avant email.
- **Erreur :** paiement non Completed, reçu indisponible, refus, email échoué ; échec de communication isolé.
- **Succès :** reçu tenant-brandé, fonctionnel sans logo ; paiement et reçu restent valides même si l’email échoue.

### FLW-INT-15 — Notifications, activité et audit

- **Point d’entrée :** Activité, badge non lu ou espace Owner.
- **Écrans/étapes :** SCR-NOTIF-01 ↔ SCR-ACT-01 ; SCR-AUD-01 séparé pour Owner.
- **Action principale :** ouvrir une ressource encore autorisée.
- **Action secondaire :** marquer une notification lue/non lue ; filtrer sobrement l’audit.
- **Retour/navigation :** retour au bon onglet et contexte tenant.
- **Confirmation :** aucune pour la lecture.
- **Erreur :** ressource devenue inaccessible, Membership révoqué, notification d’un autre tenant ; ne révéler aucune donnée.
- **Succès :** attention, chronologie et audit restent distincts.

## 3. Flows portail locataire

### FLW-TPA-01 — Activation du portail

- **Point d’entrée :** invitation reçue.
- **Écrans/étapes :** SCR-PORTAL-02 → SCR-PORTAL-03 → SCR-LANG-01 adapté au portail → SCR-PORTAL-07.
- **Action principale :** vérifier téléphone par OTP ou email par OTP/lien, puis activer la session.
- **Action secondaire :** renvoyer dans les limites ; changer de langue.
- **Retour/navigation :** après succès, Accueil portail devient racine ; aucun accès à la coque interne.
- **Confirmation :** acceptation de l’accès identifié ; aucun PIN demandé.
- **Erreur :** invitation après 7 jours, OTP après 10 minutes, lien après 15 minutes, jeton utilisé, accès révoqué.
- **Succès :** Tenant Portal Access actif et journal d’accès alimenté, sans Membership.

### FLW-TPA-02 — Compte, connexion ultérieure, récupération et coordonnées

- **Point d’entrée :** onglet Compte, retour portail, session expirée ou nouvel appareil.
- **Écrans/étapes :** SCR-PORTAL-04 → SCR-PORTAL-05 ; preuve forte si nécessaire.
- **Action principale :** reprendre la session 30 jours maximum ou revérifier le canal.
- **Action secondaire :** révoquer une session, changer téléphone/email.
- **Retour/navigation :** retour au dernier contexte encore autorisé.
- **Confirmation :** révocation ; ancien et nouveau canal vérifiés lors du changement normal.
- **Erreur :** session expirée, signal de risque, ancien canal inaccessible, accès révoqué.
- **Succès :** session ou canal mis à jour ; aucun PIN locataire.

### FLW-TPA-03 — Sélection d’accès et accueil

- **Point d’entrée :** connexion ou sélecteur de contexte.
- **Écrans/étapes :** SCR-PORTAL-06 → SCR-PORTAL-07 → SCR-PORTAL-08.
- **Action principale :** choisir explicitement Organization puis bail/logement et consulter le résumé.
- **Action secondaire :** changer de bail dans la même Organization ou ouvrir l’échéance.
- **Retour/navigation :** changement d’Organization remplace la pile complète ; retour au sélecteur sans agrégation.
- **Confirmation :** aucune pour lecture ; sélection explicite avant changement d’Organization.
- **Erreur :** accès révoqué, Lease non relié, ressource d’un autre locataire ou tenant.
- **Succès :** attendu, payé confirmé, restant et statut issus de la vérité métier autorisée.

### FLW-TPA-04 — Loyers et paiements en lecture

- **Point d’entrée :** onglet Loyers, Accueil, Reçus ou notification.
- **Écrans/étapes :** SCR-PORTAL-09 → SCR-PORTAL-10 → reçu autorisé.
- **Action principale :** consulter les échéances puis leurs paiements confirmés.
- **Action secondaire :** filtrer simplement ; changer de bail autorisé.
- **Retour/navigation :** retour à la liste avec contexte et filtre conservés.
- **Confirmation :** aucune ; aucune action financière disponible.
- **Erreur :** donnée non reliée, session expirée, accès historique limité, autre Organization.
- **Succès :** situation lisible sans copie portail et sans capacité de paiement en ligne.

### FLW-TPA-05 — Reçus et historique de fin de bail

- **Point d’entrée :** onglet Reçus, paiement ou notification.
- **Écrans/étapes :** SCR-PORTAL-11, avec SCR-PORTAL-08 en mode historique après fin du bail.
- **Action principale :** ouvrir et télécharger un reçu autorisé.
- **Action secondaire :** utiliser ensuite le partage natif de l’appareil hors serveur Kjora.
- **Retour/navigation :** retour à la liste des reçus ou au bail historique.
- **Confirmation :** aucune pour consultation ; téléchargement explicite.
- **Erreur :** reçu hors rétention, paiement non Completed, accès révoqué, autre locataire/tenant.
- **Succès :** état synthétique « reçu consulté » possible ; aucun lien public et aucune copie de conservation.

### FLW-TPA-06 — Centre de notifications locataire

- **Point d’entrée :** icône/entrée légère de notifications ou badge non lu ; aucun onglet principal dédié.
- **Écrans/étapes :** SCR-PORTAL-12 → SCR-PORTAL-09, SCR-PORTAL-10 ou SCR-PORTAL-11 selon la cible.
- **Action principale :** ouvrir la ressource autorisée.
- **Action secondaire :** marquer lu/non lu.
- **Retour/navigation :** retour à la liste du même accès/Organization.
- **Confirmation :** aucune.
- **Erreur :** ressource inaccessible après révocation ou rétention, notification d’un autre contexte ; aucun détail révélé.
- **Succès :** seulement échéance à venir, retard, paiement confirmé et reçu disponible, rendus dans la bonne langue.

## 4. Registre de couverture des 50 écrans

Chaque ID apparaît dans un flow principal. Un flow peut ouvrir un écran déjà couvert sans créer un doublon fonctionnel.

| Flow principal | Écrans Lot 2 couverts | Nombre |
|---|---|---:|
| FLW-INT-01 | SCR-AUTH-01, SCR-AUTH-02, SCR-AUTH-03, SCR-ORG-01 | 4 |
| FLW-INT-02 | SCR-AUTH-04, SCR-AUTH-05, SCR-AUTH-06 | 3 |
| FLW-INT-03 | SCR-ORG-02, SCR-ORG-03, SCR-LANG-01 | 3 |
| FLW-INT-04 | SCR-DASH-01 | 1 |
| FLW-INT-05 | SCR-PROP-01, SCR-PROP-02, SCR-PROP-03, SCR-UNIT-01, SCR-UNIT-02, SCR-UNIT-03 | 6 |
| FLW-INT-06 | SCR-TEN-01, SCR-TEN-02, SCR-TEN-03 | 3 |
| FLW-INT-07 | SCR-MEM-01, SCR-MEM-02, SCR-MEM-03 | 3 |
| FLW-INT-08 | SCR-PORTAL-01 | 1 |
| FLW-INT-09 | SCR-LEASE-01, SCR-LEASE-02, SCR-LEASE-03, SCR-LEASE-04 | 4 |
| FLW-INT-10 | SCR-DUE-01, SCR-DUE-02 | 2 |
| FLW-INT-11 | SCR-PAY-01, SCR-PAY-02, SCR-PAY-03 | 3 |
| FLW-INT-13 | SCR-PAY-04 | 1 |
| FLW-INT-14 | SCR-REC-01, SCR-REC-02 | 2 |
| FLW-INT-15 | SCR-NOTIF-01, SCR-ACT-01, SCR-AUD-01 | 3 |
| FLW-TPA-01 | SCR-PORTAL-02, SCR-PORTAL-03 | 2 |
| FLW-TPA-02 | SCR-PORTAL-04, SCR-PORTAL-05 | 2 |
| FLW-TPA-03 | SCR-PORTAL-06, SCR-PORTAL-07, SCR-PORTAL-08 | 3 |
| FLW-TPA-04 | SCR-PORTAL-09, SCR-PORTAL-10 | 2 |
| FLW-TPA-05 | SCR-PORTAL-11 | 1 |
| FLW-TPA-06 | SCR-PORTAL-12 | 1 |
| **Total** | **50 identifiants uniques** | **50** |

FLW-INT-12 est une variante métier de FLW-INT-11 utilisant les mêmes écrans et n’ajoute aucun écran à compter.

## 5. Règles de transition et de refus

- Un flow commencé dans Org A ne peut pas être confirmé après passage à Org B.
- Une permission est revérifiée à l’entrée et à la confirmation d’une action sensible.
- Un retour depuis un reçu ramène au paiement/échéance de la même Organization.
- Une notification dont la ressource n’est plus autorisée aboutit à un état indisponible sans contenu sensible.
- Une double soumission ne produit jamais deux succès affichés.
- Une perte réseau ne transforme jamais une intention en fait confirmé ; le résultat reste en attente de vérification ou en erreur.
- Le portail ne peut jamais ouvrir une route interne, même avec une URL connue.
- La fin du bail remplace les flows actifs du portail par l’historique lecture seule.

## 6. Portée

Aucun flow de maintenance, chat, signature électronique, paiement en ligne, automatisation Mobile Money, Reporting avancé ou documents avancés n’est défini. Il n’existe aucune bibliothèque documentaire parallèle : reçu, preuve, logo et bail/document essentiel restent contextuels. Un futur module Documents pourra présenter les mêmes ressources sans les dupliquer. Leur ajout futur devra s’intégrer comme capacité validée sans altérer les flows MVP ci-dessus.

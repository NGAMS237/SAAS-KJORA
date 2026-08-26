# Kjora — Parcours utilisateurs MVP v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Lot : **Lot 2 — Parcours et périmètre MVP**  
> Référence : décisions confirmées D-021 à D-068  
> Portée : parcours fonctionnels mobile-first, sans design ni implémentation

## 1. Règles de lecture

- Les capacités internes suivent la matrice validée D-040 ; le portail utilise un `Tenant Portal Access` distinct.
- Une étape tenant-scoped utilise toujours l’Organization active, un Membership actif et une capacité valide.
- Un écran masqué ne suffit pas à sécuriser une action : une action non autorisée aboutit à **REFUS**.
- Aucun événement supplémentaire n’est inventé. Lorsqu’un parcours n’a pas d’event parmi les dix du Lot 1, la mention est « aucun event métier v0.1 ».
- `NOTIFICATION`, `COMMUNICATION`, `ACTIVITY` et `AUDIT` ne sont jamais utilisés comme synonymes d’`EVENT`.
- Les critères détaillés et identifiants testables sont consolidés dans `MVP-SCOPE-ACCEPTANCE-v0.1.md`.

## 2. JRN-AUTH-01 — Créer un compte et autoriser le premier appareil

- **Acteur :** nouvel utilisateur.
- **Préconditions :** email accessible ; appareil non encore autorisé.
- **Déclencheur :** l’utilisateur choisit de créer son compte ou accepte une invitation.
- **Étapes :**
  1. saisir l’email ;
  2. recevoir le mécanisme email principal du contexte, OTP ou lien sécurisé, avec l’autre comme alternative/récupération ;
  3. vérifier l’email ;
  4. autoriser le premier appareil après preuve forte ;
  5. créer puis confirmer un PIN à 6 chiffres ;
  6. arriver sur la création d’Organization ou l’Organization invitante selon le contexte.
- **Résultat attendu :** identité établie, appareil autorisé, PIN disponible pour l’accès quotidien seulement.
- **Permissions nécessaires :** aucune permission tenant avant Membership ; preuve forte requise.
- **Events produits :** aucun event métier v0.1.
- **Notifications éventuelles :** message Auth hors catalogue métier ; aucun fournisseur défini.
- **Erreurs possibles :** email invalide, OTP/lien expiré, trop de tentatives, PIN non conforme, perte de connexion. Throttling, verrouillage et reprise doivent être compréhensibles.
- **Critères d’acceptation :** le PIN ne peut être créé avant vérification forte ; aucun accès métier n’est accordé sans Membership ; aucune donnée d’une Organization n’apparaît pendant la création globale du compte.

## 3. JRN-AUTH-02 — Connexion quotidienne par PIN

- **Acteur :** utilisateur avec appareil autorisé.
- **Préconditions :** compte vérifié, appareil non révoqué, PIN actif sur cet appareil.
- **Déclencheur :** ouverture de Kjora après expiration de l’accès quotidien.
- **Étapes :** identifier localement le compte, saisir le PIN, appliquer les limites de tentatives, ouvrir la dernière Organization autorisée ou le sélecteur.
- **Résultat attendu :** accès quotidien accordé sans refaire la preuve email, tant que l’appareil reste autorisé.
- **Permissions nécessaires :** identité reconnue ; les permissions tenant sont recalculées après connexion.
- **Events produits :** aucun event métier v0.1.
- **Notifications éventuelles :** aucune notification métier.
- **Erreurs possibles :** PIN incorrect, verrouillage, appareil révoqué, Membership révoqué, Organization mémorisée devenue inaccessible.
- **Critères d’acceptation :** le PIN seul ne permet pas une récupération, l’autorisation d’un nouvel appareil ni une action exigeant une preuve forte ; un Membership révoqué reste inaccessible malgré un PIN correct.

## 4. JRN-AUTH-03 — Nouvel appareil, PIN oublié, récupération et révocation

- **Acteur :** utilisateur du compte.
- **Préconditions :** email du compte accessible pour nouvel appareil/récupération ; session autorisée pour révocation normale.
- **Déclencheur :** connexion depuis un appareil inconnu, action « PIN oublié », récupération du compte ou choix « Révoquer l’appareil ».
- **Étapes :**
  1. demander une preuve forte par email + OTP/lien ;
  2. vérifier la preuve ;
  3. pour un nouvel appareil, l’autoriser puis créer son PIN ;
  4. pour PIN oublié, remplacer le PIN de l’appareil après preuve forte ;
  5. pour révocation, confirmer l’appareil ciblé et exiger une nouvelle preuve forte si l’action est sensible ;
  6. refuser tout accès quotidien futur depuis l’appareil révoqué.
- **Résultat attendu :** récupération contrôlée ou révocation effective sans utiliser le PIN comme preuve forte.
- **Permissions nécessaires :** contrôle du propre compte ; réauthentification forte pour l’action sensible.
- **Events produits :** aucun event métier v0.1.
- **Notifications éventuelles :** aucune notification métier ; les communications de sécurité restent distinctes.
- **Erreurs possibles :** email inaccessible, preuve expirée, appareil déjà révoqué, dernière preuve forte indisponible.
- **Critères d’acceptation :** l’appareil révoqué ne peut plus ouvrir de session par son ancien PIN ; une récupération ne confère aucun Membership supplémentaire.

## 5. JRN-ORG-01 — Créer et configurer une Organization

- **Acteur :** utilisateur vérifié agissant comme futur `Organization Owner`.
- **Préconditions :** JRN-AUTH-01 réussi ; aucune Organization active requise pour cette création initiale.
- **Déclencheur :** premier démarrage propriétaire ou action explicite de création d’une nouvelle Organization.
- **Étapes :**
  1. saisir le nom de l’Organization ;
  2. confirmer Cameroun, XAF, langue FR/EN et fuseau ;
  3. proposer téléphone, email et adresse comme compléments facultatifs ;
  4. ajouter facultativement nom légal, informations de paiement et informations destinées aux reçus/documents ;
  5. ajouter un logo ou choisir « Plus tard » ;
  6. vérifier le résumé et créer le tenant ;
  7. devenir `Organization Owner` via un Membership actif propre à ce tenant.
- **Résultat attendu :** Organization autonome sélectionnée comme active et dashboard vide disponible.
- **Permissions nécessaires :** identité vérifiée ; tout User vérifié peut créer un tenant neuf.
- **Events produits :** aucun event métier v0.1.
- **Notifications éventuelles :** aucune notification métier par défaut.
- **Erreurs possibles :** nom absent, langue/fuseau manquant, logo invalide, interruption ; les données valides ne doivent pas être perdues.
- **Critères d’acceptation :** logo absent n’empêche pas la création ; pays/devise restent issus de la configuration initiale ; aucune donnée d’une autre Organization n’est copiée.

## 6. JRN-ORG-02 — Sélectionner et changer l’Organization active

- **Acteur :** utilisateur avec plusieurs Memberships actifs.
- **Préconditions :** identité établie et au moins deux Organizations accessibles.
- **Déclencheur :** connexion ou action sur l’indicateur d’Organization active.
- **Étapes :** lister uniquement les Organizations accessibles, sélectionner une Organization, revalider le Membership, recalculer le rôle/capacités, remplacer toutes les données affichées par celles du nouveau tenant.
- **Résultat attendu :** une seule Organization active, clairement nommée dans l’interface.
- **Permissions nécessaires :** Membership actif dans l’Organization ciblée.
- **Events produits :** aucun event métier v0.1.
- **Notifications éventuelles :** le centre affiche uniquement les notifications du tenant actif.
- **Erreurs possibles :** Membership révoqué entre liste et sélection, lien profond d’un autre tenant, données en cours de chargement, action non enregistrée au changement.
- **Critères d’acceptation :** aucune vue consolidée ; aucune permission de l’ancien tenant n’est réutilisée ; un lien de Org B avec Org A active est refusé ou propose une sélection explicite sans révéler B.

## 7. JRN-MEM-01 — Inviter, voir et révoquer un membre

- **Acteur :** `Organization Owner`.
- **Préconditions :** Organization active ; Membership Owner actif.
- **Déclencheur :** ouverture de l’équipe.
- **Étapes :**
  1. consulter membres et invitations du tenant actif ;
  2. saisir l’email du futur membre ;
  3. choisir exactement un rôle fixe ;
  4. confirmer l’invitation ;
  5. informer que l’invitation expire après 7 jours ; une relance invalide l’ancienne invitation active correspondante ;
  6. après acceptation, voir le Membership actif ;
  7. avant de révoquer le dernier Owner, terminer le transfert vers un autre User vérifié ;
  8. sélectionner un membre puis confirmer la révocation.
- **Résultat attendu :** invitation tenant-scoped ou Membership révoqué ; aucune permission héritée d’un autre tenant.
- **Permissions nécessaires :** `member.view` et `member.manage`, réservées à l’Owner pour invitation/révocation.
- **Events produits :** aucun event métier du catalogue v0.1 pour une invitation ou une révocation de Membership ; l’audit administratif conserve l’action sensible.
- **Notifications éventuelles :** communication d’invitation Auth expirant après 7 jours ; relance possible.
- **Erreurs possibles :** email invalide, rôle absent, invitation existante, membre déjà actif, transfert du dernier Owner incomplet, communication échouée.
- **Critères d’acceptation :** encaisseur/gestionnaire/consultation ne peuvent pas inviter ni révoquer ; une communication échouée n’active pas silencieusement un Membership ; un Membership révoqué perd immédiatement les accès tenant.

## 8. JRN-PROP-01 — Créer un bien et ses unités

- **Acteur :** Owner ; gestionnaire.
- **Préconditions :** Organization active ; capacité `property.manage` ; pour les unités, `unit.manage`.
- **Déclencheur :** état vide « Aucun bien » ou action « Ajouter un bien ».
- **Étapes :**
  1. saisir nom/repère, ville/localité et type minimal du bien ;
  2. confirmer la création ;
  3. pour une maison entière, créer ou préremplir une unité explicite « Maison entière » ;
  4. pour un immeuble, créer une ou plusieurs unités avec repère et type minimal ;
  5. consulter le bien et la liste de ses unités ;
  6. afficher chaque unité sans contrat actif comme vacante.
- **Résultat attendu :** bien et unités tenant-scoped consultables.
- **Permissions nécessaires :** `property.view/manage`, `unit.view/manage` selon l’action.
- **Events produits :** `PROPERTY_CREATED` après création du bien ; aucun event Unit dans le catalogue v0.1.
- **Notifications éventuelles :** aucune par défaut ; Activity et Audit proposés.
- **Erreurs possibles :** champ requis absent, repère d’unité déjà utilisé, tentative de relation cross-tenant, perte de connexion.
- **Critères d’acceptation :** l’organisation vide guide vers ce parcours ; un bien sans locataire reste valide ; une unité vacante est identifiable ; aucune fonction patrimoniale avancée n’est introduite.

## 9. JRN-TEN-01 — Créer et consulter un locataire

- **Acteur :** Owner ; gestionnaire.
- **Préconditions :** Organization active ; capacité `tenant.manage`.
- **Déclencheur :** action « Ajouter un locataire » depuis la liste, l’unité ou le parcours contrat.
- **Étapes :** saisir le nom obligatoire, saisir au moins téléphone ou email, ajouter éventuellement le second contact et la langue préférée, vérifier le résumé, créer et consulter le dossier ; ne créer aucun accès portail implicitement.
- **Résultat attendu :** locataire tenant-scoped sélectionnable dans un contrat.
- **Permissions nécessaires :** `tenant.view` pour consulter ; `tenant.manage` pour créer/modifier.
- **Events produits :** `TENANT_CREATED`.
- **Notifications éventuelles :** aucune par défaut ; Activity et Audit proposés.
- **Erreurs possibles :** nom absent, contact invalide, doublon potentiel, données personnelles excessives, ressource d’un autre tenant.
- **Critères d’acceptation :** informations indispensables et facultatives sont distinguées ; aucune pièce d’identité n’est exigée par défaut ; un acteur sans `tenant.manage` ne crée pas de dossier.

## 10. JRN-LEASE-01 — Créer, enregistrer et activer un contrat

- **Acteur :** Owner ; gestionnaire.
- **Préconditions :** Organization active ; unité et locataire du même tenant ; capacité `lease.manage`.
- **Déclencheur :** action « Créer un contrat ».
- **Étapes :** sélectionner l’Unit explicite, sélectionner l’unique locataire titulaire, saisir montant XAF, périodicité mensuelle/trimestrielle/semestrielle/annuelle, date de début et règle/date d’échéance, ajouter une date de fin facultative, enregistrer le brouillon, revoir le résumé, activer ; permettre ensuite une clôture explicite.
- **Résultat attendu :** contrat actif lié à une unité et un locataire, avec loyer attendu généré/exposé.
- **Permissions nécessaires :** `lease.view/manage` ; Owner et gestionnaire peuvent préparer et activer selon la matrice validée.
- **Events produits :** `LEASE_ACTIVATED` ; `RENT_DUE_CREATED` est ensuite produit par Rent/Dues pour chaque échéance créée.
- **Notifications éventuelles :** in-app Owner/gestionnaire ; le locataire portail reçoit uniquement les notifications essentielles confirmées.
- **Erreurs possibles :** unité/locataire cross-tenant, données essentielles absentes, contrat actif concurrent dont la règle reste une décision future, date incohérente, activation sans permission.
- **Critères d’acceptation :** brouillon ne crée pas un contrat actif ; activation nécessite confirmation ; aucun reçu/paiement n’est créé ; bibliothèque juridique avancée absente.

## 11. JRN-DUE-01 — Suivre une échéance et ses états

- **Acteur :** Owner ; gestionnaire, encaisseur, comptable et consultation selon matrice proposée.
- **Préconditions :** contrat actif et échéance tenant-scoped.
- **Déclencheur :** création d’échéance, arrivée de date ou consultation.
- **Étapes :** afficher attendu, encaissé confirmé, restant et date ; appliquer l’état à venir/due ; après paiement confirmé recalculer partiel/payé ; si la date de retard définie est dépassée avec restant positif, afficher en retard.
- **Résultat attendu :** état compréhensible sans reconstruire les paiements.
- **Permissions nécessaires :** `rent_due.view` ; aucune correction d’échéance au MVP.
- **Events produits :** `RENT_DUE_CREATED`, `RENT_DUE_SOON` 5 jours avant l’échéance et `RENT_OVERDUE` à partir du lendemain si un restant subsiste.
- **Notifications éventuelles :** bientôt due et retard pour les rôles internes concernés et le locataire portail autorisé.
- **Erreurs possibles :** donnée de projection indisponible, paiement enregistré mais non confirmé, montant incohérent.
- **Critères d’acceptation :** seul le confirmé alimente encaissé ; partiel laisse un restant positif ; payé affiche restant zéro ; retard n’est pas déclenché si aucun solde ne reste.

## 12. JRN-PAY-01 — Enregistrer un paiement total ou partiel

- **Acteur :** Owner, gestionnaire et encaisseur.
- **Préconditions :** Organization active ; échéance visible du même tenant ; capacité `payment.record`; montant restant positif.
- **Déclencheur :** action « Enregistrer un paiement » depuis l’échéance.
- **Étapes :**
  1. sélectionner/confirmer l’échéance ;
  2. saisir un montant positif ;
  3. saisir la date ;
  4. choisir espèces, MTN Mobile Money, Orange Money ou virement ;
  5. saisir provider/moyen, référence et preuve facultatives lorsque pertinent ;
  6. afficher un résumé avec Organization, locataire, bien/unité, échéance, montant, moyen, date et acteur ;
  7. confirmer explicitement ;
  8. produire `PAYMENT_RECORDED` ;
  9. si la saisie manuelle est confirmée immédiatement, produire ensuite `PAYMENT_COMPLETED` dans la même opération fonctionnelle ;
  10. recalculer encaissé/restant et rendre le reçu éligible.
- **Résultat attendu :** paiement source consultable, échéance payée ou partiellement payée, reçu final générable.
- **Permissions nécessaires :** `payment.record`; `payment.view` pour consulter ; aucune capacité n’est héritée d’un autre tenant.
- **Events produits :** `PAYMENT_RECORDED`, puis `PAYMENT_COMPLETED`.
- **Notifications éventuelles :** saisie et confirmation proposées aux rôles concernés ; pas de phrase stockée dans l’event.
- **Erreurs possibles :** montant nul/négatif, montant supérieur au restant bloqué, date invalide, échéance déjà payée, preuve invalide, double soumission, perte de permission, cross-tenant.
- **Critères d’acceptation :** écran résumé obligatoire ; consultation ne peut pas confirmer ; paiement partiel met à jour le restant ; aucun reçu final après seul `PAYMENT_RECORDED`; Mobile Money reste manuel.

## 13. JRN-PAY-02 — Demander une correction

- **Acteur :** Owner, gestionnaire, encaisseur ou comptable selon la matrice validée.
- **Préconditions :** paiement existant dans l’Organization active ; aucune correction directe autorisée par défaut.
- **Déclencheur :** constat d’une erreur de montant, date, moyen, échéance ou locataire.
- **Étapes :** ouvrir le paiement, choisir « Demander une correction », indiquer le motif sans modifier le paiement source et soumettre pour examen. Toute correction effective future reste hors MVP et devra être autorisée, motivée et auditée.
- **Résultat attendu :** erreur signalée de façon traçable ; aucune mutation silencieuse.
- **Permissions nécessaires :** lecture du paiement et capacité de demande ; aucune capacité de correction directe au MVP.
- **Events produits :** aucun event de correction dans le catalogue v0.1 ; ne pas réutiliser `PAYMENT_RECORDED` pour masquer une correction.
- **Notifications éventuelles :** aucune nouvelle notification imposée ; la demande reste traçable.
- **Erreurs possibles :** paiement d’un autre tenant, demande en doublon, motif absent, tentative d’annulation/remboursement/transfert.
- **Critères d’acceptation :** le paiement original reste visible et inchangé ; correction effective, annulation, remboursement, transfert et surpaiement sont hors MVP.

## 14. JRN-REC-01 — Générer, consulter et partager un reçu

- **Acteur :** rôles disposant de `receipt.view` ; Owner, gestionnaire et encaisseur disposent de l’envoi contrôlé selon la matrice validée.
- **Préconditions :** paiement `PAYMENT_COMPLETED` du tenant actif.
- **Déclencheur :** achèvement du paiement ou action « Voir le reçu ».
- **Étapes :** générer le reçu dérivé, appliquer nom/logo/informations de l’Organization, inclure paiement/locataire/bien-unité/date/montant/moyen, consulter, télécharger ou choisir l’email contrôlé, saisir un destinataire explicite, revérifier permission et Organization, puis suivre succès ou échec séparément.
- **Résultat attendu :** reçu final tenant-brandé ; absence de logo remplacée par une présentation texte fonctionnelle.
- **Permissions nécessaires :** `receipt.view`, `receipt.generate`, `receipt.share` selon attribution proposée.
- **Events produits :** `RECEIPT_GENERATED`; `DOCUMENT_SHARED` seulement après un partage effectivement terminé.
- **Notifications éventuelles :** reçu disponible ; communication email indépendante si activée.
- **Erreurs possibles :** paiement non confirmé, artefact indisponible, logo absent, email invalide, communication en échec, destinataire non autorisé.
- **Critères d’acceptation :** aucun reçu final avant `PAYMENT_COMPLETED`; montant du reçu reflète le paiement sans le modifier ; échec email n’annule ni paiement ni reçu.

## 15. JRN-DASH-01 — Consulter le dashboard opérationnel

- **Acteur :** Owner ; lectures déléguées selon matrice proposée.
- **Préconditions :** Organization active ; capacité de lecture des indicateurs concernés.
- **Déclencheur :** ouverture de l’accueil tenant.
- **Étapes :** afficher l’Organization active et le mois courant par défaut, rendre la période active visible, permettre une navigation simple vers une autre période utile, calculer attendu, encaissé confirmé, restant, retards et activité récente, proposer l’action suivante pertinente.
- **Résultat attendu :** compréhension opérationnelle immédiate sans Reporting avancé.
- **Permissions nécessaires :** capacités de lecture des domaines projetés ; aucune agrégation inter-tenant.
- **Events produits :** aucun.
- **Notifications éventuelles :** raccourci vers notifications non lues du tenant actif.
- **Erreurs possibles :** organisation vide, projection en chargement, section indisponible, données sans fraîcheur explicite, changement de tenant en cours.
- **Critères d’acceptation :** état vide guide vers « Ajouter un bien » ; encaissé ne compte que `PAYMENT_COMPLETED`; présence de retard est visible ; aucune fonction de Reporting avancé.

## 16. JRN-NOTIF-01 — Consulter notifications, activité et audit

- **Acteur :** membre autorisé ; audit réservé à `Organization Owner`.
- **Préconditions :** Organization active et Membership actif.
- **Déclencheur :** ouverture du centre de notifications, du fil d’activité ou de l’audit.
- **Étapes :** lister les éléments du tenant actif, ouvrir une notification vers sa ressource autorisée, marquer lu/non lu, consulter la chronologie, consulter l’audit seulement si permis.
- **Résultat attendu :** attention, chronologie et contrôle restent séparés.
- **Permissions nécessaires :** lecture de notification tenant-scoped ; `activity.view` selon rôle ; `audit.view` réservé à Owner.
- **Events produits :** aucun event métier supplémentaire.
- **Notifications éventuelles :** dérivées des events retenus ; destinataires recalculés selon permissions actuelles.
- **Erreurs possibles :** ressource supprimée/inaccessible, Membership révoqué, notification d’un autre tenant, doublon, communication échouée.
- **Critères d’acceptation :** supprimer/lire une notification ne supprime ni Activity ni Audit ; une communication échouée ne change pas le fait métier ; aucun mélange inter-tenant.

## 17. JRN-LANG-01 — Choisir et changer FR/EN

- **Acteur :** tout utilisateur.
- **Préconditions :** aucune pour le choix initial ; session pour mémoriser la préférence.
- **Déclencheur :** premier accès ou action « Langue ».
- **Étapes :** proposer FR/EN, appliquer la langue, mémoriser la préférence utilisateur, rerendre les libellés et messages ; utiliser pour les communications la préférence du destinataire puis la langue de l’Organization.
- **Résultat attendu :** interface cohérente dans la langue choisie sans changer les données métier.
- **Permissions nécessaires :** aucune capacité métier pour sa propre préférence ; paramètres Organization sensibles distincts.
- **Events produits :** aucun event métier v0.1 ; les events conservent types et données, jamais des phrases FR/EN.
- **Notifications éventuelles :** rendues dans la langue utilisateur au moment de l’affichage.
- **Erreurs possibles :** traduction manquante, mélange de langues, communication sans langue destinataire connue.
- **Critères d’acceptation :** bascule FR/EN sans changement de tenant ; nombres/dates/devise rendus selon contexte ; event inchangé quelle que soit la langue.

## 18. JRN-SEC-01 — Refuser un accès ou une action non autorisée

- **Acteur :** tout utilisateur authentifié ou non-membre.
- **Préconditions :** ressource ou action tenant-scoped.
- **Déclencheur :** lien direct, appel fonctionnel, écran masqué contourné ou changement de rôle/Membership.
- **Étapes :** identifier l’Organization de la ressource, vérifier l’Organization active, le Membership actif et la capacité, refuser si une condition manque, ne révéler aucune donnée métier, proposer un retour sûr.
- **Résultat attendu :** refus par défaut sans effet métier.
- **Permissions nécessaires :** toutes les conditions doivent être satisfaites ; absence d’une seule condition = refus.
- **Events produits :** aucun event métier ; les refus sensibles couverts par la politique d’audit restent traçables.
- **Notifications éventuelles :** aucune par défaut.
- **Erreurs possibles :** Org A ouvre ressource B, Organization active incorrecte, rôle insuffisant, Membership révoqué, ressource inconnue.
- **Critères d’acceptation :**
  - Org A → ressource Org B : **REFUS** ;
  - membre A+B avec A active : aucune donnée B ;
  - encaisseur → membres : **REFUS** ;
  - consultation → paiement : **REFUS** et aucun event ;
  - gestionnaire → correction financière sensible : mutation directe **REFUSÉE** ; demande seulement si validée.

## 19. JRN-TPA-01 — Inviter, relancer et révoquer un accès portail

- **Acteur :** `Organization Owner` ou gestionnaire.
- **Préconditions :** Organization active ; Tenant avec nom et au moins téléphone ou email ; Lease autorisé ; capacité d’administration portail.
- **Déclencheur :** action « Activer le portail » depuis le dossier locataire.
- **Étapes :** choisir le canal vérifiable, sélectionner les Lease(s) autorisés, envoyer une invitation valable 7 jours, afficher l’état opérationnel, relancer si nécessaire en invalidant l’invitation active précédente, ou révoquer l’accès.
- **Résultat attendu :** `Tenant Portal Access` invité, actif ou révoqué sans création de Membership interne.
- **Permissions nécessaires :** capacité d’administration portail réservée à Owner et gestionnaire dans l’Organization du Tenant.
- **Events produits :** aucun Domain Event métier v0.1 ; les faits d’accès alimentent le journal portail séparé.
- **Notifications éventuelles :** invitation par le canal choisi ; aucune permission avant acceptation.
- **Erreurs possibles :** aucun canal vérifiable, Lease d’un autre tenant, invitation expirée, accès déjà révoqué, communication échouée.
- **Critères d’acceptation :** encaisseur/gardien/comptable/consultation sont refusés ; le contact seul ne crée aucun accès ; une révocation n’efface aucune vérité métier.

## 20. JRN-TPA-02 — Activer le portail locataire

- **Acteur :** locataire invité.
- **Préconditions :** invitation portail non expirée et accès relié au bon Tenant, à la bonne Organization et aux Lease(s) autorisés.
- **Déclencheur :** ouverture de l’invitation ou demande d’OTP.
- **Étapes :** vérifier le canal — OTP téléphone, OTP ou lien sécurisé email — dans sa durée valide, accepter l’accès, créer la session/appareil autorisé et choisir FR/EN ; aucun PIN n’est créé.
- **Résultat attendu :** accès actif limité aux ressources explicitement reliées.
- **Permissions nécessaires :** `Tenant Portal Access` valide ; aucune capacité RBAC interne.
- **Events produits :** aucun Domain Event métier ; invitation ouverte/acceptée et OTP demandé/réussi/échoué vont au journal d’accès.
- **Notifications éventuelles :** confirmation d’activation sans donnée métier excessive.
- **Erreurs possibles :** invitation après 7 jours, OTP après 10 minutes, lien après 15 minutes, jeton déjà utilisé, canal non vérifié, accès révoqué.
- **Critères d’acceptation :** aucune donnée personnelle, bail, paiement ou reçu n’apparaît avant authentification réussie ; aucun Membership n’est créé.

## 21. JRN-TPA-03 — Revenir, récupérer et changer de canal

- **Acteur :** locataire avec accès portail.
- **Préconditions :** `Tenant Portal Access` non révoqué.
- **Déclencheur :** retour au portail, session expirée, nouvel appareil, signal de risque ou changement de téléphone/email.
- **Étapes :** reprendre une session valide au plus 30 jours ; sinon refaire la vérification ; pour un changement de canal, vérifier l’identité, l’ancien canal s’il est disponible, puis le nouveau ; utiliser la récupération sécurisée si l’ancien canal est inaccessible.
- **Résultat attendu :** session restaurée ou canal remplacé sans modifier les ressources locatives.
- **Permissions nécessaires :** contrôle de sa propre identité portail et accès encore valide.
- **Events produits :** aucun Domain Event métier ; connexion réussie/échouée, nouvel appareil, révocation et expiration sont journalisés.
- **Notifications éventuelles :** alerte de changement sensible selon le canal encore vérifié.
- **Erreurs possibles :** session de plus de 30 jours, ancien canal inaccessible, nouveau canal déjà lié de façon incompatible, signal de risque, accès révoqué.
- **Critères d’acceptation :** aucune reconnexion quotidienne imposée, aucun PIN locataire, nouvelle preuve obligatoire sur nouvel appareil ou changement sensible.

## 22. JRN-TPA-04 — Consulter l’accueil et le résumé du bail

- **Acteur :** locataire authentifié.
- **Préconditions :** accès actif ou historique relié à au moins un Lease autorisé.
- **Déclencheur :** ouverture de l’accueil portail.
- **Étapes :** sélectionner l’accès/Organization si nécessaire, afficher logement, bail, attendu, payé confirmé, restant, statut et prochaine échéance, puis ouvrir le bail ou l’échéance concernée.
- **Résultat attendu :** synthèse mobile compréhensible issue de la même vérité métier que l’espace interne.
- **Permissions nécessaires :** lecture portail limitée au Tenant et aux Lease(s) autorisés.
- **Events produits :** aucun.
- **Notifications éventuelles :** raccourci vers les notifications essentielles non lues.
- **Erreurs possibles :** Lease non relié, accès révoqué, ressource d’un autre locataire, donnée indisponible, Organization incorrecte.
- **Critères d’acceptation :** aucun champ administratif interne ni donnée d’un autre locataire ; attendu/payé/restant correspondent aux mêmes données que l’Organization.

## 23. JRN-TPA-05 — Consulter échéances et paiements

- **Acteur :** locataire authentifié.
- **Préconditions :** Lease autorisé et échéances tenant-scoped.
- **Déclencheur :** ouverture de la synthèse, d’une échéance ou de l’historique des paiements.
- **Étapes :** lister les échéances, afficher à venir/due/partielle/payée/en retard, montrer attendu, payé confirmé et restant, puis lister les paiements associés en lecture.
- **Résultat attendu :** situation locative transparente sans capacité de saisie ou correction.
- **Permissions nécessaires :** lecture portail des Rent/Dues et Payments explicitement rattachés.
- **Events produits :** aucun ; le portail consulte `RENT_DUE_*` et `PAYMENT_COMPLETED` sans les produire.
- **Notifications éventuelles :** échéance à venir, retard et paiement confirmé.
- **Erreurs possibles :** paiement non relié, donnée d’un autre Tenant/Lease, paiement seulement enregistré non présenté comme confirmé, session expirée.
- **Critères d’acceptation :** aucune action d’enregistrement, modification, correction, remboursement ou paiement en ligne ; aucune copie financière portail.

## 24. JRN-TPA-06 — Consulter et télécharger un reçu

- **Acteur :** locataire authentifié concerné par le paiement.
- **Préconditions :** `PAYMENT_COMPLETED`, `RECEIPT_GENERATED` et accès au Lease/paiement associé.
- **Déclencheur :** notification « reçu disponible » ou ouverture de la liste des reçus.
- **Étapes :** lister les reçus autorisés, ouvrir le reçu, marquer un état simple « reçu consulté » et télécharger l’artefact ; le partage éventuel utilise ensuite les fonctions de l’appareil.
- **Résultat attendu :** reçu consultable et téléchargeable sans lien public côté serveur.
- **Permissions nécessaires :** lecture portail du Receipt concerné.
- **Events produits :** aucun nouvel event de partage public ; la consultation ne modifie pas le paiement ou le reçu.
- **Notifications éventuelles :** reçu disponible.
- **Erreurs possibles :** paiement non confirmé, reçu absent de la rétention, autre locataire/Organization, accès révoqué, téléchargement indisponible.
- **Critères d’acceptation :** aucun reçu final avant `PAYMENT_COMPLETED` ; aucun URL public permanent ; l’état interne est seulement « reçu consulté », sans historique détaillé.

## 25. JRN-TPA-07 — Consulter les notifications essentielles

- **Acteur :** locataire authentifié.
- **Préconditions :** accès actif ou historique autorisé et ressource encore lisible.
- **Déclencheur :** `RENT_DUE_SOON`, `RENT_OVERDUE`, `PAYMENT_COMPLETED` ou `RECEIPT_GENERATED` pertinent.
- **Étapes :** afficher la notification dans la préférence du locataire ou, à défaut, la langue de l’Organization, ouvrir la ressource autorisée et marquer lu/non lu.
- **Résultat attendu :** centre sobre limité aux quatre notifications MVP confirmées.
- **Permissions nécessaires :** accès portail courant à la ressource cible.
- **Events produits :** aucun nouvel event ; les textes sont rendus depuis le type et les données non localisées.
- **Notifications éventuelles :** échéance à venir, retard, paiement confirmé et reçu disponible.
- **Erreurs possibles :** accès révoqué après création, ressource expirée, mauvaise langue, notification d’une autre Organization.
- **Critères d’acceptation :** aucune notification configurable avancée, aucun SMS métier général implicite et aucune donnée révélée après révocation.

## 26. JRN-TPA-08 — Consulter l’historique après fin du bail

- **Acteur :** ancien locataire authentifié.
- **Préconditions :** Lease clôturé et `Tenant Portal Access` passé en historique lecture seule.
- **Déclencheur :** fin/clôture du bail ou retour ultérieur au portail.
- **Étapes :** masquer les fonctions de bail actif, afficher le bail terminé et les anciens paiements/reçus encore conservés, interdire toute mutation.
- **Résultat attendu :** historique lisible sans prolonger artificiellement la conservation.
- **Permissions nécessaires :** accès historique au Lease terminé et à ses ressources encore présentes.
- **Events produits :** aucun.
- **Notifications éventuelles :** aucune notification de bail actif ; reçu existant seulement si encore pertinent.
- **Erreurs possibles :** ressource supprimée selon rétention, accès révoqué, tentative d’action active, autre Lease non autorisé.
- **Critères d’acceptation :** aucune copie portail d’un ancien reçu ; disparition de la source entraîne son indisponibilité ; lecture seule stricte.

## 27. JRN-TPA-09 — Sélectionner entre plusieurs baux ou Organizations

- **Acteur :** locataire dont l’identité porte plusieurs accès.
- **Préconditions :** plusieurs Leases dans une Organization ou plusieurs `Tenant Portal Access` dans des Organizations distinctes.
- **Déclencheur :** connexion ou action sur le contexte affiché.
- **Étapes :** pour plusieurs baux d’une même Organization, afficher un accueil consolidé limité à cette Organization et permettre de sélectionner le logement ; pour plusieurs Organizations, exiger une sélection explicite d’accès et remplacer entièrement le contexte.
- **Résultat attendu :** contexte actif clair sans agrégation inter-Organization.
- **Permissions nécessaires :** chaque accès et chaque Lease sont vérifiés indépendamment.
- **Events produits :** aucun.
- **Notifications éventuelles :** uniquement celles de l’accès/Organization sélectionné.
- **Erreurs possibles :** accès révoqué entre liste et sélection, lien profond d’une autre Organization, fusion accidentelle, révélation d’un autre accès.
- **Critères d’acceptation :** Org A ne sait jamais que l’identité accède à Org B ; aucune donnée B avec A sélectionnée ; deux locataires de A restent isolés.

## 28. JRN-TPA-10 — Journaliser et présenter l’état opérationnel

- **Acteur :** système pour le journal ; Owner et gestionnaire pour la vue opérationnelle.
- **Préconditions :** événement de sécurité portail ou dossier Tenant accessible dans l’Organization active.
- **Déclencheur :** invitation, OTP, connexion, nouvel appareil, révocation, expiration ou consultation d’un reçu.
- **Étapes :** journaliser pendant 12 mois les faits de sécurité pertinents avec minimisation ; présenter en interne seulement non activé/invitation envoyée/acceptée/actif/révoqué, dernière connexion synthétique et « reçu consulté ».
- **Résultat attendu :** traçabilité de sécurité distincte de l’Audit métier et vue interne non technique.
- **Permissions nécessaires :** journal non exposé au locataire comme outil administratif ; vue opérationnelle réservée à Owner/gestionnaire du tenant.
- **Events produits :** aucun Domain Event métier supplémentaire.
- **Notifications éventuelles :** aucune par défaut pour chaque entrée technique.
- **Erreurs possibles :** journal d’une autre Organization, conservation au-delà de 12 mois, détails techniques exposés, historique détaillé de consultation affiché.
- **Critères d’acceptation :** isolation tenant, minimisation, purge selon 12 mois et séparation stricte avec Activity/Audit métier.

## 29. Décisions appliquées

- Q-L2-01 à Q-L2-20 sont confirmées par D-029 à D-048.
- D9 et Q-D9-01 à Q-D9-19 sont confirmées par D-049 à D-068.
- Aucun parcours de Lot 3, chat, maintenance, paiement en ligne, signature électronique ou document avancé n’est introduit.

# Kjora — Périmètre et critères d’acceptation MVP v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Lot : **Lot 2 — Parcours et périmètre MVP**  
> Base : décisions confirmées D-021 à D-068  
> Format : critères fonctionnels testables, sans technologie ni design haute fidélité

## 1. MVP IN

- Auth interne email avec OTP et lien sécurisé, premier/nouvel appareil, PIN quotidien, récupération et révocation.
- Organization autonome Cameroun/XAF, profil/branding/settings, logo facultatif et fonctionnement sans logo.
- Plusieurs Memberships, une Organization active par action, changement de tenant sans agrégation.
- Invitation, consultation et révocation de membres avec six rôles fixes.
- Biens, unités, locataires, contrats brouillon/actif et échéances.
- Échéances à venir, dues, partielles, payées et en retard.
- Paiements manuels espèces, MTN Mobile Money, Orange Money et virement ; paiements partiels.
- `PAYMENT_RECORDED` puis `PAYMENT_COMPLETED`; reçu final après confirmation seulement.
- Reçu tenant-brandé, consultation, partage simple et email si activé.
- Dashboard opérationnel attendu/encaissé/restant/retards/activité récente.
- Notifications in-app utiles, Activity et Audit séparés.
- FR/EN, mobile-first, états vide/chargement/erreur/succès et refus par permission.
- Isolation Org A / Org B / non-membre / rôle insuffisant.
- Portail locataire minimal distinct des Memberships : invitation, authentification, accueil, bail, échéances, paiements en lecture, reçus et notifications essentielles.
- Session portail au plus 30 jours, sans PIN, fin de bail en historique lecture seule et journal d’accès 12 mois.

## 2. MVP OUT

### Confirmé

- Reporting avancé.
- Intégration automatique MTN/Orange Money.
- Biométrie.
- Rôles personnalisés ou combinables.
- Dashboard et agrégats multi-organisation.

### Confirmé hors MVP par le Lot 2

- Remboursement financier et transfert d’un Payment confirmé entre locataires.
- Plusieurs locataires titulaires d’un contrat.
- Fin de bail avancée, renouvellement complexe, bibliothèque juridique et signature.
- Copropriété juridique et registres de propriété.
- Comptabilité/fiscalité/exports avancés, dépenses et maintenance.
- SMS, WhatsApp, relances complexes et mode hors ligne avancé.
- Portail : chat, maintenance, paiement en ligne, signature électronique, documents avancés, partage public côté serveur et notifications configurables avancées.

## 3. Convention d’acceptation

Chaque critère suit `Étant donné / Lorsque / Alors`. Un critère interne tenant-scoped suppose identité établie, Membership actif, Organization active et capacité explicite. Un critère portail suppose identité authentifiée, `Tenant Portal Access` valide et ressource explicitement autorisée.

## 4. Auth

### AC-AUTH-001 — Création et vérification du compte

**Étant donné** un email non vérifié, **lorsque** l’utilisateur termine le parcours OTP ou lien sécurisé valide, **alors** son identité est établie sans lui donner automatiquement accès à une Organization.

### AC-AUTH-002 — Preuve expirée

**Étant donné** un OTP/lien expiré, **lorsque** il est présenté, **alors** l’accès est refusé, une explication non technique est affichée et une nouvelle demande est proposée sous limites de tentatives.

### AC-AUTH-003 — Premier appareil et PIN

**Étant donné** une identité fortement vérifiée sur un premier appareil, **lorsque** un PIN à 6 chiffres est créé et confirmé, **alors** ce PIN est utilisable uniquement pour l’accès quotidien sur cet appareil autorisé.

### AC-AUTH-004 — PIN non preuve forte

**Étant donné** une session ouverte par PIN, **lorsque** l’utilisateur autorise un nouvel appareil, récupère son compte ou exécute une action exigeant une preuve forte, **alors** Kjora exige email + OTP/lien sécurisé.

### AC-AUTH-005 — Limites de PIN

**Étant donné** des tentatives PIN incorrectes répétées, **lorsque** la limite de sécurité applicable est atteinte, **alors** l’accès quotidien est verrouillé et la récupération forte est proposée sans que le Lot 2 fixe un paramètre technique.

### AC-AUTH-006 — Nouvel appareil

**Étant donné** un appareil non autorisé, **lorsque** un PIN valide d’un autre appareil est connu, **alors** ce PIN seul ne permet pas l’accès ; une preuve forte est requise.

### AC-AUTH-007 — PIN oublié

**Étant donné** un PIN oublié, **lorsque** la preuve forte email réussit, **alors** un nouveau PIN peut être créé pour l’appareil sans modifier les Memberships.

### AC-AUTH-008 — Révocation appareil

**Étant donné** un appareil autorisé, **lorsque** il est révoqué après confirmation appropriée, **alors** son ancien PIN ne permet plus d’ouvrir l’accès.

### AC-AUTH-009 — Biométrie absente

**Étant donné** le MVP, **lorsque** les options Auth sont consultées, **alors** aucune biométrie n’est requise ni proposée comme mécanisme MVP.

## 5. Organization

### AC-ORG-001 — Création du tenant

**Étant donné** un utilisateur vérifié dans le parcours propriétaire, **lorsque** il confirme les informations minimales, **alors** une Organization autonome Cameroun/XAF est créée avec FR ou EN et un fuseau sélectionné.

### AC-ORG-002 — Logo facultatif

**Étant donné** aucun logo renseigné, **lorsque** l’Organization est créée, **alors** le dashboard, les parcours et les reçus restent utilisables avec une identité textuelle fonctionnelle.

### AC-ORG-003 — Champs requis

**Étant donné** le formulaire initial, **lorsque** nom, langue ou fuseau manque, **alors** la création est bloquée uniquement sur ce minimum ; téléphone, email, adresse, logo, nom légal et informations documentaires restent facultatifs à ce stade.

### AC-ORG-004 — Branding tenant

**Étant donné** un logo et des informations Organization A, **lorsque** un reçu A est rendu, **alors** aucune information ou image de l’Organization B n’apparaît.

### AC-ORG-005 — Paramètres sensibles

**Étant donné** un rôle autre qu’Owner, **lorsque** il tente de modifier les paramètres sensibles, **alors** l’action est refusée et aucune valeur n’est modifiée.

### AC-ORG-006 — État vide

**Étant donné** une Organization nouvellement créée sans bien, **lorsque** son dashboard s’ouvre, **alors** un état vide explique la prochaine action « Ajouter un bien » sans indicateur inventé.

### AC-ORG-007 — Plusieurs Organizations

**Étant donné** un User vérifié déjà Owner de A, **lorsque** il crée B, **alors** B est un tenant neuf sans copie automatique de membre, permission, locataire, bien ou donnée métier de A.

## 6. Membership / RBAC

### AC-RBAC-001 — Rôle fixe unique

**Étant donné** une invitation MVP, **lorsque** l’Owner choisit un rôle, **alors** exactement un des six rôles fixes est associé au Membership.

### AC-RBAC-002 — Aucun rôle personnalisé

**Étant donné** l’écran d’invitation, **lorsque** les rôles sont listés, **alors** aucune création, combinaison ou personnalisation de rôle n’est proposée.

### AC-RBAC-003 — Invitation réservée Owner

**Étant donné** un gestionnaire, encaisseur, gardien, comptable ou consultation, **lorsque** il tente d’inviter un membre, **alors** le résultat est **REFUS**.

### AC-RBAC-004 — Révocation

**Étant donné** un Owner et un membre du tenant actif, **lorsque** l’Owner confirme la révocation, **alors** le Membership n’autorise plus aucune nouvelle lecture ou action dans ce tenant et l’audit administratif conserve l’action sensible.

### AC-RBAC-005 — Invitation non acceptée

**Étant donné** une invitation non acceptée, **lorsque** le destinataire tente d’ouvrir les données tenant, **alors** aucun accès métier normal n’est accordé.

### AC-RBAC-006 — Refus par défaut

**Étant donné** une capacité absente du rôle principal, **lorsque** l’action est tentée par écran ou accès direct, **alors** elle est refusée et aucun effet métier n’est produit.

### AC-RBAC-007 — Encaisseur et équipe

**Étant donné** un encaisseur, **lorsque** il tente de consulter ou modifier l’équipe au-delà de sa visibilité validée, **alors** la gestion des membres est refusée.

### AC-RBAC-008 — Consultation et paiement

**Étant donné** le rôle consultation, **lorsque** il tente d’enregistrer un paiement, **alors** l’action est refusée et ni `PAYMENT_RECORDED` ni `PAYMENT_COMPLETED` n’est produit.

### AC-RBAC-009 — Correction financière

**Étant donné** un gestionnaire, **lorsque** il tente de modifier directement un paiement confirmé, **alors** la mutation est refusée ; il peut seulement soumettre une demande motivée sans modifier le paiement source.

### AC-RBAC-010 — Matrice détaillée

**Étant donné** un rôle et un écran du MVP, **lorsque** la matrice validée du Lot 2 est appliquée, **alors** écrans, données et actions correspondent à `ROLE-EXPERIENCE-MATRIX-v0.1.md` sans permission implicite.

## 7. Properties

### AC-PROP-001 — Liste vide

**Étant donné** aucune propriété dans le tenant actif, **lorsque** la liste s’ouvre, **alors** elle affiche « Aucun bien » et l’action d’ajout seulement aux rôles autorisés.

### AC-PROP-002 — Création minimale

**Étant donné** `property.manage`, **lorsque** nom/repère, localité et type minimal proposés sont valides, **alors** le bien est créé dans l’Organization active et `PROPERTY_CREATED` est produit.

### AC-PROP-003 — Bien sans locataire

**Étant donné** un bien sans locataire ni contrat, **lorsque** son détail est consulté, **alors** il reste valide et ses unités/vacances sont compréhensibles.

### AC-PROP-004 — Lecture seule

**Étant donné** `property.view` sans `property.manage`, **lorsque** le bien est ouvert, **alors** ses informations autorisées sont visibles et toute modification est refusée.

### AC-PROP-005 — Tenant scope

**Étant donné** un bien de B et A active, **lorsque** son identifiant est présenté depuis A, **alors** aucun détail de B n’est révélé.

## 8. Units

### AC-UNIT-001 — Maison mono-unité

**Étant donné** une maison louée entière, **lorsque** le bien est configuré, **alors** une Unit explicite « Maison entière » est créée ou préremplie sans proposer un modèle de bien directement louable.

### AC-UNIT-002 — Immeuble multi-unités

**Étant donné** un immeuble, **lorsque** plusieurs unités valides sont ajoutées, **alors** chacune est distincte, rattachée au même bien et consultable séparément.

### AC-UNIT-003 — Vacance

**Étant donné** une unité sans contrat actif, **lorsque** sa liste ou son détail s’affiche, **alors** elle est marquée vacante sans créer de locataire ou contrat implicite.

### AC-UNIT-004 — Relation tenant

**Étant donné** un bien A, **lorsque** une tentative rattache une unité B, **alors** l’action est refusée.

### AC-UNIT-005 — Permission

**Étant donné** `unit.view` sans `unit.manage`, **lorsque** l’utilisateur tente d’ajouter/modifier une unité, **alors** l’action est refusée.

## 9. Tenants

### AC-TEN-001 — Dossier minimal

**Étant donné** un nom et au moins téléphone ou email valide, **lorsque** le formulaire est confirmé, **alors** le locataire est créé et `TENANT_CREATED` est produit sans créer d’accès portail.

### AC-TEN-002 — Champs facultatifs

**Étant donné** aucune langue préférée, profession, pièce d’identité, expiration, notes ni photo, **lorsque** le minimum validé est présent, **alors** la création n’exige aucune donnée personnelle supplémentaire. Si une pièce est renseignée, type et numéro vont ensemble. La photo reste un placeholder et aucun scan Storage n’est créé au Lot 6B.

### AC-TEN-003 — Utilisation dans contrat

**Étant donné** un locataire A et un contrat en brouillon A, **lorsque** le locataire est sélectionné, **alors** sa référence est acceptée sans recopier son dossier complet.

### AC-TEN-004 — Contact filtré

**Étant donné** un gardien ou le rôle consultation, **lorsque** le dossier s’ouvre, **alors** le gardien voit seulement l’identité minimale sans finances et consultation seulement les champs explicitement inclus dans son périmètre, sans contact personnel implicite.

### AC-TEN-005 — Cross-tenant

**Étant donné** un locataire B, **lorsque** un contrat A tente de le sélectionner, **alors** le résultat est refusé.

## 10. Leases

### AC-LEASE-001 — Brouillon

**Étant donné** une unité et un locataire du tenant actif, **lorsque** les données essentielles sont partiellement saisies puis enregistrées, **alors** le contrat reste brouillon et aucun `LEASE_ACTIVATED` n’est produit.

### AC-LEASE-002 — Activation

**Étant donné** Unit explicite, locataire titulaire unique, montant XAF, périodicité mensuelle/trimestrielle/semestrielle/annuelle, début et exigibilité valides, **lorsque** Owner ou gestionnaire confirme l’activation, **alors** le contrat devient actif et `LEASE_ACTIVATED` est produit.

### AC-LEASE-003 — Préparation financière sans échéance

**Étant donné** un contrat actif, **lorsque** le Lot 6B l’affiche, **alors** loyer hors charges, charges, total dérivé, dépôt, avance, périodicité, exigibilité J-X et proratas restent lisibles sans créer d’échéance, Payment, Ledger ou Receipt. La génération réelle appartient à 6C1.

### AC-LEASE-004 — Données incohérentes

**Étant donné** une date, périodicité ou exigibilité invalide, **lorsque** l’activation est demandée, **alors** elle est bloquée sans perdre le brouillon.

### AC-LEASE-005 — Unité occupée

**Étant donné** une unité avec contrat actif concurrent, **lorsque** un second brouillon couvre les mêmes dates, un chevauchement partiel ou un recouvrement total, **alors** le brouillon peut rester préparé mais son activation est refusée par une contrainte PostgreSQL conformément à D-077/D-084. Une location future est activable seulement après la fin de la précédente.

### AC-LEASE-006 — Fin de contrat

**Étant donné** un contrat actif avec ou sans date de fin, **lorsque** un acteur autorisé confirme sa clôture explicite, **alors** le contrat passe à l’état terminé sans suppression silencieuse ; les règles avancées de renouvellement restent hors MVP.

## 11. Rent / Dues

### AC-DUE-001 — À venir

**Étant donné** une échéance future avec aucun paiement confirmé, **lorsque** son détail s’affiche, **alors** attendu et restant sont égaux et l’état est « à venir ».

### AC-DUE-002 — Due

**Étant donné** la date d’exigibilité atteinte sans règle de retard déclenchée, **lorsque** l’échéance est consultée, **alors** elle est due avec attendu, encaissé et restant visibles.

### AC-DUE-003 — Partiellement payée

**Étant donné** un paiement confirmé positif inférieur au montant attendu, **lorsque** la projection se met à jour, **alors** l’état est « partiellement payée » et le restant est strictement positif.

### AC-DUE-004 — Payée

**Étant donné** des paiements confirmés dont la somme égale l’attendu, **lorsque** la projection se met à jour, **alors** l’état est « payée » et le restant vaut zéro.

### AC-DUE-005 — Enregistré non confirmé

**Étant donné** seulement `PAYMENT_RECORDED`, **lorsque** l’échéance est recalculée, **alors** ce montant n’est pas compté comme encaissé confirmé.

### AC-DUE-006 — En retard

**Étant donné** un restant positif au lendemain de la date d’échéance Cameroun, **lorsque** le retard est constaté, **alors** l’état devient « en retard » et `RENT_OVERDUE` est produit selon la règle pays.

### AC-DUE-007 — Bientôt due

**Étant donné** une échéance camerounaise avec restant positif à 5 jours de sa date, **lorsque** la règle pays s’applique, **alors** `RENT_DUE_SOON` est produit sans phrase localisée.

### AC-DUE-008 — Lisibilité

**Étant donné** n’importe quel état d’échéance, **lorsque** le détail s’affiche sur téléphone, **alors** attendu, encaissé confirmé, restant, date et retard éventuel sont visibles sans Reporting avancé.

## 12. Payments

### AC-PAY-001 — Moyens autorisés

**Étant donné** le formulaire MVP, **lorsque** le moyen est choisi, **alors** seules les options espèces, MTN Mobile Money, Orange Money et virement bancaire sont proposées.

### AC-PAY-002 — Mobile Money manuel

**Étant donné** MTN ou Orange, **lorsque** le paiement est saisi, **alors** provider/moyen, référence facultative, preuve facultative, date, montant, acteur et confirmation sont traités manuellement sans appel fournisseur.

### AC-PAY-003 — Résumé obligatoire

**Étant donné** une saisie valide, **lorsque** l’utilisateur continue, **alors** un résumé affiche Organization, échéance, locataire, bien/unité, montant, date, moyen et acteur avant confirmation.

### AC-PAY-004 — Séquence d’événements

**Étant donné** une saisie manuelle immédiatement confirmée, **lorsque** l’utilisateur confirme le résumé, **alors** `PAYMENT_RECORDED` est produit avant `PAYMENT_COMPLETED` dans la même opération fonctionnelle.

### AC-PAY-005 — Total

**Étant donné** un montant égal au restant, **lorsque** le paiement est confirmé, **alors** l’échéance devient payée et le reçu final devient éligible.

### AC-PAY-006 — Partiel

**Étant donné** un montant positif inférieur au restant, **lorsque** le paiement est confirmé, **alors** l’échéance devient partiellement payée et conserve le solde exact.

### AC-PAY-007 — Valeur invalide

**Étant donné** un montant nul/négatif ou une date invalide, **lorsque** la confirmation est demandée, **alors** aucun paiement ni event n’est créé.

### AC-PAY-008 — Surpaiement

**Étant donné** un montant supérieur au restant exigible, **lorsque** la confirmation est validée, **alors** les dettes sélectionnées sont couvertes sans dépassement et le reliquat devient un crédit Payment traçable dans le Ledger ; aucun remboursement ni transfert silencieux n’est créé.

### AC-PAY-009 — Double soumission

**Étant donné** une confirmation déjà réussie, **lorsque** la même intention est soumise de nouveau, **alors** aucun second paiement fonctionnel ni second reçu actif n’est créé.

### AC-PAY-010 — Permission perdue

**Étant donné** un acteur dont `payment.record` a été révoqué avant confirmation, **lorsque** le résumé est confirmé, **alors** le résultat est refusé et aucun event paiement n’est produit.

### AC-PAY-011 — Cross-tenant

**Étant donné** une échéance B avec A active, **lorsque** un paiement est tenté, **alors** le résultat est refusé sans révéler le détail de B.

### AC-PAY-012 — Correction

**Étant donné** un paiement confirmé erroné, **lorsque** un utilisateur non autorisé tente de le modifier, **alors** la mutation directe est refusée et le paiement source reste inchangé.

### AC-PAY-012B — Reversal autorisé

**Étant donné** un Payment confirmé erroné, **lorsque** un Owner fournit un motif et confirme son annulation, **alors** l’original et ses allocations sont conservés, une écriture compensatoire restaure le solde et une seconde annulation est refusée.

### AC-PAY-013 — Demande de correction

**Étant donné** un paiement consultable par Owner, gestionnaire, encaisseur ou comptable, **lorsque** il soumet un motif de correction, **alors** une demande traçable est créée sans réécrire le paiement.

### AC-PAY-014 — Absence d’automatisation

**Étant donné** une référence Mobile Money, **lorsque** le paiement est enregistré, **alors** aucune confirmation automatique MTN/Orange n’est attendue ou simulée.

## 13. Receipts

### AC-REC-001 — Éligibilité

**Étant donné** uniquement `PAYMENT_RECORDED`, **lorsque** la génération du reçu final est demandée, **alors** elle est refusée ou reste non éligible.

### AC-REC-002 — Génération

**Étant donné** `PAYMENT_COMPLETED`, **lorsque** Receipts traite le paiement, **alors** un reçu dérivé est généré et `RECEIPT_GENERATED` est produit.

### AC-REC-003 — Source de vérité

**Étant donné** un reçu, **lorsque** il est consulté, **alors** son montant, date et moyen reflètent le paiement source et aucune modification du reçu ne change ce paiement.

### AC-REC-004 — Branding

**Étant donné** un paiement A, **lorsque** son reçu est rendu, **alors** nom/logo facultatif/informations documentaires de A sont utilisés et aucune donnée B n’apparaît.

### AC-REC-005 — Sans logo

**Étant donné** une Organization sans logo, **lorsque** le reçu est généré, **alors** il reste lisible et identifiable par le nom/informations textuelles de l’Organization.

### AC-REC-006 — Contenu minimal

**Étant donné** un reçu disponible, **lorsque** il est consulté, **alors** Organization, paiement, locataire, bien/unité, date, montant et moyen sont présents selon les permissions.

### AC-REC-007 — Partage

**Étant donné** Owner, gestionnaire ou encaisseur autorisé, **lorsque** il télécharge le reçu ou termine un email contrôlé à un destinataire explicite après revérification tenant, **alors** le reçu reste inchangé et `DOCUMENT_SHARED` constate l’envoi terminé lorsque applicable.

### AC-REC-008 — Email en échec

**Étant donné** un reçu déjà généré, **lorsque** la communication email échoue, **alors** le paiement reste `PAYMENT_COMPLETED`, le reçu reste disponible et le statut de communication indique l’échec séparément.

### AC-REC-009 — Permission

**Étant donné** un rôle sans `receipt.share`, **lorsque** il tente de partager, **alors** l’action est refusée sans supprimer ou altérer le reçu.

## 14. Dashboard

### AC-DASH-001 — Cinq informations

**Étant donné** une Organization avec données, **lorsque** le dashboard s’ouvre, **alors** attendu, encaissé confirmé, restant, retards et activité récente sont visibles.

### AC-DASH-002 — Encaissé confirmé

**Étant donné** des paiements enregistrés et confirmés, **lorsque** l’indicateur encaissé est calculé, **alors** seuls les `PAYMENT_COMPLETED` sont comptés.

### AC-DASH-003 — Organisation vide

**Étant donné** aucun bien, **lorsque** le dashboard s’ouvre, **alors** il n’invente aucun montant et propose la prochaine action autorisée.

### AC-DASH-004 — Retards

**Étant donné** au moins une échéance en retard, **lorsque** le dashboard s’ouvre, **alors** le retard est identifiable et ouvre le détail tenant-scoped.

### AC-DASH-005 — Période

**Étant donné** le dashboard, **lorsque** il s’ouvre, **alors** le mois courant est la période par défaut, la période active est visible et identique pour attendu/encaissé/restant, avec navigation simple vers d’autres périodes utiles.

### AC-DASH-006 — Pas de Reporting

**Étant donné** le MVP, **lorsque** le dashboard fonctionne, **alors** aucune activation ou disponibilité du module Reporting avancé n’est requise.

### AC-DASH-007 — Pas de consolidation

**Étant donné** un User membre de A et B, **lorsque** A est active, **alors** le dashboard n’affiche aucun chiffre ou activité de B.

## 15. Notifications

### AC-NOT-001 — Contrat activé

**Étant donné** `LEASE_ACTIVATED`, **lorsque** les destinataires proposés sont encore autorisés, **alors** une notification in-app peut les orienter vers le contrat sans contenir la vérité métier.

### AC-NOT-002 — Bientôt due

**Étant donné** `RENT_DUE_SOON`, **lorsque** les destinataires encore autorisés sont calculés, **alors** une notification tenant-scoped est créée pour les rôles concernés et le locataire portail relié.

### AC-NOT-003 — Retard

**Étant donné** `RENT_OVERDUE`, **lorsque** l’Owner/gestionnaire autorisé ou le locataire portail concerné consulte ses notifications, **alors** il voit le restant et un lien autorisé vers l’échéance.

### AC-NOT-004 — Paiement enregistré vs confirmé

**Étant donné** `PAYMENT_RECORDED` puis `PAYMENT_COMPLETED`, **lorsque** les notifications sont rendues, **alors** les libellés distinguent saisie et confirmation finale.

### AC-NOT-005 — Reçu généré

**Étant donné** `RECEIPT_GENERATED`, **lorsque** le destinataire a `receipt.view`, **alors** la notification ouvre le reçu de la même Organization.

### AC-NOT-006 — Membership révoqué

**Étant donné** un Membership ou `Tenant Portal Access` révoqué, **lorsque** une notification ancienne est traitée ou ouverte, **alors** aucun contenu tenant n’est remis ou révélé.

### AC-NOT-007 — Lu/non lu

**Étant donné** une notification, **lorsque** elle est marquée lue, **alors** son état change sans supprimer Activity ou Audit.

### AC-NOT-008 — Event sans phrase

**Étant donné** FR ou EN, **lorsque** la notification est rendue, **alors** sa phrase est générée à partir du type/données de l’event ; l’event ne contient pas une phrase française ou anglaise.

## 16. Activity / Audit

### AC-TRACE-001 — Séparation

**Étant donné** un fait métier, **lorsque** ses effets sont consultés, **alors** Notification, Communication, Activity et Audit ont des finalités et états distincts.

### AC-TRACE-002 — Activity

**Étant donné** des faits du tenant actif, **lorsque** le fil d’activité s’ouvre, **alors** une chronologie humaine affiche seulement les éléments autorisés de ce tenant.

### AC-TRACE-003 — Audit sensible

**Étant donné** une action financière ou administrative sensible, **lorsque** elle réussit ou est refusée selon politique, **alors** l’audit métier conserve acteur, action/fait, ressource, Organization et moment de manière utile à l’intégrité et à la sécurité.

### AC-TRACE-004 — Accès Audit

**Étant donné** un rôle autre que `Organization Owner`, **lorsque** l’audit métier est demandé, **alors** le résultat est refusé.

### AC-TRACE-005 — Email indépendant

**Étant donné** une communication email en échec, **lorsque** Activity/Audit sont consultés, **alors** le fait métier et le statut de communication restent distinguables.

### AC-TRACE-006 — Correction explicable

**Étant donné** une demande de correction, **lorsque** son historique est consulté, **alors** paiement source, demandeur et motif restent distinguables ; aucune correction effective n’est exécutée par le workflow MVP.

## 17. FR / EN

### AC-I18N-001 — Choix initial

**Étant donné** le premier accès, **lorsque** FR ou EN est choisi, **alors** les écrans suivants utilisent cette langue.

### AC-I18N-002 — Changement

**Étant donné** une session active, **lorsque** l’utilisateur change FR ↔ EN, **alors** les libellés sont rerendus sans changer Organization, données ou permissions.

### AC-I18N-003 — Préférence utilisateur

**Étant donné** deux utilisateurs d’une même Organization, **lorsque** chacun choisit une langue différente, **alors** leurs interfaces peuvent être rendues différemment sans dupliquer les données métier.

### AC-I18N-004 — Communications

**Étant donné** un reçu à communiquer, **lorsque** la langue du destinataire est connue, **alors** elle est utilisée ; sinon la langue de l’Organization est utilisée.

### AC-I18N-005 — Events neutres

**Étant donné** un event du catalogue, **lorsque** il est consommé en FR puis EN, **alors** type et données restent identiques et aucune phrase localisée n’est stockée dans l’event.

### AC-I18N-006 — XAF

**Étant donné** un montant du tenant Cameroun, **lorsque** il est affiché en FR ou EN, **alors** la valeur et la devise XAF restent identiques même si le rendu localisé change.

## 18. Tenant isolation

### AC-ISO-001 — Accès direct Org B

**Étant donné** un utilisateur membre seulement de A, **lorsque** il ouvre directement une ressource B, **alors** le résultat est **REFUS** sans révéler nom, montant, locataire ou existence détaillée de B.

### AC-ISO-002 — User membre A et B

**Étant donné** un User membre de A et B avec A active, **lorsque** listes, dashboard, notifications, activité et recherche s’affichent, **alors** aucune donnée B n’apparaît.

### AC-ISO-003 — Changement de tenant

**Étant donné** B sélectionnée explicitement, **lorsque** le changement réussit, **alors** les capacités sont recalculées selon le Membership B et les vues A sont remplacées.

### AC-ISO-004 — Permission non héritée

**Étant donné** Owner en A et consultation en B, **lorsque** B est active, **alors** aucune capacité Owner de A n’est utilisable en B.

### AC-ISO-005 — Relations métier

**Étant donné** des ressources de tenants différents, **lorsque** l’utilisateur tente de relier unité, locataire, contrat, échéance, paiement ou reçu, **alors** l’opération est refusée.

### AC-ISO-006 — Documents et fichiers

**Étant donné** un reçu/document B, **lorsque** un membre A présente sa référence, **alors** le contenu et le branding B ne sont pas délivrés.

### AC-ISO-007 — Effets

**Étant donné** un event, notification, communication, activité ou audit B, **lorsque** A est active, **alors** aucun effet B n’est visible ou adressé à un non-membre.

### AC-ISO-008 — Refus sans event métier

**Étant donné** une action inter-tenant refusée, **lorsque** le contrôle échoue, **alors** aucun event métier de création, activation ou paiement n’est produit.

## 19. Tenant Portal Access — administration

### AC-TPA-001 — Accès distinct

**Étant donné** un Tenant, **lorsque** son portail est activé, **alors** un `Tenant Portal Access` est créé sans Membership interne ni septième rôle RBAC.

### AC-TPA-002 — Contact sans accès implicite

**Étant donné** un Tenant avec téléphone ou email, **lorsque** son dossier est créé ou modifié, **alors** aucun accès portail n’existe avant une invitation explicite.

### AC-TPA-003 — Administration autorisée

**Étant donné** Owner ou gestionnaire du tenant actif, **lorsque** il invite, relance ou révoque un accès portail, **alors** l’action est permise uniquement pour un Tenant et des Lease(s) de cette Organization.

### AC-TPA-004 — Administration refusée

**Étant donné** encaisseur, gardien, comptable ou consultation, **lorsque** il tente d’administrer un accès portail, **alors** le résultat est **REFUS** sans changement d’accès.

### AC-TPA-005 — Invitation expirante

**Étant donné** une invitation portail, **lorsque** plus de 7 jours se sont écoulés, **alors** elle ne permet plus l’activation.

### AC-TPA-006 — Relance

**Étant donné** une invitation active, **lorsque** Owner ou gestionnaire la relance, **alors** la nouvelle invitation invalide l’ancienne correspondante.

### AC-TPA-007 — Révocation

**Étant donné** un accès portail actif, **lorsque** il est révoqué, **alors** toute nouvelle lecture portail est refusée sans supprimer Tenant, Lease, Payment ou Receipt.

### AC-TPA-008 — Vue opérationnelle

**Étant donné** Owner ou gestionnaire, **lorsque** le dossier locataire s’ouvre, **alors** il voit seulement non activé, invitation envoyée/acceptée, actif/révoqué et dernière connexion synthétique.

## 20. Authentification et sessions portail

### AC-TPAUTH-001 — Canal minimum

**Étant donné** un Tenant sans téléphone ni email vérifiable, **lorsque** une invitation portail est demandée, **alors** elle est bloquée jusqu’à présence d’au moins un canal vérifiable.

### AC-TPAUTH-002 — Téléphone

**Étant donné** un téléphone vérifiable, **lorsque** l’activation utilise ce canal, **alors** un OTP portail est exigé sans activer des SMS métier généraux.

### AC-TPAUTH-003 — Email

**Étant donné** un email vérifiable, **lorsque** l’activation utilise ce canal, **alors** OTP ou lien sécurisé peut établir l’identité selon le contexte.

### AC-TPAUTH-004 — Durées

**Étant donné** invitation, OTP ou lien sécurisé portail, **lorsque** respectivement 7 jours, 10 minutes ou 15 minutes sont dépassés, **alors** la preuve est refusée.

### AC-TPAUTH-005 — Usage contrôlé

**Étant donné** un jeton/lien déjà utilisé lorsque l’usage unique s’applique, **lorsque** il est présenté de nouveau, **alors** l’accès est refusé sans révéler de donnée locative.

### AC-TPAUTH-006 — Session persistante

**Étant donné** une authentification portail réussie, **lorsque** la session est reprise dans sa durée, **alors** elle peut rester active au plus 30 jours sans reconnexion quotidienne.

### AC-TPAUTH-007 — Nouvelle vérification

**Étant donné** nouvel appareil, session expirée, changement sensible ou signal de risque, **lorsque** l’accès est demandé, **alors** une nouvelle vérification forte est exigée.

### AC-TPAUTH-008 — Aucun PIN

**Étant donné** le portail MVP, **lorsque** l’accès quotidien est repris, **alors** aucun PIN locataire n’est créé, demandé ou utilisé.

### AC-TPAUTH-009 — Changement de canal

**Étant donné** un locataire changeant téléphone/email, **lorsque** l’ancien canal reste disponible, **alors** identité, ancien canal et nouveau canal sont vérifiés avant activation ; sinon le workflow de récupération sécurisé s’applique.

### AC-TPAUTH-010 — Aucun accès public

**Étant donné** une ressource portail sans session authentifiée, **lorsque** son identifiant ou lien est présenté, **alors** aucune donnée personnelle, bail, paiement ou reçu n’est délivré.

## 21. Lecture portail et source unique

### AC-TPREAD-001 — Aucune copie métier

**Étant donné** un bail, une échéance, un paiement ou un reçu affiché au portail, **lorsque** sa valeur est comparée à l’espace interne, **alors** elle provient de la même vérité métier autorisée.

### AC-TPREAD-002 — Accueil

**Étant donné** un Lease autorisé, **lorsque** l’accueil locataire s’ouvre, **alors** logement, attendu, payé confirmé, restant, statut et prochaine échéance sont visibles sur mobile.

### AC-TPREAD-003 — Plusieurs baux dans une Organization

**Étant donné** plusieurs Lease(s) autorisés dans la même Organization, **lorsque** l’accueil s’ouvre, **alors** une synthèse limitée à cette Organization permet de sélectionner le bail/logement.

### AC-TPREAD-004 — Paiements en lecture

**Étant donné** des paiements reliés au Lease, **lorsque** l’historique s’ouvre, **alors** le locataire peut les lire sans capacité d’enregistrement, modification ou correction.

### AC-TPREAD-005 — Encaissé confirmé

**Étant donné** `PAYMENT_RECORDED` sans `PAYMENT_COMPLETED`, **lorsque** le portail calcule payé et restant, **alors** ce paiement n’est pas compté comme encaissé confirmé.

### AC-TPREAD-006 — États d’échéance

**Étant donné** une échéance autorisée, **lorsque** elle s’affiche, **alors** à venir, due, partielle, payée ou en retard correspond au même état que l’espace interne.

### AC-TPREAD-007 — Fin du bail

**Étant donné** un Lease clôturé, **lorsque** le portail est repris, **alors** il passe en historique lecture seule et aucune fonction de bail actif n’est disponible.

### AC-TPREAD-008 — Rétention sans copie

**Étant donné** un ancien reçu, **lorsque** il existe encore dans la source de vérité selon rétention, **alors** il reste consultable ; lorsqu’il n’y existe plus, aucune copie portail ne prolonge sa disponibilité.

## 22. Reçus et notifications portail

### AC-TPREC-001 — Reçu après confirmation

**Étant donné** seulement `PAYMENT_RECORDED`, **lorsque** le locataire ouvre ses reçus, **alors** aucun reçu final n’est disponible pour ce paiement.

### AC-TPREC-002 — Consultation et téléchargement

**Étant donné** `PAYMENT_COMPLETED`, `RECEIPT_GENERATED` et accès au Lease concerné, **lorsque** le reçu s’ouvre, **alors** le locataire peut le consulter et le télécharger.

### AC-TPREC-003 — Aucun partage public serveur

**Étant donné** un reçu portail, **lorsque** le locataire souhaite le partager, **alors** aucun lien public serveur n’est créé ; il peut utiliser les fonctions de son appareil après téléchargement.

### AC-TPREC-004 — Reçu consulté

**Étant donné** un reçu mis à disposition, **lorsque** le locataire l’ouvre, **alors** l’Organization peut voir seulement l’état simple « reçu consulté », sans historique détaillé.

### AC-TPNOT-001 — Notifications essentielles

**Étant donné** `RENT_DUE_SOON`, `RENT_OVERDUE`, `PAYMENT_COMPLETED` ou `RECEIPT_GENERATED` pertinent, **lorsque** le locataire est encore autorisé, **alors** une notification portail peut être créée.

### AC-TPNOT-002 — Langue

**Étant donné** une notification ou communication portail, **lorsque** la préférence du locataire existe, **alors** elle est utilisée ; sinon la langue de l’Organization est utilisée.

### AC-TPNOT-003 — Révocation

**Étant donné** un accès portail révoqué, **lorsque** une ancienne notification est ouverte, **alors** aucune ressource locative n’est délivrée.

### AC-TPNOT-004 — Périmètre limité

**Étant donné** le portail MVP, **lorsque** les préférences sont consultées, **alors** aucun système configurable avancé, SMS métier général ou marketing n’est introduit.

## 23. Journal d’accès portail

### AC-TPLOG-001 — Rétention 12 mois

**Étant donné** une entrée du journal d’accès portail, **lorsque** sa durée atteint 12 mois, **alors** elle n’est pas conservée au-delà de la politique MVP.

### AC-TPLOG-002 — Faits couverts

**Étant donné** invitation, OTP, connexion, nouvel appareil, révocation ou expiration, **lorsque** le fait pertinent survient, **alors** son résultat minimal est journalisé.

### AC-TPLOG-003 — Isolation

**Étant donné** une entrée de journal B, **lorsque** Owner ou gestionnaire A consulte l’état portail, **alors** aucune information B n’apparaît.

### AC-TPLOG-004 — Minimisation

**Étant donné** une entrée de sécurité, **lorsque** elle est conservée, **alors** elle contient seulement les données nécessaires à la sécurité et à la traçabilité.

### AC-TPLOG-005 — Vue interne synthétique

**Étant donné** Owner ou gestionnaire, **lorsque** il consulte l’accès portail, **alors** aucun détail technique, OTP, adresse technique ou historique complet de connexion n’est exposé.

### AC-TPLOG-006 — Séparation Audit

**Étant donné** le journal d’accès portail et l’Audit métier, **lorsque** ils sont consultés ou conservés, **alors** leurs finalités, lecteurs et données restent distincts.

## 24. Isolation du portail locataire

### AC-TPISO-001 — Autre locataire même Organization

**Étant donné** locataire A dans Org A, **lorsque** il présente une ressource du locataire B de Org A non reliée à son accès, **alors** le résultat est **REFUS** sans révélation.

### AC-TPISO-002 — Autre Organization

**Étant donné** un accès portail Org A, **lorsque** une ressource Org B est présentée, **alors** le résultat est **REFUS** sans révélation de B.

### AC-TPISO-003 — Identité multi-Organization

**Étant donné** une identité avec accès A et B, **lorsque** elle se connecte, **alors** elle sélectionne explicitement l’accès/Organization et aucune agrégation n’est affichée.

### AC-TPISO-004 — Confidentialité entre Organizations

**Étant donné** une identité utilisée chez A et B, **lorsque** Org A consulte son locataire, **alors** elle ne peut savoir que cette identité possède aussi un accès chez B.

### AC-TPISO-005 — Contexte actif

**Étant donné** A sélectionnée, **lorsque** accueil, notifications, baux, paiements ou reçus s’affichent, **alors** aucune donnée B n’apparaît.

### AC-TPISO-006 — Liaison des ressources

**Étant donné** un `Tenant Portal Access`, **lorsque** une ressource est demandée, **alors** Organization, Tenant, Lease et ressource autorisée correspondent tous au même périmètre.

### AC-TPISO-007 — Lien profond

**Étant donné** un lien vers une ressource hors périmètre, **lorsque** il est ouvert avec une session valide, **alors** la session seule ne suffit pas et la ressource est refusée.

### AC-TPISO-008 — Refus sans effet métier

**Étant donné** un accès portail refusé, **lorsque** le contrôle échoue, **alors** aucun Lease, Rent/Due, Payment ou Receipt n’est créé, modifié ou copié.

## 25. Décisions appliquées

- Q-L2-01 à Q-L2-20 sont confirmées par D-029 à D-048.
- D9 et Q-D9-01 à Q-D9-19 sont confirmées par D-049 à D-068.
- AC-LEASE-005 reste explicitement une décision future non inventée et ne remet pas en cause le périmètre validé du Lot 2.

## 26. Critère de sortie du Lot 2

Le Lot 2 est validé lorsque :

- chaque critère est compatible avec D-021 à D-068 ;
- chaque `SCR-*` est relié à un `JRN-*` et à au moins une capacité ou règle d’accès ;
- chaque action financière, administrative ou portail sensible a un refus par défaut et un scénario négatif ;
- aucune fonctionnalité MVP OUT n’est nécessaire pour réussir les parcours MVP IN ;
- `Tenant Portal Access` reste séparé des Memberships et utilise l’unique vérité métier ;
- aucun choix technique, fournisseur ou design haute fidélité n’est requis pour comprendre le résultat attendu.

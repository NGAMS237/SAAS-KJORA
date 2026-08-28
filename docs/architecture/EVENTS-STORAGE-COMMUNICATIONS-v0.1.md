# Kjora — Events, Storage & Communications v0.1

> Statut : **VALIDÉ PAR BLAISE — D-072 à D-077**  
> Portée : architecture technique conceptuelle ; aucun code, SQL, fournisseur configuré ou bucket créé

## 1. Séparation des responsabilités

| Concept | Finalité | Source de vérité ? |
|---|---|---|
| Domain Event | Fait métier passé, immuable et tenant-scoped | Vérité du fait publié, pas de l’aggregate complet |
| Notification | Attention in-app d’un destinataire autorisé | Non |
| Activity | Chronologie humaine | Non |
| Audit | Trace sensible utile à l’intégrité/sécurité | Non, append-only |
| Communication | Intention et résultat d’un envoi externe | Non |
| Storage | Binaire privé et artefact relié à une ressource | Le File Asset décrit l’objet ; le domaine reste propriétaire du sens |

Un module ne contacte pas directement un fournisseur de communication. Il termine son fait métier, persiste son event/outbox, puis un consommateur orchestre les effets.

## 2. Enveloppe Domain Event

Chaque événement comporte conceptuellement :

- `event_id` global et opaque ;
- `event_type` parmi le catalogue validé ;
- `event_version` ;
- `organization_id` obligatoire ;
- type et identifiant de l’aggregate ;
- actor logique ou `system` ;
- date du fait ;
- identifiants de corrélation et causalité ;
- séquence/version de l’aggregate si l’ordre local est requis ;
- payload minimal, non localisé et sans secret.

Les payloads ne contiennent ni phrase FR/EN, ni OTP, ni URL signée, ni dossier personnel complet.

## 3. Catalogue technique des 10 événements

| Event | Producteur | Consommateurs prévus | Notification | Activity | Audit | Communication |
|---|---|---|---|---|---|---|
| `PROPERTY_CREATED` | Properties | Activity, Audit, dashboard/compteurs éventuels | Interne optionnelle, non par défaut | Oui | Oui, moyenne | Non par défaut |
| `TENANT_CREATED` | Tenants | Activity, Audit | Non par défaut | Oui | Oui, moyenne | Non |
| `LEASE_ACTIVATED` | Leases | Rent/Dues, Activity, Audit, Notifications, Communications selon politique | Owner/gestionnaire ; portail si pertinent | Oui | Oui, élevée | Possible |
| `RENT_DUE_CREATED` | Rent/Dues/Schedules | Dashboard projection, Activity, Audit, Notifications/Communications si règle | Possible | Oui | Oui | Possible selon règle |
| `RENT_DUE_SOON` | Rent/Dues/Schedules, évaluation temporelle | Notifications, Communications, Activity optionnelle | Interne + portail relié | Optionnelle | Faible/moyenne | Rappel possible |
| `RENT_OVERDUE` | Rent/Dues/Schedules | Notifications, Communications, Activity, Audit, dashboard | Interne + portail relié | Oui | Oui, élevée | Relance possible |
| `PAYMENT_RECORDED` | Payments | Activity, Audit, Notifications, dashboard état transitoire | Rôles concernés | Oui | Oui, élevée | Optionnelle, sans affirmer confirmation |
| `PAYMENT_COMPLETED` | Payments | Rent/Dues, Receipts, dashboard, Notifications, Activity, Audit, Communications | Interne + portail relié | Oui | Oui, élevée | Confirmation possible |
| `RECEIPT_GENERATED` | Receipts après Completed | Notifications, Activity, Audit, Communications | Reçu disponible | Oui | Oui, élevée | Email contrôlé possible |
| `DOCUMENT_SHARED` | Documents/artefact après partage réellement terminé | Activity, Audit, Notification éventuelle | Optionnelle | Oui | Oui, élevée | Aucune : l’envoi a déjà réussi |

Un event autorise un consommateur à réagir ; il n’impose pas qu’une notification ou un email soit envoyé à tous. Les destinataires sont recalculés depuis les droits actuels et les liaisons portail.

## 4. Transaction métier et outbox

### 4.1 Pattern confirmé — D-073

**Outbox transactionnelle Postgres + worker.**

Dans la même transaction logique :

1. valider la commande et les invariants ;
2. écrire la vérité métier ;
3. écrire le Domain Event et son état outbox ;
4. confirmer la transaction ;
5. répondre au client sur le résultat métier ;
6. distribuer l’event après commit.

Ainsi, un paiement réussi ne peut pas exister sans son event prévu, et une panne de communication ne peut pas annuler la transaction.

### 4.2 Dispatcher

Un worker/Edge Function :

- réclame un lot borné d’events non distribués ;
- exécute chaque consommateur avec un identifiant d’idempotence ;
- marque succès ou planifie le retry ;
- isole les erreurs par consommateur ;
- place les échecs permanents en état d’intervention/dead letter ;
- ne bloque pas les autres Organizations ou consommateurs.

Le runtime exact du worker est **DIFFÉRÉ à l’implémentation** par D-073. Ce choix ne modifie ni l’outbox ni la frontière de sécurité et ne bloque pas 5A.

## 5. Idempotence et non-duplication

### 5.1 Producteur

- Une commande sensible reçoit une clé d’idempotence liée à l’acteur, l’Organization et l’intention.
- Une confirmation répétée renvoie le résultat existant ou un état cohérent.
- `PAYMENT_RECORDED`, `PAYMENT_COMPLETED` et `RECEIPT_GENERATED` ne créent pas deux aggregates actifs pour la même intention.

### 5.2 Consommateur

- Clé logique unique `(consumer, event_id, version)`.
- Le consommateur enregistre son succès atomiquement avec son effet lorsque possible.
- Une notification utilise une clé de déduplication événement + destinataire + catégorie.
- Une Communication utilise événement/commande + destinataire logique + template/version.
- Receipt associe au plus un reçu actif à un Payment Completed au MVP.

L’architecture accepte une livraison « au moins une fois » et rend chaque consommateur idempotent ; elle ne prétend pas garantir une livraison physique exactement une fois.

## 6. Retry et erreurs fournisseur

- Retry exponentiel avec jitter pour erreurs transitoires.
- Nombre maximal de tentatives et fenêtre totale à fixer par type de communication lors de l’implémentation ; ce paramètre opérationnel ne remet pas en cause le retry validé.
- Erreur permanente : état échoué, motif technique minimisé et possibilité de reprise contrôlée.
- Circuit breaker ou ralentissement si un fournisseur est durablement indisponible.
- Backlog et âge du plus ancien event surveillés par environnement/Organization sans exposer de données métier.
- Une nouvelle tentative ne duplique pas le message si le fournisseur a déjà accepté la même clé d’idempotence.

### Garantie fonctionnelle

Un échec email ou fournisseur n’annule jamais :

- Payment Recorded ou Completed ;
- Receipt Generated ;
- Lease Activated ;
- Rent Due créé ;
- autre action métier déjà commise.

L’utilisateur voit séparément : résultat métier réussi, communication en attente/réussie/échouée.

## 7. Ordre des événements

- Aucun ordre global entre Organizations.
- Ordre local seulement par aggregate lorsque nécessaire.
- `PAYMENT_RECORDED` précède `PAYMENT_COMPLETED` pour un Payment.
- `PAYMENT_COMPLETED` précède `RECEIPT_GENERATED`.
- `DOCUMENT_SHARED` vient après confirmation réelle du partage.
- Un consommateur détecte une version manquante et diffère/rejoue plutôt que d’inventer l’état.
- Les projections sont reconstructibles depuis la vérité métier et/ou les events conservés selon la politique future.

## 8. Notifications

- Créées seulement pour un destinataire encore autorisé.
- Tenant-scoped et liées à une ressource, sans la remplacer.
- Texte rendu en FR/EN à partir du type d’event et des préférences.
- Membership/Portal Access revérifié à l’ouverture.
- Révocation : la notification ne redonne aucun accès.
- Portail : seulement bientôt dû, retard, paiement confirmé, reçu disponible.
- État lu/non lu indépendant d’Activity/Audit.

## 9. Activity et Audit

### Activity

- Projection humaine d’événements utiles.
- Actor affichable, date, type et lien tenant-scoped.
- Données filtrées selon la ressource et le rôle courant.

### Audit

- Append-only, acteur/system, action/fait, Organization, ressource, résultat, date, corrélation.
- Owner uniquement dans l’expérience MVP.
- Les commandes sensibles peuvent créer une trace de succès ou de refus selon politique.
- Ne contient ni secret, ni contenu complet du reçu, ni journal technique brut.
- Journal d’accès portail séparé et conservé 12 mois.

## 10. Communications

### 10.1 Deux canaux logiques séparés

- **Auth** : OTP, lien sécurisé, invitation et récupération, administrés par le système Auth.
- **Métier** : reçu, rappel ou information transactionnelle validée, orchestrés par Communications.

Leurs domaines/identités expéditrices, clés serveur, templates et journaux restent séparés conformément à D-013.

### 10.2 Commande de communication

Une action utilisateur comme « Envoyer le reçu » :

1. vérifie `receipt.share`, Organization, Receipt et destinataire explicite ;
2. persiste une Communication en attente ;
3. remet au worker uniquement les données nécessaires ;
4. enregistre chaque tentative ;
5. après succès réel, produit `DOCUMENT_SHARED` ;
6. après échec, conserve Payment et Receipt inchangés.

Une demande d’envoi est une commande ; `DOCUMENT_SHARED` est un fait accompli.

### 10.3 Minimisation

- Le Domain Event contient un destinataire logique, pas nécessairement l’adresse brute.
- Le worker résout le canal au dernier moment depuis la donnée autorisée.
- La préférence du destinataire précède la langue Organization.
- Logs fournisseur : identifiant de tentative et erreur minimisée, pas de payload complet.

## 11. Storage tenant-scoped

### 11.1 Buckets et catégories conceptuelles

**RETENU LOT 4 :** Storage privé organisé par niveau de sensibilité, avec catégories :

| Catégorie | Ressource propriétaire | Lecteurs | Mutations |
|---|---|---|---|
| Logo | Organization Branding | Membres/portail lorsque rendu autorisé | Owner |
| Preuve de paiement | Payment | Rôles financiers explicitement autorisés | Uploader lors du paiement ; remplacement contrôlé avant confirmation |
| Reçu | Receipt | Rôles avec receipt.view et portail relié | Générateur serveur ; aucun edit utilisateur |
| Document futur | Module propriétaire + File Asset | Selon capacité future | Selon règle future, inactive au MVP |

Les catégories peuvent partager un bucket privé si les politiques restent lisibles ; multiplier les buckets sans différence de sécurité n’est pas nécessaire.

### 11.2 Convention de chemin conceptuelle

`Organization / catégorie / ressource propriétaire / version / nom opaque`.

Le préfixe Organization facilite les politiques et l’exploitation. L’autorisation réelle vérifie aussi la métadonnée File Asset et la relation métier.

### 11.3 Upload

- Demande autorisée et taille/type attendus avant upload.
- Chemin attribué par le serveur, pas librement choisi comme autorisation.
- Métadonnée en attente, puis active après validation du fichier.
- Hash pour intégrité/déduplication technique éventuelle ; aucun partage cross-tenant par hash.
- Un échec upload n’altère pas une transaction métier déjà confirmée ; la preuve facultative reste facultative.

### 11.4 Lecture et téléchargement

- Bucket privé.
- URL signée de courte durée ou streaming serveur.
- Signature créée seulement après autorisation courante.
- Aucune URL permanente stockée dans Notification, Domain Event ou Receipt public.
- Un lien expiré exige une nouvelle autorisation.

### 11.5 Suppression et rétention

- Suppression logique/métadonnée puis objet selon politique, avec audit si sensible.
- Un Receipt ancien disparaît du portail lorsque la source/artefact n’existe plus selon rétention.
- Le portail ne conserve aucune copie.
- La politique légale de rétention des reçus/documents reste **À VALIDER** dans un lot dédié ; ce lot n’invente pas de durée.

## 12. Tests obligatoires

- Transaction métier réussie + worker indisponible : vérité/event présents, communication en attente.
- Email échoué : Payment/Receipt/Lease inchangés.
- Même event livré deux fois : une seule notification/communication logique.
- `PAYMENT_COMPLETED` traité avant/avec retry : un seul Receipt actif.
- Event B consommé dans un worker : aucun effet dans A.
- Membre A demande objet B : refus Storage.
- Portal Tenant A demande Receipt Tenant B : refus.
- URL signée expirée : refus et nouvelle autorisation nécessaire.
- Upload dans préfixe d’un autre tenant : refus.
- Revocation après notification : lien cible refusé.

## 13. Métriques opérationnelles proposées

- âge et taille de l’outbox ;
- taux de retry/échec par consommateur ;
- durée de génération Receipt ;
- communications en attente/échouées par catégorie ;
- tentatives Storage refusées ;
- backlog temporel RENT_DUE_SOON/OVERDUE ;
- aucune donnée personnelle dans les labels métriques.

## 14. Décisions reliées et paramètres différés

- **D-073 / Q-TECH-L4-02** : outbox + worker confirmés ; runtime précis différé à l’implémentation.
- **D-074 / Q-TECH-L4-03** : LOCAL/DEV, STAGING et PRODUCTION isolés ; aucun secret partagé.
- **D-076 / Q-TECH-L4-05** : `PhoneOtpProvider` abstrait le fournisseur OTP téléphone portail, distinct des communications métier ; fournisseur concret à choisir avant 6E.
- **À VALIDER ultérieurement** : politique légale de rétention des reçus/documents.
- **À PARAMÉTRER à l’implémentation** : nombre de retries, fenêtres et seuils opérationnels, sans changer les garanties de non-régression métier.

## 15. Critères de sortie

- Les 10 événements exacts ont un producteur et des consommateurs.
- Transaction métier et communication sont indépendantes.
- Outbox, idempotence, retry, déduplication et ordre local sont définis.
- `DOCUMENT_SHARED` reste un fait après succès, pas une commande.
- Storage est privé et tenant-scoped pour logo, preuve, reçu et futur document.
- Aucune URL privée permanente ou clé serveur n’est exposée.
- Aucun code, SQL, bucket ou fournisseur n’a été créé.

Cette architecture est **VALIDÉE** pour le Lot 4. Aucun worker, bucket, fournisseur ou environnement n’a été créé et le Lot 5A reste non commencé.

## 16. Matérialisation Lot 6C3

D-108 à D-114 matérialisent cette architecture sans modifier ses invariants :

- `private.domain_events` reste la source des faits `PAYMENT_COMPLETED` et `PAYMENT_REVERSED` ; un watermark d’installation et `financial_document_event_processing` forment le consommateur idempotent sans backfill ;
- `financial_documents` et `financial_document_payments` portent les snapshots et relations immuables ;
- `message_deliveries` est l’outbox email et `notifications` le canal interne distinct ;
- `DOCUMENT_GENERATED`, `DOCUMENT_INVALIDATED` et `MESSAGE_DELIVERY_FAILED` étendent le catalogue technique sans texte localisé ;
- le bucket privé `financial-documents` applique des policies Storage Organization/document/capability ;
- le worker concret est un Route Handler Node.js appelé par Vercel Cron, authentifié par `CRON_SECRET`, utilisant un secret Supabase serveur et Resend ;
- trois essais avec éligibilité après 5, 30 et 120 minutes sont retenus pour 6C3 ; le cron Vercel Hobby quotidien reprend les éléments éligibles au passage suivant ;
- le flag global et les quatre réglages Organization restent `false` au déploiement initial, donc aucune communication réelle n’est déclenchée par la migration.

La politique légale de rétention demeure à préciser ; l’implémentation 6C3 ne supprime aucun original financier.

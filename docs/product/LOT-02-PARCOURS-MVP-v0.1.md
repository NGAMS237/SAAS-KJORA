# Kjora — Lot 2 — Parcours et périmètre MVP v0.1

> Statut : **VALIDÉ PAR BLAISE**  
> Base officielle : Lots 1 et 2 validés, décisions D-021 à D-068 confirmées  
> Portée : expérience fonctionnelle mobile-first, sans design détaillé ni implémentation  
> Version : v0.1 — 24 août 2026

## 1. Objectif

Le Lot 2 transforme l’architecture fonctionnelle validée en un contrat produit vérifiable : qui agit, dans quelle Organization active, sur quel parcours et écran, avec quelle capacité, quels états, quels effets et quel résultat attendu.

La boucle MVP reste :

`Bien → Unité → Locataire → Contrat → Échéance / loyer attendu → Paiement → Reçu → Visibilité propriétaire`

Les arbitrages Q-L2-01 à Q-L2-20 et Q-D9-01 à Q-D9-19 sont confirmés et tracés dans `project-context/DECISIONS.md`.

## 2. Principes non négociables

- **CONFIRMÉ — D-021/D-028 :** une seule Organization active par action ; aucune donnée, permission ou synthèse de deux organisations n’est affichée simultanément.
- **CONFIRMÉ — D-022 :** `Organization Owner` contrôle le compte Kjora ; ce rôle ne prouve aucune propriété juridique d’un immeuble.
- **CONFIRMÉ — D-023 :** Payments possède le paiement ; Receipts possède le reçu dérivé ; seul `PAYMENT_COMPLETED` permet le reçu final.
- **CONFIRMÉ — D-024 :** le MVP couvre paiements manuels et partiels, reçus, délégation minimale, notifications in-app, activité, audit et dashboard opérationnel simple.
- **CONFIRMÉ — D-025 :** six rôles fixes, un rôle principal par Membership, capacités explicites et refus par défaut ; aucun rôle personnalisé.
- **CONFIRMÉ — D-026 :** email + OTP ou lien sécurisé pour la preuve forte ; PIN 6 chiffres seulement sur appareil autorisé ; biométrie hors MVP.
- **CONFIRMÉ — D-027 :** espèces, MTN Mobile Money, Orange Money et virement sont saisis manuellement ; aucune confirmation fournisseur automatique au MVP.
- **CONFIRMÉ — D-028 :** profil, branding, documents, fichiers et effets fonctionnels sont tenant-scoped ; Kjora fonctionne sans logo personnalisé.
- **CONFIRMÉ — D-029 à D-048 :** les vingt arbitrages fonctionnels du Lot 2 fixent onboarding, modèle locatif, paiements, RBAC, invitations, audit, langue, dashboard et limites du MVP.
- **CONFIRMÉ — D-049 à D-068 :** le premier MVP inclut un portail locataire minimal par `Tenant Portal Access`, distinct des Memberships internes et sans copie des vérités métier.
- Mobile-first, FR/EN, Cameroun et XAF.
- Une action interdite n’est pas rendue possible par l’interface ; le résultat fonctionnel attendu reste **REFUS**.
- `EVENT`, `NOTIFICATION`, `COMMUNICATION`, `ACTIVITY` et `AUDIT` restent cinq objets fonctionnels distincts.

## 3. Acteurs

| Acteur | Responsabilité MVP | Limite structurante |
|---|---|---|
| `Organization Owner` / propriétaire | Crée et administre le compte Kjora de l’organisation, gère membres et paramètres sensibles, supervise la boucle locative. | N’est pas une preuve de propriété juridique des biens. |
| Gestionnaire | Exécute la gestion locative quotidienne selon les capacités attribuées. | Ne gère ni membres ni paramètres sensibles ; aucune correction financière silencieuse. |
| Encaisseur | Consulte le contexte nécessaire et enregistre un paiement manuel selon permission. | Ne gère ni équipe, ni paramètres, ni contrats ; correction directe refusée. |
| Gardien | Consulte un contexte local minimal et reçoit les informations utiles retenues. | Aucun droit financier ou administratif par défaut. |
| Comptable | Consulte les informations financières et reçus autorisés. | Comptabilité avancée hors MVP ; mutation financière non implicite. |
| Consultation | Accès strictement en lecture aux domaines autorisés. | Aucune création, modification ou saisie de paiement. |
| Locataire | Entité métier et utilisateur externe du portail minimal. | Utilise un `Tenant Portal Access` limité à ses locations ; n’est ni Membership interne ni septième rôle RBAC. |

L’attribution détaillée des capacités internes et la séparation de l’accès portail sont validées dans `ROLE-EXPERIENCE-MATRIX-v0.1.md`.

## 4. Parcours principaux

| ID | Parcours | Acteur principal | Résultat fonctionnel |
|---|---|---|---|
| JRN-AUTH-01 | Créer un compte et autoriser le premier appareil | Futur utilisateur | Identité vérifiée, appareil autorisé et PIN créé. |
| JRN-AUTH-02 | Accès quotidien par PIN | Tout utilisateur | Session ouverte sur appareil déjà autorisé sans traiter le PIN comme preuve forte. |
| JRN-AUTH-03 | Nouvel appareil, PIN oublié, récupération et révocation | Tout utilisateur | Accès rétabli ou appareil révoqué après vérification forte. |
| JRN-ORG-01 | Créer et configurer une Organization | Organization Owner | Tenant autonome utilisable, avec ou sans logo. |
| JRN-ORG-02 | Sélectionner ou changer l’Organization active | Utilisateur multi-organisation | Contexte et permissions recalculés sans mélange de données. |
| JRN-MEM-01 | Inviter, consulter et révoquer un membre | Organization Owner | Membership tenant-scoped avec un rôle fixe, ou accès révoqué. |
| JRN-PROP-01 | Créer un bien et ses unités | Owner / gestionnaire proposé | Bien consultable ; unités consultables et état vacant explicite. |
| JRN-TEN-01 | Créer et consulter un locataire | Owner / gestionnaire proposé | Dossier minimal disponible pour un contrat. |
| JRN-LEASE-01 | Créer, enregistrer et activer un contrat | Owner / gestionnaire proposé | Contrat actif et génération/existence des échéances attendues. |
| JRN-DUE-01 | Suivre les loyers attendus | Rôles financiers autorisés | Attendu, encaissé confirmé, restant et retard compréhensibles. |
| JRN-PAY-01 | Enregistrer un paiement total ou partiel | Owner / gestionnaire / encaisseur proposés | `PAYMENT_RECORDED`, puis `PAYMENT_COMPLETED` si confirmation manuelle immédiate. |
| JRN-PAY-02 | Signaler une erreur et demander une correction | Acteur financier autorisé proposé | Demande explicite sans modification silencieuse du paiement source. |
| JRN-REC-01 | Générer, consulter et partager un reçu | Rôles autorisés proposés | Reçu tenant-brandé dérivé d’un paiement confirmé. |
| JRN-DASH-01 | Comprendre la situation opérationnelle | Owner ; lectures déléguées proposées | Attendu, encaissé, restant, retards et activité récente. |
| JRN-NOTIF-01 | Consulter notifications et activité | Membre autorisé | Attention et chronologie distinctes de l’audit. |
| JRN-LANG-01 | Choisir et changer FR/EN | Tout utilisateur | Interface rendue dans la langue utilisateur ; événements sans phrases localisées. |
| JRN-SEC-01 | Refuser accès inter-tenant ou action non autorisée | Tout utilisateur | Refus sans exposition de données ni héritage de permission. |
| JRN-TPA-01 | Inviter et administrer un accès portail | Owner / gestionnaire | Invitation portail tenant-scoped ou accès révoqué, sans Membership interne. |
| JRN-TPA-02 | Activer le portail | Locataire | Canal vérifié et accès activé sur les locations autorisées. |
| JRN-TPA-03 | Se reconnecter, récupérer et changer de canal | Locataire | Session persistante contrôlée ou accès récupéré sans PIN. |
| JRN-TPA-04 | Consulter l’accueil et le bail | Locataire | Logement, bail et synthèse financière autorisés visibles. |
| JRN-TPA-05 | Consulter échéances et paiements | Locataire | Attendu, payé, restant, retard et historique issus de la vérité métier. |
| JRN-TPA-06 | Consulter et télécharger un reçu | Locataire | Reçu autorisé disponible sans lien public. |
| JRN-TPA-07 | Consulter les notifications essentielles | Locataire | Échéance, retard, paiement confirmé et reçu disponible. |
| JRN-TPA-08 | Passer en historique après la fin du bail | Locataire | Lecture historique sans fonction de bail actif. |
| JRN-TPA-09 | Isoler plusieurs baux et Organizations | Locataire | Sélection explicite sans agrégation ni révélation inter-tenant. |
| JRN-TPA-10 | Journaliser et minimiser les accès portail | Système / Owner / gestionnaire | Journal de sécurité 12 mois et vue opérationnelle synthétique. |

Les étapes, erreurs, permissions, événements et critères de chaque parcours figurent dans `USER-JOURNEYS-v0.1.md`.

## 5. Dépendances entre parcours

1. JRN-AUTH-01 précède toute action tenant-scoped.
2. JRN-ORG-01 crée le premier Membership `Organization Owner` ; le dernier Owner ne peut être révoqué avant transfert terminé vers un User vérifié.
3. JRN-ORG-02 fixe le contexte de tous les parcours métier et de délégation.
4. JRN-MEM-01 dépend de l’Organization active et ne peut viser une autre Organization.
5. JRN-PROP-01 précède JRN-LEASE-01 ; une unité sélectionnable doit appartenir au bien et à l’Organization active.
6. JRN-TEN-01 précède JRN-LEASE-01.
7. JRN-LEASE-01 précède JRN-DUE-01 ; seul un contrat actif produit ou expose les loyers attendus du MVP.
8. JRN-DUE-01 précède JRN-PAY-01 ; le paiement manuel vise une échéance de l’Organization active.
9. JRN-PAY-01 précède JRN-REC-01 ; seul `PAYMENT_COMPLETED` rend le paiement éligible au reçu final.
10. JRN-DASH-01 et JRN-NOTIF-01 consomment des projections tenant-scoped sans devenir sources de vérité métier.
11. JRN-TEN-01 crée le dossier métier ; aucun contact ne crée automatiquement JRN-TPA-01.
12. JRN-TPA-01 précède l’activation JRN-TPA-02 et exige un Lease autorisé ou une future liaison valide.
13. JRN-TPA-02/03 établissent l’accès portail sans créer de Membership interne.
14. JRN-TPA-04/05/06 lisent les mêmes Lease, Rent/Dues, Payments et Receipts que l’Organization, avec permissions plus restreintes.
15. JRN-TPA-08 dépend de la clôture du bail et conserve uniquement la lecture historique autorisée.
16. JRN-TPA-09 impose la sélection explicite d’un accès et interdit toute agrégation inter-Organization.

## 6. États métier visibles

### Compte et accès

- Compte : email à vérifier, vérifié, récupération requise.
- Appareil : nouveau/non autorisé, autorisé, révoqué.
- PIN : à créer, actif sur l’appareil, oublié/verrouillé.
- Membership : invité, actif, révoqué ; invitation interne expirant après 7 jours.
- Tenant Portal Access : non activé, invitation envoyée, invitation acceptée, actif, révoqué, historique lecture seule.
- Session portail : active, expirée, réauthentification requise ; durée maximale 30 jours et aucun PIN locataire.

### Organization et patrimoine

- Organization : configuration initiale incomplète, opérationnelle.
- Branding : logo présent ou logo absent avec identité texte Kjora/Organization fonctionnelle.
- Bien : aucun bien, bien avec une unité, bien avec plusieurs unités.
- Unité : explicite, vacante ou occupée par un contrat actif ; une maison entière reçoit une Unit préremplie.
- Locataire : nom et au moins téléphone ou email ; portail non activé tant qu’aucun accès n’est créé explicitement.

### Contrat, échéance, paiement et reçu

- Contrat : brouillon, actif, clôturé/terminé ; périodicité mensuelle, trimestrielle, semestrielle ou annuelle, avec date de fin facultative.
- Échéance : à venir, due, partiellement payée, payée, en retard.
- Paiement : saisi/enregistré (`PAYMENT_RECORDED`), encaissé/confirmé (`PAYMENT_COMPLETED`), correction demandée sans mutation du paiement source.
- Reçu : non éligible, en génération, disponible, partage réussi, communication en échec.

### Règles de calcul fonctionnelles proposées

- `encaissé` ne compte que les montants de paiements `PAYMENT_COMPLETED`.
- `restant = attendu − encaissé confirmé` ; un paiement supérieur au restant est bloqué avant confirmation.
- `partiellement payé` signifie `encaissé confirmé > 0` et `restant > 0`.
- `payé` signifie `restant = 0`.
- Surpaiement, crédit automatique, remboursement, transfert et workflow financier avancé sont hors MVP.
- Cameroun MVP : `RENT_DUE_SOON` 5 jours avant l’échéance ; `RENT_OVERDUE` à partir du lendemain, sans période de grâce Organization.

## 7. Notifications, communications, activité et audit MVP

| Event | Notification in-app proposée | Communication | Activity | Audit |
|---|---|---|---|---|
| `PROPERTY_CREATED` | Pas par défaut | Aucune | Oui | Oui |
| `TENANT_CREATED` | Pas par défaut | Aucune | Oui | Oui |
| `LEASE_ACTIVATED` | Owner et gestionnaire concerné | Selon communication autorisée | Oui | Oui |
| `RENT_DUE_CREATED` | Pas par défaut | Aucune par défaut | Oui | Oui |
| `RENT_DUE_SOON` | Owner/gestionnaire autorisés et locataire portail concerné | Notification portail essentielle | Oui | Oui |
| `RENT_OVERDUE` | Owner/gestionnaire autorisés et locataire portail concerné | Notification portail essentielle | Oui | Oui |
| `PAYMENT_RECORDED` | Owner et gestionnaire autorisé si l’acteur est délégué | Pas de confirmation finale au payeur | Oui | Oui |
| `PAYMENT_COMPLETED` | Owner, gestionnaire, acteur autorisé et locataire portail concerné | Notification portail essentielle | Oui | Oui |
| `RECEIPT_GENERATED` | Acteur, Owner et locataire portail concerné | Email contrôlé à destinataire explicite | Oui | Oui |
| `DOCUMENT_SHARED` | Pas par défaut | Constate un partage terminé | Oui | Oui |

Un email en échec ne supprime ni le paiement, ni le reçu, ni leurs événements. Le statut de communication est affiché séparément et peut proposer une reprise sans fournisseur défini dans ce lot.

## 8. MVP IN

- Création de compte, vérification email forte, premier appareil, PIN quotidien, nouvel appareil, récupération et révocation.
- Création d’une Organization Cameroun/XAF, langue et fuseau, profil minimal, logo facultatif et fonctionnement sans branding personnalisé.
- Multi-organisation avec sélection d’une seule Organization active et recalcul des permissions.
- Invitation, liste et révocation de membres avec les six rôles fixes.
- Biens, unités, locataires, contrats brouillon/actif et loyers attendus.
- États d’échéance : à venir, due, partiellement payée, payée, en retard.
- Paiements manuels en espèces, MTN Mobile Money, Orange Money et virement ; paiement total ou partiel.
- Reçu final après `PAYMENT_COMPLETED`, consultation et partage simple ; email si activé.
- Dashboard opérationnel simple : attendu, encaissé, restant, retards, activité récente.
- Notifications in-app utiles, fil d’activité et audit distincts.
- FR/EN et isolation fonctionnelle de tenant.
- États vide, chargement, succès, erreur et refus pour les écrans concernés.
- Portail locataire minimal : invitation, activation/authentification, accueil, bail, échéances, historique des paiements en lecture, reçus et notifications essentielles.
- Session portail persistante 30 jours maximum, sans PIN, avec nouvelle vérification pour nouvel appareil, expiration, changement sensible ou risque.
- Historique lecture seule après fin de bail ; journal d’accès portail conservé 12 mois.

## 9. MVP OUT

### Confirmé hors MVP

- Reporting avancé.
- Intégration automatique MTN Mobile Money / Orange Money.
- Biométrie.
- Rôles personnalisés ou combinables.
- Dashboard ou agrégation multi-organisation.

### Confirmé hors MVP par le Lot 2

- Surpaiement, crédit automatique, remboursement, annulation financière, transfert de paiement et workflow financier avancé.
- Plusieurs échéances dans une même saisie de paiement.
- Plusieurs locataires titulaires d’un même contrat, colocation et cotitulaires.
- Bibliothèque juridique, clauses avancées et signature électronique.
- Gestion juridique de copropriété, indivision, succession ou mandat.
- Comptabilité, fiscalité, clôture, rapprochement et exports avancés.
- Dépenses, maintenance et gestion documentaire avancée.
- SMS, WhatsApp et automatisations complexes de relance.
- Mode hors ligne avancé et application native spécifique.
- Portail locataire : chat, maintenance, paiement en ligne, signature électronique, documents avancés, partage public côté serveur et notifications configurables avancées.

## 10. Scénarios obligatoires de sécurité

| Scénario | Résultat attendu |
|---|---|
| Membre de Org A ouvre directement une ressource de Org B sans Membership actif | **REFUS** ; aucune donnée de B n’est révélée. |
| User membre de A et B agit avec A active | Seules les données et permissions de A sont visibles et utilisables. |
| Encaisseur tente de gérer les membres | **REFUS** ; action masquée et contrôle fonctionnel obligatoire. |
| Consultation tente d’enregistrer un paiement | **REFUS** ; aucun événement paiement n’est produit. |
| Gestionnaire tente une correction financière sensible non autorisée | **REFUS** de mutation directe ; demande de correction seulement si le workflow proposé est validé. |
| PIN seul utilisé pour une action exigeant une preuve forte | Nouvelle vérification email/OTP ou lien sécurisé ; le PIN ne suffit pas. |
| Locataire portail A ouvre une ressource d’un autre locataire de la même Org A | **REFUS** ; aucune donnée de l’autre locataire n’est révélée. |
| Locataire portail Org A ouvre une ressource Org B | **REFUS** ; aucune donnée ni existence détaillée de B n’est révélée. |
| Une identité portail possède des accès A et B avec A sélectionné | Seules les données A apparaissent ; Org A ne reçoit aucune information sur B. |
| Session portail expirée ou nouvel appareil | Nouvelle vérification selon téléphone/email ; aucun PIN locataire. |
| Tenant Portal Access révoqué | Toute nouvelle lecture est refusée sans supprimer Tenant, Lease, Payment ou Receipt. |
| Reçu portail présenté sans authentification | **REFUS** ; aucun lien public permanent n’est accepté. |

## 11. Décisions validées et traçabilité

### Lot 2

| Questions | Décisions officielles | Choix confirmés |
|---|---|---|
| Q-L2-01 à Q-L2-05 | D-029 à D-033 | C / A / B / B / B |
| Q-L2-06 à Q-L2-10 | D-034 à D-038 | A / A / A / A / A |
| Q-L2-11 à Q-L2-15 | D-039 à D-043 | A / A / A / A / A |
| Q-L2-16 à Q-L2-20 | D-044 à D-048 | C / A / A / A / B |

### Portail locataire D9

| Questions | Décisions officielles | Choix confirmés |
|---|---|---|
| D9 | D-049 | Portail distinct des Memberships, source métier unique |
| Q-D9-01 à Q-D9-05 | D-050 à D-054 | B / C / C / A / B |
| Q-D9-06 à Q-D9-10 | D-055 à D-059 | A / B / B / B / B |
| Q-D9-11 à Q-D9-15 | D-060 à D-064 | A / B / A / B / B |
| Q-D9-16 à Q-D9-19 | D-065 à D-068 | A / A / B / A |

## 12. Critères globaux de réussite du MVP

Le MVP est fonctionnel lorsque :

1. un nouvel utilisateur peut vérifier son identité, autoriser son appareil et créer un PIN sans que le PIN remplace une preuve forte ;
2. un Owner peut créer une Organization fonctionnelle avec ou sans logo ;
3. un utilisateur multi-organisation peut changer de tenant sans voir ni cumuler données ou droits ;
4. l’Owner peut inviter et révoquer un membre avec l’un des six rôles fixes ;
5. la boucle Bien → Unité → Locataire → Contrat → Échéance est réalisable sur téléphone ;
6. un acteur autorisé peut enregistrer un paiement total ou partiel manuel, après résumé explicite ;
7. `PAYMENT_RECORDED` précède `PAYMENT_COMPLETED` et seul le second rend possible un reçu final ;
8. le reçu reprend les informations de son Organization et fonctionne sans logo personnalisé ;
9. l’échec d’un email ne modifie ni le paiement ni le reçu ;
10. le dashboard affiche attendu, encaissé confirmé, restant, retards et activité récente sans Reporting avancé ;
11. notifications, communications, activité et audit restent distincts et tenant-scoped ;
12. les scénarios Org A/Org B, rôle insuffisant et non-membre aboutissent à un refus testable ;
13. les parcours et écrans essentiels fonctionnent en FR/EN et en format mobile ;
14. chaque critère de `MVP-SCOPE-ACCEPTANCE-v0.1.md` est vérifiable sans dépendre d’une maquette haute fidélité.
15. un locataire peut activer un accès sans Membership interne, puis consulter le même bail, les mêmes échéances, paiements et reçus que l’Organization dans un périmètre plus restreint ;
16. aucun locataire ne peut voir une ressource d’un autre locataire ou d’une autre Organization ;
17. une identité portail multi-Organization sélectionne explicitement son accès sans agrégation ni révélation ;
18. aucun PIN locataire, session au plus 30 jours, journal d’accès conservé 12 mois et fin du bail en historique lecture seule ;
19. aucun reçu public et aucune fonction portail hors MVP n’est nécessaire pour réussir les parcours.

## 13. Limite du lot

Ce document reflète la validation officielle du Lot 2 et ne démarre pas le Lot 3. Le design détaillé, le développement, les choix techniques et les fournisseurs restent hors périmètre.

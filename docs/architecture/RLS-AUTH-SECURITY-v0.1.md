# Kjora — RLS, Auth & sécurité v0.1

> Statut : **VALIDÉ PAR BLAISE — D-072 à D-077**  
> Portée : modèle de menace, contrôles et tests conceptuels ; aucune politique SQL, configuration ou secret

## 1. Objectifs de sécurité

1. Empêcher tout accès inter-Organization non autorisé.
2. Empêcher tout accès portail à un autre Tenant ou Lease non relié.
3. Appliquer les six rôles internes avec refus par défaut.
4. Faire survivre la sécurité à un contournement complet de l’UI.
5. Révoquer Membership, Tenant Portal Access, appareil et session de façon effective.
6. Protéger les fichiers privés et les reçus contre les URLs permanentes.
7. Séparer Auth, autorisation métier, communications et audit.

## 2. Modèle de menace minimum

- ID valide deviné ou obtenu dans une autre Organization.
- User membre de A et B tentant d’utiliser le rôle de A dans B.
- Client modifié appelant directement la Data API ou une fonction serveur.
- Ancien Membership ou accès portail révoqué réutilisant une session.
- Lien d’invitation ou OTP réutilisé, expiré ou bruteforcé.
- Upload dans un préfixe Storage d’un autre tenant.
- URL de reçu transmise à une personne non autorisée.
- Double soumission d’un paiement.
- Worker privilégié oubliant un filtre Organization.
- Donnée personnelle exposée dans logs, events ou messages d’erreur.

## 3. Défense en profondeur

| Couche | Contrôle | Ne suffit pas seule |
|---|---|---|
| UX | Navigation par rôle, Organization active visible, actions masquées | Oui |
| Client | Validation de forme, contexte explicite, protection anti-double clic | Oui |
| Serveur/BFF | Session, contexte, capacité, invariant et idempotence | Oui |
| RLS | Autorisation ligne par ligne pour chaque chemin interne/portail | Non : barrière obligatoire |
| Contraintes de données | Relations du même `organization_id`, unicités et états valides | Non : complète RLS |
| Storage policies | Bucket privé, métadonnée/ressource autorisée | Non : complète RLS métier |
| Audit/monitoring | Détection de refus, abus et erreurs privilégiées | Non : contrôle après/prévention complémentaire |

## 4. Stratégie RLS

### 4.1 Règle générale

**CONFIRMÉ — D-073 :** RLS protège toute donnée tenant-scoped et constitue la barrière fondamentale d’isolation. Une défense en profondeur s’applique aussi aux tables privées sensibles. Aucune table métier exposée ne fonctionne avec une politique « tout utilisateur authentifié » sans prédicat d’autorisation.

Une politique logique vérifie au minimum :

- identité authentifiée et session non révoquée ;
- registre Session Authorization actif pour l’identifiant de session authentifié ;
- Organization active du registre identique au `organization_id` demandé pour une surface interne ;
- `organization_id` de la ligne ;
- un des deux chemins d’accès autorisés : Membership interne ou Tenant Portal Access ;
- capacité/opération requise ;
- relation de ressource valide ;
- état compatible pour une mutation.

Les rôles/capacités ne proviennent pas de métadonnées utilisateur modifiables. Les Memberships et liaisons portail en base sont la source d’autorisation. Les claims éventuellement mis en cache ne remplacent jamais une revérification sur une action sensible.

### 4.2 Organization active

L’Organization active est un contexte de requête et d’UX, pas une permission. Elle borne toutefois chaque opération à un tenant unique.

- Le client demande explicitement le changement d’Organization sélectionnée.
- Une commande serveur vérifie le Membership puis met à jour le contexte de Session Authorization ; le client ne peut pas auto-déclarer ce contexte comme autorisation.
- Toutes les requêtes applicatives ajoutent un filtre tenant explicite.
- Le serveur refuse une commande si son contexte actif ne correspond pas à la ressource.
- RLS vérifie que la ligne correspond au contexte actif et que l’acteur possède réellement le Membership ou Portal Access correspondant.
- Un User membre de A et B est autorisé dans les deux, mais une vue MVP ne demande qu’une seule Organization et ne fait aucune agrégation.
- L’Organization active n’est pas placée dans un champ utilisateur global comme autorisation durable.

### 4.3 Prédicat interne conceptuel

Un accès interne exige :

1. User Identity authentifiée ;
2. Session Authorization et appareil encore actifs ;
3. Membership actif pour le `organization_id` de la ligne ;
4. rôle principal possédant la capacité de l’opération ;
5. contraintes supplémentaires de ressource et d’état.

### 4.4 Prédicat portail conceptuel

Un accès portail exige :

1. identité portail authentifiée ;
2. session portail non expirée/révoquée ;
3. Tenant Portal Access actif ou historique autorisé ;
4. même Organization que la ligne ;
5. Lease explicitement relié à l’accès ;
6. ressource dérivée de ce Lease ;
7. opération en lecture uniquement, hors gestion du propre compte/session.

Le chemin portail ne tombe jamais par défaut sur les politiques Membership. Le locataire n’est pas un septième rôle.

## 5. Matrice conceptuelle RLS

| Ressource | Lecture interne | Mutation interne | Lecture portail | Mutation portail |
|---|---|---|---|---|
| Organization/Profile | Membership actif, champs selon rôle | Owner pour paramètres sensibles | Identité Organization minimale autorisée | Aucune |
| Membership/Invitation | Owner ; lecture de soi limitée si nécessaire | Owner, avec protection dernier Owner | Aucune | Aucune |
| Property/Unit | Selon `property.view`/`unit.view` ; contexte minimal pour rôles limités | Owner/gestionnaire | Logement relié seulement | Aucune |
| Tenant | Selon `tenant.view`, projection minimisée par rôle | Owner/gestionnaire | Son identité seulement si nécessaire | Canal propre via workflow vérifié, pas le dossier interne |
| Lease | Selon `lease.view` | Owner/gestionnaire | Lease explicitement relié | Aucune |
| Rent Due/Schedule | Selon `rent_due.view` | Génération système ; aucune édition libre MVP | Dues du Lease relié | Aucune |
| Payment/Allocation | Selon matrice ; contexte encaisseur limité | Record par Owner/gestionnaire/encaisseur via commande ; aucune réécriture Completed | Paiements du Lease relié en lecture | Aucune |
| Receipt | Selon `receipt.view` | Génération système ; partage selon capacité | Reçu du Payment/Lease relié | Marquer consultation minimalement via commande contrôlée |
| Notification | Destinataire encore autorisé | État lu propre seulement | Destinataire portail + ressource autorisée | État lu propre seulement |
| Activity | `activity.view` + accès ressource | Système append-only | Aucune | Aucune |
| Audit | Owner uniquement | Système append-only | Aucune | Aucune |
| Domain Event/Outbox | Aucun accès client normal | Worker/transaction système | Aucun | Aucun |
| Communication | Acteurs métier autorisés à voir un état utile | Worker serveur | État minimal si explicitement prévu | Aucun |
| Portal Access Log | Pas de journal brut ; vue synthétique Owner/gestionnaire | Système sécurité | Sessions propres seulement, pas le journal | Révocation session propre |

RLS contrôle les lignes. La minimisation de colonnes — par exemple contacts cachés au gardien — utilise des projections/contrats serveur dédiés et sûrs, pas une simple convention UI. Toute vue exposée doit respecter l’invocateur ou rester dans une surface non exposée ; elle ne doit pas contourner RLS.

## 6. Membership, capacités et Owner

- Les six rôles et leurs capacités sont versionnés dans le Core.
- Un Membership actif porte exactement un rôle principal.
- L’absence de capacité vaut refus.
- Une mutation revérifie le rôle au moment de la confirmation.
- `Organization Owner` est une autorité Kjora, pas un titre juridique.
- Le retrait du dernier Owner est bloqué jusqu’au transfert terminé.
- La révocation du Membership interdit toute nouvelle lecture/action ; les anciennes notifications ne rouvrent rien.
- Aucune permission ne se propage entre Organizations.

## 7. Auth interne

### 7.1 Email, OTP et lien sécurisé

- Supabase Auth est le fournisseur d’identité principal interne de Kjora — D-075.
- OTP et lien sécurisé expirent, sont à usage contrôlé et soumis au throttling.
- Le mécanisme présenté comme principal peut varier selon le contexte sans modifier le niveau d’autorisation.
- Un succès Auth crée/ouvre une User Identity ; il ne crée pas de Membership sauf acceptation valide.
- Les emails Auth utilisent la configuration Auth et restent séparés des communications métier.

### 7.2 PIN et appareil

**CONFIRMÉ — D-075.** Le modèle distingue Auth, session, appareil et verrou rapide :

- Supabase Auth email OTP/lien sécurisé établit l’identité principale et sa session peut persister ;
- un Device Authorization n’est enregistré qu’après preuve forte ;
- le PIN à 6 chiffres verrouille/déverrouille Kjora sur cet appareil déjà vérifié ; il ne crée, n’émet ni ne remplace la session Supabase Auth ;
- le PIN n’est jamais stocké en clair : seul un dérivé cryptographique approprié peut être conservé ;
- les tentatives sont limitées et soumises à throttling/verrouillage, avec journal minimal sans secret ;
- nouvel appareil et récupération exigent une preuve forte ; une action sensible peut déclencher un step-up Auth ;
- révoquer un appareil refuse ses futures reprises/lectures et invalide les sessions applicatives associées.

L’emplacement exact du vérificateur et le mécanisme de verrouillage seront choisis selon les contraintes web/PWA au Lot 5B sans transformer le PIN en facteur Auth. Si Capacitor est ajouté plus tard, Keychain/Keystore et biométrie pourront protéger l’accès local ; la biométrie reste hors MVP.

## 8. Auth portail

- Tenant Portal Access reste une autorisation séparée d’Auth et du Membership.
- Téléphone : OTP ; email : OTP ou lien sécurisé.
- Invitation 7 jours, OTP 10 minutes, lien 15 minutes, session 30 jours maximum.
- Aucun PIN locataire.
- Nouvel appareil, session expirée, changement sensible ou signal de risque exigent une nouvelle preuve.
- L’authentification téléphone dépend d’un port `PhoneOtpProvider` ; aucun fournisseur concret n’est couplé au domaine.
- **CONFIRMÉ COMME DIFFÉRÉ — D-076 :** le fournisseur réel doit être choisi avant 6E, sans bloquer 5A ni les lots métier propriétaires.
- Une identité multi-Organization voit une sélection explicite de ses propres accès sans que chaque Organization connaisse les autres.

## 9. Invitations

### 9.1 Contrôles communs

- Jeton aléatoire à forte entropie ; seule une empreinte non réversible est conservée dans le domaine.
- Date d’expiration et usage unique/contrôlé.
- Relance invalidant l’invitation active précédente correspondante.
- Réponse générique si l’invitation est inconnue, expirée ou révoquée.
- Aucune donnée métier avant Auth et autorisation finale.

### 9.2 Invitation interne

- Créée seulement par Owner dans son Organization active.
- Porte le rôle proposé mais aucune permission active.
- À l’acceptation, vérifie identité, invitation, Organization et état avant Membership.

### 9.3 Invitation portail

- Créée seulement par Owner/gestionnaire.
- Porte Tenant, Organization et Lease(s) autorisés.
- N’accepte aucun Lease cross-tenant.
- À l’acceptation, crée/active Tenant Portal Access, jamais Membership.

## 10. Sessions et révocation

- Les access tokens restent de courte durée ; la durée exacte est un paramètre technique à fixer lors de 5B.
- Chaque session authentifiée utilisée par Kjora possède une Session Authorization applicative liée à l’identifiant de session et, pour l’interne, à une Organization active vérifiée.
- Une session persistante ne signifie pas une permission persistante : Membership/Portal Access sont revérifiés.
- La révocation d’un appareil invalide ses sessions applicatives et rend son verrou PIN inutilisable.
- La révocation d’un Tenant Portal Access invalide les sessions portail reliées.
- Les actions sensibles consultent l’état courant de session/appareil, pas seulement un JWT potentiellement ancien.
- Les lectures directes protégées par RLS exigent une Session Authorization active ; après révocation, le jeton déjà émis ne satisfait plus le prédicat applicatif.
- Le changement d’Organization met à jour le contexte de session après vérification et remplace les données affichées ; il n’accorde aucun Membership nouveau.

## 11. Storage privé et reçus

### 11.1 Principes

- Buckets privés uniquement.
- Objet classé par Organization, catégorie et ressource.
- Métadonnée File Asset tenant-scoped liée à la ressource métier.
- Le chemin de fichier facilite l’isolation mais ne remplace pas la politique.
- Upload, lecture, remplacement et suppression ont des autorisations distinctes.
- Les fichiers sont contrôlés par type, taille et, lorsque pertinent, analyse de contenu future.

### 11.2 Reçus

- Seul Payment Completed autorise la génération.
- Receipt + File Asset du même `organization_id`.
- Accès interne selon `receipt.view/share`.
- Accès portail seulement si Payment → Due → Lease est relié au Tenant Portal Access.
- Téléchargement par URL signée courte ou streaming serveur autorisé.
- Aucun bucket public, URL permanente ou lien devinable.
- L’état « reçu consulté » est minimal et tenant-scoped.

### 11.3 Protection contre ID guessing

- Identifiants opaques et non séquentiels.
- RLS et relation de ressource sur chaque lecture.
- Aucune différence révélatrice entre « existe mais interdit » et « introuvable » pour un acteur non autorisé.
- Aucun branding, nom, taille de fichier ou métadonnée d’un autre tenant dans l’erreur.

## 12. Actions sensibles

| Action | Contrôles supplémentaires |
|---|---|
| Confirmation paiement | Capacité revérifiée, restant recalculé, idempotence, Organization/échéance cohérentes |
| Activation/clôture Lease | Capacité, ressources même tenant, invariant dates/occupation |
| Invitation/révocation membre | Owner, réauthentification selon risque, dernier Owner protégé |
| Paramètres Organization | Owner et contexte explicite |
| Révocation appareil/session | Identité propre, confirmation, preuve forte si risque |
| Changement canal portail | Identité + ancien canal si disponible + nouveau canal |
| Email reçu | `receipt.share`, destinataire explicite, Organization revérifiée |
| Création URL fichier | Droit courant, ressource liée, durée courte et usage limité si applicable |

## 13. Audit, logs et données sensibles

- Audit métier append-only, tenant-scoped et visible uniquement par Owner.
- Journal portail séparé, rétention 12 mois, détails techniques non exposés aux acteurs métier.
- Logs techniques sans OTP, token, PIN, secret, reçu complet ni contact non nécessaire.
- Les refus sensibles peuvent être journalisés avec actor, action, Organization demandée et résultat, sans révéler la ressource cible.
- Correlation ID pour suivre commande, event, communication et erreur.
- Les accès privilégiés `service_role` sont journalisés et surveillés.

## 14. service_role et secrets

- `service_role` ou secret Supabase n’existe que dans un environnement serveur/worker protégé.
- Jamais dans JavaScript navigateur, PWA, bundle, dépôt, log, documentation d’exemple ou variable publique.
- Une opération utilisateur préfère le client lié à sa session afin que RLS s’applique.
- Un worker privilégié reçoit un contrat étroit, un `organization_id` obligatoire et un identifiant d’idempotence.
- Le fait qu’un service privilégié contourne RLS impose des contrôles applicatifs et tests dédiés ; il ne sert pas à corriger une politique déficiente.
- Secrets Auth et communications métier séparés, avec rotation et accès minimaux.

## 14.1 Isolation des environnements

- LOCAL/DEV, STAGING et PRODUCTION sont les trois niveaux confirmés.
- PRODUCTION ne partage jamais base, Auth, Storage, secrets ou `service_role` avec STAGING/DEV ni VERALUZ.
- Aucun secret n’est réutilisé entre environnements ; les previews ne ciblent jamais PRODUCTION par défaut.

## 15. Récupération de compte

### Interne

- Email vérifié + OTP/lien contrôlé.
- Révoquer/remplacer les sessions ou appareils compromis selon le parcours.
- Nouveau PIN seulement après preuve forte.
- Aucun Membership ajouté ou rôle élevé pendant la récupération.

### Portail

- Canal disponible vérifié ; ancien canal si accessible, puis nouveau.
- Si ancien canal inaccessible, workflow renforcé à définir lors de 6E sans révéler de données locatives.
- Aucun PIN proposé.
- Récupération impossible pour un Tenant Portal Access révoqué sans nouvelle administration interne.

## 16. Scénarios obligatoires

| ID | Scénario | Résultat attendu |
|---|---|---|
| SEC-ISO-01 | Membre Org A présente une ressource Org B | **REFUS**, aucune donnée ou existence détaillée B |
| SEC-TPA-01 | Tenant A présente une ressource du Tenant B dans la même Organization | **REFUS**, aucune donnée B |
| SEC-TPA-02 | Tenant Portal Access Org A présente une ressource Org B | **REFUS**, aucune donnée ou relation B |
| SEC-RBAC-01 | Encaisseur tente de lire/modifier les membres | **REFUS**, aucun Membership modifié |
| SEC-RBAC-02 | Consultation tente d’enregistrer un paiement | **REFUS**, aucun Payment ni event |
| SEC-SESSION-01 | Session/appareil révoqué tente une nouvelle lecture/action | **REFUS**, nouvelle preuve requise si récupération autorisée |
| SEC-MULTI-01 | Owner A, Consultation B, B active | Capacités Consultation uniquement, aucun droit Owner hérité |
| SEC-STORAGE-01 | Membre A présente le chemin/ID d’un reçu B | **REFUS**, aucun objet ni metadata B |
| SEC-INV-01 | Invitation expirée ou déjà utilisée | **REFUS**, aucune permission créée |
| SEC-PAY-01 | Permission `payment.record` retirée entre résumé et confirmation | **REFUS**, aucun event paiement |

## 17. Stratégie de tests automatiques d’isolation

### 17.1 Jeu minimal fixe

- Org A et Org B.
- Owner A, gestionnaire A, encaisseur A, gardien A, comptable A, consultation A.
- Un User Owner A + Consultation B.
- Un non-membre.
- Tenant A1 et A2 avec accès portail séparés.
- Tenant B1.
- Property/Unit/Lease/Due/Payment/Receipt/File/Event/Notification dans A et B.
- Sessions actives puis révoquées.

### 17.2 Matrice par ressource

Pour chaque table/endpoint/bucket tenant-scoped, tester :

1. rôle autorisé dans A : succès limité à A ;
2. rôle insuffisant dans A : refus ou projection minimisée attendue ;
3. membre A vers ID B : refus ;
4. non-membre vers A : refus ;
5. User A+B avec A active : requête applicative limitée à A ;
6. Portal A1 vers sa ressource : succès lecture ;
7. Portal A1 vers A2 : refus ;
8. Portal A1 vers B1 : refus ;
9. session/Membership/Portal Access révoqué : refus immédiat attendu ;
10. tentative de mutation cross-tenant : aucun effet ni Domain Event.

### 17.3 Niveaux de tests

- Tests de politique RLS sur base locale/CI réinitialisée.
- Tests d’intégration serveur avec session réelle de chaque fixture.
- Tests Storage sur upload, lecture, remplacement et URL expirée.
- Tests E2E des liens profonds et changement d’Organization.
- Tests de régression exécutés à chaque nouvelle table, vue, fonction, bucket ou capacité.

Une feature tenant-scoped ne sort pas si elle n’a pas ses cas A/B, non-membre et rôle insuffisant.

## 18. Critères de sortie sécurité

- Toute entité tenant-scoped a une stratégie RLS documentée.
- Les deux chemins Membership/Portal Access sont distincts et testés.
- Les vues minimisées ne contournent pas RLS.
- Storage reste privé et les reçus n’ont aucune URL permanente.
- Le navigateur ne reçoit aucun `service_role` ou secret.
- Les six scénarios imposés par le brief passent conceptuellement dans la matrice.
- La révocation est couverte par des tests de session active/ancienne.
- Aucun SQL ou projet réel n’a été créé.

Cette stratégie est **VALIDÉE** par D-073 à D-076. Le fournisseur concret de `PhoneOtpProvider` demeure volontairement différé jusqu’avant 6E ; cela ne bloque pas le Lot 5A, qui reste non commencé.

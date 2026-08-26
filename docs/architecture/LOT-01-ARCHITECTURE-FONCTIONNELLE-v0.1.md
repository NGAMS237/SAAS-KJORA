# Kjora — Lot 1 — Architecture fonctionnelle v0.1

> Statut du document : **VALIDÉ PAR BLAISE — Lot 1**  
> Portée : architecture fonctionnelle et produit, sans implémentation  
> Version : v0.1 — 24 août 2026

## 1. Objectif du lot

Définir et consigner l’architecture fonctionnelle validée de Kjora : frontière entre Core et modules métier, modèle conceptuel d’accès par organisation, contrat minimal des événements/notifications/audit et boucle principale de l’Organization Owner. Les questions résiduelles marquées **À VALIDER** ne sont pas tranchées.

## 2. Statut des sources et règle de lecture

- **CONSTAT VÉRIFIÉ** — Le brief `Lot 1 — Architecture fonctionnelle v0.1`, fourni dans `regles`, est disponible ; ses quatre copies sont identiques.
- **CONSTAT VÉRIFIÉ** — Le skill `pilot-africa-rental-saas` et les sources officielles d’origine ont été lus dans `kjora-brand-kit-v1.2-production.zip`.
- **CONSTAT VÉRIFIÉ** — `for-agents/CONTEXT_INDEX.md` et `for-agents/CODEX_ADVANCED_WORKFLOW.md` ont aussi été lus. Le Design System n’a pas été chargé, car ce lot ne produit aucune UI.
- **CONSTAT VÉRIFIÉ** — Le skill est indiqué comme brouillon non installé dans `PROJECT_STATE.md` et ses liens relatifs ne correspondent pas à son emplacement dans l’archive. La lecture directe des fichiers adjacents permet néanmoins d’appliquer leur contenu sans ambiguïté.
- **CONSTAT VÉRIFIÉ** — `project-context/PROJECT_CONTEXT.md`, `project-context/DECISIONS.md` et `project-context/PROJECT_STATE.md` sont maintenant présents dans le repository et intègrent la validation D1 à D8.
- **CONSTAT VÉRIFIÉ** — Le Lot 1 est validé ; le Lot 2 est non commencé.

### Légende

- **CONFIRMÉ** : décision approuvée par Blaise et enregistrée dans les sources officielles.
- **PROPOSITION** : choix de conception réversible soumis à Blaise.
- **À VALIDER** : question ou arbitrage encore ouvert ; aucune réponse n’est présumée.

## 3. Décisions confirmées utilisées

Les décisions suivantes sont **CONFIRMÉES dans `DECISIONS.md` et/ou `PROJECT_CONTEXT.md`** et reprises par le brief du Lot 1 :

1. Kjora est un SaaS mobile-first de gestion locative pour propriétaires immobiliers.
2. Le Cameroun est le premier marché ; le français et l’anglais sont prévus ; le XAF est la devise initiale.
3. Le produit est multi-utilisateur et multi-tenant ; un User peut appartenir à plusieurs Organizations autonomes et administrer plusieurs d'entre elles.
4. Toute donnée métier appartient à une organisation.
5. L’isolation devra être imposée côté serveur/base dans une phase technique future ; elle ne repose jamais seulement sur l’interface.
6. L’architecture suit un Core et des modules métier indépendants. Une défaillance de module ne doit pas rendre l’ensemble de l’application inutilisable.
7. Les notifications et emails sont orchestrés autour d’événements métier.
8. Le futur projet Supabase de Kjora est distinct de VERALUZ ; les responsabilités Resend Auth/transactionnel restent séparées.
9. Les règles camerounaises variables ne sont pas inscrites en dur dans la logique principale ; elles relèvent d’une configuration pays.
10. Aucun agent ne constitue à lui seul la mémoire du projet.
11. Le produit est Web/PWA d’abord ; les stores mobiles restent ultérieurs à partir d’une base de code commune.
12. Les paiements initiaux prévus sont espèces, MTN Mobile Money, Orange Money et virement.
13. Kjora reste un nom de travail provisoire.
14. Le travail s’effectue par petits lots avec critères d’acceptation avant développement.

**PROPOSITION** — Chaque ressource métier porte explicitement son contexte `organization_id` afin de matérialiser la décision tenant.

**CONTRAINTE DU LOT — RESPECTÉE :** aucun code applicatif, schéma de base, fournisseur configuré, secret, déploiement ou choix définitif de stack n’est produit.

## 4. Principes d’architecture fonctionnelle

| Statut | Principe | Conséquence fonctionnelle |
|---|---|---|
| **CONFIRMÉ** | Tenant métier | Toute ressource métier est rattachée à une organisation et l’isolation est imposée côté serveur/base lors de la phase technique. |
| **CONFIRMÉ — D-021/D-025** | Accès tenant | L’accès exige un Membership actif, un rôle principal et une capacité valide pour l’organisation active. |
| **CONFIRMÉ — Lot 1** | Dépendance du Core | Le Core ne dépend d’aucun module métier et conserve identité, accès, configuration et fonctionnement minimal quand un module est indisponible. |
| **CONFIRMÉ — Lot 1** | Propriété claire des données | Chaque bloc est seul propriétaire de ses données conceptuelles ; les autres blocs utilisent un contrat public ou un événement. |
| **CONFIRMÉ — Lot 1** | Dépendances orientées | Les dépendances vont des modules vers le Core et, exceptionnellement, vers les contrats publics d’autres modules ; aucune boucle n’est admise. |
| **CONFIRMÉ — D-010/Lot 1** | Fait avant communication | Une opération métier réussie produit un fait ; notification, activité, audit et email le consomment séparément. |
| **PROPOSITION** | Dégradation maîtrisée | Une communication en échec est marquée à reprendre ; le fait métier reste acquis. Le niveau de garantie de l’audit reste **À VALIDER**. Un module désactivé n’est plus proposé, sans casser la navigation Core. |
| **CONFIRMÉ** | Localisation configurable | Langue, devise et règles pays sont portées par le contexte et la configuration, pas par des règles variables figées dans le métier. |
| **CONFIRMÉ — D-024** | Simplicité mobile-first | Les parcours demandent le minimum de données, exposent une action principale et utilisent un vocabulaire concret en FR/EN. |

## 5. Synthèse Core / modules

### Core

**CONFIRMÉ — Lot 1** — Le Core porte les capacités transversales suivantes : identité/authentification, organisations, memberships, autorisation, configuration pays, i18n, registre de modules et options, événements de domaine, notifications in-app, communications, audit et réglages communs.

**CONFIRMÉ — Lot 1** — Le Core ne contient pas la logique de gestion des biens, locataires, contrats, loyers ou paiements.  
**CONFIRMÉ — Lot 1** — Notifications et communications appartiennent au Core comme capacités transversales, tout en restant deux responsabilités distinctes.  
**CONFIRMÉ — D-028** — Organizations distingue conceptuellement Organization, Organization Profile, Organization Branding et Organization Settings ; fichiers, documents et communications restent tenant-scoped.  
**CONFIRMÉ — Lot 1** — L’audit de contrôle et le fil d’activité lisible par l’utilisateur sont deux vues différentes d’un même fait lorsque pertinent ; les exigences techniques d’inaltérabilité restent à définir ultérieurement.

### Modules métier

**CONFIRMÉ — Lot 1** — Les modules sont : Properties, Units, Tenants, Leases, Rent/Dues/Schedules, Payments & Receipts, Expenses, Maintenance, Documents et Reporting.

**CONFIRMÉ — D-023/D-024** — La boucle MVP utilise Properties, Units, Tenants, Leases, Rent/Dues/Schedules et Payments & Receipts. Documents peut fournir l’artefact tenant-scoped du reçu sans posséder sa vérité métier.  
**CONFIRMÉ — D-024** — Le dashboard simple utilise un read model opérationnel et ne dépend pas de Reporting avancé.  
**CONFIRMÉ — Lot 1** — Expenses et Maintenance restent découplés de la boucle principale et peuvent être désactivés.  
**CONFIRMÉ — D-023** — Payments et Receipts sont deux capacités séparées dans le même module ; le paiement est la source de vérité et seul `PAYMENT_COMPLETED` autorise le reçu final.

La carte détaillée, les contrats et la matrice de dépendance figurent dans `CORE-MODULE-MAP-v0.1.md`.

## 6. Modèle d’accès multi-tenant

**CONFIRMÉ — D-021** — Une identité utilisateur est globale et peut posséder plusieurs Memberships ; chaque action utilise une seule organisation active.  
**CONFIRMÉ — D-021/D-025** — `Membership` relie un User à une Organization et porte un rôle principal au MVP ; aucune permission ne passe d’une organisation à une autre.  
**CONFIRMÉ — D-022** — Un utilisateur peut administrer plusieurs Organizations indépendantes. `Organization Owner` contrôle le compte Kjora et ne constitue pas une preuve de propriété juridique des immeubles.  
**CONFIRMÉ — D-025** — Les six rôles fixes sont propriétaire / `Organization Owner`, gestionnaire, encaisseur, gardien, comptable et consultation ; refus par défaut et aucun rôle personnalisé au MVP.  
**À PRÉCISER ULTÉRIEUREMENT** — La matrice exhaustive des capacités doit appliquer D-025 sans inventer de rôle ou de privilège.

Le détail et les scénarios Org A / Org B / non-membre figurent dans `IDENTITY-ORGANIZATION-RBAC-v0.1.md`.

## 7. Événements, notifications, activité et audit

**CONFIRMÉ — Lot 1** — Un événement métier décrit un fait passé, jamais une instruction d’envoyer un message.  
**CONFIRMÉ — Lot 1** — Le catalogue v0.1 se limite à dix faits utiles à la boucle principale : création de bien et locataire, activation du contrat, création/échéance proche/retard du loyer attendu, enregistrement et complétion du paiement, génération du reçu et partage d’un document.  
**CONFIRMÉ — D-023/D-027** — `PAYMENT_RECORDED` signifie enregistré sans confirmation définitive ; `PAYMENT_COMPLETED` signifie encaissé/confirmé et autorise seul `RECEIPT_GENERATED`.  
**PROPOSITION** — Chaque consommateur traite le fait de façon idempotente et peut reprendre après échec sans bloquer l’opération métier déjà réussie.  
**À VALIDER** — Canaux effectivement présents au MVP et destinataires de chaque communication.

Le contrat conceptuel figure dans `EVENT-NOTIFICATION-AUDIT-v0.1.md`.

## 8. Parcours propriétaire et MVP validé

**CONFIRMÉ — D-024** — La boucle est : **Bien → Unité → Locataire → Contrat → Échéance / loyer attendu → Paiement → Reçu → Visibilité propriétaire**.

**CONFIRMÉ — D-024** — Le MVP IN couvre paiements manuels, paiements partiels avec règles minimales, reçus, délégation minimale, notifications in-app utiles, activité, audit, dashboard opérationnel simple, FR/EN, Cameroun et XAF.  
**CONFIRMÉ — D-027** — Mobile Money est saisi manuellement au MVP ; aucune intégration automatique MTN/Orange.  
**CONFIRMÉ — D-024/D-026/D-027** — Reporting avancé, biométrie et intégration Mobile Money automatique sont MVP OUT. Les autres éléments proposés hors MVP restent à prioriser ultérieurement.

Le parcours, les états et les frictions sont détaillés dans `OWNER-JOURNEY-MVP-v0.1.md`.

## 9. Décisions de validation du Lot 1

| Décision | Statut | Application |
|---|---|---|
| D-021 | **CONFIRMÉ** | Multi-organisation, une organisation active, aucune agrégation ou permission croisée. |
| D-022 | **CONFIRMÉ** | Plusieurs Organizations administrables ; `Organization Owner` n’est pas une preuve de propriété juridique. |
| D-023 | **CONFIRMÉ** | Payments/Receipts séparés dans le même module ; reçu après `PAYMENT_COMPLETED`. |
| D-024 | **CONFIRMÉ** | Boucle et périmètre MVP, paiements partiels inclus, dashboard par read model opérationnel. |
| D-025 | **CONFIRMÉ** | Six rôles fixes, capacités explicites, refus par défaut, un rôle principal par Membership. |
| D-026 | **CONFIRMÉ** | Email/OTP ou lien sécurisé + PIN quotidien sur appareil autorisé ; biométrie hors MVP. |
| D-027 | **CONFIRMÉ** | Moyens de paiement saisis manuellement ; architecture compatible avec confirmation Mobile Money future. |
| D-028 | **CONFIRMÉ** | Tenant autonome, profil/branding/settings organisationnels, stockage tenant-scoped, monolithe modulaire évolutif. |

## 10. Risques et mesures proposées

| Risque | Niveau | Statut | Mesure proposée |
|---|---:|---|---|
| Une proposition future est interprétée comme une décision validée | Élevé | Gouvernance D-016 **CONFIRMÉE** | Conserver les statuts et ne pas étendre D-021 à D-028 sans validation. |
| Fuite entre organisations | Critique | D-005/D-021/D-028 **CONFIRMÉES** | Tenant explicite sur chaque ressource et autorisation imposée côté serveur/base lors de la phase technique. |
| Couplage entre modules | Élevé | Garde-fous **PROPOSITION** | Propriété unique des données, contrats publics, événements et matrice de dépendance. |
| Notification indisponible bloquant le métier | Élevé | O-006 **PROPOSITION** | Valider O-006 : séparer le fait métier de ses consommateurs et prévoir reprise/idempotence conceptuelles. |
| Dérive du périmètre MVP validé | Élevé | D-024 **CONFIRMÉE** | Empêcher l’ajout automatique de Reporting avancé, Mobile Money automatique ou autres modules complémentaires. |
| Complexité pour utilisateurs peu techniques | Élevé | Mesure **PROPOSITION** | Étapes courtes, données minimales, libellés simples, états et récupération explicites. |
| Règles pays devenant rigides | Moyen | D-002 **CONFIRMÉE** | Conserver langue, devise et règles variables dans la configuration pays. |

## 11. Critères d’acceptation et résultat du contrôle v0.1

| Domaine | Critère | Résultat |
|---|---|---|
| Gouvernance | Aucune question ouverte présentée comme confirmée ; propositions visibles ; source de vérité alignée après validation | **SATISFAIT** |
| Core/modules | Frontières, responsabilités et dépendances explicites ; aucune dépendance circulaire proposée | **SATISFAIT** |
| Résilience | Core utilisable si un module est désactivé ; communication non bloquante | **SATISFAIT conceptuellement** |
| Multi-tenant | Ressources métier tenant-scoped ; contrôle non limité à l’UI ; Org A/Org B/non-membre couverts | **SATISFAIT conceptuellement** |
| Événements | Faits séparés des notifications, communications, activité et audit ; reprise/idempotence abordées | **SATISFAIT conceptuellement** |
| MVP | Boucle complète, mobile-first, FR/EN, MVP IN validé | **SATISFAIT — D-024** |
| Périmètre | Aucun code, SQL, secret, déploiement ou fournisseur configuré | **SATISFAIT** |
| Sources officielles | Skill, état, contexte, décisions et roadmap chargés et recoupés | **SATISFAIT** — lecture directe dans l’archive |

Le Lot 1 est **validé, documenté et contrôlé**. Les propositions et questions résiduelles qui ne figurent pas dans D-021 à D-028 conservent leur statut et exigent une validation future distincte.

## 12. Source de vérité après validation

- `project-context/DECISIONS.md` : D-021 à D-028 enregistrées comme confirmées ; anciennes hypothèses conservées comme remplacées.
- `project-context/PROJECT_CONTEXT.md` : architecture fonctionnelle, tenant branding et périmètre MVP intégrés.
- `project-context/PROJECT_STATE.md` : Lot 1 validé ; Lot 2 non commencé.

**CONSTAT VÉRIFIÉ** — Ces mises à jour documentaires sont appliquées sans code, SQL, Supabase, déploiement ou secret.

## 13. Décisions validées par Blaise

1. **D1 / D-021 — Multi-organisation : CONFIRMÉ.**
2. **D2 / D-022 — Multi-ownership et sens d’`Organization Owner` : CONFIRMÉ.**
3. **D3 / D-023 — Frontière Payments / Receipts et déclencheur du reçu : CONFIRMÉ.**
4. **D4 / D-024 — Périmètre MVP et dashboard opérationnel : CONFIRMÉ.**
5. **D5 / D-025 — Structure RBAC du MVP : CONFIRMÉ.**
6. **D6 / D-026 — Email/OTP, PIN et appareil autorisé : CONFIRMÉ.**
7. **D7 / D-027 — Mobile Money manuel et évolution événementielle : CONFIRMÉ.**
8. **D8 / D-028 — Tenant autonome, profil, branding, settings et stockage : CONFIRMÉ.**

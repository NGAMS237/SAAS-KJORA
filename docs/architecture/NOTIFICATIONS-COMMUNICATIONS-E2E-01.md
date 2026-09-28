# KJORA — NOTIFICATIONS-COMMUNICATIONS-E2E-01 v4

**Statut :** livré localement (un commit, un patch autonome). **Remplace entièrement v1, v2 et v3** (correctif final minimal de la v3). Rien n'a été appliqué sur KJORA Dev, rien sur Production. Aucun push, aucune fusion, aucun changement Vercel. Aucun vrai courriel envoyé, aucune clé réelle utilisée.
**Date :** 2026-09-27
**Branche :** `claude/notifications-communications-e2e-01`
**Base :** arbre `8f24c04e20d43d24eb438c571c570050966b81d6` (commit local `9f783ea`)
**Verdict officiel :** la CI Supabase éphémère réelle. Les résultats pgTAP ci-dessous viennent d'un PostgreSQL 16 local qui reproduit l'amorce Supabase : approximation fidèle, pas la CI.

---

## 0. Gate et base

La CI confirmée porte sur `954c5b558c64c2ce56ea52d1bd5caf0544f0552b` (run 36338943940, SUCCESS). Le dépôt de travail ne peut pas atteindre `origin` (bundle local, sans identifiants GitHub). Le lot part donc du commit local `9f783ea`, publié en `954c5b5`.

**Vérification avant application :**

```
git fetch origin
git rev-parse 954c5b5^{tree}   # doit afficher 8f24c04e20d43d24eb438c571c570050966b81d6
```

Si l'arbre diffère, ne pas appliquer le patch : me le signaler.

L'arbre Git obtenu après application du patch v4 est indiqué dans le message de livraison et dans la copie de ce rapport jointe au patch. Il ne peut pas figurer dans un fichier du commit lui-même, puisqu'il dépend de son contenu.

---

## 1. Ce que la v4 corrige par rapport à la v3 (périmètre minimal)

| # | Défaut de la v3 | Correction v4 |
|---|---|---|
| 1 | `resend` gardait sur la ligne les métadonnées de la revue g0 (`reviewed_by/at`, `review_reason`, `last_error_*`) et de l'expédition g0 (`provider*`, `sent_at`, `delivered_at`, `provider_event_at`, `provider_delayed_at`). Surtout, `reviewed_at` restait renseigné : la **finalisation tardive** de la génération 1, qui exige `reviewed_at IS NULL`, échouait donc après une expiration de bail | La décision `resend` remet à NULL `reviewed_by`, `reviewed_at`, `review_reason`, `last_error_code`, `last_error_message` (loyers ; la colonne n'existe pas côté SaaS), `provider`, `provider_message_id`, `sent_at`, `delivered_at`, `provider_event_at`, `provider_delayed_at` et `last_claim_token` (jeton de g0), puis pose `next_attempt_at = now()`, `attempt_count = 0`, `resend_generation + 1`. L'historique de la décision reste dans `administrative_audit_log` et `platform_operation_runs`. `confirm_sent` et `abandon` sont inchangés (horodatage de la revue conservé sur la ligne) |
| 2 | L'unicité de `provider_message_id` entre les deux files n'était contrôlée que par `EXISTS`, ce qui ne suffit pas en concurrence, et ne couvrait pas `complete_*` | Mécanisme commun `private.reserve_provider_message_id(id, file, ligne)` : verrou transactionnel déterministe `pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('kjora.provider_message_id:' ‖ id, 0))`, vérification des **deux** tables sous ce verrou, exclusion de la seule ligne cible, refus si l'identifiant appartient à une autre ligne. Utilisé **exactement** par les quatre chemins : `complete_message_delivery`, `complete_billing_email_delivery`, `admin_resolve_delivery_review` (`confirm_sent`) et `private.apply_provider_event_to_queue`. `complete_*` renvoie `false` sans rien affecter ; le worker place alors la ligne en `delivery_unknown` / `finalization_failed`, sans renvoi automatique. Fonction non exposée (ni `authenticated`, ni `service_role`) |

Aucune autre fonctionnalité n'a été modifiée. Toutes les protections v3 sont conservées et retestées.

## 1 bis. Rappel : ce que la v3 corrigeait par rapport à la v2

| # | Défaut de la v2 | Correction v3 |
|---|---|---|
| B | **Bloquant :** l'étiquette webhook `kjora_delivery` (`rent_<uuid>` / `saas_<uuid>`) ne portait pas la génération. Un webhook **retardé** d'une ancienne génération pouvait donc lever la revue d'une génération plus récente passée en `delivery_unknown` | L'étiquette porte la génération : `rent_<uuid>_g0`, `rent_<uuid>_g1`, `saas_<uuid>_g0`. `deliveryReferenceTag(file, id, génération)` ; le worker transmet `delivery.resendGeneration` ; `summarizeResendEvent` extrait `{ queue, deliveryId, resendGeneration }` ; la route transmet `p_delivery_queue`, `p_delivery_id`, `p_delivery_generation`. En SQL, le rapprochement exige `id` **et** `resend_generation` égaux. Si la génération diffère : aucune modification, outcome `generation_mismatch`, événement conservé dans l'historique. Sans étiquette, seul un `provider_message_id` exact rapproche, et jamais une levée de revue |
| 9 | File SaaS : `admin_resolve_delivery_review` mettait `next_attempt_at = now()` quelle que soit la décision | `resend` → `now()` ; `confirm_sent` et `abandon` → `NULL`. La colonne devient nullable ; NULL signifie « aucune tentative automatique prévue » (états terminaux et revue) |
| 10 | `confirm_sent` acceptait un identifiant fournisseur déjà porté par une autre ligne | Refus `provider_message_id_already_used` si l'identifiant existe déjà dans `message_deliveries` **ou** `billing_email_deliveries`. La levée de revue par webhook refuse de même un identifiant déjà affecté |

Toutes les protections de la v2 sont conservées (§2). L'étiquette de l'ancien format (sans génération) est ignorée : un tel événement n'est rapproché que par identifiant fournisseur exact.

## 1 ter. Rappel : ce que la v2 corrigeait par rapport à la v1

| # | Défaut de la v1 | Correction v2 |
|---|---|---|
| 1 | La reprise d'une ligne `processing` après expiration du bail pouvait **renvoyer** un courriel déjà accepté par Resend. L'Idempotency-Key ne protège que 24 h, et un cron quotidien peut reprendre au-delà | Point de non-retour `send_started_at`, posé en base **juste avant** l'appel fournisseur. Bail expiré après ce point → nouvel état `delivery_unknown`, jamais une nouvelle réservation. Bail expiré avant ce point → aucun appel n'a pu avoir lieu, la ligne reste réservable |
| 2 | Timeout, coupure réseau et 5xx étaient « relançables » | Classement explicite : `retryable` (429 uniquement, refus certain), `terminal` (autres 4xx), `ambiguous` (timeout, coupure, 5xx, 409, 2xx sans identifiant). Tout résultat `ambiguous` → `delivery_unknown`, **aucune relance automatique** |
| 3 | Crash entre l'acceptation fournisseur et l'écriture en base | Revue Admin (`finalization_failed`, ou `worker_lease_expired` à l'expiration du bail). Une finalisation tardive portant le jeton de la réservation **et** l'identifiant fournisseur lève l'ambiguïté (preuve) |
| 4 | Aucune décision humaine possible | `admin_resolve_delivery_review` : `confirm_sent` (identifiant Resend exigé), `resend` (nouvelle génération, donc nouvelle clé, risque de doublon **accepté explicitement**), `abandon`. Motif obligatoire, audité dans `administrative_audit_log` et `platform_operation_runs` |
| 5 | Webhook `email.failed` ignoré | `email.failed` → `provider_failed` : terminal, jamais « livré », jamais relancé. `email.delivery_delayed` est enregistré comme information seule. `email.sent` sert de preuve pour lever une revue. Idempotence par `event_id` conservée ; historique consigné (type, file, effet) |
| 6 | `Sec-Fetch-Site` absent acceptait l'écriture | Seules `same-origin` et `none` écrivent. Absent → **aucune écriture** (lecture seule `peek_notification`). `cross-site` / `same-site` → ni lecture ni écriture. Le marquage « lu » au clic passe par une Server Action (POST, contrôle d'origine Next), indépendante de l'en-tête |
| 7 | Documentation : backoff 5/30/120 min présenté comme un horaire | Ce sont des **délais minimaux**. Sur Vercel Hobby, le cron est quotidien : une relance part au **prochain passage quotidien ou sur déclenchement Admin**. L'interface l'affiche |
| 8 | Affirmations absolues sur l’absence de doublon, non démontrées | Retirées. Seule la garantie démontrée est énoncée (§2). Un test Node échoue si une affirmation non démontrée réapparaît |

Le reste de la v1 est conservé sans changement de comportement : lecture et ouverture des notifications, destinations fermées, rattrapage des avis d'échéance, réglages propriétaire, factures SaaS XAF automatiques, supervision Admin, correctif de l'ordre du consentement 01I.

---

## 2. Garantie anti-doublon : ce qui est garanti, et ce qui ne l'est pas

**Garanti (démontré par pgTAP et Node) :** au plus **une** tentative d'expédition **automatique** susceptible d'avoir été acceptée par le fournisseur, par ligne de file et par génération.

**Pas garanti :** ce système n'est **pas** « exactly-once ».
- Une ligne `delivery_unknown` a pu être délivrée ou non. Tant qu'aucune preuve n'arrive (webhook, finalisation tardive) et qu'aucun Admin n'a décidé, elle ne part plus.
- La décision Admin « ré-expédier » peut produire un doublon. Elle est prise en connaissance de cause, motivée et auditée.
- L'Idempotency-Key Resend (`kjora-<file>-<id>[-r<génération>]`) réduit les doublons dans sa fenêtre de 24 h. Ce n'est **pas** la garantie.

### Cycle d'une ligne (loyers et SaaS)

| État | Sens | Terminal pour l'automatisme ? |
|---|---|---|
| `pending` | En file | Non |
| `processing` | Réservée (jeton). `send_started_at` posé = point de non-retour | Non |
| `sent` | Identifiant fournisseur reçu | Non (attend un webhook) |
| `delivered` | Webhook `email.delivered` | **Oui, succès** |
| `failed` (attempt_count < 3) | Refus **certain** (429) ou échec **avant** tout appel (rendu PDF, crash avant le point de non-retour) | Non : relance au prochain passage quotidien ou déclenchement Admin |
| `failed` (attempt_count = 3) | Refus définitif (4xx) ou tentatives épuisées | **Oui** |
| `delivery_unknown` | Issue ambiguë : timeout, 5xx, 409, 2xx sans identifiant, crash après le point de non-retour | **Oui** — seule une décision Admin ou une preuve fournisseur la fait évoluer |
| `provider_failed` | Webhook `email.failed` | **Oui**, jamais « livré » |
| `bounced` / `complained` / `suppressed` | Webhook ; ajout à la liste de suppression (empreinte) | **Oui** |
| `cancelled` | Annulée avant tout appel, ou abandon Admin | **Oui** |

### Webhooks Resend

| Événement | Classe | Effet |
|---|---|---|
| `email.sent` | information | Lève une revue si l'étiquette `kjora_delivery` désigne la ligne `delivery_unknown` **et sa génération courante** |
| `email.delivered` | terminal succès | `sent` → `delivered` |
| `email.delivery_delayed` | information | `provider_delayed_at` renseigné, statut inchangé, **aucune ré-expédition** |
| `email.failed` | terminal échec | `sent` → `provider_failed` ; pas de liste de suppression (échec fournisseur, pas l'adresse) |
| `email.bounced` / `email.suppressed` | terminal échec | `sent` → état correspondant + liste de suppression |
| `email.complained` | terminal | `sent` ou `delivered` → `complained` + liste de suppression |
| autre | ignoré | Accusé de réception, rien d'écrit |

Aucune transition régressive : un `delivered` après `email.failed` est refusé et consigné `transition_refused`. Aucun webhook ne déclenche de relance.

L'étiquette `kjora_delivery` (`<file>_<uuid>_g<génération>`, génération 0 à 20) est posée à chaque envoi.

| Webhook reçu | Rapprochement | Effet |
|---|---|---|
| Étiquette valide, même ligne **et** même génération | `id` + `resend_generation` | Transition normale, ou levée de revue si la ligne est `delivery_unknown` sans identifiant fournisseur |
| Étiquette valide, **autre génération** | aucun | `generation_mismatch` : aucune modification, événement historisé |
| Étiquette valide, même génération, identifiant fournisseur différent de celui enregistré | aucun | `transition_refused` |
| Étiquette valide mais ligne inexistante | aucun | `no_matching_delivery` |
| Étiquette incomplète ou génération hors bornes | — | `invalid_event`, rien d'écrit |
| Sans étiquette (ou ancien format) | `provider_message_id` exact | Transition normale ; **jamais** de levée de revue |

Si Resend ne renvoie pas l'étiquette, une ligne en revue y reste et attend une décision Admin.

---

## 3. Fichiers

### Migration (1)

`supabase/migrations/20260928090000_notifications_communications_e2e_01.sql` : additive, enveloppée dans `begin;`/`commit;`. Aucun `delete`, aucun `truncate`, aucune écriture dans `auth.*`, aucun appel réseau depuis la base.

| § | Contenu |
|---|---|
| 0 | `is_deliverable_email`, `email_fingerprint`, `mask_email` ; tables privées `email_suppressions`, `email_provider_events` (idempotence **et** historique : type, file, effet), `platform_operation_runs` (+ type `delivery_review`) |
| 1 | `list_my_notifications`, `private.notification_destination`, `open_notification` (écrit), `peek_notification` (lecture seule), `set_notification_read_state` idempotente |
| 2 | Rattrapage borné des avis, réconciliation dry-run, jamais de courriel tardif |
| 3 | Réglages propriétaire ; audit `communication.settings_updated` et `communication.delivery_review_resolved` |
| 4 | `message_deliveries` : `send_started_at`, `last_claim_token`, `resend_generation`, `review_reason`, `reviewed_by/at`, `provider_delayed_at` ; états `delivery_unknown`, `provider_failed` ; RPC `claim`, `mark_…_sending`, `complete`, `fail`, `mark_…_unknown`, `cancel` (service_role seul). Les lignes `processing` héritées de l'ancien worker passent en revue, sans suppression |
| 5 | Factures SaaS automatiques ; file `billing_email_deliveries` avec les mêmes états et RPC ; mise en attente (identité légale) seulement avant le point de non-retour |
| 6 | Webhook : classement explicite, rapprochement par étiquette, idempotence (course concurrente → rejet `40001`, relivraison absorbée) |
| 7 | Orchestrateur ; supervision : `deliveryUnknown`, `providerFailed`, `deliveryDelayedAwaitingOutcome`, `retryableFailuresDueNow`, `providerEvents30d` ; `admin_list_delivery_reviews` (adresse masquée), `admin_resolve_delivery_review`, `admin_list_provider_events` |
| 8 | Ordre déterministe du journal de consentement 01I |

### Application

| Fichier | Rôle |
|---|---|
| `src/core/email/resend-transport.ts` | Classement `retryable` / `terminal` / `ambiguous` ; clé ligne + génération ; étiquette `kjora_delivery` avec génération |
| `src/core/email/resend-webhook.ts` | Svix en temps constant ; classes d'événements ; extraction de l'étiquette (objet ou liste) |
| `src/modules/communications/worker.ts` | Rendu → point de non-retour → appel unique → `complete` / `fail` / `markUnknown` |
| `src/modules/communications/server.ts` | Adaptateurs RPC (seul fichier à clé service_role, `server-only`) |
| `src/app/api/webhooks/resend/route.ts` | Transmet l'étiquette à `record_email_provider_event` |
| `src/modules/notifications/model.ts` | `isTrustedOpenNavigation` (same-origin/none), `notificationOpenMode` (open/peek/reject) |
| `src/app/api/notifications/[notificationId]/open/route.ts` | Rejet cross-site avant toute lecture ; `peek_notification` si en-tête absent |
| `src/modules/documents/views.tsx` | Marquage au clic par Server Action ; libellés d'état d'envoi explicites |
| `src/modules/platform-admin/operations-{view,actions}.ts(x)`, `src/app/administration/operations/page.tsx` | Compteurs, file des revues avec décision motivée, historique des événements fournisseur |

Le reste est inchangé depuis la v1 : pages `/app/parametres/communications` et `/administration/operations`, cron unique `/api/cron/daily-communications` (`0 1 * * *`), alias de compatibilité `/api/financial-communications/cron`.

---

## 4. Tests réellement exécutés

| Contrôle | Résultat |
|---|---|
| `npm ci` | OK, 0 vulnérabilité |
| `npm run typecheck` | OK |
| `npm run lint` | 0 erreur, 0 avertissement |
| `npm test` | **842/842** (fail 0, cancelled 0, skipped 0) : les 829 tests antérieurs au lot passent tous ; 43 tests dans `tests/notifications-communications-e2e-01.test.ts` |
| `npx next build --webpack` | OK, sans avertissement |
| `git diff --check` | OK |
| Rejeu des 50 migrations depuis une base vide | OK |
| pgTAP, 31 fichiers de régression | **31/31**, 0 échec, 1 354 assertions, dont **272** pour `rls_notifications_communications_e2e_01` |
| **Concurrence réelle (v4, harnais local, hors dépôt)** | Deux sessions `psql` distinctes sur une base de fixtures validées. Session A : `complete_message_delivery(A, 're_concurrent_same_id')` → `true`, transaction maintenue 3 s. Session B, lancée 1 s après sur une autre ligne avec le même identifiant : **bloquée** sur le verrou jusqu'au `COMMIT` de A (≈ 2 s d'attente), puis `false`. État final : A `sent` avec l'identifiant, B `processing` sans identifiant |
| pgTAP `site_app_flow_canada_intent` (protocole CI) | OK, 31/31 |

### Scénarios exigés

| Scénario | pgTAP | Node |
|---|---|---|
| Timeout ambigu | Ligne B : `provider_timeout` → `delivery_unknown`, aucune date de relance | Transport : abandon → `ambiguous/provider_timeout` ; worker : un seul appel, `markUnknown` |
| Crash après acceptation, avant finalisation | Ligne C : point de non-retour posé, bail expiré → revue ; finalisation tardive avec preuve acceptée, autre jeton refusé | `complete` qui lève ou renvoie `false` → `finalization_failed`, aucun renvoi |
| Reprise après plus de 24 h | B (revue) et C (bail +25 h) jamais réservées ; SaaS en revue +30 h jamais réservée ; refus certain (429) repris +25 h sans risque | Clé `-r1` après décision Admin ; `claim` ne sélectionne que `pending`/`failed` |
| `email.failed` | → `provider_failed`, `delivered` ultérieur refusé, pas de suppression, rien en file, compteur et historique | Classe `terminal_failure`, jamais relançable |
| `email.delivery_delayed` | Information, statut `sent` inchangé, date enregistrée, rejeu ignoré, rien en file, compteur | Classe `information` |
| `Sec-Fetch-Site` absent / cross-site | `peek_notification` : destination sans écriture (`read_at` reste NULL) | Absent → `peek`, cross-site/same-site/inconnu → `reject` avant toute lecture ; seules same-origin/none écrivent |
| **Unicité fournisseur (v4)** | `complete_billing_email_delivery` refuse un identifiant de la file loyers ; `complete_message_delivery` refuse un identifiant de la file SaaS et un identifiant d'une autre ligne loyers ; dans chaque cas aucune affectation, ligne toujours `processing`, identifiant porté par sa seule ligne d'origine ; ligne refusée → `finalization_failed` ; identifiant libre accepté dans chaque file ; le webhook refuse toujours la levée de revue avec un identifiant déjà affecté ; `confirm_sent` conserve son refus (tests v3). Preuve SQL (`pg_proc.prosrc`) : les quatre chemins appellent `private.reserve_provider_message_id`, qui prend `pg_catalog.pg_advisory_xact_lock` ; aucun `EXISTS` isolé ne subsiste ; fonction non exécutable par `authenticated` ni `service_role` | Test statique : les quatre corps de fonction appellent le mécanisme commun, `complete_*` refuse avant toute écriture |
| **Nouvelle génération propre + finalisation tardive g1 (v4)** | Loyers (L) **et** SaaS (K) : g0 → `delivery_unknown` ; métadonnées g0 résiduelles simulées ; Admin `resend` → g1 ; **toutes** les métadonnées nettoyées (13 colonnes loyers, 12 SaaS, plus `last_claim_token`), `next_attempt_at ≈ now()` ; décision toujours dans `administrative_audit_log` et `platform_operation_runs` ; réservation g1 et `send_started_at` ; bail expiré → `delivery_unknown` (`worker_lease_expired`), jamais re-réservée ; finalisation tardive : jeton étranger refusé, identifiant déjà affecté refusé, jeton exact de g1 **accepté** → `sent`, sans webhook ; webhook g0 retardé (`email.delivered` pour L, `email.failed` pour K) → `generation_mismatch` | Test statique : la branche `resend` remet chaque colonne à NULL dans les deux files |
| **Génération (v3, obligatoire)** | Ligne H : g0 → `delivery_unknown` ; Admin `resend` → g1 ; g1 → `delivery_unknown` ; webhook retardé g0 (`email.delivered` puis `email.sent`) → `generation_mismatch`, g1 reste `delivery_unknown` sans identifiant, événement historisé avec sa file ; même identifiant g0 sans étiquette → `no_matching_delivery` ; rejeu g0 → `duplicate_event` ; webhook g1 → `review_resolved`, ligne livrée avec l'identifiant g1 ; même génération, autre identifiant → `transition_refused`. Même scénario g0/g1 sur la file SaaS | Aller-retour étiquette g0/g1/g7/g20 ; ancien format, g21, g01, casse, valeurs hostiles ignorés ; le worker transmet la génération ; la route transmet file/ligne/génération |
| **Durcissements SaaS (v3)** | En revue : `next_attempt_at` NULL ; `confirm_sent` → NULL ; `resend` → `now()` et génération 1 ; `abandon` → NULL ; rien de réservable ensuite ; file incohérente → `delivery_not_found` | — |
| **Unicité de l'identifiant (v3)** | `confirm_sent` refusé pour un identifiant déjà porté par une ligne loyers (depuis la file SaaS) ou par une autre ligne ; identifiant libre accepté | — |
| Revue Admin | Refus au propriétaire, motif obligatoire, identifiant exigé pour `confirm_sent`, décision fermée, ligne envoyée non ré-expédiable, 3 décisions auditées sans adresse, nouvelle génération repartie seule | — |

---

## 5. Matrice navigateur — **NON EXÉCUTÉE**

Il faudrait GoTrue, PostgREST et Storage ; l'environnement local n'a que PostgreSQL. **Aucune ligne n'est présentée comme passée.** À dérouler sur KJORA Dev, en Chrome, Safari iOS, Firefox et Edge, bureau et mobile (≤ 390 px) :

| # | Parcours | Attendu |
|---|---|---|
| B1 | Cloche → avis d'échéance | PDF dans un nouvel onglet ; badge immédiat ; lue après rechargement |
| B2 | « Tout marquer comme lu » | Badge à 0, persistant |
| B3 | Centre → marquer non lue / lue | `aria-pressed` cohérent, « (lue) » / « (non lue) » annoncés |
| B4 | Retard de paiement → Ouvrir | `/app/paiements?lease=…` + bandeau |
| B5 | Crédit insuffisant → Ouvrir | État de compte |
| B6 | Document invalidé → Ouvrir | Fiche locataire / documents, jamais « Ressource introuvable » |
| B7 | `/api/notifications/<uuid inconnu>/open` | Centre + « n'est plus disponible » |
| B8 | Même URL ouverte depuis un autre site | Centre ; notification **non** lue |
| B9 | Navigateur sans `Sec-Fetch-Site` (ex. Safari < 16.4) : clic dans la cloche | Destination atteinte ; marquage par la Server Action du clic |
| B10 | Réglages sans Resend configuré | Cases désactivées, message d'environnement |
| B11 | Réglages avec Resend (Dev) → Tester | Adresse de simulation uniquement |
| B12 | Collaborateur → `/app/parametres/communications` | 404 |
| B13 | Admin → Opérations → Simuler | Compteurs, ligne dry-run, acteur masqué |
| B14 | Admin → Opérations → envoi à l'issue inconnue → Décider | Motif et confirmation exigés ; `confirm_sent` exige l'identifiant ; ligne retirée de la liste ; décision dans l'historique |
| B15 | Document dont l'envoi est en revue | « Issue d'envoi incertaine — en vérification, aucun renvoi automatique » |
| B16 | FR ↔ EN | Titres, contexte, dates JJ/MM/AAAA |

---

## 6. Déploiement sur KJORA Dev (par Blaise, sur autorisation)

1. `git rev-parse 954c5b5^{tree}` doit afficher `8f24c04e20d43d24eb438c571c570050966b81d6`.
2. Nouvelle branche depuis `954c5b5`, puis `git am KJORA-NOTIFICATIONS-COMMUNICATIONS-E2E-01-v4.patch`. Sous Windows, en cas de conflit : `git am --abort` puis `git am --3way`. Ni v1, ni v2, ni v3 ne doivent être appliquées : la v4 les remplace entièrement.
3. Pousser et laisser la CI Supabase éphémère rejouer migrations et pgTAP (verdict officiel).
4. KJORA Dev uniquement : appliquer `20260928090000_notifications_communications_e2e_01.sql`.
5. Variables Dev, **tout désactivé** : `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=false`, `KJORA_SAAS_AUTO_INVOICING_ENABLED=false`, `CRON_SECRET` (≥ 16 caractères), `RESEND_WEBHOOK_SECRET`.
6. Admin → Opérations : simulation et comptage des avis manquants ; puis création des avis par lots de 50, sans courriel.
7. Matrice B1 à B16.
8. Ensuite seulement, séparément : `RESEND_TRANSACTIONAL_API_KEY`, `KJORA_TRANSACTIONAL_EMAIL_FROM` (domaine vérifié), `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=true`. Webhook Resend → `/api/webhooks/resend` avec les événements `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.failed`, `email.bounced`, `email.complained`, `email.suppressed`.
9. Surveiller « Issue inconnue » dans Opérations : chaque ligne demande une vérification dans le tableau de bord Resend avant décision.

**Cadence réelle :** un passage automatique par jour (Vercel Hobby, `0 1 * * *` UTC, en Production Vercel seulement). Les délais 5/30/120 min ne sont que des minimums : une relance part au prochain passage quotidien ou sur déclenchement Admin. Sur Dev/Preview, seul le déclenchement Admin fait partir les files.

---

## 7. Rollback (documenté, jamais exécuté)

Principe : ne jamais supprimer de données pour rendre un retour possible. Une table non vide est un signal d'arrêt et une décision humaine.

1. **Neutralisation immédiate sans migration :** `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=false` et `KJORA_SAAS_AUTO_INVOICING_ENABLED=false`. Les files restent intactes ; les lignes en revue restent en revue.
2. **Application :** `git revert` du commit et restauration de `vercel.json`.
3. **Base, ordre inverse :**
   - §7 : `drop function` des RPC Admin (dont `admin_resolve_delivery_review`, `admin_list_delivery_reviews`, `admin_list_provider_events`) et de l'orchestrateur ;
   - §0 (v4) : `drop function private.reserve_provider_message_id(text, text, uuid)` seulement **après** les fonctions qui l'appellent ;
   - §6 : `drop function record_email_provider_event(text, text, text, timestamptz, text, uuid, integer)` et `private.apply_provider_event_to_queue(text, text, text, timestamptz, uuid, integer)` ;
   - §5 : triggers SaaS ; `admin_issue_manual_invoice` et `admin_run_billing_reminders` (versions 01B/01C) ; `billing_email_deliveries` **si vide** ;
   - §4 : RPC de file ; contraintes `send_state`, `review_state`, `claim_state` ; contrainte de statut d'origine **seulement si** aucune ligne n'est en `delivered`, `delivery_unknown`, `provider_failed`, `bounced`, `complained` ou `suppressed` (sinon : arrêt, décision humaine). Les colonnes ajoutées restent (additives) ;
   - §2/§3 : `prepare_financial_communications`, `queue_automatic_delivery`, `run_financial_daily` (versions lot_6c3) ;
   - §1 : `drop function list_my_notifications, open_notification, peek_notification, private.notification_destination` ; `set_notification_read_state` (lot_6d) ;
   - §8 : `admin_list_marketing_consent_history` (01I).
   - Tables privées : supprimées seulement si vides.

---

## 8. Variables (noms seulement)

`RESEND_TRANSACTIONAL_API_KEY`, `KJORA_TRANSACTIONAL_EMAIL_FROM`, `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED`, `RESEND_WEBHOOK_SECRET`, `KJORA_SAAS_AUTO_INVOICING_ENABLED`, `CRON_SECRET`, `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`), `NEXT_PUBLIC_SUPABASE_URL`, `KJORA_BILLING_LEGAL_NAME`, `KJORA_BILLING_LEGAL_ADDRESS`, `KJORA_BILLING_LEGAL_REGISTRATION`, `KJORA_BILLING_LEGAL_TAX_ID`, `KJORA_BILLING_LEGAL_CONTACT_EMAIL`, `VERCEL_ENV` (fournie par Vercel).

## 9. Limites connues

- Matrice navigateur non exécutée (§5).
- Pas d'« exactly-once » (§2). Une panne Resend prolongée (5xx) peut remplir la file des revues : c'est voulu, puisque le système préfère un blocage visible à un doublon silencieux.
- La levée automatique d'une revue par webhook suppose que Resend renvoie l'étiquette `kjora_delivery` avec la génération. Sinon, la décision reste manuelle.
- L'unicité d'un identifiant fournisseur entre les deux files repose sur le verrou consultatif commun, pris par tous les chemins d'affectation du lot. Une écriture directe en base qui contournerait ces fonctions (par exemple un `UPDATE` manuel par un superutilisateur) n'est pas couverte. Aucun index inter-tables n'existe en PostgreSQL, et un index par table aurait pu faire échouer la migration sur des données Dev existantes.
- Fonction Vercel de 60 s : au plus 4 lots de 5 courriels par file et par passage.
- Le portail locataire, qui marquait déjà ses notifications lues à l'ouverture, n'a pas été modifié.

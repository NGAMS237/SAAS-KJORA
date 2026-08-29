# KJORA — Documents financiers et notifications v0.1

> Lot 6C3 — état Production au 2026-08-28. Validation fonctionnelle Blaise en attente.

## 1. Périmètre

6C3 transforme les faits 6C1/6C2 en quatre artefacts déterministes : avis d’échéance, reçu de paiement, quittance de loyer et état de compte. Il ne crée ni Payment, ni Allocation, ni nouvelle vérité de solde, et n’ouvre pas le portail locataire.

## 2. Contrat documentaire

`financial_documents` stocke un snapshot JSON immuable, la référence, la langue destinataire, la version `6c3-v1`, les relations source et l’état `prepared`, `ready` ou `invalidated`. `prepared` signifie que la vérité documentaire est figée ; le PDF est matérialisé au premier téléchargement ou par le worker d’envoi. Le binaire est reproductible à partir du snapshot.

La référence suit `AVI|REC|QUI|ETAT-AAAA-NNNNNN`. Le numéro vient d’une séquence PostgreSQL et le trigger `financial_documents_set_reference` l’attribue dans la transaction d’insertion : il est atomique et sûr en concurrence. Des trous de séquence sont acceptables après rollback ; une même source réutilise le même document et donc le même numéro grâce à la contrainte `(organization_id, source_key)`.

Le reçu de paiement référence exactement un Payment confirmé, même partiel, et snapshotte le montant réellement reçu, sa ventilation d’allocation (loyer, charges, dépôt et crédit créé) ainsi que, pour les Dues liées, le total, le crédit appliqué distinct, les Payments alloués et le restant. Une allocation dépôt est donc identifiée comme dépôt de garantie dans le reçu, jamais comme loyer. La quittance référence une Due périodique intégralement soldée et tous ses Payments contributeurs via `financial_document_payments`. Un paiement partiel ne crée jamais de quittance. Le dépôt ne devient jamais un loyer.

Le patch UX post-6C3 ajoute `prepare_payment_receipt(uuid)`, point d’entrée authentifié immédiat et idempotent. Il contrôle `auth.uid()`, l’Organization du Payment et `receipt.view`, puis délègue à `private.prepare_payment_documents` ; la contrainte de source 6C3 réutilise le même reçu au double clic. `PUBLIC` et `anon` n’ont aucun droit d’exécution. Cette préparation ne change ni Payment, Allocation, Ledger, réglage email, watermark ni accès portail.

## 3. Invalidation

Un `PAYMENT_REVERSED` invalide le reçu du Payment et toute quittance qui le référence. Aucun enregistrement, snapshot ou fichier n’est supprimé. Les livraisons encore en attente sont annulées. Un événement `DOCUMENT_INVALIDATED` est ajouté pour chaque artefact.

## 4. PDF et Storage

Les PDF A4 sont produits côté serveur avec `pdf-lib`, sans Chromium, capture d’écran ou IA. Ils utilisent Ink/Navy, Gold, tableaux imprimables, références et montants XAF. Le bucket `financial-documents` est privé, limité à 5 Mio et `application/pdf`. Le chemin est `<organization_id>/<document_id>/v1.pdf`. Les téléchargements utilisent des liens signés valables 120 secondes.

Le profil Organization actuel ne porte que le nom, la langue, le pays, la devise et le timezone. Le snapshot utilise donc le nom Organization et le fallback texte KJORA ; Property/localité restent des informations distinctes du contrat. Aucun logo, email, téléphone ou adresse Organization n’est inventé. Leur ajout futur pourra enrichir un nouveau template sans réécrire les snapshots `6c3-v1`.

## 5. J-X, J+10, prépaiement et idempotence

Le job quotidien existant reste unique. Il appelle d’abord la génération 6C1, traite ensuite les événements Payment postérieurs à l’installation, puis prépare uniquement les avis dont `notice_date = run_on` et les rappels dont `next_reminder_date = run_on`. Les clés source/document/dédoublonnage empêchent toute duplication au rejeu. Les dates manquées ne sont pas backfillées implicitement.

À J-X, la même passe compare la prochaine Due non couverte avec les projections 6C1/6C2. Elle crée une alerte interne lorsque la dernière période prépayée est atteinte. Si un crédit a été affecté sans solder la prochaine Due, une seconde alerte expose trois valeurs positives et non ambiguës : crédit affecté, montant de l’échéance et reste attendu. Ces informations sont aussi figées dans le snapshot de l’avis ; l’éventuel email reste l’unique email d’avis J-X afin d’éviter le spam.

## 6. Notifications et email

Les notifications in-app sont adressées aux Owner et gestionnaires actifs, puis revérifient leur capability à chaque lecture. Encaisseur et comptable conservent l’accès documentaire prévu par RBAC mais ne reçoivent pas chaque alerte, afin de limiter le bruit. Les emails utilisent la langue préférée du Tenant, puis celle de l’Organization. `message_deliveries` constitue l’outbox idempotente. Le worker Vercel joint le PDF, utilise Resend côté serveur et limite les reprises à trois essais, éligibles après 5, 30 puis 120 minutes.

Le projet Vercel est sur le plan Hobby, dont la fréquence minimale est quotidienne. Le worker tourne donc à 01:00 UTC, après le job Supabase de 00:15 UTC. Les seuils de retry sont des minimums : un item éligible est repris au prochain passage quotidien. Une cadence plus fine exigera un plan Vercel compatible ou un scheduler serveur autorisé séparément.

Un email échoué ne modifie jamais Payment, Allocation, Due, Ledger ou FinancialDocument. À épuisement, une notification interne est créée avec un code contrôlé, sans secret fournisseur.

## 7. Déploiement sûr

La table de runtime fixe son watermark à l’installation : aucun `PAYMENT_COMPLETED` antérieur n’est consommé. Les quatre réglages automatiques Organization valent `false` et `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED` vaut `false` par défaut. La migration ne crée aucune ligne de réglage pour les Organizations existantes, ne prépare aucun ancien document et ne contacte aucun email.

L’activation email future exige séparément : secrets Vercel présents, flag global à `true`, puis opt-in explicite des catégories Organization. Cette activation n’appartient pas à l’application initiale de la migration.

## 8. RLS/RBAC

- avis et états de compte : `due.view` ;
- reçus et quittances : `receipt.view` ;
- envoi externe et historique de livraison : `receipt.share` ;
- Storage : capability dérivée de la métadonnée du document ;
- Gardien, Consultation, anon, non-membre et autre Organization : aucun accès financier ;
- portail : aucun accès avant le contrat `TenantPortalAccess` du Lot 6E.

Les relations `tenant_id`, `lease_id`, `due_id` et `payment_id` préparent une future projection autorisée 6E sans attribut public supplémentaire. Aucun document, objet Storage ou URL signé durable n’est exposé au portail par ce patch.

## 9. Validation et déploiement

La suite Node vérifie validation, séparation des artefacts, idempotence, Storage privé, déploiement sûr et absence de trigger bloquant. Les 68 assertions pgTAP Production couvrent génération, préparation immédiate et idempotente du reçu partiel, plusieurs Payments, J-X/J+10, compte Ledger, invalidation, rôles, Org A/B, UUID direct, anon, chemins Storage, absence d’email et absence de Payment fabriqué. Toute donnée de test a été annulée par `ROLLBACK`.

`lot_6c3_documents_notifications` (`20260828141940`) et le hardening `lot_6c3_advisor_indexes` sont appliqués. Les huit avis de clés étrangères non indexées ont été corrigés. Les index neufs sont naturellement signalés comme inutilisés tant que les tables restent vides. Les RPC publiques `SECURITY DEFINER` sont intentionnelles, retirées à `PUBLIC`/`anon` et contrôlent identité, Organization et capability.

Le patch `post_6c3_receipt_ux` (`20260829195924`) est appliqué sur KJORA Production. Il n’exécute aucun backfill, ne modifie aucun réglage email et n’ouvre aucun accès portail/public.

Au contrôle post-déploiement : 0 document, 0 livraison, 0 notification et 0 objet Storage ; les 5 Payments préexistants sont antérieurs au watermark et ne sont pas backfillés. Les interrupteurs Organization restent absents/`false` et aucun email réel n’a été envoyé.

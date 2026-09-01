# Kjora — Tenant Portal Access v0.1

> Statut au 1er septembre 2026 : **TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE**. Le téléphone OTP reste bloqué par le choix fournisseur différé D-076.

## Modèle d’accès

`User Identity ≠ Membership ≠ Tenant ≠ Tenant Portal Access`.

Une identité Supabase peut détenir plusieurs `TenantPortalAccess`, chacun borné par `organization_id`, `tenant_id` et une liste explicite de Leases. Aucun accès portail ne crée de Membership ou de rôle interne. Les tables portail ne copient jamais Lease, Due, Payment, Allocation ou FinancialDocument.

Entités dédiées :

- `tenant_portal_accesses` : association identité/Organization/Tenant et état `invited`, `active` ou `revoked` ;
- `tenant_portal_lease_accesses` : seules Leases autorisées, avec intégrité Organization + Access + Tenant ;
- `tenant_portal_invitations` : email, hash SHA-256 du jeton, expiration 7 jours et usage unique ;
- `tenant_portal_sessions` : session Auth vérifiée, au plus 30 jours, non renouvelable avec le même `session_id` expiré ;
- `tenant_portal_document_views` : état synthétique « reçu consulté » ;
- `private.tenant_portal_access_log` : événements minimisés, rétention glissante 12 mois.

Les relations enfant imposent aussi par contraintes composites la concordance `Organization + Access + Tenant`, puis `Organization + Lease + Tenant` ou `Organization + Document + Tenant`. Une incohérence ne peut donc pas être introduite même par un chemin serveur privilégié.

## Sécurité et isolation

Les tables sont RLS-enabled mais ne possèdent aucun grant direct client. Les lectures passent par des RPC minimales `SECURITY DEFINER`, `search_path = ''`, accordées à `authenticated` seulement après retrait `PUBLIC`/`anon`.

Chaque projection revérifie :

1. `auth.uid()` ;
2. `TenantPortalAccess.status = active` ;
3. le `session_id` Supabase courant, non révoqué et non expiré ;
4. Organization + Tenant ;
5. la Lease explicitement accordée.

Connaître un UUID ou un chemin Storage ne donne aucun accès. La révocation invalide immédiatement les sessions et invitations actives. Une même identité avec deux Organizations sélectionne explicitement un espace ; aucune agrégation inter-Organization n’existe.

## Invitation et authentification

Owner et gestionnaire réutilisent la capability existante `tenant_portal.manage`. Le dossier Tenant doit posséder un email exploitable ; la création du Tenant ne crée jamais automatiquement le portail.

Le workflow email est : invitation explicite → jeton brut transmis une seule fois au serveur email → hash seul en base → lien d’invitation → identité Supabase vérifiée par OTP/lien PKCE → acceptation avec correspondance exacte de l’email → session portail. Relancer invalide le jeton précédent. Une livraison email échouée révoque l’accès créé afin de ne pas laisser de jeton actif silencieux.

Le chemin OTP d’une invitation conduit d’abord à l’écran d’acceptation : il ne tente pas de créer une session portail avant que l’accès `invited` soit accepté. Le lien sécurisé utilise le callback PKCE partagé puis revient au même écran d’acceptation.

La communication utilise la préférence Tenant, sinon la langue Organization. Elle ne contient aucune donnée financière. Les emails financiers 6C3 restent désactivés.

Le PIN interne n’est jamais chargé dans le portail. Une session portail expire au plus après 30 jours ; le même `session_id` Auth ne peut pas prolonger une session portail expirée. Le téléphone OTP et le changement de canal ne sont pas implémentés dans cette passe : D-076 exige un `PhoneOtpProvider` concret avant cette partie et le Lot 6E interdit l’ajout d’un fournisseur SMS arbitraire.

## Données exposées

Les RPC portail projettent uniquement :

- Organization affichée, identité/contact du Tenant lié et langue ;
- logement, Unit, Lease active ou historique, dates, périodicité, loyer, charges et dépôt séparé ;
- prochaines échéances et ventilation issue de `dues_with_status` ;
- crédit disponible issu de `tenant_financial_positions` ;
- Payments confirmés ou reversés et leurs allocations ;
- avis, reçus de paiement et quittances liés aux Leases autorisées.

Les notes internes, membres, audit interne, outbox, santé système, autres Tenants et données d’autres Organizations ne sont jamais projetés. Le portail ne recalcule ni Ledger, ni allocation, ni statut financier.

## Documents

Les documents réutilisent les snapshots et le moteur PDF 6C3. Un artefact existant est servi depuis le bucket privé `financial-documents` par lien signé de 120 secondes ; un document préparé peut être matérialisé en mémoire avec le moteur existant. Aucun bucket ou lien permanent public n’est créé. Le reçu de Payment partiel reste disponible ; la quittance n’existe que pour une période soldée selon 6C3.

## Interface

Le layout `/portal` reste séparé de `/app`, sans navigation interne ni PIN. Les destinations sont Accueil, Loyers, Reçus et Compte. Accueil montre la Lease active en priorité ; les Leases historiques restent sélectionnables et en lecture seule. Plusieurs accès Organization utilisent un sélecteur explicite. L’interface suit la préférence FR/EN du Tenant et le design system Kjora v2.

## Audit et révocation

Le journal administratif existant reçoit invitation, relance, acceptation, révocation et réactivation. Le journal d’accès privé conserve les faits opérationnels minimisés, notamment ouverture authentifiée d’invitation, acceptation, connexion réussie, nouvel appareil/session, refus après expiration et révocation ; il purge les entrées de plus de 12 mois lors de nouvelles écritures. Aucun jeton, code, `session_id` Auth brut ou secret n’est placé dans `details`. L’interface interne n’affiche que l’état, les Leases autorisées, l’expiration d’invitation et la dernière connexion synthétique.

## Validation technique et limites

- migration principale `20260831090000_lot_6e_tenant_portal_access.sql` appliquée au seul projet Production KJORA ;
- migration corrective additive `20260831204119_lot_6e_portal_invitation_rpc_fix.sql` appliquée : elle qualifie uniquement les références des deux RPC d’invitation, sans changer leurs règles, contrôles ou grants ;
- 62/62 assertions pgTAP réussies dans une transaction annulée ; aucune ligne Access, Session, Lease ou donnée portail de test ne persiste ;
- Advisors post-migration : aucun niveau critique. Les tables portail sans policy directe sont volontairement default-deny, les RPC `SECURITY DEFINER` sont limitées à `authenticated` et contrôlent Auth/Organization/Access ;
- l’index simple `tenant_portal_lease_accesses(access_id)` n’a pas été ajouté : `EXPLAIN` utilise déjà l’index composite existant pour le chemin de suppression/rotation observé ;
- téléphone OTP, récupération/changement de canal et fournisseur SMS non implémentés ;
- notifications portail dédiées et états de compte non exposés dans ce MVP local ;
- aucun paiement provider, contrat, signature, WhatsApp ou SMS ;
- aucune activation des emails financiers.

Le commit `03c1993` est déployé `Ready` sur `https://saas-kjora.vercel.app`. La route de connexion portail répond, `/portal` refuse l’anonyme, `/app` conserve sa frontière interne et l’endpoint d’invitation refuse l’anonyme. La validation fonctionnelle du parcours réel invitation → Auth → portail → révocation demeure explicitement réservée à Blaise.

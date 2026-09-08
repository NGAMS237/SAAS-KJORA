# KJORA — Contrat d'intégration Site ↔ App v0.1

**Statut :** ALIGN-02 — contrat de handoff vers KJEMO Commercial
**Date :** 2026-09-04
**Portée :** URLs d'entrée, Auth, `plan_requested`, résolution de contexte, routage, onboarding, quotas, sécurité, analytics
**Autorité :** Ce document régit toute intégration Site ↔ App. Toute modification exige une nouvelle version.

> Ce contrat décrit ce qui est **implémenté**. Les éléments explicitement marqués `NON IMPLÉMENTÉ` ne doivent pas être annoncés comme disponibles par le site commercial.

---

## 1. Principe fondateur

Il existe **un seul Espace propriétaire réel**. Le site commercial ne fait qu'**acquisition + intention**.

KJORA reste la source de vérité unique pour : identité, contexte, Organization, plan effectif, quotas, entitlements et droits.

Le site ne crée aucun compte, n'attribue aucun plan et ne détermine aucune destination.

---

## 2. URLs d'entrée

| Usage | URL | Comportement |
|---|---|---|
| Entrée générique depuis le site | `https://app.kjora.com/?plan_requested=<slug>` | Recalcule le contexte serveur et route |
| Auth directe | `https://app.kjora.com/connexion?plan_requested=<slug>` | Écran Magic Link |
| Onboarding direct | `https://app.kjora.com/onboarding/organization?plan_requested=<slug>` | Nécessite une session |
| Callback Magic Link | `https://app.kjora.com/auth/callback?code=…&next=…` | Échange PKCE puis redirection |
| Contact Sur mesure | `https://kjora.com/contact-sur-mesure` | Route commerciale, hors application |

**Recommandation site :** utiliser `/` avec `plan_requested`. C'est la seule URL qui gère correctement le cas « utilisateur déjà connecté » (§9).

---

## 3. Paramètre `plan_requested`

### 3.1 Slugs canoniques

`decouverte` · `essentiel` · `avance` · `patrimoine` · `sur_mesure`

### 3.2 Règle de confiance

`plan_requested` provient du site : il est **NON FIABLE**.

Le serveur :

1. le parse et le valide contre la liste canonique ;
2. le conserve comme **intention** dans `onboarding_states.plan_intent` ;
3. ne l'utilise **jamais** pour attribuer un plan, un entitlement ou un quota ;
4. ne l'utilise **jamais** pour décider d'une destination de routage.

Le plan effectif est attribué exclusivement par le trigger base de données `private.auto_assign_decouverte()` (ALIGN-01). Aucun code applicatif ne peut le contourner.

### 3.3 Comportement par valeur

| Valeur | Effet |
|---|---|
| `decouverte` | Onboarding standard, plan Découverte |
| `essentiel` / `avance` / `patrimoine` | Onboarding Découverte + intention enregistrée pour un futur upgrade. **Aucun entitlement payant activé.** |
| `sur_mesure` | Redirection immédiate vers le contact commercial, avant tout formulaire. Aucune Organization créée. |
| Valeur invalide | **Fallback silencieux** : aucune erreur technique, aucune intention enregistrée, aucun droit accordé. Onboarding standard. |
| Absent | Onboarding standard |

### 3.4 Sécurité

- Jamais placé dans un JWT, un cookie de session ou un claim Supabase.
- Jamais transmis à Supabase Auth.
- Seul le slug validé est journalisé — aucune donnée personnelle.

---

## 4. Authentification

### 4.1 Mécanisme

Supabase **Email OTP / Magic Link** existant. **Aucun mot de passe classique.**

### 4.2 Flux Magic Link (PKCE)

1. L'utilisateur saisit son email sur `/connexion`.
2. `signInWithOtp({ email, options: { emailRedirectTo } })` côté navigateur.
3. `emailRedirectTo` = `/auth/callback?next=<safeNextPath>`.
4. L'utilisateur ouvre le lien → `/auth/callback?code=…&sb_flow_id=…&next=…`.
5. `exchangeCodeForSession(code)` côté serveur.
6. Succès → redirection vers `next`. Échec → `/connexion?reason=<motif classifié>`.

### 4.3 OTP (alternative)

Code à usage unique vérifié par `verifyOtp({ email, token, type: "email" })`, puis redirection vers `next`.

### 4.4 Durées

Les durées d'expiration du Magic Link et de l'OTP proviennent de la **configuration Supabase réelle du projet**. Ce contrat n'en fixe aucune et le site ne doit annoncer aucune durée.

### 4.5 `return_to` / `next` — anti open redirect

`safeNextPath` applique :

- chemin accepté seulement s'il commence par `/`, sans `//` ni `\` ;
- URL absolue acceptée seulement si son origine est identique à celle de l'application ;
- toute valeur non conforme retombe silencieusement sur `/app`.

Aucune redirection externe n'est possible via `next`.

### 4.6 Reprise après interruption

La session Supabase et `onboarding_states` sont indépendants du navigateur : un parcours interrompu reprend à l'étape enregistrée côté serveur (§7).

---

## 5. Résolution de contexte serveur

Implémentation : `src/core/routing/context-resolver.ts` — `resolveUserContext()`.

**Le navigateur ne décide jamais de son rôle, de son Organization, de son plan ni de sa destination.** Aucun paramètre d'URL (`role`, `org`, `organization_id`, `plan`, `admin`…) n'entre dans la décision. Le resolver ne lit ni `searchParams` ni `nextUrl`.

### 5.1 Ordre d'évaluation

Les invitations priment sur toute création d'Organization (§8).

1. Session absente → `unauthenticated`
2. Cookie d'invitation Membership présent → `membership_invitation_pending`
3. Cookie d'invitation portail présent → `portal_invitation_pending`
4. Aucun Membership actif :
   - identité portail → `tenant_only`
   - sinon → `no_organization`
5. Memberships actifs :
   - toutes Organizations suspendues → `organization_suspended`
   - onboarding inachevé → `onboarding_incomplete`
   - identité portail également → `owner_and_tenant`
   - aucun rôle owner → `collaborator`
   - un seul Organization → `owner_single_org`
   - plusieurs → `owner_multi_org`

---

## 6. Matrice de routage

| Contexte | Destination | Statut |
|---|---|---|
| Non authentifié | `/connexion` (intention conservée) | Implémenté |
| Invitation Organization en attente | `/invitation/accepter` | Implémenté |
| Invitation portail en attente | `/portal/invitation/accepter` | Implémenté |
| Compte sans Organization | `/onboarding/organization` | Implémenté |
| Onboarding incomplet | Reprise à l'étape enregistrée | Implémenté |
| Owner, 1 Organization | `/app` | Implémenté |
| Owner, plusieurs Organizations | `/app` — dernière Organization valide, sinon sélecteur du shell | Implémenté |
| Collaborateur | `/app` sur l'Organization autorisée | Implémenté |
| Locataire seul | `/portal` | Implémenté |
| Owner + Locataire | `/app` avec bascule de contexte disponible | Implémenté |
| Organization suspendue | `/connexion?reason=organization-suspended` | Implémenté |
| Magic Link invalide/expiré | `/connexion?reason=<motif>` | Implémenté |
| Admin plateforme | `/administration` | **NON IMPLÉMENTÉ** — aucune table ni rôle d'administration plateforme n'existe |
| Admin + Owner | Admin par défaut + bascule Owner | **NON IMPLÉMENTÉ** |
| Grace billing | Application normale + bandeau | **NON IMPLÉMENTÉ** — domaine Billing absent (ALIGN-03+) |
| Billing bloqué | Billing / Support / compte uniquement | **NON IMPLÉMENTÉ** — domaine Billing absent (ALIGN-03+) |

Les quatre lignes non implémentées sont documentées pour le handoff. Aucune route fantôme n'a été créée : le site ne doit pas les annoncer.

---

## 7. Onboarding

### 7.1 Étapes

`plan_intent` → `organization` → `rent_method` → `property` → `unit` → `completed`

L'état vit dans `public.onboarding_states` (une ligne par User, RLS stricte).

### 7.2 Idempotence et reprise

- Une ressource déjà enregistrée (`organization_id`, `first_property_id`, `first_unit_id`) n'est **jamais écrasée** : `coalesce(existant, nouveau)`.
- L'étape **n'avance jamais à reculons** (`private.onboarding_step_rank`).
- Un double submit ne crée donc jamais de doublon.
- Toute écriture passe par le RPC `SECURITY DEFINER upsert_onboarding_state` ; le client n'a aucun droit d'écriture direct sur la table.

### 7.3 Découverte de bout en bout

Un nouveau propriétaire obtient sans intervention manuelle : Organization → plan Découverte → quotas serveur → premier bien → premier logement → dashboard réel.

Une maison reçoit automatiquement son logement « Maison entière ». Un immeuble demande explicitement le premier logement.

**Aucun paiement, aucun checkout, aucune carte, aucun faux abonnement.**

### 7.4 Question réception des loyers

> Comment recevez-vous actuellement vos loyers ?

`mtn_momo` · `orange_money` · `merchant_account` · `bank_transfer` · `cash` · `multiple`

Préférence déclarative uniquement. **Aucune automatisation d'encaissement n'est branchée.** L'utilisateur peut ne pas répondre.

---

## 8. Invitations

Une invitation en attente **prime toujours** sur la création d'une nouvelle Organization. Un utilisateur invité ne se voit jamais proposer de créer une Organization inutile.

Les deux flux existants sont réutilisés sans modification : cookie httpOnly déposé par la route d'invitation, puis page d'acceptation/refus.

---

## 9. Utilisateur déjà connecté

Arrivant du site sur `/` avec une session valide :

- son email n'est **jamais** redemandé ;
- son contexte est recalculé côté serveur ;
- il est routé selon la matrice §6 ;
- son intention de plan est conservée uniquement s'il lui reste un onboarding à faire.

Le CTA commercial peut donc devenir « Ouvrir KJORA » sans logique côté site.

---

## 10. Quota Organizations

| Plan | Organizations |
|---|---:|
| Découverte | 1 |
| Essentiel | 1 |
| Avancé | 2 |
| Patrimoine | 5 |
| Sur mesure | custom |

Enforcement serveur : `public.create_organization` appelle `private.assert_organization_quota(user_id)` **avant tout INSERT**. Aucun contournement client n'est possible.

Dépassement → `PLAN_ORGANIZATION_LIMIT_REACHED`, exposé en HTTP 403 :

```json
{
  "error": "PLAN_ORGANIZATION_LIMIT_REACHED",
  "plan": "decouverte",
  "quota": 1,
  "current": 1,
  "suggestedUpgrade": "avance"
}
```

**Aucune Organization existante n'est jamais supprimée ni archivée** pour faire de la place.

---

## 11. Intention de plan payant

Tant que le domaine Billing n'existe pas (ALIGN-03/04) :

- l'intention `essentiel` / `avance` / `patrimoine` est enregistrée ;
- le plan payant **n'est pas activé** ;
- les entitlements payants **ne sont pas accordés** ;
- l'utilisateur démarre sur Découverte ;
- le futur parcours upgrade/checkout est préparé mais non exposé.

`sur_mesure` → contact commercial, aucune activation automatique.

---

## 12. Analytics du funnel

| Événement | Payload |
|---|---|
| `site_cta_clicked` | `{ plan_requested }` |
| `auth_started` | `{ plan_requested }` |
| `magic_link_sent` | `{ plan_requested }` |
| `auth_completed` | `{}` |
| `plan_intent_received` | `{ plan_intent, activated: false }` |
| `onboarding_started` | `{ plan_intent, resumed }` |
| `organization_created` | `{ plan_effective, plan_intent }` |
| `first_property_created` | `{ property_type }` |
| `first_unit_created` | `{ unit_type }` |
| `onboarding_completed` | `{ plan_effective }` |

**Interdits absolus dans tout payload :** token, code Magic Link, PKCE verifier, secret, donnée financière, email, `user_id`, `organization_id`.

`site_cta_clicked` est émis par le site ; les neuf autres par l'application.

---

## 13. Invariants de sécurité

- Aucun routage fondé sur un paramètre d'URL.
- `plan_requested` n'accorde jamais aucun droit.
- Aucune open redirect possible via `next` / `return_to`.
- `onboarding_states` : RLS par User, aucun droit d'écriture client direct.
- Tous les RPC ALIGN-02 : `SECURITY DEFINER`, `search_path = ''`, `PUBLIC`/`anon` révoqués.
- `upsert_onboarding_state` vérifie que l'Organization appartient bien au User.
- Isolation multi-tenant et RLS existantes inchangées.
- Aucune clé `service_role` côté navigateur.

---

## 14. Intégration côté site

```html
<!-- Recommandé : gère aussi l'utilisateur déjà connecté -->
<a href="https://app.kjora.com/?plan_requested=decouverte">Commencer gratuitement</a>
<a href="https://app.kjora.com/?plan_requested=essentiel">Démarrer avec Essentiel</a>

<!-- Sur mesure : route commerciale, hors application -->
<a href="https://kjora.com/contact-sur-mesure">Nous contacter</a>
```

```js
// Avant redirection
trackEvent("site_cta_clicked", { plan_requested: "essentiel" });
```

Le site ne doit annoncer comme disponible aucune capacité marquée `NON IMPLÉMENTÉ` (§6).

---

## 15. Hors périmètre

Stripe · CamPay · Flutterwave · tout provider réel · checkout · factures SaaS · retries · webhooks billing · KJORA Collect · mobile natif · redesign global · second Espace propriétaire · administration plateforme.

---

## 16. Statut

**ALIGN-02 — contrat établi, implémentation déployée en Production le 2026-09-08.**

Migrations Production : `align_02_onboarding_and_org_quota` (20260908120300) et `align_02_advisor_fixes`.

Gate de sortie : 228/228 tests Node, 35/35 assertions pgTAP transactionnelles, 23/23 scénarios E2E Production vérifiés en transaction annulée, Advisors sans nouvelle catégorie.

Contrat de handoff faisant autorité pour KJEMO Commercial jusqu'à nouvelle version.

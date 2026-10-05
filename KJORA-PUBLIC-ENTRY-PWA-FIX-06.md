# KJORA — PUBLIC-ENTRY-PWA-FIX-06

Date : 2026-10-05

## Base

- BASE TYPE: Hostinger v2 local verified commit
- BASE SHA: `f23cfbb500170aba8f7d9a97c878df9d70ec855e`
- BASE TREE: `914f3059e48549acfa58d75940fa2db0d1bec7ca`
- REMOTE MAIN OBSERVED: `a8d11756d263d351fa4de2d83697b5e21897cb03`
- REMOTE MAIN STATUS: stale/unavailable in this execution environment
- Branche : `codex/kjora-public-entry-pwa-fix-06`

## Causes exactes

### Redirection de la racine

`src/app/page.tsx` était encore le point d'entrée historique Site→App : il appelait `resolveUserContext()` puis exécutait systématiquement `redirect()`, vers `/connexion` pour un visiteur anonyme ou vers une destination privée pour une session existante. La racine ne contenait donc aucune vitrine.

### Faux statut hors ligne

`ServiceWorkerRegistration` initialisait directement son état avec `navigator.onLine` pendant le premier rendu client. Ce signal est indicatif et peut être faux selon le navigateur ou l'hôte; il créait aussi une divergence avec le rendu serveur. Les événements `online/offline` étaient les seuls mécanismes de correction et « Réessayer » exécutait seulement `window.location.reload()`, sans nouvelle mesure. Aucune erreur API n'appelait directement ce composant et le service worker conservait ses exclusions privées : la cause était l'état initial trop affirmatif combiné à l'absence de sonde et de véritable retry, pas Supabase ni une mise en cache privée.

## Architecture finale

- `/` : vitrine publique FR/EN, canonique `https://kjorapp.com`.
- `/connexion` : Auth Owner/collaborateur; `next` reste validé par `safeNextPath`.
- `/app` : application Owner/collaborateur protégée.
- `/portal` : portail locataire protégé.
- `/partenaire` : tableau de bord partenaire protégé.
- `/administration` : administration protégée, absente de la navigation publique.
- `/aide`, `/contact`, `/securite` et routes légales : surfaces publiques conservées.

Le CTA gratuit utilise le contrat existant (`decouverte`, cycle mensuel, source `site`) mais ne change jamais le plan effectif. Le contexte, l'Organization et les droits restent résolus côté serveur.

## Réseau et PWA

L'état initial est `checking` et ne rend aucun bandeau. Après hydratation, `navigator.onLine=false` déclenche le refus immédiat; sinon une requête `HEAD` same-origin vers `/robots.txt` avec `cache: no-store` et `credentials: omit` vérifie le transport. Toute réponse HTTP prouve la connectivité; seule une exception réseau passe à `offline`. Les événements `online/offline` et « Réessayer » utilisent cette même logique.

Le service worker conserve toutes les exclusions API, Auth, application, portail, administration, onboarding, documents, contrats et PDF. Une réponse `Set-Cookie`, `private` ou `no-store` n'est jamais mise en cache.

## Fournisseurs et données

Le coupe-circuit global, Stripe Test fermé, Resend financier désactivé et WhatsApp API désactivée sont inchangés. Aucun message, courriel, paiement, secret ou donnée privée n'a été utilisé. Aucune migration n'est créée ou modifiée.

## Rollback

Revenir au commit de base `f23cfbb500170aba8f7d9a97c878df9d70ec855e` ou appliquer les commits du lot en sens inverse, reconstruire avec Node 22, puis redéployer uniquement après autorisation. Aucun rollback de base n'est nécessaire.

## Contrôles Hostinger après fusion

1. `/` et `/?locale=en` répondent 200 et affichent la vitrine.
2. Les deux CTA atteignent `/connexion` sur la même origine.
3. Les liens publics et légaux répondent sans exposer l'administration.
4. Online : aucun bandeau; offline : bandeau; retour online et retry : disparition.
5. Aucun contenu privé n'est disponible depuis le cache.
6. `/robots.txt` et `/sitemap.xml` annoncent seulement les pages publiques.

## Inventaire du lot

23 fichiers sont ajoutés ou modifiés :

- entrée publique et SEO : `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/globals.css`, `src/core/ui/public-footer.tsx` ;
- connexion et cloisonnement privé : `src/app/connexion/page.tsx`, `src/app/(internal)/app/layout.tsx`, `src/app/(portal)/portal/layout.tsx`, `src/core/onboarding/plan-intent.ts` ;
- PWA : `public/sw.js`, `src/app/hors-ligne/page.tsx`, `src/core/pwa/connectivity.ts`, `src/core/pwa/service-worker-registration.tsx` ;
- tests : `tests/public-entry-pwa-fix-06.test.ts`, `tests/legal-pages.test.ts`, `tests/site-app-flow-canada.test.ts` ;
- exploitation et gouvernance : `docs/deployment/KJORA-HOSTINGER-DEPLOYMENT-RUNBOOK-05.md`, `docs/deployment/KJORA-HOSTINGER-SMOKE-TESTS-05.md`, `docs/product/KJORA-ROADMAP-LAUNCH.md`, `project-context/DECISIONS.md`, `project-context/PROJECT_STATE.md`, ce rapport.

Aucun fichier de migration, dépendance, variable d'environnement ou configuration fournisseur n'est ajouté ou modifié.

## Validations réellement exécutées

### Baseline avant modification

- environnement observé : Node `v24.19.0`, npm `11.17.0`; la validation finale utilise en plus le runtime cible Node `v22.22.0` ;
- `npm ci` : PASS, 362 paquets installés ;
- `npm test` : PASS, 958/958 ;
- `npm run typecheck` : PASS ;
- `npm run lint` : PASS ;
- `npx next build --webpack` : PASS, 81/81 pages ;
- `git diff --check` : PASS ;
- arbre de travail initial : propre.

### Validation finale Node 22

- `npm test` : PASS, 972/972, dont 14 tests dédiés au lot ;
- `npm run typecheck` : PASS ;
- `npm run lint` : PASS ;
- `npx next build --webpack` : PASS, 82/82 pages ;
- `npm start` avec Node `v22.22.0` : PASS sur `http://localhost:3106` ;
- smoke HTTP : PASS pour `/`, `/?locale=en`, `/aide/`, `/contact/`, `/securite/`, `/confidentialite/`, `/mentions-legales/`, `/hors-ligne/`, `/robots.txt` et `/sitemap.xml` ;
- `/` ne porte pas `noindex`, ne rend aucun faux bandeau hors ligne côté serveur, et les exclusions privées sont présentes dans `robots.txt` ;
- navigateur desktop 1440 px : PASS pour la vitrine ; tablette 768 px : PASS ; mobile 390 px : PASS ;
- changement FR/EN : PASS ; aide, contact, sécurité et mentions légales : PASS ;
- CTA : destinations observées conformes. Le rendu de `/connexion` n'est pas validable dans cet environnement sans variables Supabase; l'échec explicite « Configuration Supabase Kjora absente » n'est pas transformé en erreur réseau ;
- en ligne sans faux bandeau : PASS ; simulation offline, retour online et clic retry dans un navigateur réellement déconnecté : NON EXÉCUTÉS (capacité de simulation réseau indisponible) ;
- logique offline/online/retry et distinction erreur HTTP/panne transport : PASS dans les tests Node ;
- `git diff --check` : PASS ;
- contrôle anti-secrets et fichiers interdits : PASS ;
- migrations créées ou modifiées : 0.

## Limites et risques restants

- Les essais authentifiés exigent une configuration Supabase de développement et restent à exécuter après intégration dans l'environnement supervisé.
- Le comportement offline/retour online doit être confirmé dans les outils réseau d'un navigateur sur l'hôte de recette, même si le réducteur, la sonde et les exclusions de cache sont testés localement.
- Les métadonnées publiques et le cache PWA ne seront effectifs sur `kjorapp.com` qu'après une fusion et un déploiement Hostinger séparément autorisés.
- Le commit final, son tree et le SHA-256 du patch sont calculés après le commit de ce rapport. Ils sont donc fournis dans la remise externe afin d'éviter une référence cryptographique circulaire dans le fichier committé.

## Résumé de clôture

```text
BASE SHA: f23cfbb500170aba8f7d9a97c878df9d70ec855e
BRANCH: codex/kjora-public-entry-pwa-fix-06
FINAL SHA: voir remise externe calculée après commit du rapport
TREE SHA: voir remise externe calculée après commit du rapport
PATCH SHA256: voir remise externe calculée après export du patch
FILES CHANGED: 23
MIGRATIONS CREATED OR MODIFIED: 0
NODE TESTS: PASS — 972/972
TYPECHECK: PASS
LINT: PASS
BUILD: PASS — Webpack, 82/82 pages
HOSTINGER START: PASS — commande Production locale sous Node 22.22.0
PUBLIC HTTP SMOKE: PASS
BROWSER DESKTOP: PASS — 1440 px
BROWSER MOBILE: PASS — 390 px
ONLINE RECOVERY: PASS tests Node; navigateur réellement reconnecté NON EXÉCUTÉ
OFFLINE MODE: PASS tests Node; simulation navigateur NON EXÉCUTÉE
DIFF CHECK: PASS
ANTI-SECRETS: PASS
REAL EMAIL SENT: NON
REAL WHATSAPP SENT: NON
REAL PAYMENT: NON
SUPABASE DISTANT MODIFIED: NON
HOSTINGER MODIFIED: NON
VERCEL MODIFIED: NON
PRODUCTION MODIFIED: NON
READY FOR PATCH REVIEW: OUI
READY FOR SUPERVISED HOSTINGER DEPLOYMENT: OUI
READY FOR PRODUCTION: NON
NEXT AUTHORIZATION REQUIRED: revue du patch, fusion puis déploiement Hostinger supervisé et smoke tests sur kjorapp.com
```

Les résultats finaux, SHA de commits, tree et patch sont complétés dans la remise après leur exécution réelle. Les contrôles navigateur non disponibles sont marqués NON EXÉCUTÉ, jamais PASS.

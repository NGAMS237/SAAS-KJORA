# KJORA — Commercial Experience Visual 09

## Références Git

- Base vérifiée : `b5f06d5e0d918e881922b76c37b24707dd0261ae` (`origin/main`).
- Workflow de base : `SITE-APP-FLOW ephemeral SQL`, exécution GitHub Actions `38277990417`, réussite sur le SHA de base.
- Branche locale : `codex/kjora-commercial-experience-visual-09`.
- SHA final : commit contenant ce rapport; sa valeur exacte est fournie dans le verdict externe et les métadonnées du patch (un commit ne peut pas contenir son propre SHA).
- Aucun push, aucune PR, aucun merge et aucun déploiement.

## Résultat livré

La racine publique est devenue une expérience commerciale bilingue complète, sans séparer le site de l’application. Elle comprend une navigation claire, un hero cinématographique CSS, des preuves de valeur, les problèmes résolus, les fonctions principales, les parcours Afrique et diaspora, trois étapes, la clarification des flux financiers, les offres, la sécurité, les partenaires, la FAQ, un CTA final et un footer public complet.

Les CTA utilisent le parcours réel de connexion/onboarding et conservent la locale. Le discours distingue explicitement les loyers, les documents locatifs, l’abonnement SaaS payé à KJORA et l’encaissement manuel ou futur des loyers. WhatsApp reste présenté comme un partage manuel; aucune API active, livraison ou automatisation n’est promise.

## Inventaire exact

- `KJORA-COMMERCIAL-EXPERIENCE-VISUAL-09.md`
- `public/images/marketing/kjora-diaspora-canada.webp`
- `public/images/marketing/kjora-hero-abidjan.webp`
- `public/images/marketing/kjora-proprietaire-locataire.webp`
- `src/app/mentions-legales/page.tsx`
- `src/app/page.tsx`
- `src/app/public-home.module.css`
- `src/core/ui/public-footer.tsx`
- `tests/commercial-experience-visual-09.test.ts`

## Actifs visuels

| Actif | Source PNG | WebP livré | Réduction |
| --- | ---: | ---: | ---: |
| Hero Abidjan | 2 005 103 octets | 124 534 octets | 93,8 % |
| Propriétaire / locataire | 2 458 976 octets | 209 094 octets | 91,5 % |
| Diaspora Canada | 2 277 481 octets | 157 462 octets | 93,1 % |
| **Total** | **6 741 560 octets** | **491 090 octets** | **92,7 %** |

Les trois images sont servies via `next/image`. Seul le hero est préchargé; les deux autres restent différés. Les dimensions intrinsèques et les attributs `sizes` sont définis afin d’éviter les décalages de mise en page. Les PNG sources ne sont pas suivis dans le dépôt.

## Routes et résilience

- Routes publiques/applicatives avant : 62 pages `page.tsx`.
- Routes publiques/applicatives après : 62 pages `page.tsx`.
- Route supprimée ou ajoutée : aucune.
- Le build expose toujours les espaces propriétaire, locataire, administration et les parcours d’authentification existants.
- Le service worker et le manifeste n’ont pas été modifiés.
- Les tests confirment qu’aucune route privée, API, réponse `private`/`no-store` ou réponse portant `Set-Cookie` ne rejoint le cache public.

## Validations exécutées

- Installation reproductible : `npm@12.0.2 ci --allow-remote=root`; dépendances résolues dans le worktree isolé.
- Node ciblé : `v22.22.0`.
- Tests ciblés initiaux : 52/52 réussis (commercial, routes/onboarding, PWA).
- Régression footer/légal : 32/32 réussis.
- Suite Node complète finale : 1 025/1 025 réussis, code de sortie 0.
- TypeScript : `tsc --noEmit`, réussi.
- ESLint : `eslint .`, réussi.
- Build : Next.js 16.3.4, `next build --webpack`, réussi; 82 pages statiques générées.
- Démarrage Production local : `next start -p 3219`, prêt en 464 ms.
- Smoke HTTP : 11/11 ressources publiques non authentifiées validées sans erreur en HTTP 200 (FR, EN, aide, contact, partenaires, pages légales/sécurité et trois images). Les URL sans slash final renvoient le 308 canonique attendu. Les deux entrées de connexion ont aussi répondu HTTP 200, mais ont journalisé l’erreur attendue `Configuration Supabase Kjora absente`, car le worktree propre ne contient volontairement aucun `.env`; l’authentification interactive n’a donc pas été exécutée.
- `git diff --check` : réussi.
- Routes : 62 avant / 62 après, ensemble inchangé après normalisation des séparateurs Windows.
- Images : 3/3 présentes, lisibles et inférieures à 350 Ko chacune.
- Fichiers interdits : aucun dans le diff.
- Anti-secrets : aucune clé, aucun jeton, aucun secret ni fichier `.env` ajouté.

## Contrôles navigateur

Captures de contrôle produites hors dépôt avec Chrome 155 et émulation DevTools exacte :

- Desktop 1440 × 1000 : hero, cadrage, navigation, contraste et CTA validés; aucun débordement horizontal.
- Tablette 768 × 1024 : version EN, menu adaptatif, CTA et image validés; aucun débordement horizontal.
- Mobile 390 × 844 : version FR, menu ouvert, liens complets, texte et CTA non coupés; aucun débordement horizontal.
- Clavier : ordre de focus vérifié sur les liens de navigation, le sélecteur de langue, le menu et les CTA; focus visible contrôlé.
- Mouvement réduit : `prefers-reduced-motion: reduce` émulé; `animation-name: none` et `transform: none` constatés sur l’image hero.
- FR/EN : titres, métadonnées, navigation, sections, prix, FAQ et CTA vérifiés dans les deux langues.

Le navigateur intégré Codex n’a pas pu initialiser son noyau (`failed to write kernel assets: Le chemin d’accès spécifié est introuvable. (os error 3)`). Après la seconde tentative prescrite, les contrôles ont été effectués avec le Chrome local via DevTools. Lighthouse n’a pas été exécuté; aucun score n’est revendiqué.

## Portée et garanties

- Migrations modifiées : non.
- Stripe modifié ou réactivé : non.
- Supabase distant modifié : non.
- Resend ou WhatsApp modifié : non.
- Courriel, message, Checkout ou paiement déclenché : non.
- Variables d’environnement ou coupe-circuit modifiés : non.
- Hostinger, Vercel, DNS ou Production modifiés : non.
- Les quatre changements locaux historiques signalés par l’utilisateur sont absents du lot et n’ont été ni modifiés, ni stashés, ni commités.

## Limites

- Aucune reconstruction Supabase locale n’a été lancée, car le lot ne contient aucun SQL et le mandat demande d’éviter cette exécution inutile.
- Les routes et CTA de connexion sont couverts statiquement, mais leur session interactive locale n’a pas été testée sans la configuration Supabase, conformément à l’interdiction de copier ou modifier les variables d’environnement.
- Aucun Lighthouse n’a été lancé.
- Aucune validation distante ou Preview n’a été créée, faute d’autorisation de push/déploiement.

Le lot est prêt pour revue du patch et pour une Preview supervisée après autorisation explicite. Il n’est pas autorisé pour Production.

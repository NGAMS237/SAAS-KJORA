# KJORA — HOSTINGER-DEPLOYMENT-READINESS-05 — Rapport final

Date : 2026-10-03

Dépôt : `NGAMS237/SAAS-KJORA`

Base obligatoire : `a8d11756d263d351fa4de2d83697b5e21897cb03`

Branche locale : `codex/kjora-hostinger-deployment-readiness-05`

## Gate de départ

- `origin/main` : exactement `a8d11756d263d351fa4de2d83697b5e21897cb03`.
- Arbre initial : propre.
- `7583f55e35531f7c49cf269481b9521dba54bbcd` : ancêtre confirmé.
- CI `SITE-APP-FLOW ephemeral SQL` : run `37089545675`, état `completed/success`, même SHA de tête.
- PR corrective #18 : présente dans l'historique fusionné de la base.

## Résultat

Le dépôt est préparé pour une revue de patch puis un déploiement Hostinger supervisé avec Next.js 16.3.4 et Node.js 22.x. Aucun déploiement, DNS, migration distante ou fournisseur n'a été activé.

Correctif fonctionnel minimal : hors Vercel, `NODE_ENV=production` est désormais le repli fail-closed lorsque `VERCEL_ENV` est absent. Cela empêche une instance Hostinger Production d'afficher un badge développement ou d'exposer le test Resend simulé. Une Preview Vercel garde la priorité et reste Preview.

`package.json` annonce `node: 22.x`. Le runtime Node 22.22.0 a réellement exécuté la suite, le typage, ESLint, le build et `next start`.

## Configuration fournisseur au premier déploiement

- Stripe Test : `BILLING_PROVIDER_STRIPE_TEST_ENABLED=0` et `BILLING_KILL_SWITCH_STRIPE=1`.
- Stripe : seules les clés `sk_test_` sont acceptées; six Price IDs restent serveur; origine préparée `https://kjorapp.com`; aucun appel effectué.
- Resend : expéditeur public préparé sur `mail.kjorapp.com`; `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=false`; aucune clé et aucun envoi.
- Facturation automatique : `KJORA_SAAS_AUTO_INVOICING_ENABLED=false`.
- WhatsApp : `KJORA_WHATSAPP_PROVIDER=disabled`; `wa.me` manuel seulement; aucun statut d'envoi fabriqué.
- Cron : aucun planificateur Hostinger configuré; `CRON_SECRET` reste absent.

La matrice exhaustive est `docs/deployment/KJORA-HOSTINGER-ENV-MATRIX-05.md`. Les secrets doivent être saisis directement dans hPanel, jamais copiés dans un chat ou Git.

## Audit et nettoyage

Aucun fichier n'a été supprimé : aucune preuve ne justifiait une suppression sans risque. Aucun `.env` réel, build, archive, dump, journal ou cache n'est suivi. `vercel.json`, les migrations, rapports historiques, fondations fournisseurs et service worker sont conservés avec justification dans `docs/deployment/KJORA-REPOSITORY-CLEANUP-05.md`.

## Compatibilité Hostinger

- Framework : Next.js App Router, routes API et Proxy supportés par le serveur Node standard.
- Node : `22.x` déclaré; validation réelle avec `v22.22.0`.
- Installation/build/start : `npm ci`, `npm run build`, `npm start`.
- Répertoire racine : `./`.
- Domaine préparé : `kjorapp.com`; aucune modification DNS.
- Reverse proxy : Hostinger doit terminer TLS et conserver HTTPS/cookies sécurisés.
- Webhooks Stripe/Resend : corps brut lu avant vérification; configuration absente → échec contrôlé.
- PWA : API, espaces privés, documents et PDF exclus du cache.
- Fonte : `next/font/google` télécharge Inter et Inter Tight pendant le build; une sortie HTTPS est requise. Le premier build sandbox a échoué sur `EACCES` réseau, puis le même build avec réseau autorisé a réussi. Ce premier échec n'est pas masqué.
- `vercel.json` : conservé; son cron n'est pas interprété par Hostinger et n'est pas reproduit.

## Validations avant modification

| Contrôle | Résultat |
|---|---|
| `npm ci` | PASS — 362 paquets, lockfile inchangé; 15 min sous OneDrive |
| tests Node | PASS — 948/948 |
| TypeScript | PASS |
| ESLint | PASS |
| build Webpack | PASS après autorisation réseau — Next.js 16.3.4, 81/81 pages; première tentative `next/font` bloquée par le sandbox |
| `git diff --check` | PASS |

## Validations finales

| Contrôle | Résultat exact |
|---|---|
| `npm ci` | PASS — 362 paquets, 16 min; avertissement attendu car l'hôte local utilise Node 24 tandis que `engines` impose 22.x |
| Runtime cible | PASS — Node.js `v22.22.0` réellement exécuté |
| tests ciblés | PASS — 22/22 après adaptation du test au kill switch Stripe obligatoire |
| tests Node complets | PASS — 958/958, 0 skipped, 0 todo |
| TypeScript sous Node 22 | PASS |
| ESLint sous Node 22 | PASS |
| build Webpack sous Node 22 | PASS — Next.js 16.3.4, 81/81 pages statiques |
| `next start` sous Node 22 | PASS — prêt en 5,6 s sur port local 3105 |
| sondes locales | PARTIEL — `/aide/` 200, `/robots.txt` 200, `/app/` redirige vers connexion; parcours Supabase non testable sans variables |
| `git diff --check` | PASS |
| anti-secrets | PASS — aucun motif de clé privée, Stripe réelle, webhook réel ou JWT dans les fichiers hors `.env.example` |
| fichiers suivis interdits | PASS — seul `.env.example` est volontairement suivi |
| routes avant/après | PASS — aucune page/route ajoutée ou retirée; build identique à 81/81 pages statiques |
| liens internes | PASS dans la suite Node; navigateur distant NON EXÉCUTÉ |
| fournisseurs désactivés | PASS — tests statiques + valeurs sûres de `.env.example` |
| cache privé/PWA | PASS — test statique; navigateur distant NON EXÉCUTÉ |
| migrations historiques | PASS — aucun fichier sous `supabase/migrations` modifié |
| SQL replay | NON EXÉCUTÉ — Docker, PostgreSQL et Supabase CLI indisponibles |
| pgTAP | NON EXÉCUTÉ — même limite; aucun PASS revendiqué |

Le démarrage sans configuration Supabase confirme le fail-closed : les pages dépendantes de Supabase indiquent une configuration absente et `/app` redirige vers la connexion. Les deux variables publiques Supabase doivent être fournies au build Hostinger avant un smoke test complet.

## Commits locaux

1. `fe3151194c8a02c39673b1838e4501edcbac061f` — `fix(deployment): prepare safe Hostinger runtime`.
2. Le commit documentation/rapport est créé après rédaction de ce fichier; son SHA final est fourni dans la remise, car un document ne peut contenir son propre SHA sans le modifier.

## Fichiers du lot

### Ajoutés

- `KJORA-HOSTINGER-DEPLOYMENT-READINESS-05.md`
- `docs/deployment/KJORA-REPOSITORY-CLEANUP-05.md`
- `docs/deployment/KJORA-HOSTINGER-ENV-MATRIX-05.md`
- `docs/deployment/KJORA-HOSTINGER-DNS-PLAN-05.md`
- `docs/deployment/KJORA-HOSTINGER-DEPLOYMENT-RUNBOOK-05.md`
- `docs/deployment/KJORA-HOSTINGER-SMOKE-TESTS-05.md`
- `tests/hostinger-deployment-readiness-05.test.ts`

### Modifiés

- `.gitignore`
- `.env.example`
- `package.json`
- `src/app/administration/layout.tsx`
- `src/modules/communications/config.ts`
- `tests/admin-01-1-ux-quick-wins.test.ts`
- `tests/notifications-communications-e2e-01.test.ts`
- `tests/revenue-01f-provider-foundations.test.ts`
- `docs/product/KJORA-ROADMAP-LAUNCH.md`
- `project-context/DECISIONS.md`
- `project-context/PROJECT_STATE.md`

### Supprimés / migrations modifiées

- Fichiers supprimés : aucun.
- Migrations modifiées : aucune.
- La migration `20261002120000_pilot_resilience_whatsapp_manual_04.sql` n'a pas été appliquée; sa procédure future contrôlée figure dans le runbook.

## Limites et gates restants

- Replay SQL et pgTAP sur base éphémère.
- Revue du patch et CI de la future branche distante.
- Saisie des variables dans Hostinger par Blaise sans exposition de valeur.
- Déploiement Hostinger, DNS/SSL et URL Supabase Auth sous autorisations distinctes.
- Smoke tests authentifiés desktop/mobile avec comptes de test.
- Aucun test réel Resend, Stripe ou WhatsApp dans ce lot.

## Verdict

```text
HOSTINGER DEPLOYMENT EXECUTED: NON
DNS MODIFIED: NON
SUPABASE DEV MODIFIED: NON
PRODUCTION MODIFIED: NON
READY FOR PATCH REVIEW: OUI
READY FOR SUPERVISED HOSTINGER DEPLOYMENT: OUI, après revue/fusion et configuration manuelle
READY FOR PRODUCTION: NON
```

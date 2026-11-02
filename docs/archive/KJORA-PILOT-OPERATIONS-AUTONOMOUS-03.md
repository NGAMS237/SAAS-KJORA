# KJORA — PILOT-OPERATIONS-AUTONOMOUS-03

Date de clôture : 2026-09-30

Dépôt : `NGAMS237/SAAS-KJORA`

Base réelle vérifiée : `347df8adf2f4a1bdf934d32d281f882306bed46e`

Branche locale : `codex/kjora-pilot-operations-autonomous-03`

## Périmètre et garanties

Le lot prépare un pilote privé sans connecter ni appeler de fournisseur réel. Aucun push, merge, PR, déploiement, changement DNS, modification de Supabase distant ou de Vercel n'a été effectué. Aucun courriel, message WhatsApp, paiement ou webhook fournisseur réel n'a été émis.

La migration déjà alignée `supabase/migrations/20261001090000_pilot_month_end_africa_preview.sql` demeure strictement inchangée. Son empreinte SHA-256 contrôlée par test est `c5d9c860e41077a9a41485af3e895b149fd2f29b875ca8467de770050aa4a173`. Aucune migration n'est créée par ce lot.

## Résultat par sous-lot

### A — Fin de mois propriétaire

- `/app/documents` accepte un mois explicite fermé au format `YYYY-MM`, sinon transmet `target_month: null` afin que la RPC utilise le mois local de l'Organization.
- L'autorisation et la lecture des paramètres indépendants sont parallélisées.
- L'aperçu affiche la devise sans conversion et neuf compteurs : baux, échéances, préparés, manquants, brouillons, reports, approbations, file et envoyés.
- Les liens vers les documents et notifications sont explicites. L'état d'indisponibilité est sûr et ne déclenche aucune écriture ou communication.
- La différence entre échéance, avis, quittance et facturation SaaS est rappelée dans l'interface.

### B — Centre de préparation des intégrations

`/administration/operations` présente dix systèmes avec exactement quatre états : `operational`, `configured_disabled`, `configuration_missing`, `attention_required`. Les valeurs de variables ne sont jamais rendues ; seuls leurs noms manquants peuvent apparaître. La configuration locale n'est pas présentée comme une preuve fournisseur. Stripe Test, Resend et les automatisations exigent des preuves distinctes ; WhatsApp demeure désactivé.

### C — Fournisseurs en simulation

- Stripe : clé serveur limitée à `sk_test_`, secret webhook limité à `whsec_`, coupe-circuit conservé, URLs de retour HTTPS/localhost strictement internes, refus des formes ambiguës et externes. Le mapping fermé des Price IDs CAD existant est conservé.
- Resend : les gardes existantes sont conservées ; les aperçus locaux FR/EN utilisent uniquement des données fictives et n'envoient rien.
- WhatsApp : adapter désactivé par défaut, aperçu fictif et numéro masqué. La documentation retient uniquement la voie Meta Cloud API officielle et ne promet aucun palier gratuit permanent.

### D — Partenaires

La page publique est bilingue, distingue commerciaux et influenceurs, affiche les conditions avant candidature et ne promet aucun revenu. La mutation exige une origine strictement same-site. Les vues Admin non encore couvertes par une RPC de lecture bornée restent volontairement masquées ; aucune migration ou règle de commission n'est inventée.

### E — Authentification et rôles

L'audit statique des entrées propriétaire, collaborateur, locataire, partenaire et Admin n'a révélé aucun défaut confirmé nécessitant une modification dans ce lot. Les mécanismes existants conservent la session réelle, les gardes serveur, la sélection d'Organization côté serveur et les redirections internes. Les parcours authentifiés n'ont pas été exécutés sans environnement local sûr.

### F/G — PWA, accessibilité, performance et matrice navigateur

- L'écran public `/hors-ligne` rappelle qu'aucune donnée privée n'est mise en cache.
- La page partenaires FR/EN et l'écran hors ligne ont été ouverts localement avec réponse HTTP 200 et contenu accessible.
- Les libellés, conditions et liens étaient présents dans l'arbre d'accessibilité.
- Les parcours authentifiés, le mobile instrumenté, la mise à jour du service worker et Lighthouse sont `NON EXÉCUTÉS`.
- La matrice reproductible distingue les scénarios locaux de ceux nécessitant une Preview supervisée et des comptes de test.

### H — Sécurité ciblée

- protection same-origin ajoutée à la candidature partenaire ;
- URLs de retour Stripe fermées aux chemins internes ;
- secrets Live Stripe refusés par le garde Test ;
- aucune valeur de secret, adresse complète, téléphone complet ou payload fournisseur ajouté au rendu, aux tests ou aux documents ;
- aucun appel fournisseur au rendu du centre Admin ou dans les aperçus ;
- les contrôles d'accès SQL existants n'ont pas été modifiés.

## Historique Supabase

L'inventaire confirme un historique ancien volumineux et déjà connu. Le présent lot ne modifie, renomme, rejoue ni répare aucune ancienne migration. `20261001090000` reste la version de référence alignée local/distant annoncée par le mandat.

Plan futur non destructif : exporter séparément les versions locales et distantes dans un environnement supervisé, classifier les écarts antérieurs, reconstruire une base éphémère depuis zéro, exécuter pgTAP et les tests de concurrence, puis proposer une normalisation révisée. Aucune commande de réparation ne doit précéder ces preuves.

## Validation

### Baseline avant modification

- `npm ci --no-audit --no-fund` : PASS, 362 paquets installés dans une copie locale hors OneDrive ;
- `npm test` : PASS — 927/927 ;
- `npm run typecheck` : PASS ;
- `npm run lint` : PASS ;
- `npx next build --webpack` : PASS — 78/78 pages, après exécution avec accès réseau pour les polices Google ;
- `git diff --check` : PASS.

### Après modification

- tests ciblés OPERATIONS-03 : PASS — 7/7 ;
- `npm test` : PASS — 934/934 ;
- `npm run typecheck` : PASS ;
- `npm run lint` : PASS ;
- `npx next build --webpack` : PASS — 78/78 pages générées ;
- `git diff --check` : PASS ;
- contrôle anti-secrets : PASS — aucune signature de credential dans les 22 fichiers ; les noms de variables et valeurs fictives courtes ont été revus séparément ;
- contrôle des fichiers interdits : PASS — aucun `.env`, `.next`, `node_modules`, `.vercel`, journal, dump ou ZIP suivi ;
- liens internes ajoutés : PASS — les sept routes cibles existent ;
- comparaison des routes : PASS — 78/78 pages avant et après ;
- replay SQL : `NON EXÉCUTÉ` — Docker, PostgreSQL et Supabase CLI absents ;
- pgTAP : `NON EXÉCUTÉ` — même limite ;
- concurrence SQL : `NON EXÉCUTÉ` — même limite ;
- navigateur public : `PARTIEL` — partenaires FR/EN et hors-ligne exécutés localement ;
- navigateur authentifié : `NON EXÉCUTÉ` ;
- Lighthouse : `NON EXÉCUTÉ`.

## Inventaire attendu

Ajouts :

- `KJORA-PILOT-OPERATIONS-AUTONOMOUS-03.md`
- `docs/product/KJORA-DOMAIN-DNS-PLAN-01.md`
- `src/core/billing/stripe-test-safety.ts`
- `src/modules/communications/provider-previews.ts`
- `src/modules/documents/month-end.ts`
- `src/modules/platform-admin/operations-readiness.ts`
- `tests/pilot-operations-autonomous-03.test.ts`

Modifications :

- `docs/product/KJORA-PILOT-BROWSER-MATRIX-01.md`
- `docs/product/KJORA-PILOT-PREVIEW-RUNBOOK-01.md`
- `docs/product/KJORA-PROVIDER-SANDBOX-GUIDE-v0.1.md`
- `docs/product/KJORA-ROADMAP-LAUNCH.md`
- `project-context/DECISIONS.md`
- `project-context/PROJECT_STATE.md`
- `src/app/(internal)/app/documents/page.tsx`
- `src/app/administration/operations/page.tsx`
- `src/app/administration/partenaires/page.tsx`
- `src/app/api/partners/applications/route.ts`
- `src/app/partenaires/page.tsx`
- `src/core/billing/adapters/stripe-test-adapter.ts`
- `src/core/billing/provider-config.ts`
- `src/modules/documents/views.tsx`
- `src/modules/platform-admin/operations-view.tsx`

Suppressions : aucune. Migrations créées : zéro.

## Risques et décisions ouvertes

1. Une Preview supervisée doit prouver les parcours authentifiés, les rôles, le mobile, le service worker et les journaux avant activation pilote.
2. Stripe Test requiert ses clés Test, secrets webhook, Price IDs CAD et une preuve de webhook ; le kill switch reste fermé.
3. Resend requiert identité légale, domaine vérifié, SPF/DKIM/DMARC, coupe-circuit et preuve de livraison.
4. WhatsApp requiert la décision d'utiliser Meta Cloud API, les consentements, modèles approuvés et tarifs alors applicables ; il reste désactivé.
5. La normalisation de l'ancien historique Supabase nécessite un environnement éphémère complet, une revue et une autorisation séparée.
6. Les règles juridiques, fiscales et de rémunération partenaires restent à décider par Blaise.

## Application Windows du patch

Dans un clone propre positionné sur la base exacte :

```powershell
git switch --detach 347df8adf2f4a1bdf934d32d281f882306bed46e
git switch -c codex/kjora-pilot-operations-autonomous-03-review
git am --3way "C:\chemin\KJORA-PILOT-OPERATIONS-AUTONOMOUS-03.patch"
git status --short
```

Le SHA-256 du patch, le SHA final, le Tree SHA et la preuve d'égalité des arbres sont fournis dans la remise finale, car inclure l'empreinte du patch dans le patch lui-même créerait une référence circulaire.

## Verdict

```text
BASE SHA: 347df8adf2f4a1bdf934d32d281f882306bed46e
BRANCH: codex/kjora-pilot-operations-autonomous-03
FINAL SHA: remis après les commits locaux
TREE SHA: remis après les commits locaux
PATCH SHA256: remis avec l'artefact final
FILES CHANGED: 22 (7 ajoutés, 15 modifiés, 0 supprimé)
MIGRATIONS CREATED: 0
NODE TESTS: PASS — 934/934
TYPECHECK: PASS
LINT: PASS
BUILD: PASS — Next.js 16.3.4 Webpack, 78/78 pages
DIFF CHECK: PASS
SQL REPLAY: NON EXÉCUTÉ
PGTAP: NON EXÉCUTÉ
BROWSER TESTS: PARTIEL — public FR/EN et hors-ligne seulement
REAL PROVIDER CALLS: NON
SUPABASE DISTANT MODIFIED: NON
VERCEL MODIFIED: NON
PRODUCTION MODIFIED: NON
READY FOR PATCH REVIEW: OUI
READY FOR SUPERVISED PREVIEW: OUI — après application et revue du patch, fournisseurs toujours désactivés
READY FOR PRODUCTION: NON
NEXT AUTHORIZATION REQUIRED: application du patch puis Preview supervisée avec configuration Test distincte
```

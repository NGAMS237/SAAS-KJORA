# KJORA — PILOT-RESILIENCE-WHATSAPP-AUTONOMOUS-04

## Résumé exécutif

Le lot a été construit dans un clone isolé hors OneDrive à partir du `main` réel contenant la fusion du lot OPERATIONS-03. Il améliore les retours de reconnexion, limite strictement le cache PWA au shell public, ajoute un handoff WhatsApp manuel pour les documents locataires et distingue ce mode de toute future API officielle dans le centre Admin.

Le fournisseur WhatsApp reste désactivé. Aucun message, courriel, paiement, webhook ou appel Meta n'a été effectué. Une migration additive est proposée, mais n'a été appliquée à aucune base. Les tests SQL réels restent obligatoires avant toute Preview supervisée.

## Base vérifiée

- Base Git : `d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f`.
- Tree de base : `a8af234b6324534aa94da3c8564143aa2bd8fc90`.
- Dernier commit : fusion de la PR #14, `KJORA-PILOT-OPERATIONS-AUTONOMOUS-03`.
- Historique observé : `d31ac7e`, `26bf9bf`, `f1f19bc`, `347df8a`, `ac45156`, `1564f9f`, `b087d1e`, `8b35536`.
- Inventaire de base : 59 migrations, 40 fichiers pgTAP et 55 fichiers de tests Node.
- Baseline avant modification : 934/934 tests Node, TypeScript, ESLint, build Webpack 78/78 et `git diff --check` PASS.

## Ce qui existait déjà

- Authentification officielle Supabase, destinations internes filtrées, parcours Owner, portail, partenaire et Admin.
- Service worker et page `/hors-ligne`, sans mode métier hors ligne.
- Fondation WhatsApp désactivée : préférences locataires, gabarits privés, outbox serveur et adaptateur sans appel fournisseur.
- Contrats, documents financiers privés, revue préalable, PDF, portail locataire et contrôles de capabilities.
- Identités historiques du bailleur, du locataire et du partenaire, conservées sans réécriture.
- Centre `/administration/operations` et ses quatre états fermés.

## Corrections et ajouts

### Résilience et PWA

- Retour partenaire limité à une destination `/partenaire` sûre et message explicite de session absente ou expirée.
- Retours bilingues « Se reconnecter » et « Réessayer » pour le partenaire et les erreurs internes.
- Bannière globale hors ligne, confirmation du retour réseau, information de mise à jour et page hors ligne bilingue.
- Exclusions explicites du cache : API, espaces authentifiés, portail, Admin, partenaire privé, invitations, documents, contrats, PDF, réponses avec `Authorization`, `Set-Cookie`, `private` ou `no-store`.

### WhatsApp manuel

- Normalisation E.164 fermée pour CA, CM, CD, CI, KE, NG, SN et ZA.
- Migration additive étendant la préférence locataire existante avec pays, indicatif, numéro national et états `unknown`, `declared`, `verified`, `disabled`.
- Consentements service et marketing séparés, versionnés et révocables; marketing désactivé par défaut.
- Registre append-only stockant seulement une empreinte SHA-256 du numéro.
- Un Owner peut enregistrer une déclaration, jamais fabriquer `verified`; une modification du numéro invalide la vérification.
- Le locataire peut confirmer ou retirer le canal depuis une session portail active.
- La RPC de handoff résout document, Organization, locataire et numéro côté serveur, exige `receipt.share`, un document prêt/approuvé et un consentement service actif.
- Le client ouvre un lien `wa.me` FR/EN; il ne transmet au serveur que l'identifiant du document et n'affirme jamais que le message a été envoyé.
- L'unique événement écrit est `whatsapp_open_requested`; aucune ligne fournisseur ni statut `sent`, `delivered` ou `read` n'est fabriqué.

La migration est nécessaire parce que la fondation antérieure ne distinguait pas pays/indicatif/numéro national, `declared` de `verified`, la source/version des consentements, ni un historique append-only. Elle préserve les lignes historiques et ne rend aucun numéro globalement unique.

Le stockage WhatsApp structuré Owner et partenaire n'a pas été inventé dans ce lot : leurs modèles actuels n'offrent pas encore de préférence de communication personnelle autoritative comparable au portail locataire. Le guide produit documente ce prolongement comme décision différée. Le handoff documentaire pilote cible donc uniquement le locataire résolu depuis un document financier.

### Admin, contrats et performance

- Le centre Admin distingue le site commercial, WhatsApp manuel, la future API WhatsApp et le support.
- WhatsApp manuel est `attention_required`; l'API officielle reste `configured_disabled`.
- Les contrats et documents existants ont été audités; aucun défaut reproductible d'identité, de rendu ou d'autorisation justifiant une modification supplémentaire n'a été confirmé.
- Aucun goulot de navigation confirmé n'a justifié une modification de performance. Aucun appel fournisseur n'a été ajouté au rendu.

## Fichiers

### Ajoutés

- `KJORA-PILOT-RESILIENCE-WHATSAPP-AUTONOMOUS-04.md`
- `docs/product/KJORA-WHATSAPP-MANUAL-PILOT-01.md`
- `src/app/api/communications/whatsapp/manual/route.ts`
- `src/app/api/tenant-portal/whatsapp/route.ts`
- `src/modules/communications/manual-whatsapp-button.tsx`
- `src/modules/communications/manual-whatsapp.ts`
- `src/tenant-portal/whatsapp-preferences.tsx`
- `supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql`
- `supabase/tests/database/rls_pilot_resilience_whatsapp_04.test.sql`
- `tests/pilot-resilience-whatsapp-autonomous-04.test.ts`

### Modifiés

- `docs/architecture/WHATSAPP-FOUNDATION-01.md`
- `docs/product/KJORA-PILOT-BROWSER-MATRIX-01.md`
- `docs/product/KJORA-PILOT-PREVIEW-RUNBOOK-01.md`
- `docs/product/KJORA-ROADMAP-LAUNCH.md`
- `project-context/DECISIONS.md`
- `project-context/PROJECT_STATE.md`
- `public/sw.js`
- `src/app/(internal)/app/error.tsx`
- `src/app/(portal)/portal/compte/page.tsx`
- `src/app/globals.css`
- `src/app/hors-ligne/page.tsx`
- `src/app/partenaire/page.tsx`
- `src/app/partenaires/connexion/page.tsx`
- `src/core/pwa/service-worker-registration.tsx`
- `src/modules/documents/views.tsx`
- `src/modules/platform-admin/operations-readiness.ts`
- `src/modules/platform-admin/operations-view.tsx`
- `src/tenant-portal/views.tsx`
- `tests/pilot-operations-autonomous-03.test.ts`

Aucun fichier supprimé. La migration historique `20261001090000_pilot_month_end_africa_preview.sql` reste inchangée; son SHA-256 contrôlé est `c5d9c860e41077a9a41485af3e895b149fd2f29b875ca8467de770050aa4a173`.

## Tests exécutés

- Tests ciblés finaux : 16/16 PASS.
- Tests Node complets : 943/943 PASS, 0 échec, 0 ignoré.
- TypeScript : PASS.
- ESLint : PASS.
- Build Next.js 16.3.4 avec Webpack : PASS, 79/79 pages générées.
- `git diff --check` : PASS.
- Contrôle anti-secrets : PASS; aucune signature de clé, jeton, secret ou variable d'environnement suivie.
- Fichiers interdits : PASS; aucun fichier d'environnement, cache, build, journal, ZIP ou patch n'est ajouté ou modifié par le lot. Le `.env.example` historique reste suivi hors diff et ne contient aucune valeur secrète.
- pgTAP proposé : 49 assertions exactement, transaction avec rollback.

PostgreSQL, Supabase CLI et Docker sont absents. La reconstruction SQL, pgTAP et les tests de concurrence sont donc **NON EXÉCUTÉS — environnement indisponible**. Le test pgTAP ne doit pas être considéré PASS sur la seule base de sa revue statique.

## Vérification navigateur

- Navigateur public local : PARTIEL. `/partenaires?locale=en` a été contrôlé sur desktop 1280×720 et mobile 390×844; `/hors-ligne` a été contrôlé sur mobile, sans débordement ni erreur console.
- Le parcours public français n'a pas été rejoué séparément dans le navigateur; son contenu et ses branches sont couverts par les tests Node.
- PWA hors ligne : PARTIEL. L'écran hors ligne et l'état `navigator.onLine` ont été observés; une installation réelle et un rejeu contrôlé du cache par le service worker n'ont pas été exécutés.
- Cibles tactiles : PARTIEL; le contrôle automatisé mobile a signalé au moins un élément sous 36 px, sans blocage fonctionnel confirmé.
- Parcours authentifiés Owner, collaborateur, locataire, partenaire et Admin : NON EXÉCUTÉS, faute d'environnement isolé et de comptes sûrs.
- WhatsApp manuel : génération E.164, messages FR/EN, encodage `wa.me`, résolution serveur et absence de faux statut PASS en tests; ouverture authentifiée dans un navigateur NON EXÉCUTÉE. Aucun numéro réel n'a été utilisé et aucun message n'a été envoyé.

## Limites et décisions ouvertes

1. Exécuter toutes les migrations depuis zéro, toute la suite pgTAP et les 49 assertions du nouveau test dans un environnement SQL isolé.
2. Valider la migration additive, les contraintes de données historiques et l'isolation inter-Organization avant toute application distante.
3. Exécuter la matrice navigateur authentifiée, le vrai cycle service worker et les contrôles mobile/accessibilité complets.
4. Décider du modèle autoritatif pour les préférences WhatsApp personnelles Owner et partenaire avant d'ajouter leurs formulaires.
5. Configurer domaine, Resend, Stripe Test et Meta Cloud API uniquement dans des lots séparés et autorisés. L'API Meta doit conserver un kill switch et l'adaptateur désactivé par défaut.

## Application Windows

À partir d'un clone propre contenant exactement la base annoncée :

```powershell
git switch --detach d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f
git switch -c review/kjora-pilot-resilience-whatsapp-04
git am --3way C:\chemin\KJORA-PILOT-RESILIENCE-WHATSAPP-AUTONOMOUS-04.patch
git status --short
git rev-parse HEAD
git rev-parse "HEAD^{tree}"
git diff --check d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f..HEAD
```

La preuve finale `git am --3way`, l'identité des arbres et le SHA-256 exact du patch sont produits après le commit de ce rapport. Ils figurent dans le handoff final; les intégrer ici modifierait récursivement le commit et le hash du patch.

## Bloc de clôture

BASE SHA: `d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f`

BASE TREE: `a8af234b6324534aa94da3c8564143aa2bd8fc90`

BRANCH: `codex/kjora-pilot-resilience-whatsapp-autonomous-04`

FINAL SHA: checkpoint d'implémentation `094ebd88a0f3b46fd26d5e952b4c1364e5f48026`; SHA du commit de rapport fourni dans le handoff final.

FINAL TREE: checkpoint d'implémentation `e7fdad0ece2604104d520993712263b9612be017`; tree final fourni dans le handoff final.

PATCH SHA256: valeur exacte fournie dans le handoff final après matérialisation du patch.

COMMITS: 4 commits fonctionnels plus 1 commit documentaire final; liste et SHA complets dans le handoff final.

FILES CHANGED: 29

FILES ADDED: 10

FILES MODIFIED: 19

FILES DELETED: 0

MIGRATIONS CREATED: 1 — `20261002120000_pilot_resilience_whatsapp_manual_04.sql`

MIGRATIONS MODIFIED: 0

NODE TESTS: PASS — 943/943

TYPECHECK: PASS

LINT: PASS

BUILD: PASS — Webpack, 79/79 pages

DIFF CHECK: PASS

SQL REPLAY: NON EXÉCUTÉ — environnement indisponible

PGTAP: NON EXÉCUTÉ — environnement indisponible; 49 assertions proposées

CONCURRENCY TESTS: NON EXÉCUTÉ — environnement indisponible; aucune file ni idempotence fournisseur modifiée

PUBLIC BROWSER TESTS: PARTIEL — desktop/mobile EN et page hors ligne; FR navigateur non rejoué

AUTHENTICATED BROWSER TESTS: NON EXÉCUTÉ — aucun environnement sûr

PWA OFFLINE TESTS: PARTIEL — UI et règles statiques contrôlées; cycle service worker réel non exécuté

WHATSAPP MANUAL TESTS: PASS en Node/statique; navigateur authentifié NON EXÉCUTÉ

META CLOUD API CALLS: NON

REAL WHATSAPP SENT: NON

REAL EMAIL SENT: NON

REAL PAYMENT: NON

SUPABASE DISTANT MODIFIED: NON

VERCEL MODIFIED: NON

DNS MODIFIED: NON

PRODUCTION MODIFIED: NON

READY FOR PATCH REVIEW: OUI

READY FOR ISOLATED SQL VALIDATION: OUI

READY FOR SUPERVISED PREVIEW: NON — après validation SQL isolée

READY FOR META WHATSAPP CONFIGURATION: NON — fournisseur volontairement désactivé

READY FOR PRODUCTION: NON

NEXT AUTHORIZATION REQUIRED: revue du patch, exécution CI/reconstruction SQL isolée, puis autorisation séparée pour une Preview supervisée; aucune migration distante avant ces gates.

# KJORA — PILOT-RESILIENCE-WHATSAPP-AUTONOMOUS-04 v2

## Résultat

Cette v2 remplace intégralement la v1. Elle est construite localement depuis la base obligatoire `d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f`, sur `codex/kjora-pilot-resilience-whatsapp-autonomous-04`. Aucun push, merge, PR, déploiement, appel fournisseur, message, courriel, paiement, changement Supabase/Vercel/DNS ou Production n'a été effectué.

Le fournisseur WhatsApp reste désactivé. Le parcours produit uniquement un handoff manuel vers `wa.me`; il ne prétend jamais envoyer, livrer ou lire un message.

## Correctifs v2

- La confirmation du portail produit `tenant_confirmed`, jamais `verified`. `verified` est réservé à une future preuve OTP ou fournisseur officiel.
- Le catalogue fermé partagé TypeScript/SQL couvre CA, CM, SN, CI, BJ, BF, GW, ML, NE, TG, NG, CD, KE et ZA. Pays, indicatif, longueur nationale, absence de préfixe `0`, chiffres seuls et E.164 exact sont validés côté serveur.
- Le bailleur ne peut pas créer le consentement marketing du locataire. Une tentative est refusée; le marketing exige une action directe du locataire dans son portail.
- Le handoff exige `status = ready` et `review_status = approved`. `NULL`, pending, rejected, refused et tout autre état restent refusés.
- Owner, partenaire authentifié, candidat partenaire et locataire disposent de sources de préférence séparées. Ces données ne sont ni une preuve d'identité, ni un rôle, ni une autorisation.
- Les réponses contenant le numéro ou l'URL `wa.me` portent `Cache-Control: private, no-store`; les API de préférence aussi. Le service worker exclut les API, espaces privés, documents, PDF et réponses privées.
- Le contexte serveur normalise le nom avec repli `KJORA`, limite la langue à `fr`/`en` et ferme les types de documents. Une valeur inconnue retourne une erreur contrôlée.
- Les journaux append-only ne contiennent ni numéro, ni E.164, ni numéro national, ni empreinte de téléphone.
- Les premières sauvegardes concurrentes sont sérialisées avec `pg_advisory_xact_lock` avant lecture/upsert. Un changement de numéro ramène l'état à `declared` et ne restaure jamais un consentement révoqué.
- Toutes les fonctions sensibles sont `SECURITY DEFINER`, `search_path=''`, refusées à `PUBLIC`/`anon`, bornées par `auth.uid()`, Organization et capability lorsque nécessaire. Les tables restent RLS/default-deny et non lisibles directement.

## Compatibilité des données

La migration est additive et n'est appliquée à aucune base dans ce lot. Les anciennes lignes de préférences sont conservées : un numéro historique non structuré peut rester lisible, tandis que toute nouvelle sauvegarde v2 exige le format structuré fermé. Aucune unicité globale n'est imposée au numéro. La migration historique `20261001090000_pilot_month_end_africa_preview.sql` reste byte-for-byte inchangée.

## Inventaire fonctionnel

### Migration et tests SQL

- `supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql`
- `supabase/tests/database/rls_pilot_resilience_whatsapp_04.test.sql` — `plan(66)` correspond exactement à 66 assertions, transaction annulée.

### Application WhatsApp et préférences

- `src/core/currency/metadata.ts`
- `src/modules/communications/manual-whatsapp.ts`
- `src/modules/communications/manual-whatsapp-button.tsx`
- `src/modules/communications/personal-whatsapp-preferences.tsx`
- `src/modules/tenancy/tenant-whatsapp-preferences.tsx`
- `src/tenant-portal/whatsapp-preferences.tsx`
- `src/app/api/communications/whatsapp/manual/route.ts`
- `src/app/api/profile/whatsapp/route.ts`
- `src/app/api/tenancy/whatsapp/route.ts`
- `src/app/api/tenant-portal/whatsapp/route.ts`
- `src/app/api/partners/applications/route.ts`
- `src/app/(internal)/app/profil/page.tsx`
- `src/app/partenaire/page.tsx`
- `src/modules/partners/application-form.tsx`
- `src/modules/partners/partner-dashboard.tsx`
- `src/modules/tenancy/views.tsx`
- `src/tenant-portal/views.tsx`

### Résilience, PWA, Admin et documentation

Le patch complet contient également les changements v1 conservés et corrigés : retours de session sûrs, PWA fail-closed, page hors ligne, visibilité Admin séparant WhatsApp manuel et future API, guides pilote, matrice navigateur, runbook et état projet. L'inventaire Git final contient 39 fichiers avec ce rapport : 14 ajoutés et 25 modifiés, aucune suppression par rapport à la base.

## Validations réellement exécutées

- `npm ci` : PASS après arrêt des deux processus Node du clone qui verrouillaient SWC; 362 paquets installés.
- Tests ciblés WhatsApp v2 : PASS — 12/12.
- `npm test` final : PASS — 946/946, 0 échec, 0 ignoré.
- `npm run typecheck` : PASS.
- `npm run lint` : PASS, aucune erreur affichée.
- `npx next build --webpack` : PASS — Next.js 16.3.4, 81/81 pages générées.
- `git diff --check` : PASS.
- Plan pgTAP statique : PASS — 66 assertions déclarées et comptées.
- Contrôle anti-secrets : PASS — aucune clé privée, clé live, service-role, jeton fournisseur ou secret détecté dans le lot. Le seul `sk_test_fixture` historique est une fixture de test non secrète.
- Fichiers interdits suivis : PASS — aucun `.env*` nouveau, `node_modules`, `.next`, `.vercel`, journal, ZIP ou patch suivi.
- PWA/cache : PASS en tests Node et revue statique; cycle service worker réel dans un navigateur authentifié NON EXÉCUTÉ.

## Contrôles non exécutés

PostgreSQL, Supabase CLI et Docker sont absents de l'environnement. Par conséquent :

- replay complet des migrations : **NON EXÉCUTÉ**;
- pgTAP réel : **NON EXÉCUTÉ**, jamais présenté comme PASS;
- deux connexions SQL simultanées sur la première sauvegarde : **NON EXÉCUTÉ**; le verrou transactionnel et les invariants sont vérifiés statiquement seulement;
- parcours navigateur authentifiés Owner, partenaire et locataire : **NON EXÉCUTÉ**;
- aucun message WhatsApp réel : **NON ENVOYÉ**.

## Risques et décisions ouvertes

1. Exécuter une reconstruction SQL complète et les 66 assertions pgTAP dans un environnement éphémère avant toute migration distante.
2. Exécuter un test de concurrence réel avec deux sessions SQL et confirmer absence d'unicité perdue, de consentement restauré et de statut confirmé conservé après changement de numéro.
3. Tester les formulaires FR/EN Owner, partenaire, candidat et portail sur mobile/desktop dans une Preview isolée.
4. Faire valider juridiquement les textes et versions de consentement avant Production.
5. Toute activation Meta Cloud API, OTP, webhook ou envoi réel exige un lot et une autorisation séparés.

## Commits

Le patch v2 autonome inclut les commits fonctionnels v1, puis le correctif `943bfc6cad68b3d58613c9cfde419f89d2b7e86a` (`fix(whatsapp): harden pilot consent and phone handling`) et un commit documentaire final. Le SHA et le tree finaux sont fournis avec le patch, car les inscrire dans ce document avant le commit modifierait récursivement ces valeurs.

## Verdict

BASE SHA: `d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f`

BRANCH: `codex/kjora-pilot-resilience-whatsapp-autonomous-04`

NODE TESTS: PASS — 946/946

TYPECHECK: PASS

LINT: PASS

BUILD WEBPACK: PASS — 81/81

DIFF CHECK: PASS

ANTI-SECRETS: PASS

SQL REPLAY: NON EXÉCUTÉ

PGTAP: NON EXÉCUTÉ — 66 assertions préparées

CONCURRENCY SQL: NON EXÉCUTÉ

REAL WHATSAPP / EMAIL / PAYMENT: NON

REMOTE / PREVIEW / PRODUCTION MODIFIED: NON

READY FOR PATCH REVIEW: OUI

READY FOR ISOLATED SQL VALIDATION: OUI

READY FOR SUPERVISED PREVIEW: NON — après SQL isolé

READY FOR PRODUCTION: NON

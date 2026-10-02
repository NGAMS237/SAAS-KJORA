# KJORA — PILOT-RESILIENCE-WHATSAPP-AUTONOMOUS-04 v3

## Résultat

Cette v3 remplace intégralement les livrables v1 et v2. Elle est construite localement depuis la base obligatoire `d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f`, sur `codex/kjora-pilot-resilience-whatsapp-autonomous-04`. Aucun push, merge, PR, déploiement, appel fournisseur, message, courriel, paiement, changement Supabase/Vercel/DNS ou Production n'a été effectué.

Le fournisseur WhatsApp reste désactivé. Le parcours produit uniquement un handoff manuel vers `wa.me`; il ne prétend jamais envoyer, livrer ou lire un message.

## Correctif v3 — numéros nationaux significatifs

- La règle globale qui interdisait tout zéro initial est supprimée. Chaque pays porte désormais son propre `nationalPattern` en TypeScript et `national_pattern` en SQL.
- Côte d'Ivoire : le motif fermé `^0[157][0-9]{8}$` accepte exactement dix chiffres pour les préfixes mobiles officiels `01`, `05` et `07`. `0701020304` produit exactement `+2250701020304`; le zéro n'est jamais retiré.
- Bénin : le motif fermé `^01[0-9]{8}$` exige exactement dix chiffres, dont le préfixe `01`. `0197123456` produit exactement `+2290197123456`.
- Les douze autres pays conservent leurs règles existantes de numéro national significatif après l'indicatif : longueur fermée et premier chiffre non nul. Les quatorze exemples passent dans les tests Node et sont repris comme appels positifs pgTAP.
- Pays, indicatif, numéro national et E.164 doivent concorder exactement. Aucun indicatif n'est déduit et aucun chiffre n'est ajouté, supprimé ou reformatté.
- Les formulaires Owner, locataire et partenaire affichent la longueur et un exemple adaptés au pays sélectionné. La consigne générique « sans le zéro initial » a disparu.

Références de vérification : bulletin UIT-T OB 1208 pour le plan ivoirien à dix chiffres et la conservation du zéro après `+225`; ARCEP Bénin pour le passage à dix chiffres et le préfixe `01` après `+229`; répertoire UIT-T des plans nationaux et bulletin OB 1256 pour les autres indicatifs et la longueur à neuf chiffres de la Guinée-Bissau.

## Protections v2 conservées

- `tenant_confirmed` reste distinct de `verified`; seul un futur OTP ou fournisseur officiel pourra établir `verified`.
- Consentements service et marketing séparés; le marketing locataire exige une action directe depuis son portail.
- Handoff limité aux documents `ready` et `approved`, capability et Organization vérifiées côté serveur.
- RLS/default-deny, RPC `SECURITY DEFINER`, `search_path=''`, `auth.uid()` non nul, grants `PUBLIC`/`anon` retirés.
- Verrou transactionnel sur la sauvegarde; un changement de numéro perd les états confirmé/vérifié et ne restaure aucun consentement.
- Réponses privées `no-store`, PWA fermée aux API et surfaces privées, journaux sans téléphone, E.164, empreinte ni contenu.
- Aucune activation Meta, aucun provider, aucun webhook et aucun statut de livraison fabriqué.

## Inventaire final depuis la base

Le patch contient 39 fichiers avec ce rapport : 14 ajoutés et 25 modifiés, aucune migration historique modifiée et aucune suppression fonctionnelle. Le rapport v2 est remplacé par ce rapport v3.

### Migration et test SQL

- `supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql`
- `supabase/tests/database/rls_pilot_resilience_whatsapp_04.test.sql` — `plan(86)` correspond statiquement à 86 assertions; transaction entièrement annulée par `rollback`.

### Catalogue, application et tests Node

- `src/core/currency/metadata.ts`
- `src/modules/communications/manual-whatsapp.ts`
- `src/modules/communications/manual-whatsapp-button.tsx`
- `src/modules/communications/personal-whatsapp-preferences.tsx`
- `src/modules/tenancy/tenant-whatsapp-preferences.tsx`
- `src/modules/partners/application-form.tsx`
- `src/tenant-portal/whatsapp-preferences.tsx`
- `tests/pilot-resilience-whatsapp-autonomous-04.test.ts`

Les autres fichiers du patch couvrent les routes serveur de préférences et handoff, les surfaces Owner/partenaire/locataire, la PWA fail-closed, les retours de session sûrs, la séparation Admin entre WhatsApp manuel et future API, les guides pilote, la matrice navigateur, le runbook et le contexte projet.

## Validations réellement exécutées

- Tests ciblés du correctif v3 : PASS.
- `npm test` complet : PASS — 948/948, 0 échec, 0 ignoré.
- `npm run typecheck` : PASS.
- `npm run lint` : PASS, aucune erreur affichée.
- `npx next build --webpack` : PASS — Next.js 16.3.4, 81/81 pages générées.
- `git diff --check` : PASS.
- Plan pgTAP statique : PASS — 86 assertions déclarées et 86 expressions pgTAP comptées.
- Contrôle anti-secrets : PASS — aucune clé privée, clé live, clé service-role, jeton fournisseur ou secret détecté dans le lot.
- Fichiers interdits suivis : PASS — aucun `.env` secret, `node_modules`, `.next`, `.vercel`, `supabase/.temp`, journal, ZIP ou patch suivi. `.env.example` reste le modèle public historique sans valeur secrète.

## Contrôles non exécutés

PostgreSQL, Supabase CLI et Docker sont absents de l'environnement. Par conséquent :

- replay complet des migrations : **NON EXÉCUTÉ**;
- pgTAP réel : **NON EXÉCUTÉ**, jamais présenté comme PASS;
- concurrence SQL réelle à deux sessions : **NON EXÉCUTÉ**;
- parcours navigateur authentifiés Owner, partenaire et locataire : **NON EXÉCUTÉ**;
- WhatsApp, courriel et paiement réels : **NON ENVOYÉS**.

## Commits locaux inclus avant le rapport

- `8b6f94a` — résilience et récupération hors ligne;
- `1e54145` — handoff WhatsApp manuel et consent-aware;
- `a5660f4` — séparation de l'état Admin manuel/fournisseur;
- `094ebd8` — couverture de tests du pilote;
- `e0915e6` — documentation v1;
- `943bfc6` — durcissement v2 des consentements et du téléphone;
- `1486ab6` — livraison v2, remplacée dans l'arbre final;
- `7041c8a` — validation nationale par pays et correction CI/BJ v3.

Le commit documentaire final, le SHA final, le tree SHA et le SHA-256 du patch sont fournis avec le livrable, car les inscrire ici avant le commit modifierait récursivement ces valeurs.

## Limites et décisions ouvertes

1. Exécuter une reconstruction SQL complète et les 86 assertions pgTAP dans un environnement éphémère avant toute migration distante.
2. Exécuter un test de concurrence réel avec deux sessions SQL.
3. Tester les formulaires FR/EN Owner, partenaire, candidat et portail sur mobile/desktop dans une Preview isolée.
4. Faire valider juridiquement les textes et versions de consentement avant Production.
5. Toute activation Meta Cloud API, OTP, webhook ou envoi réel exige un lot et une autorisation séparés.

## Verdict

BASE SHA: `d31ac7ebf02faa0cd9eb48d1c9eb02b50d765a7f`

BRANCH: `codex/kjora-pilot-resilience-whatsapp-autonomous-04`

COUNTRY-SPECIFIC PHONE VALIDATION: PASS

CI LEADING ZERO: PASS

BJ PREFIX 01: PASS

TYPESCRIPT / SQL CATALOG PARITY: PASS

NODE TESTS: PASS — 948/948

TYPECHECK: PASS

LINT: PASS

BUILD WEBPACK: PASS — 81/81

DIFF CHECK: PASS

ANTI-SECRETS: PASS

SQL REPLAY: NON EXÉCUTÉ

PGTAP: NON EXÉCUTÉ — 86 assertions préparées et comptées statiquement

CONCURRENCY SQL: NON EXÉCUTÉ

REAL WHATSAPP / EMAIL / PAYMENT: NON

REMOTE / PREVIEW / PRODUCTION MODIFIED: NON

READY FOR PATCH REVIEW: OUI

READY FOR ISOLATED SQL VALIDATION: OUI

READY FOR SUPERVISED PREVIEW: NON — après SQL isolé

READY FOR PRODUCTION: NON

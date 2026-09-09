# KJORA — Architecture des providers de paiement v0.1

**Statut :** ALIGN-04A — architecture livrée, **aucun provider branché, aucun débit possible**
**Date :** 2026-09-09
**Portée :** frontière de types, matrice de capacités, routage serveur, contrat d'adaptateur, webhooks, idempotence
**Hors portée :** mode live, clés de Production, débit réel, remboursement réel, KJORA Collect, paiements de loyer → ALIGN-04B

ALIGN-03 reste la source de vérité du cycle de vie de l'abonnement. Ce lot ne le reconstruit pas : il fournit ce qui lui manquait, à savoir un moyen d'obtenir une **preuve de paiement vérifiée**.

---

## 1. La frontière client / serveur

C'est le point signalé à la fin d'ALIGN-03 : `billing-view.tsx` est un composant client et importait ses types depuis `server.ts`, marqué `server-only`. Cela fonctionnait parce que TypeScript efface les types à la compilation — mais une seule valeur importée par mégarde aurait cassé le build, ou pire, tiré du code serveur dans le bundle navigateur.

Les types de vue vivent désormais dans `src/core/billing/types.ts`, module pur.

| Module | Nature | Le client peut-il l'importer ? |
|---|---|---|
| `model.ts` | pur — états, prix, prorata | ✅ |
| `types.ts` | pur — types de vue, affordance | ✅ |
| `provider-capabilities.ts` | pur — matrice | ✅ |
| `provider-routing.ts` | pur — décision | ✅ (importé par le serveur seul en pratique) |
| `webhook-rules.ts` | pur — décision | ✅ |
| `signature.ts` | pur — HMAC | ✅ |
| `server.ts` | `server-only` — base | ❌ |
| `provider-config.ts` | `server-only` — **secrets** | ❌ |
| adaptateurs | `server-only` — réseau + secrets | ❌ |

Un test balaie exhaustivement `src/**/*.{ts,tsx}` : tout fichier `"use client"` qui importe un module `server-only` fait échouer le gate. Les modules déclarés purs sont vérifiés comme tels.

---

## 2. Matrice de capacités

`provider-capabilities.ts` décrit ce que chaque provider **sait faire**, jamais comment. Dix opérations sont nommées :

```
createCheckout · createSubscription · updateSubscription · cancelSubscription
chargeRecurring · retryPayment · fetchPaymentStatus · fetchPaymentMethod
verifyWebhook · refund
```

**Aucun provider n'est tenu de toutes les offrir.** Deux seulement sont exigées : `createCheckout` et `verifyWebhook`. C'est délibéré — CamPay ne fait pas de carte, ElyonPay ne documente pas son remboursement, et exiger l'uniformité aurait signifié soit écarter les providers locaux, soit écrire des implémentations en trompe-l'œil qui échouent à l'appel.

Une capacité non déclarée n'est donc pas un échec à l'exécution : c'est une **exclusion au moment du choix**. Le routage ne demande à un provider que ce qu'il a déclaré.

Un provider est intégrable si, et seulement si :

1. il est retenu ;
2. le marchand camerounais peut détenir un compte ;
3. il offre les opérations minimales ;
4. **ses webhooks sont vérifiables.**

La quatrième condition n'est pas négociable. Sans signature vérifiable, un événement entrant n'est qu'une affirmation non authentifiée, et une affirmation non authentifiée n'active jamais un plan. C'est pourquoi ElyonPay porte `signedWebhooks: false` tant que son mécanisme n'est pas documenté — il est sélectionné dans le comparatif, mais non intégrable en l'état, et le code le dit plutôt que de l'oublier.

---

## 3. Le serveur décide du provider

`provider-routing.ts` est pur et déterministe.

Le navigateur peut exprimer une **préférence de moyen de paiement** — « je veux payer par MTN MoMo ». Il ne peut jamais nommer un provider. `normalizeMethodHint` rejette explicitement toute valeur qui est un nom de provider, y compris un provider valide : c'est précisément le cas qu'il faut fermer.

Ordre de routage :

| Situation | Ordre |
|---|---|
| Défaut, carte, CAD | Flutterwave → CamPay → ElyonPay |
| Mobile Money XAF | CamPay → Flutterwave → ElyonPay |

Le croisement devise × moyen est vérifié, pas seulement chaque liste isolément : le Mobile Money n'existe qu'en XAF, donc une préférence MoMo sur un règlement en CAD est écartée avant tout choix de provider, sans bloquer le client sur sa propre préférence.

**Ce que l'interface apprend** est réduit à une `BillingCheckoutAffordance` : le règlement en ligne est-il possible, faudra-t-il valider chaque échéance, et sinon pourquoi. Le nom du provider retenu n'y figure pas — un test sérialise l'affordance et vérifie qu'aucun nom de provider n'y apparaît.

---

## 4. Deux modes de récurrence

C'est la contrainte produit la plus importante de ce lot, et elle vient de la réalité du Mobile Money, pas d'un choix technique.

| Mode | Ce qui se passe | Providers |
|---|---|---|
| `unattended` | Le montant est prélevé seul à chaque cycle | Carte via Flutterwave ; MoMo **si** le mandat marchand est activé |
| `customer_approved` | À chaque échéance, le client valide sur son téléphone (USSD/OTP) | MoMo par défaut, tous providers |

L'interface doit dire honnêtement lequel s'applique — « à chaque échéance, vous recevrez une demande à valider » n'est pas la même promesse que « le montant sera prélevé automatiquement ». Les deux messages sont dans `types.ts` et affichés depuis l'affordance.

---

## 5. Webhooks

Route unique : `POST /api/billing/webhooks/[provider]`.

Séquence, dans cet ordre :

1. **Provider fermé** — le segment de chemin doit figurer dans la liste. Sinon 404.
2. **Configuré** — secret d'API *et* secret de webhook présents. Sinon 503, pour que le provider rejoue plus tard plutôt que de considérer l'événement livré.
3. **Corps brut** — lu par `request.text()`, jamais reparsé avant vérification. Une signature porte sur des octets, pas sur un objet JSON reconstruit.
4. **Signature** — vérifiée par l'adaptateur, comparaison HMAC-SHA256 à temps constant. Échec → 400, sans distinguer le motif vers l'extérieur.
5. **Idempotence** — insertion dans `billing_webhook_events`, unicité `(provider, provider_event_id)`. La contrainte est en base, pas dans le code applicatif : deux requêtes simultanées ne peuvent pas doubler, la seconde perd la course et reçoit 200 comme doublon reconnu.
6. **Décision** — `decideWebhook`, module pur, sans base ni réseau.

**Un webhook constate, il n'ordonne pas.** Un seul effet touche au plan — `activate_pending_plan` — et il exige simultanément : une intention de changement enregistrée, une Organization connue, une devise identique et un montant identique à celui calculé en base.

Le prorata reste calculé par KJORA (ALIGN-03, §5). Le montant annoncé par le provider ne sert qu'à un contrôle de cohérence : s'il diverge, l'événement est **refusé** et l'écart journalisé pour traitement humain. La base n'est jamais ajustée sur la parole du provider, et le navigateur n'entre à aucun moment dans ce calcul.

Sortant, l'idempotence repose sur `buildIdempotencyKey`, déterministe : la même demande logique produit toujours la même clé, donc jamais deux débits ; deux intentions distinctes produisent des clés distinctes.

---

## 6. Secrets

Un seul module lit les secrets : `provider-config.ts`, marqué `server-only`. Il ne les renvoie jamais — il répond « configuré » ou « non configuré », et remet le secret directement à l'adaptateur qui en a besoin.

- `.env.example` ne contient que des **noms**, jamais de valeurs. Vérifié par test, ligne à ligne.
- Aucune variable provider ne porte le préfixe `NEXT_PUBLIC_`. Vérifié par balayage exhaustif du code source.
- **Le mode `live` est refusé** : `providerMode()` renvoie `sandbox`, `isLiveModeAllowed()` renvoie `false`. Une clé live présente est une erreur de configuration, pas une autorisation.
- La colonne `mode` de `billing_webhook_events` rend vérifiable après coup qu'un événement sandbox n'a pas prétendu à un effet de production.

---

## 7. Journal des événements

`public.billing_webhook_events` — migration `20260909120000_align_04a_billing_webhook_events.sql`, **déployée en Production le 2026-09-09** (ALIGN-04A finalisation).

RLS activée, **zéro policy**, `anon` et `authenticated` révoqués : ce journal est une donnée d'infrastructure, aucun client n'y accède. Seul le rôle de service y écrit, côté serveur.

La charge utile complète n'est pas conservée — elle peut contenir des données du porteur. On stocke une empreinte SHA-256 du corps brut, qui suffit à prouver qu'on a traité ce qu'on a reçu.

Aucune clé étrangère vers `payments`, `dues`, `ledger_entries` ou `financial_documents` : l'étanchéité entre le domaine loyer et le domaine abonnement (ALIGN-03, §1) reste intacte, et un test le vérifie sur l'ensemble de `src/core/billing/`.

**Décision de déploiement (finalisation ALIGN-04A) :** cette migration est purement additive (`create table if not exists`, `create index if not exists`), sans mutation d'aucune table existante, sans trigger, sans lien vers le domaine loyer, et strictement inerte tant qu'aucun adaptateur n'écrit dedans — ce qui reste le cas (`hasConfiguredProvider()` renvoie `false`, registre vide). Validée par **21/21 assertions pgTAP** en transaction annulée contre le schéma Production réel (`supabase/tests/database/rls_align_04a_webhook_events.test.sql`), couvrant la structure, l'unicité `(provider, provider_event_id)` comme mécanisme d'idempotence, l'absence de policy RLS, l'absence de privilège `anon`/`authenticated`, l'absence de trigger, et zéro clé étrangère vers le domaine loyer. Appliquée en Production puis revérifiée : table présente, 0 ligne, RLS active, 0 policy. Advisors sécurité et performance vérifiés après déploiement : **aucune nouvelle catégorie** — `billing_webhook_events` apparaît dans `rls_enabled_no_policy` aux côtés de 11 autres tables suivant délibérément le même patron, et dans `unused_index` comme toute table neuve sans trafic ; aucun avertissement critique.

---

## 8. Identité de facturation

Inchangée par ce lot. Les factures sont émises par **STE VERALUZ SARL** (D-143), marque KJEMO Studios, produit KJORA. Un provider n'est jamais l'émetteur de la facture : il est le moyen d'encaissement.

> Le format de facture n'est toujours pas validé fiscalement. Aucune conformité n'est revendiquée avant revue juridique.

---

## 8bis. Correction ALIGN-04A.2 — encodage de signature

ALIGN-04A.2 a tenté une vraie connexion sandbox et s'est arrêté à la précondition : aucun credential Flutterwave ou CamPay n'existe dans le dépôt ni dans l'environnement d'exécution (voir `docs/product/KJORA-PROVIDER-SANDBOX-GUIDE-v0.1.md`). La recherche documentaire menée pour préparer ce blocage a néanmoins révélé une erreur dans `signature.ts` : ALIGN-04A supposait un encodage hexadécimal générique pour toute signature HMAC-SHA256, sans l'avoir vérifié contre une documentation provider réelle.

La documentation officielle Flutterwave (`developer.flutterwave.com/docs/webhooks`) confirme un encodage **base64** de la signature, transmise dans l'en-tête `flutterwave-signature`. Le base64 est sensible à la casse — l'hexadécimal ne l'est pas — et `signaturesMatch` normalisait pourtant les deux valeurs en minuscules avant comparaison. Une signature Flutterwave légitime contenant une majuscule aurait donc été rejetée à tort.

Corrigé dans ce module, sans qu'aucun adaptateur n'ait jamais existé pour l'exploiter : `hmacDigest` et `signaturesMatch` prennent désormais un encodage explicite (`hex` | `base64`), la normalisation de casse ne s'applique qu'au hex, et `verifyFlutterwaveSignature` encapsule le cas Flutterwave nommément. Un test dédié (`16bis`) le vérifie. Le mécanisme de signature CamPay reste, lui, `NEEDS PROVIDER CONFIRMATION` — non deviné par analogie.

## 9. Ce que ce lot ne fait pas — et pourquoi

**Aucune connexion sandbox réelle n'a été établie.** Elle exige des comptes marchands chez Flutterwave et CamPay, et donc des clés de test qui n'existent pas encore. Ce qui a été construit est **prêt pour la sandbox** : contrat d'adaptateur, vérification de signature, route de webhook, journal d'idempotence, routage. Ce qui manque est la partie qu'aucun code ne peut inventer — les identifiants.

**Aucun adaptateur concret n'est écrit.** Écrire un adaptateur Flutterwave sans avoir vu une seule réponse réelle de son API reviendrait à coder contre une documentation supposée et à appeler cela une intégration. Le registre reste vide, et `hasConfiguredProvider()` renvoie `false`.

Conséquence directe et voulue : la route de webhook, même déployée, ne peut rien activer. Sans adaptateur enregistré elle répond 503, et même avec un adaptateur, le rattachement d'un événement à son intention appartient à ALIGN-04B — donc `pendingPlanExists` est faux et `decideWebhook` refuse l'activation.

**Aucune Organization cliente n'a été modifiée.** Tous les scénarios tournent sur des données de test en mémoire.

---

## 10. Pour ouvrir ALIGN-04B

1. Ouvrir les comptes marchands Flutterwave et CamPay pour STE VERALUZ SARL (KYC — voir comparatif §6).
2. Récupérer les clés **sandbox** et les poser en variables serveur, jamais dans le dépôt.
3. Écrire les deux adaptateurs contre les réponses réelles de la sandbox.
4. Rattacher un événement provider à son intention de changement de plan en base — la pièce qui manque pour qu'un webhook puisse activer quoi que ce soit.
5. ~~Déployer `align_04a_billing_webhook_events`.~~ **Fait — voir §7, déployée en Production le 2026-09-09.**
6. Confirmer les six points marqués `NEEDS PROVIDER CONFIRMATION` avant toute ouverture commerciale.

---

## 11. Statut

**ALIGN-04A = FINALIZED.** Architecture livrée, migration du journal webhook déployée en Production (additive, inerte, testée 21/21 pgTAP), registre vide, mode live refusé, aucun débit possible.

**ALIGN-04A.2 = WAITING FOR SANDBOX CREDENTIALS — READY TO RESUME.** Aucun compte Flutterwave ni CamPay n'existe dans ce dépôt ou cet environnement d'exécution ; aucun adaptateur n'a été écrit. Correction apportée à `signature.ts` pendant la recherche préparatoire (§8bis). Point de reprise préparé : voir la **RESUME CHECKLIST** en tête de `docs/product/KJORA-PROVIDER-SANDBOX-GUIDE-v0.1.md` pour la liste exacte des actions nécessaires côté Blaise, dans l'ordre.

**KJORA APP ROADMAP = CONTROLLED PAUSE AT ALIGN-04A.2.**

Documents liés : `docs/product/KJORA-PAYMENT-PROVIDERS-COMPARISON-v0.1.md`, `docs/product/KJORA-PROVIDER-SANDBOX-GUIDE-v0.1.md`, `docs/architecture/KJORA-BILLING-SAAS-v0.1.md`.

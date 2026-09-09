# KJORA — Guide de mise en sandbox d'un provider de paiement v0.1

**Statut :** ALIGN-04A.2 — **bloqué faute de credentials**. Ce guide documente exactement ce qu'il faut ouvrir et récupérer pour débloquer, provider par provider. Aucune valeur secrète ne figure dans ce document.
**Date :** 2026-09-09
**Portée :** Flutterwave (primaire candidat), CamPay (secondaire candidat)
**Sources :** citées à chaque section, consultées le 2026-09-09

---

## 0. Pourquoi ce document existe

ALIGN-04A a livré l'architecture — contrat d'adaptateur, matrice de capacités, routage serveur, route de webhook, journal d'idempotence — entièrement testable sans provider réel. ALIGN-04A.2 devait connecter un vrai sandbox. Aucun credential Flutterwave ou CamPay n'existe dans le dépôt, dans `.env.local`, ni dans une variable d'environnement accessible à cette exécution. Écrire un adaptateur sans jamais avoir vu une réponse réelle de l'API reviendrait à deviner un contrat — précisément ce qu'ALIGN-04A a refusé de faire pour les tarifs non publics, et ce lot applique la même règle au code.

Ce document est donc la liste d'actions côté Blaise pour lever le blocage, provider par provider, avec les noms de variables déjà réservés dans `provider-config.ts` et `.env.example`.

---

## RESUME CHECKLIST

Point de reprise unique pour ALIGN-04A.2. À cocher dans cet ordre dès qu'un credential arrive — rien avant la première case ne peut légitimement commencer.

- [ ] **Credentials sandbox présents** — clé secrète et secret webhook du provider choisi effectivement injectés côté serveur (pas seulement promis)
- [ ] **Version d'API provider confirmée** — pour Flutterwave : v3 ou v4 tranché avant d'écrire le moindre appel (§1.6) ; pour CamPay : mécanisme de signature webhook confirmé (§2.3)
- [ ] **Webhook secret configuré** — secret hash (Flutterwave) ou équivalent (CamPay) posé côté dashboard provider, pas seulement côté KJORA
- [ ] **Variables env injectées** — `FLUTTERWAVE_SANDBOX_SECRET_KEY` / `FLUTTERWAVE_SANDBOX_WEBHOOK_SECRET` ou `CAMPAY_SANDBOX_SECRET_KEY` / `CAMPAY_SANDBOX_WEBHOOK_SECRET` lisibles par `provider-config.ts` (`isProviderConfigured()` doit renvoyer `true`)
- [ ] **Provider registry activé en sandbox uniquement** — `registerBillingProvider()` appelé pour ce seul provider, `providerMode()` toujours `"sandbox"`, `isLiveModeAllowed()` toujours `false`
- [ ] **Checkout sandbox test** — un checkout réel est créé et redirige vers l'environnement de test du provider
- [ ] **Webhook success test** — un paiement sandbox réussi déclenche un webhook signé, vérifié, et journalisé dans `billing_webhook_events`
- [ ] **Webhook failure test** — un paiement sandbox refusé ne change pas le plan effectif et journalise l'échec
- [ ] **Duplicate webhook test** — le même événement rejoué ne produit ni double facture ni double activation
- [ ] **Plan activation test** — le plan effectif ne change qu'après le webhook confirmé, jamais au moment du checkout
- [ ] **Invoice test** — une facture SaaS est émise, identité STE VERALUZ SARL, montant conforme au calcul serveur
- [ ] **Multi-tenant test** — deux Organizations de test, aucun croisement de checkout, de webhook ou de facture entre elles
- [ ] **Rent/Ledger isolation test** — `payments`, `dues`, `ledger_entries`, `financial_documents` inchangés après le cycle complet

Tant que la première case n'est pas cochée, la seule action légitime est d'attendre ou de relancer Blaise sur les sections 1 ou 2 ci-dessous — jamais d'écrire un adaptateur par anticipation.

---

## 1. Flutterwave — provider primaire candidat

### 1.1 Ouvrir le compte

- Tableau de bord : **dashboard.flutterwave.com** (connexion : app.flutterwave.com/login).
- Créer un compte **Business (Limited Entities)**, pas un compte individuel — c'est celui qui correspond à STE VERALUZ SARL.
- Le mode test (sandbox) est disponible **dès la création du compte**, avant même la fin de la vérification KYC : on peut commencer l'intégration technique en parallèle de la vérification.

### 1.2 Documents KYC — Cameroun, compte Business

Source : [Onboarding requirements for using Flutterwave in Cameroon](https://flutterwave.com/ke/support/onboarding/onboarding-requirements-for-using-flutterwave-in-cameroon)

- Contrat dûment complété, signé et tamponné (si Flutterwave en fournit un)
- Formulaire KYC rempli, signé et tamponné
- Statuts de la société (Articles of Association)
- Certificat de non-endettement
- Certificat d'immatriculation (RCCM — KJORA dispose déjà de CM-NSI-02-2026-B12-00615, D-143)
- Pièce d'identité du gérant
- Carte de contribuable (NIU — déjà disponible : M062618820539S, D-143)
- Domiciliation bancaire
- Attestation de localisation et plan de localisation
- Lettre nommant le gérant si différent de celui des statuts
- Licence d'exploitation (business license)

**Deux pièces existent déjà dans le dossier légal canonique** (D-143) : RCCM et NIU. Les autres restent à réunir côté Blaise/VERALUZ SARL.

### 1.3 Récupérer les clés de test

Source : [Getting your API keys](https://flutterwave.com/tz/support/my-account/getting-your-api-keys)

1. Dashboard → **Settings** → **API Keys** (section Developers).
2. Basculer sur **Test Mode**.
3. Les clés de test commencent par `FLWPUBK_TEST-` (publique) et `FLWSECK_TEST-` (secrète).
4. **La clé secrète n'est affichée qu'une seule fois** : téléchargez-la immédiatement via le bouton dédié, elle ne réapparaît plus ensuite.

### 1.4 Configurer le webhook

Source : [Webhooks — Flutterwave API docs](https://developer.flutterwave.com/docs/webhooks)

1. Dashboard → **Settings** → **Webhooks**.
2. URL à renseigner : `https://<domaine-kjora>/api/billing/webhooks/flutterwave`
3. Cocher toutes les cases d'événements pertinents, activer les **retries** (3 tentatives, intervalle 30 minutes en cas d'échec).
4. Définir un **secret hash** — une valeur aléatoire choisie par KJORA, pas fournie par Flutterwave. C'est elle qui devient `FLUTTERWAVE_SANDBOX_WEBHOOK_SECRET`.
5. Flutterwave calcule `HMAC-SHA256(secret_hash, corps_brut)`, encodé en **base64**, transmis dans l'en-tête **`flutterwave-signature`**.

> **Correction technique apportée pendant cette exécution.** `src/core/billing/signature.ts` (ALIGN-04A) supposait un encodage hexadécimal générique, jamais vérifié faute de documentation consultée à l'époque. La documentation officielle confirme un encodage **base64**, qui est sensible à la casse — contrairement à l'hexadécimal. Le module a été corrigé (`verifyFlutterwaveSignature`, comparaison base64 sans normalisation de casse) et un test dédié ajouté (`16bis`). Cette correction n'a affecté aucun webhook réel : aucun adaptateur n'a jamais existé pour l'utiliser.

### 1.5 Variables d'environnement attendues

Déjà déclarées dans `.env.example` (noms seuls, jamais de valeurs) :

```
FLUTTERWAVE_SANDBOX_SECRET_KEY=
FLUTTERWAVE_SANDBOX_WEBHOOK_SECRET=
```

`FLUTTERWAVE_SANDBOX_SECRET_KEY` reçoit `FLWSECK_TEST-...`. `FLUTTERWAVE_SANDBOX_WEBHOOK_SECRET` reçoit le secret hash choisi à l'étape 1.4, pas une valeur fournie par Flutterwave.

### 1.6 Point à trancher avant d'écrire l'adaptateur

Flutterwave documente **deux générations d'API actives en parallèle** : v3 (historique, la plus répandue dans les intégrations existantes) et v4 (unifiée, actuellement mise en avant dans la documentation consultée). Le format des endpoints, l'authentification et la structure des webhooks diffèrent entre les deux. **`NEEDS PROVIDER CONFIRMATION`** : contre quelle génération l'adaptateur `FlutterwaveBillingProviderAdapter` doit-il être écrit — probablement v4 pour un développement neuf, mais à confirmer avant d'écrire le moindre appel réseau, faute de quoi le code serait construit contre la mauvaise cible.

### 1.7 Cartes et wallets de test

Non trouvés dans les pages publiques consultées lors de cette exécution. `NEEDS PROVIDER CONFIRMATION` — habituellement documentés dans la section **Testing** du portail développeur (`developer.flutterwave.com/docs/testing`), accessible seulement après connexion à un compte sandbox actif.

---

## 2. CamPay — provider secondaire candidat, spécialiste Mobile Money

### 2.1 Ouvrir le compte de démonstration

Source : [CamPay API — documentation Postman](https://documenter.getpostman.com/view/2391374/T1LV8PVA)

- Site de démo/sandbox : **demo.campay.net**
- S'inscrire, se connecter, puis **enregistrer une application** — c'est cette étape qui génère les clés.

### 2.2 Récupérer les clés

- Une fois l'application enregistrée, les identifiants apparaissent sous la section **APP KEYS** de l'application.
- Authentification par jeton permanent (`Authorization: Token <clé>`) ou jeton temporaire renouvelable, au choix.

### 2.3 Configurer le webhook

Le mécanisme précis de signature des webhooks CamPay n'a pas pu être confirmé de façon fiable dans les pages publiques consultées lors de cette exécution — la documentation Postman renvoyait un contenu partiel. **`NEEDS PROVIDER CONFIRMATION`** avant d'écrire `CamPayBillingProviderAdapter` : nom exact de l'en-tête de signature, algorithme, encodage. Ne pas supposer un format par analogie avec Flutterwave — c'est exactement l'erreur corrigée en §1.4.

URL à renseigner une fois le mécanisme confirmé : `https://<domaine-kjora>/api/billing/webhooks/campay`

### 2.4 Variables d'environnement attendues

Déjà déclarées dans `.env.example` :

```
CAMPAY_SANDBOX_SECRET_KEY=
CAMPAY_SANDBOX_WEBHOOK_SECRET=
```

### 2.5 Cartes et wallets de test

CamPay opère par Mobile Money (MTN, Orange) : le test se fait vraisemblablement par des numéros de téléphone factices fournis par l'environnement demo.campay.net après inscription, pas par des cartes. **`NEEDS PROVIDER CONFIRMATION`** — non documenté publiquement dans les pages consultées.

---

## 3. Scénarios à exécuter dès qu'un sandbox est connecté

Repris de la spécification ALIGN-04A.2, à charge de l'adaptateur réel une fois écrit :

1. Checkout sandbox réussi — Découverte → Avancé, plan effectif mis à jour seulement après webhook confirmé.
2. Checkout / paiement refusé — plan effectif inchangé, tentative journalisée.
3. Webhook rejoué — aucun doublon de facture, aucune double activation.
4. Signature invalide ou absente — 4xx, aucun effet métier.
5. Montant, devise ou plan falsifiés côté client — recalcul serveur, webhook incohérent rejeté.
6. Mobile Money (CamPay, ou Flutterwave si le compte le permet en sandbox) — tester le flux réellement offert ; si le mandat récurrent n'est pas activable en sandbox, le documenter comme tel plutôt que de le simuler.
7. Remboursement — si le sandbox le permet ; sinon `NOT SUPPORTED / NEEDS PROVIDER CONFIRMATION`.
8. Isolation multi-tenant — deux Organizations de test, aucune fuite d'un côté ni de l'autre.
9. Étanchéité loyers — `payments`, `dues`, `ledger_entries`, `financial_documents` inchangés après le cycle complet.

---

## 4. Checklist avant tout passage en mode live (hors périmètre de ce lot)

Cette checklist n'est **pas** à exécuter maintenant — `isLiveModeAllowed()` renvoie `false` dans le code tant qu'ALIGN-04B n'a pas explicitement changé cela.

- [ ] KYC business complété et compte activé (pas seulement le mode test)
- [ ] Grille tarifaire réelle confirmée par le provider (voir comparatif §6)
- [ ] Politique de remboursement confirmée
- [ ] Délais et seuils de règlement confirmés
- [ ] Clés live générées, stockées uniquement comme variables serveur de Production, jamais commitées
- [ ] Webhook live configuré avec sa propre URL et son propre secret, distinct du sandbox
- [ ] `isLiveModeAllowed()` explicitement changé par un lot dédié, avec revue
- [ ] E2E sandbox de la section 3 entièrement vert avant toute demande de passage live

---

## 5. Statut

**ALIGN-04A.2 = WAITING FOR SANDBOX CREDENTIALS — READY TO RESUME.**

Aucun compte Flutterwave ni CamPay n'existe dans ce dépôt ou cet environnement. Ce guide fournit tout ce qui est nécessaire pour que Blaise ouvre l'un des deux comptes ; l'implémentation reprendra dès qu'un jeu de clés de test sera disponible côté serveur, en suivant la **RESUME CHECKLIST** ci-dessus dans l'ordre.

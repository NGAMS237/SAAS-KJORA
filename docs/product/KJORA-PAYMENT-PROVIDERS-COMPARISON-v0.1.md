# KJORA — Comparatif des providers de paiement SaaS v0.1

**Statut :** ALIGN-04A — sélection et architecture, aucun débit réel
**Date :** 2026-09-09
**Portée :** abonnement SaaS **Organization → STE VERALUZ SARL** uniquement
**Hors portée :** paiements de loyer Locataire → Propriétaire, futur KJORA Collect

> Ce document tranche le choix des providers. Il ne vaut pas engagement contractuel : tout tarif marqué `NEEDS PROVIDER CONFIRMATION` doit être confirmé par le provider avant activation commerciale.

---

## 1. La contrainte qui détermine tout

L'éditeur du service est **STE VERALUZ SARL**, société camerounaise (RCCM CM-NSI-02-2026-B12-00615, siège Yaoundé — D-143). C'est elle qui doit être le marchand encaisseur.

**Stripe n'accepte pas de compte marchand camerounais.** Stripe opère dans 46 pays ; le Cameroun n'en fait pas partie. Un client camerounais *peut* payer via Stripe, mais une société camerounaise *ne peut pas* détenir le compte marchand. Les contournements (entité étrangère, compte bancaire US) créeraient une entité juridique non canonisée et sortent du périmètre de D-143.

**Conséquence : le provider primaire doit être licencié au Cameroun.** Ce critère élimine mécaniquement l'option la plus confortable techniquement.

---

## 2. Tableau comparatif

| Provider | Cameroon | Canada | XAF | CAD | Cards | MTN | Orange | Recurring | Webhooks | Refunds | KYC | Fees | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Stripe** | ❌ marchand | ✅ | ✅ présentement | ✅ | ✅ | ❌ | ❌ | ✅ natif | ✅ signés | ✅ | ❌ SARL CM refusée | publics | **Rejeté** |
| **Flutterwave** | ✅ licencié | 🟡 encaissement | ✅ | 🟡 converti XAF | ✅ | ✅ | ✅ | 🟡 Payment Plans | ✅ | 🟡 à confirmer | ✅ | `NEEDS CONFIRMATION` | **Primaire** |
| **CamPay** | ✅ natif | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | 🟡 sur demande | ✅ HMAC-SHA256 | 🟡 | ✅ | `NEEDS CONFIRMATION` | **Secondaire** |
| **ElyonPay** | ✅ natif | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | 🟡 à confirmer | 🟡 à confirmer | 🟡 | ✅ | 2,5–3 % publiés | **Fallback** |
| **Notch Pay** | ✅ | ❌ | ✅ | ❌ | 🟡 | ✅ | ✅ | 🟡 | ✅ | 🟡 | ✅ | `NEEDS CONFIRMATION` | **Réserve** |
| **PayUnit** | 🟡 | ❌ | 🟡 | ❌ | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | `NEEDS CONFIRMATION` | **Non retenu** |

Légende : ✅ confirmé · 🟡 partiel ou à confirmer · ❌ non disponible

---

## 3. Détail par provider

### Stripe — rejeté comme marchand

- **Marchés :** 46 pays. Cameroun absent.
- **Devises :** XAF est une devise de présentement supportée ; CAD également.
- **Recurring :** Stripe Billing est la référence du marché — tokenisation, mandats, retries, prorations natives.
- **Blocage :** aucune société camerounaise ne peut ouvrir de compte marchand.
- **Verdict :** rejeté tant que VERALUZ SARL est la seule entité canonisée. À réexaminer si une entité canadienne était un jour créée et canonisée — ce qui serait une décision produit et juridique, pas technique.

### Flutterwave — provider primaire

- **Marchés :** licence de paiement étendue au Cameroun en 2025.
- **Moyens :** cartes Visa/Mastercard, MTN MoMo, Orange Money, virement bancaire.
- **Devises :** collecte multi-devises possible ; **tout est converti et réglé en XAF**.
- **Contrainte de settlement majeure :** un marchand camerounais ne peut plus transférer depuis son solde XAF vers une autre devise, un compte bancaire d'une autre devise ou un wallet MoMo d'une autre devise. Restriction réglementaire, **sans échéance de levée annoncée**.
- **Recurring :** API Payment Plans. À confirmer pour le cas Mobile Money.
- **Verdict :** seul provider trouvé qui soit à la fois licencié au Cameroun **et** capable d'encaisser des cartes internationales — indispensable pour la diaspora et le Canada.

### CamPay — provider secondaire, spécialiste MoMo

- **Moyens :** MTN Mobile Money et Orange Money.
- **Devise :** XAF.
- **Webhooks :** HTTPS signés **HMAC-SHA256**, déclenchés dès validation par le client.
- **Idempotence :** garantie par le provider — un client ne peut pas payer deux fois par accident.
- **Recurring :** abonnements MoMo mensuels disponibles **sur demande**.
- **Verdict :** meilleur choix pour l'encaissement MoMo local en XAF. Sa signature HMAC et son idempotence native en font un bon second.

### ElyonPay — fallback

- **Moyens :** MTN MoMo, Orange Money, Wave, Moov, Express Union, cartes bancaires — API unifiée.
- **Tarifs :** 2,5–3 % publiés, seul provider de la liste à publier une fourchette claire.
- **Intégration :** API REST, SDK JavaScript/Node, PHP, Python, Java, React Native.
- **Verdict :** fallback crédible et camerounais. Recurring et politique de remboursement à confirmer.

### Notch Pay — réserve

API REST et SDK, webhooks, XAF, Mobile Money. Techniquement viable mais redondant avec CamPay et ElyonPay. Conservé en réserve documentée plutôt qu'intégré.

### PayUnit — non retenu

Aucune documentation publique fiable trouvée sur les marchés, tarifs, webhooks ou recurring. **Ne pas intégrer sans preuve documentaire.** Les agrégateurs camerounais pratiquent typiquement 1–4 % de commission, mais cette fourchette générale ne constitue pas une information sur PayUnit.

---

## 4. La contrainte produit la plus importante

**Le Mobile Money ne permet pas le prélèvement silencieux qu'on connaît avec une carte.**

MTN définit bien un « Repeat Payment » — une autorisation permettant à un marchand de débiter un wallet à date et montant fixes — et les abonnements MoMo mensuels existent **sur demande** chez les agrégateurs. Mais cette capacité doit être activée au niveau du marchand, et n'est pas acquise par défaut.

Conséquence pour KJORA : le moteur de facturation doit traiter **deux modes de récurrence**, pas un seul.

| Mode | Description | Providers |
|---|---|---|
| `unattended_recurring` | Débit automatique sans action du client à chaque cycle. Carte tokenisée ou mandat MoMo activé. | Cartes via Flutterwave ; MoMo **si** le mandat est activé |
| `customer_approved_recurring` | À chaque échéance, KJORA émet la facture et le client valide le paiement (USSD/OTP). | MoMo par défaut, tous providers |

L'interface Abonnement doit donc savoir dire honnêtement : « à chaque échéance, vous recevrez une demande à valider » quand le mandat n'est pas actif. C'est une différence de promesse produit, pas un détail technique.

---

## 5. Recommandation

**Provider primaire — Flutterwave.** Licencié au Cameroun, accepte cartes internationales et Mobile Money, permet d'encaisser la diaspora et le Canada. Réserve : tout est réglé en XAF, sans conversion sortante possible.

**Provider secondaire — CamPay.** Spécialiste MoMo camerounais, webhooks signés HMAC-SHA256, idempotence native. Utilisé pour les paiements XAF/MoMo locaux et comme relais si Flutterwave est indisponible.

**Fallback — ElyonPay.** Camerounais, tarification publiée, couverture large des wallets et des cartes.

**Réserve documentée — Notch Pay.** Viable, non intégré.

**Rejetés :**

- **Stripe** — aucun compte marchand possible pour une SARL camerounaise. Réexaminable seulement si une entité étrangère était créée et canonisée.
- **PayUnit** — preuves publiques insuffisantes.

**Stratégie Cameroun :** CamPay en premier pour MoMo XAF, Flutterwave pour les cartes, ElyonPay en secours.

**Stratégie Canada / diaspora :** encaissement par **carte internationale via Flutterwave**, prix affiché en CAD, règlement converti en XAF sur le compte VERALUZ SARL. Il n'existe pas, à ce stade, de chemin permettant à une entité camerounaise de conserver un solde CAD. Si l'activité canadienne le justifiait un jour, la bonne réponse serait une entité juridique locale — décision produit et juridique, pas technique.

---

## 6. À confirmer avant activation commerciale

Ces points sont marqués `NEEDS PROVIDER CONFIRMATION` et bloquent l'ouverture commerciale, pas la sandbox :

1. Grille tarifaire réelle de Flutterwave, CamPay et Notch Pay pour un marchand camerounais : commission par transaction, frais fixes, frais de change, frais de règlement.
2. Conditions exactes d'activation du **mandat MoMo récurrent** chez Flutterwave et CamPay.
3. Politique de remboursement de chaque provider : total, partiel, délai.
4. Délais de règlement et seuils minimaux.
5. Dossier KYC requis pour STE VERALUZ SARL : documents, compte bancaire, délais.
6. Comportement exact des webhooks : politique de retry, garanties de livraison, format des identifiants d'événement.

---

## 7. Statut

**ALIGN-04A — comparatif établi. Aucun contrat, aucun compte marchand ouvert, aucun débit réel.**

Sources : [Stripe supported countries](https://dodopayments.com/blogs/stripe-supported-countries-alternatives) · [Stripe Africa](https://ngwaspenn.com/stripe-supported-countries-africa/) · [CamPay](https://campay.net/fr/) · [Flutterwave Cameroun](https://fintech.global/2025/06/27/flutterwave-expands-licensed-payments-in-cameroon/) · [Flutterwave payout pause Cameroun](https://flutterwave.com/us/support/general/about-the-payout-pause-in-cameroon) · [Flutterwave tarifs CM](https://flutterwave.com/cm/pricing) · [Notch Pay developers](https://developer.notchpay.co/) · [ElyonPay](https://elyonpay.com/paiement.html) · [MTN MoMo Cameroun](https://mtn.cm/helppersonal/momo-app/)

# KJORA — Matrice des variables Hostinger

Inventaire statique effectué le 2026-10-03 depuis toutes les lectures de `process.env`, les clés dynamiques fermées et `.env.example`. « Obligatoire » signifie nécessaire au parcours indiqué, pas autorisation d'activer le fournisseur. Une valeur `NEXT_PUBLIC_*` est publique et figée par Next.js au build.

## 1. Indispensables au premier démarrage

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public + serveur | non | oui | oui | URL HTTPS du projet KJORA, saisie dans Hostinger | Supabase | obligatoire |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public + serveur | non | oui | oui | clé publiable/anon du même projet, jamais une clé secrète | Supabase | obligatoire |
| `NODE_ENV` | serveur/système | non | automatique | oui | `production`, fourni par `next start` | Node.js | obligatoire, ne pas détourner |

## 2. Supabase Dev et traitements serveur

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `SUPABASE_SECRET_KEY` | serveur | oui | non | conditionnel | clé secrète KJORA pour cron/webhooks serveur; jamais dans le navigateur | Supabase | à saisir manuellement lorsque ces traitements sont autorisés |
| `SUPABASE_SERVICE_ROLE_KEY` | serveur | oui | non | non | ancien nom accepté en fallback | Supabase | obsolète; ne pas configurer sur Hostinger |

La clé secrète ne donne aucune autorisation de migration automatique. Elle ne doit jamais être préfixée `NEXT_PUBLIC_`.

## 3. Resend

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `RESEND_TRANSACTIONAL_API_KEY` | serveur | oui | non | conditionnel | clé d'envoi restreinte, saisie manuellement | Resend | non configurée par ce lot |
| `KJORA_TRANSACTIONAL_EMAIL_FROM` | serveur | non | non | conditionnel | `KJORA <notifications@mail.kjorapp.com>` | Resend | adresse préparée |
| `KJORA_SUPPORT_EMAIL_TO` | serveur | donnée privée de configuration | non | conditionnel | boîte support autorisée | Resend | facultatif; support 503 si absent |
| `RESEND_WEBHOOK_SECRET` | serveur | oui | non | conditionnel | secret Svix `whsec_…` | Resend | non configuré par ce lot |
| `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED` | serveur | non | non | oui | `false` au premier déploiement | KJORA | désactivé |

L'adresse d'expédition est publique par nature; la clé API, le destinataire et le secret webhook ne doivent jamais figurer dans Git ou les journaux.

## 4. Stripe Test

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `BILLING_PROVIDER_STRIPE_TEST_ENABLED` | serveur | non | non | oui | `0` | Stripe | désactivé |
| `BILLING_KILL_SWITCH_STRIPE` | serveur | non | non | oui | `1` | KJORA | fermé |
| `STRIPE_SANDBOX_SECRET_KEY` | serveur | oui | non | conditionnel | uniquement une clé commençant par `sk_test_` | Stripe | ne pas saisir au premier déploiement |
| `STRIPE_SANDBOX_WEBHOOK_SECRET` | serveur | oui | non | conditionnel | secret Test `whsec_…` | Stripe | ne pas saisir au premier déploiement |
| `KJORA_APP_ORIGIN` | serveur | non | non | conditionnel | `https://kjorapp.com` sans chemin, requête ou fragment | KJORA | préparé; utilisé seulement si Stripe Test est autorisé |
| `STRIPE_TEST_PRICE_ESSENTIEL_MONTHLY_CAD` | serveur | sensible de configuration | non | conditionnel | Price ID Test `price_…` | Stripe | fermé |
| `STRIPE_TEST_PRICE_ESSENTIEL_ANNUAL_CAD` | serveur | sensible de configuration | non | conditionnel | Price ID Test `price_…` | Stripe | fermé |
| `STRIPE_TEST_PRICE_AVANCE_MONTHLY_CAD` | serveur | sensible de configuration | non | conditionnel | Price ID Test `price_…` | Stripe | fermé |
| `STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD` | serveur | sensible de configuration | non | conditionnel | Price ID Test `price_…` | Stripe | fermé |
| `STRIPE_TEST_PRICE_PATRIMOINE_MONTHLY_CAD` | serveur | sensible de configuration | non | conditionnel | Price ID Test `price_…` | Stripe | fermé |
| `STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD` | serveur | sensible de configuration | non | conditionnel | Price ID Test `price_…` | Stripe | fermé |

Le code refuse les clés live. Les URL Checkout et portail sont construites depuis l'origine fermée; le portail revient vers `/app/billing`.

## 5. Facturation Afrique et coupe-circuits

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `BILLING_KILL_SWITCH_ALL` | serveur | non | non | oui | `1` au premier déploiement pour couper tous les providers | KJORA | fermé |
| `FLUTTERWAVE_SANDBOX_SECRET_KEY` | serveur | oui | non | non | clé sandbox future | Flutterwave | aucun adaptateur |
| `FLUTTERWAVE_SANDBOX_WEBHOOK_SECRET` | serveur | oui | non | non | secret sandbox futur | Flutterwave | aucun adaptateur |
| `BILLING_KILL_SWITCH_FLUTTERWAVE` | serveur | non | non | non | `1` si une future intégration doit être coupée | KJORA | facultatif |
| `CAMPAY_SANDBOX_SECRET_KEY` | serveur | oui | non | non | clé sandbox future | CamPay | aucun adaptateur |
| `CAMPAY_SANDBOX_WEBHOOK_SECRET` | serveur | oui | non | non | secret sandbox futur | CamPay | aucun adaptateur |
| `BILLING_KILL_SWITCH_CAMPAY` | serveur | non | non | non | `1` si une future intégration doit être coupée | KJORA | facultatif |
| `ELYONPAY_SANDBOX_SECRET_KEY` | serveur | oui | non | non | clé sandbox future | ElyonPay | aucun adaptateur |
| `ELYONPAY_SANDBOX_WEBHOOK_SECRET` | serveur | oui | non | non | secret sandbox futur | ElyonPay | aucun adaptateur |
| `BILLING_KILL_SWITCH_ELYONPAY` | serveur | non | non | non | `1` si une future intégration doit être coupée | KJORA | facultatif |
| `NOTCHPAY_SANDBOX_SECRET_KEY` / `NOTCHPAY_SANDBOX_WEBHOOK_SECRET` | serveur | oui | non | non | noms lus par le registre générique, non documentés dans `.env.example` | Notch Pay | réserve, aucun adaptateur; ne pas configurer |
| `PAYUNIT_SANDBOX_SECRET_KEY` / `PAYUNIT_SANDBOX_WEBHOOK_SECRET` | serveur | oui | non | non | noms lus par le registre générique, non documentés dans `.env.example` | PayUnit | rejeté, aucun adaptateur; ne pas configurer |
| `BILLING_KILL_SWITCH_NOTCHPAY` / `BILLING_KILL_SWITCH_PAYUNIT` | serveur | non | non | non | clés dynamiques possibles du registre | KJORA | inutilisées en pratique sans adaptateur |

## 6. WhatsApp manuel et future API Meta

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `KJORA_WHATSAPP_PROVIDER` | serveur | non | non | non | `disabled` | KJORA | désactivé; `wa.me` manuel seulement |
| `KJORA_WHATSAPP_ACCESS_TOKEN` | non lue | oui | non | non | aucune valeur au pilote | Meta | placeholder inutilisé |
| `KJORA_WHATSAPP_PHONE_NUMBER_ID` | non lue | sensible | non | non | aucune valeur au pilote | Meta | placeholder inutilisé |
| `KJORA_WHATSAPP_WEBHOOK_SECRET` | non lue | oui | non | non | aucune valeur au pilote | Meta | placeholder inutilisé |

Les trois placeholders Meta restent vides et ne peuvent activer le provider. Le handoff manuel ouvre uniquement `wa.me`; aucun statut d'envoi, livraison ou lecture n'est fabriqué.

## 7. Automatisations désactivées

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `CRON_SECRET` | serveur | oui | non | conditionnel | valeur aléatoire d'au moins 16 caractères | KJORA/planificateur | vide; aucun cron Hostinger configuré |
| `KJORA_SAAS_AUTO_INVOICING_ENABLED` | serveur | non | non | oui | `false` | KJORA | dry-run/désactivé |

`vercel.json` décrit un cron Vercel historique. Il n'active rien sur Hostinger et ne doit pas être reproduit sans autorisation séparée.

## 8. Facultatives, partenaires, administration et identité

| Variable | Côté client/serveur | Secrète | Obligatoire au build | Obligatoire au runtime | Valeur attendue | Fournisseur | État pilote |
|---|---|---:|---:|---:|---|---|---|
| `KJORA_PARTNERS_HASH_SALT` | serveur | oui | non | pour les candidatures | sel aléatoire fort | KJORA | à saisir manuellement avant test partenaire |
| `KJORA_COMMERCIAL_SITE_URL` | serveur | non | non | non | `https://kjorapp.com`, site public et application servis par le même déploiement | KJORA | lien Admin préparé |
| `NEXT_PUBLIC_KJORA_CONTACT_EMAIL` | public | non | oui | non | adresse destinée à être publique ou vide | KJORA | facultatif |
| `KJORA_BILLING_LEGAL_NAME` | serveur | non | non | conditionnel | dénomination officielle validée | KJORA | décision juridique requise |
| `KJORA_BILLING_LEGAL_ADDRESS` | serveur | non | non | non | adresse officielle validée | KJORA | facultatif |
| `KJORA_BILLING_LEGAL_REGISTRATION` | serveur | non | non | non | immatriculation officielle validée | KJORA | facultatif |
| `KJORA_BILLING_LEGAL_TAX_ID` | serveur | donnée réglementée | non | non | identifiant validé | KJORA | facultatif |
| `KJORA_BILLING_LEGAL_CONTACT_EMAIL` | serveur | non | non | non | contact de facturation validé | KJORA | facultatif |
| `VERCEL_ENV` | serveur | non | non | non | fourni automatiquement par Vercel | Vercel | ne pas créer sur Hostinger |

Si le nom légal est absent, les PDF restent explicitement provisoires; aucune identité n'est inventée.

## 9. Obsolètes ou inutilisées

- `SUPABASE_SERVICE_ROLE_KEY` : fallback historique; préférer `SUPABASE_SECRET_KEY`.
- `KJORA_WHATSAPP_ACCESS_TOKEN`, `KJORA_WHATSAPP_PHONE_NUMBER_ID`, `KJORA_WHATSAPP_WEBHOOK_SECRET` : déclarées mais non lues; conserver vides jusqu'au lot Meta.
- Variables Notch Pay et PayUnit : le registre fermé connaît les noms mais aucun adaptateur n'existe; ne pas les configurer.
- `VERCEL_ENV` : spécifique à Vercel; le repli Hostinger sécurisé utilise `NODE_ENV` lorsque cette variable est absente.

## Valeurs sûres obligatoires au premier déploiement

```text
BILLING_PROVIDER_STRIPE_TEST_ENABLED=0
BILLING_KILL_SWITCH_ALL=1
BILLING_KILL_SWITCH_STRIPE=1
KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=false
KJORA_SAAS_AUTO_INVOICING_ENABLED=false
KJORA_WHATSAPP_PROVIDER=disabled
KJORA_APP_ORIGIN=https://kjorapp.com
KJORA_COMMERCIAL_SITE_URL=https://kjorapp.com
```

Les champs secrets restent vides dans Git. Blaise les saisit uniquement dans le gestionnaire de variables Hostinger, jamais dans un chat, un ticket, un rapport ou un fichier versionné.

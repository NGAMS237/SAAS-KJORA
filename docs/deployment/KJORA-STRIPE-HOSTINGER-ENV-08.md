# KJORA — Stripe Test — matrice Hostinger 08

Cette matrice concerne exclusivement Stripe **Test** sur `kjorapp.com`. Elle
ne contient aucune valeur secrète ni aucun Price ID complet.

## Gate avant saisie

1. Exécuter `npm run stripe:test:audit` avec une clé `sk_test_…` injectée
   uniquement dans le processus local.
2. Exiger le résultat `products: 3`, `prices: 6` et six lignes `PASS`.
3. Comparer les Price IDs masqués aux six valeurs qui seront saisies.
4. Ne rien enregistrer dans Hostinger sans autorisation immédiate de Blaise.

Exemple PowerShell avec saisie masquée :

```powershell
$stripeSecure = Read-Host "Clé Stripe Test" -AsSecureString
$stripePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stripeSecure)
try {
  $env:STRIPE_SANDBOX_SECRET_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stripePointer)
  npm run stripe:test:audit
} finally {
  Remove-Item Env:STRIPE_SANDBOX_SECRET_KEY -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stripePointer)
  $stripeSecure = $null
}
```

La commande n'affiche jamais la clé et le script masque les Price IDs.

## Matrice exacte

| Variable | Valeur attendue | Secrète | Gate |
| --- | --- | ---: | --- |
| `KJORA_APP_ORIGIN` | `https://kjorapp.com` | non | exacte, sans chemin |
| `BILLING_PROVIDER_STRIPE_TEST_ENABLED` | `1` | non | après audit Stripe |
| `BILLING_KILL_SWITCH_STRIPE` | `0` | non | seulement pour le test supervisé |
| `BILLING_KILL_SWITCH_ALL` | `0` | non | seulement pour le test supervisé |
| `STRIPE_SANDBOX_SECRET_KEY` | clé restreinte `sk_test_…` | oui | gestionnaire Hostinger |
| `STRIPE_SANDBOX_WEBHOOK_SECRET` | secret `whsec_…` de l'endpoint Test exact | oui | après webhook vérifié |
| `STRIPE_TEST_PRICE_ESSENTIEL_MONTHLY_CAD` | KJORA Essentiel, 14,99 CAD/mois | configuration | Price actif validé |
| `STRIPE_TEST_PRICE_ESSENTIEL_ANNUAL_CAD` | KJORA Essentiel, 149,90 CAD/an | configuration | Price actif validé |
| `STRIPE_TEST_PRICE_AVANCE_MONTHLY_CAD` | KJORA Avancé, 31,99 CAD/mois | configuration | Price actif validé |
| `STRIPE_TEST_PRICE_AVANCE_ANNUAL_CAD` | KJORA Avancé, 319,90 CAD/an | configuration | Price actif validé |
| `STRIPE_TEST_PRICE_PATRIMOINE_MONTHLY_CAD` | KJORA Patrimoine, 61,99 CAD/mois | configuration | Price actif validé |
| `STRIPE_TEST_PRICE_PATRIMOINE_ANNUAL_CAD` | KJORA Patrimoine, 619,90 CAD/an | configuration | Price actif validé |

Les six Price IDs doivent commencer par `price_`, être distincts et provenir
des trois produits KJORA exacts. Les produits `Kjemo Entretien`, `Essentiel`,
`Kjemo Croissance` et `Kjemo Protection` sont explicitement refusés.

## Variables qui restent indépendantes

- `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=false`
- `KJORA_WHATSAPP_PROVIDER=disabled`
- aucune clé Stripe Live;
- aucune variable Stripe préfixée `NEXT_PUBLIC_`;
- aucun changement Supabase ou migration.

## Fermeture après le test

Après le test supervisé, remettre au minimum :

```text
BILLING_PROVIDER_STRIPE_TEST_ENABLED=0
BILLING_KILL_SWITCH_STRIPE=1
BILLING_KILL_SWITCH_ALL=1
```

Le retrait ou la rotation des secrets Hostinger exige une autorisation séparée.

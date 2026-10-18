# KJORA — Matrice Test / Live du pilote payant

Toutes les valeurs secrètes sont saisies dans Hostinger, jamais dans Git, un rapport ou une conversation.

| Variable | Test | Live pilote | Défaut sûr |
|---|---:|---:|---:|
| `BILLING_PROVIDER_STRIPE_TEST_ENABLED` | `1` | `0` | `0` |
| `BILLING_PROVIDER_STRIPE_LIVE_ENABLED` | `0` | `1` | `0` |
| `KJORA_PAID_PILOT_ENABLED` | `0` | `1` | `0` |
| `KJORA_PAID_PILOT_INVITE_ONLY` | `1` | `1` | `1` |
| `BILLING_KILL_SWITCH_ALL` | `0` seulement pendant un test supervisé | `0` après tous les gates | `1` |
| `BILLING_KILL_SWITCH_STRIPE` | `0` seulement pendant un test supervisé | `0` après tous les gates | `1` |
| `BILLING_KILL_SWITCH_STRIPE_LIVE` | `1` | `0` après tous les gates | `1` |
| clé serveur | `STRIPE_SANDBOX_SECRET_KEY` (`sk_test_…`) | `STRIPE_LIVE_SECRET_KEY` (`sk_live_…`) | absente |
| clé publique | `STRIPE_TEST_PUBLISHABLE_KEY` (`pk_test_…`, optionnelle) | `STRIPE_LIVE_PUBLISHABLE_KEY` (`pk_live_…`, exigée) | absente |
| signature webhook | `STRIPE_SANDBOX_WEBHOOK_SECRET` | `STRIPE_LIVE_WEBHOOK_SECRET` | absente |
| prix | six `STRIPE_TEST_PRICE_*` | six `STRIPE_LIVE_PRICE_*` | absents |

Test et Live ne peuvent jamais être actifs simultanément : la configuration devient invalide et le Checkout répond indisponible. Une configuration Live partielle est également refusée.

Événements attendus : `charge.refunded`, `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.


# KJORA — First paid pilot launch readiness 14

## Scope and safety

This local-only lot prepares an invitation-only paid-pilot review. It does not
configure Stripe Live, send invitations, create Checkout sessions, or modify
Hostinger, DNS, Resend, WhatsApp, or remote Supabase.

## Invoice synchronization diagnosis

`invoice.paid` can carry the billing period on a subscription line instead of
top-level invoice fields. The prior route only read the latter, causing the
database contract to reject an otherwise verified event. The route now extracts
only valid Unix timestamps from the top-level period or subscription line. The
existing SQL RPC remains the authoritative fail-closed verifier for currency,
amount, period ordering, provider invoice reference, idempotency, and mode.

## Test → Live matrix

| Scenario | Local fixture | Stripe Test supervised | Live prerequisite |
| --- | --- | --- | --- |
| First subscription and duplicate webhook | Automated | Previously validated | Required before Live |
| Renewal, failed payment, recovery | Fixture coverage required | Execute | Required before Live |
| Monthly/annual switch and cancellation | Fixture coverage required | Execute | Required before Live |
| Refund and malformed event | Fixture coverage required | Execute | Required before Live |
| Test/Live mixing and unauthorized customer | Automated gate | Execute | Required before Live |

## Hostinger pilot configuration matrix

| Variable group | Class | Gate |
| --- | --- | --- |
| `KJORA_APP_ORIGIN` | public, mandatory | HTTPS `https://kjorapp.com` |
| `NEXT_PUBLIC_SUPABASE_*` | public, mandatory | project identity verified |
| `SUPABASE_SECRET_KEY` | server sensitive, mandatory | server-only |
| `STRIPE_LIVE_*` keys, webhook and six prices | Live/server sensitive, mandatory for Live | supervised gate only |
| `KJORA_PAID_PILOT_ENABLED`, invite-only and provider flag | kill-switch/mandatory | explicit enablement only |
| `BILLING_KILL_SWITCH_ALL`, Stripe Live switch | kill-switch/mandatory | remain closed outside a supervised window |
| Resend variables | server sensitive, optional | only for actual invitation delivery |

No value is documented here. The code and `.env.example` are the source of
truth for exact variable names.

## First-payment runbook and rollback

Before one supervised Stripe Test pass: confirm named pilot authorization,
same-origin checkout, webhook signature, resulting subscription and provider
invoice. For any anomaly: close global and Stripe Live kill switches, stop new
Checkouts, preserve events/invoices, identify affected organizations, and
perform any provider action manually. Never delete or alter payment history.

## Gates

Code review and isolated SQL replay remain mandatory. Stripe Live configuration,
first real payment, three pilots, and public launch are not authorized by this
document.

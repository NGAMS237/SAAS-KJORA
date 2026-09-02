# KJORA — Commercial & Billing Decisions v0.1

**Status:** VALIDATED PRODUCT DECISIONS — ready for canonical integration  
**Date:** 2026-09-02  
**Scope:** Commercial plans, quotas, SaaS billing, subscription lifecycle, product packaging, support, data retention, payment-provider strategy  
**Target canonical path:** `docs/product/KJORA-COMMERCIAL-BILLING-DECISIONS-v0.1.md`

> This document records product decisions explicitly validated during ALIGN-00. It is a product/business source of truth once integrated into the canonical KJORA repository. It does **not** by itself mean that the described billing, quota or provider features are implemented in Production.

---

## 1. Product plans and pricing

### 1.1 Canonical plan names

| Plan | Positioning |
|---|---|
| **Découverte** | Free plan to test and adopt KJORA on a small real portfolio |
| **Essentiel** | Small landlord / small portfolio |
| **Avancé** | Structured and growing portfolio |
| **Patrimoine** | Large portfolio / professional management needs |
| **Sur mesure** | Enterprise, agencies, groups and custom requirements |

### 1.2 Core quotas

Quotas are evaluated at the subscription / customer scope defined by the future Billing implementation. Server-side enforcement is mandatory; UI-only enforcement is insufficient.

| Plan | Active units | Properties | Organizations | Collaborators |
|---|---:|---:|---:|---:|
| **Découverte** | 3 | 1 | 1 | 0 |
| **Essentiel** | 10 | 3 | 1 | 1 |
| **Avancé** | 30 | 10 | 2 | 3 |
| **Patrimoine** | 100 | 30 | 5 | 10 |
| **Sur mesure** | >100 / custom | custom | custom | custom |

Rules:

- An **active unit** is the primary quota unit.
- Archived units do **not** consume the active-unit quota.
- Property and Organization quotas are independent limits and must also be respected.
- A user cannot bypass an active-unit limit by creating additional Properties.
- Additional Organizations or collaborators above plan quota require an upgrade; there is no separate seat or Organization add-on in the standard plans.
- Existing customer data is never deleted automatically because a quota is reached.

### 1.3 Monthly prices

Prices are fixed commercial prices per currency, not daily FX conversions.

| Plan | XAF / FCFA | CAD | EUR | USD |
|---|---:|---:|---:|---:|
| **Découverte** | 0 | 0 | 0 | 0 |
| **Essentiel** | 5,900 | 14.99 | 9.99 | 10.99 |
| **Avancé** | 12,900 | 31.99 | 19.99 | 21.99 |
| **Patrimoine** | 24,900 | 61.99 | 39.99 | 43.99 |
| **Sur mesure** | Quote | Quote | Quote | Quote |

### 1.4 Annual billing

Annual billing = **10 months billed for 12 months of access**.

Examples in XAF:

- Essentiel: **59,000 XAF/year**
- Avancé: **129,000 XAF/year**
- Patrimoine: **249,000 XAF/year**

The same `monthly price × 10` rule applies to other fixed billing currencies.

### 1.5 Price display and taxes

- Commercial prices should be presented as **tax-inclusive / final expected prices** where practical for the target customer.
- The invoice must detail base price, applicable tax(es), total, currency and billing period.
- The Billing engine must determine applicable taxes based on jurisdiction and customer status.
- The checkout must display the actual amount due before confirmation.
- Tax implementation requires jurisdiction-specific validation before Production activation.

---

## 2. Découverte and onboarding

### 2.1 Free-plan policy

Découverte is the permanent free entry plan and also serves as KJORA's practical trial.

- No card required.
- No checkout required.
- No separate 14-day or 30-day trial for paid plans.
- Découverte is assigned automatically when the first Organization is created.
- Target limit: 1 Property / 3 active Units / 1 Organization / no collaborator.

### 2.2 Target free onboarding

Target flow:

1. `Commencer gratuitement`
2. Account creation / passwordless sign-in
3. Email verification when required by current Auth flow
4. Organization creation
5. Automatic Découverte assignment
6. First Property creation
7. First Units creation
8. Owner dashboard

The site and app must distinguish clearly between **implemented state** and **target product state** until this flow is fully shipped.

### 2.3 Rent-receipt onboarding question

Keep the following onboarding question:

**Comment recevez-vous actuellement vos loyers ?**

- MTN MoMo sur mon numéro personnel
- Orange Money sur mon numéro personnel
- Compte marchand
- Virement bancaire
- Cash
- Plusieurs moyens

At launch this answer configures user preferences and prepares future payment automation; it must not imply an API connection that does not exist.

---

## 3. Quota behavior

### 3.1 Reaching a quota

When a plan quota is reached:

- deny the **new creation/activation** that would exceed the limit;
- enforce the denial on the server;
- show the relevant upgrade path;
- preserve all existing data and access allowed by the current subscription state;
- never auto-delete or auto-archive customer data to make a downgrade fit.

Example: on Découverte, the attempted creation/activation of a 4th active Unit triggers the Essentiel upgrade path.

### 3.2 Downgrade eligibility

A downgrade is allowed **only when the customer's current usage already fits the target plan quotas**.

Example: Avancé → Essentiel requires the customer to be at or below:

- 10 active Units;
- 3 Properties;
- 1 Organization;
- 1 collaborator.

If quotas do not fit, the downgrade must remain unavailable until the customer adjusts usage manually.

---

## 4. Feature packaging

### 4.1 Découverte — complete core

Découverte includes the essential operational core:

- Properties / Units
- Tenants / Leases
- Dues
- manual rent payment recording
- receipts / rent receipts / essential financial documents
- tenant portal
- basic notifications
- essential documents
- basic activity visibility

The free plan should be useful enough to prove KJORA's value; paid plans should not be differentiated by crippling the core product.

### 4.2 Contracts and electronic signatures

- Découverte: not included
- Essentiel: system contract templates + contract generation + electronic signature
- Avancé: customizable templates + advanced versioning
- Patrimoine: Avancé capabilities + multi-Organization scale
- Sur mesure: custom requirements

Commercial availability remains dependent on the actual Production status of Lot 6F.

### 4.3 Collaborators

- Découverte: Owner only
- Essentiel: 1 collaborator
- Avancé: 3 collaborators
- Patrimoine: 10 collaborators
- Sur mesure: custom

Exceeding collaborator quota requires a plan upgrade.

### 4.4 Audit

- Découverte / Essentiel: essential activity history
- Avancé: detailed audit + advanced filters
- Patrimoine: extended traceability / broader multi-Organization visibility
- Sur mesure: custom requirements

### 4.5 Notifications and automation

- Découverte: essential system notifications
- Essentiel: standard notification/reminder templates
- Avancé: advanced scheduled reminders, automation scenarios, configurable rules and message customization
- Patrimoine: extended multi-Organization automation/customization
- Sur mesure: custom

### 4.6 Reporting and exports

- Découverte: basic views + essential documents
- Essentiel: standard history + simple CSV/PDF exports
- Avancé: detailed exports, advanced filters, reconciliations and consolidated reports
- Patrimoine: multi-Organization consolidation
- Sur mesure: custom formats/integrations

### 4.7 Support

- Découverte: help resources + standard support
- Essentiel: standard support
- Avancé: priority support
- Patrimoine: reinforced priority support
- Sur mesure: dedicated support / accompaniment

### 4.8 Storage

No customer-facing storage quota is displayed at launch.

- Maintain reasonable technical backend limits.
- Monitor real usage and cost.
- Do **not** market storage as "unlimited".
- Future storage quotas/add-ons may be introduced if actual economics justify them.

### 4.9 Patrimoine positioning

Patrimoine keeps the same advanced functional core as Avancé and differentiates mainly through:

- larger quotas;
- 5 Organizations;
- 10 collaborators;
- broader multi-Organization reporting;
- extended audit;
- reinforced priority support.

Avoid artificial feature fragmentation solely to force upgrades.

### 4.10 Sur mesure / enterprise capabilities

Sur mesure may include:

- >100 Units and custom quotas
- custom Organization/collaborator limits
- dedicated support
- SLA
- public API / webhooks
- SSO (SAML/OIDC, Microsoft Entra ID, Google Workspace where applicable)
- white-label / custom branding where agreed
- custom integrations

API, public webhooks, SSO and white-label are reserved for Sur mesure in the standard commercial model.

---

## 5. Demo and commercial contact

### 5.1 Demo

The commercial demo is a **video or guided tour without an account**.

- No separate sandbox demo at launch.
- No shared demo account to maintain.
- Découverte is the real product trial.

### 5.2 Sur mesure contact

Use a dedicated commercial form with at least:

- name
- company
- email
- country
- number of Properties
- number of Units
- primary need

Phone can be optional.

---

## 6. SaaS subscription lifecycle

### 6.1 Renewal reminders

Before automatic renewal, notify at:

- J-7
- J-3
- J-1

If renewal succeeds, send a simple confirmation.

### 6.2 Payment-method expiry reminders

If the provider exposes expiry information, notify at:

- J-30
- J-7

### 6.3 Failed renewal and grace period

Grace period: **7 days**.

During grace:

- keep normal application access;
- show clear billing warnings;
- allow manual payment/update of payment method;
- automated retry schedule: J+1, J+3, J+6 after the initial failed attempt, where the payment method/provider allows legitimate retries.

At the end of J+7, if still unpaid, the customer account enters blocked state.

### 6.4 Blocked account

After the 7-day grace period:

- the owner/business application is blocked;
- the user may authenticate only to reach subscription/payment/support and necessary account/legal surfaces;
- no new rent payment can be recorded;
- no new business operation is created;
- no existing business data is deleted;
- only SaaS billing/block/recovery notifications continue.

### 6.5 Tenant portal during owner subscription block

The tenant portal remains available in **read-only mode**.

Tenants may:

- view existing information;
- view/download previously generated receipts, rent receipts and documents;
- inspect existing history.

They may not trigger new operations dependent on an active owner subscription.

### 6.6 Reactivation after long inactivity

If a blocked customer returns months later during the retention window:

- do not charge all inactive months retroactively;
- payment of a new subscription cycle reactivates the service;
- no reactivation fee.

---

## 7. Upgrade, downgrade and cancellation

### 7.1 Upgrade during a billing cycle

Upgrade is immediate after successful payment and uses **proration** for the remaining time in the current cycle.

The next renewal occurs normally at the new plan's full price.

### 7.2 Downgrade during a billing cycle

- scheduled for the end of the already-paid period;
- no prorated refund;
- allowed only if target-plan quotas are already satisfied.

### 7.3 Voluntary cancellation

- cancellation takes effect at the end of the already-paid period;
- full normal access continues until that date;
- no immediate deletion of data.

### 7.4 Voluntary account deletion

- explicit deletion request;
- 30-day safety/retraction period;
- user can cancel deletion during that period;
- final deletion occurs afterward subject to applicable legal retention requirements.

---

## 8. Data retention and export

### 8.1 Inactive / cancelled customer data

Default operational retention after block/cancellation: **12 months**.

Before final deletion, use warnings such as:

- J-30
- J-7
- J-1

### 8.2 Legal retention exception

The 12-month deletion rule must **not** blindly delete records subject to legal retention obligations.

Retention must be differentiated by:

- data/document type;
- jurisdiction;
- applicable accounting, contractual, tax and other legal requirements.

Operational data may follow the KJORA retention policy while accounting/contractual evidence may require longer retention.

A jurisdiction-specific legal retention matrix must be validated before destructive automation is enabled.

### 8.3 Customer export

Customers must be able to export their main data and documents:

- before the end of active access; and
- during the 12-month retention period where technically/legalistically possible.

Export is not a paid service and should not require support for ordinary cases.

---

## 9. Pricing changes

### 9.1 Annual subscriptions

Existing annual customers keep their current price until the next annual renewal. A clear advance notice is required before the new price applies.

### 9.2 Monthly subscriptions

A new monthly price applies after **30 days' advance notice**.

No price changes are applied retroactively to an already-paid period.

---

## 10. KJORA rent payments — Track and Collect direction

### 10.1 Launch decision

Do **not** block the functional app/site launch on Mobile Money provider integration.

At launch:

- use the existing manual rent-payment flow;
- preserve the real financial chain `Payment → Allocation → Ledger → Documents`;
- do not require tenants to declare payments manually as the primary mechanism;
- design provider integration points so future automation can connect without rebuilding the financial engine.

### 10.2 Future KJORA Track

Long-term goal: automate reconciliation when rent money goes directly to the landlord, where operator/provider capabilities allow it.

Possible future sources include:

- landlord merchant account webhooks;
- bank/provider transaction feeds;
- transaction imports and assisted reconciliation.

A standard personal MTN MoMo or Orange Money number must not be assumed to expose a webhook/API.

### 10.3 Future KJORA Collect

KJORA Collect is a future optional electronic rent-collection capability.

Commercial rule:

- available as an option across all plans, including Découverte where technically/commercially appropriate;
- no mandatory extra monthly subscription simply to enable Collect;
- monetized primarily with a commission per successful transaction;
- precise commission rates remain undecided until provider costs, settlement model, split/payout behavior and compliance are validated.

SaaS subscription billing and tenant rent collection are separate financial domains and must remain architecturally distinct.

---

## 11. SaaS Billing architecture and providers

### 11.1 Multi-provider architecture

KJORA Billing must use a provider abstraction rather than hardcoding one provider throughout the application.

Current direction:

- Canada / diaspora: **Stripe** as priority candidate;
- Cameroon / Africa: local/regional provider to be validated;
- provider selection remains open until sandbox, fees, webhooks, recurring-payment behavior, compliance and operational reliability are validated.

### 11.2 Payment methods

KJORA Billing should support:

- one primary payment method;
- one or more fallback methods where provider capabilities and customer authorization permit it;
- auditable payment attempts and retries.

### 11.3 Billing invoices

After every successful KJORA subscription payment:

- automatically generate a billing invoice PDF;
- make it available in `Abonnement / Facturation`;
- optionally email it when billing email delivery is enabled;
- include price, applicable taxes, total, currency, billing period and payment reference.

---

## 12. Security and implementation rules

These commercial decisions do not override KJORA's existing security architecture.

Implementation must preserve:

- multi-tenant Organization isolation;
- mandatory RLS;
- default deny;
- no `service_role` in browser;
- existing RBAC and TenantPortalAccess separation;
- server-side quota/entitlement enforcement;
- append-only/auditable financial behavior where applicable.

No commercial CTA or prototype is evidence that a backend capability exists. Development must verify the actual repo state before marking any CTA/function as `available`.

---

## 13. Relationship with HANDOFF-01

`KJORA-COMMERCIAL-APP-HANDOFF-v0.1.md` remains the current Commercial ↔ App handoff baseline.

This ALIGN-00 document resolves or supersedes the corresponding open commercial/product decisions in that handoff, especially around:

- plan names;
- quotas;
- prices;
- annual billing;
- grace/block/cancellation behavior;
- feature packaging;
- demo;
- Sur mesure contact;
- typography direction;
- Collect direction;
- provider architecture.

Development must still verify implementation-specific items marked `À VÉRIFIER DANS DEVELOPMENT` before coding or advertising them as live.

---

## 14. Typography / Horizon direction

- Keep **Inter / Inter Tight** across the site and application.
- Horizon Signature remains the visual direction.
- Do not impose Plus Jakarta Sans without a future explicit design decision.

---

## 15. Required next actions

### Commercial & UX workspace

1. Update HANDOFF-01 against these validated decisions.
2. Update pricing/plan comparison specifications.
3. Keep unsupported features clearly marked as not yet live.
4. Do not implement backend/billing from the Commercial workspace without an authorized lot.

### Development workspace

1. Finish and canonically record Lot 6F status before advertising contracts/signatures.
2. Integrate this decision document into the repo after review.
3. Split implementation into controlled lots, at minimum:
   - plan catalog / entitlements;
   - server-side quotas;
   - Découverte assignment + onboarding intent preservation;
   - subscription lifecycle / billing domain;
   - provider adapters;
   - SaaS invoice generation;
   - account blocking/read-only tenant behavior;
   - data export/retention policies.
4. Do not integrate a payment provider until explicitly authorized and validated.

---

## 16. Canonical status

**ALIGN-00: COMPLETE — PRODUCT DECISIONS VALIDATED**

This document is ready to be copied into the canonical KJORA repository and referenced by both Claude Commercial & UX and Claude Development.

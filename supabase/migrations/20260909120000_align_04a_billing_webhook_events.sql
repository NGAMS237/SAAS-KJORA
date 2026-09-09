begin;

-- =============================================================================
-- ALIGN-04A — Journal des événements provider (webhooks)
-- =============================================================================
-- Une seule table, dont la raison d'être est l'idempotence : un événement
-- provider reçu deux fois ne doit produire d'effet qu'une seule fois.
--
-- Ce que cette migration n'apporte PAS, volontairement :
--   • aucune activation de plan — l'activation reste soumise aux RPC ALIGN-03 ;
--   • aucun secret provider ;
--   • aucun lien vers le domaine loyer (payments, dues, ledger_entries,
--     financial_documents), l'étanchéité d'ALIGN-03 restant intacte.
-- =============================================================================

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),

  provider text not null
    constraint billing_webhook_events_provider_check
    check (provider in ('stripe','campay','flutterwave','payunit','elyonpay','notchpay')),

  -- Identifiant de l'événement CHEZ le provider. C'est lui qui porte
  -- l'idempotence : l'unicité est une contrainte de base, pas une politesse
  -- applicative, donc un rejeu concurrent échoue au lieu de doubler.
  provider_event_id text not null,

  event_type text not null,

  -- Mode d'exécution. Un événement sandbox ne peut pas prétendre à un effet
  -- de production : la colonne le rend vérifiable après coup.
  mode text not null default 'sandbox'
    constraint billing_webhook_events_mode_check check (mode in ('sandbox','live')),

  organization_id uuid references public.organizations (id) on delete set null,

  -- Décision prise par KJORA, pas par le provider.
  disposition text not null
    constraint billing_webhook_events_disposition_check
    check (disposition in ('ignore_duplicate','acknowledge_unhandled','reject','apply')),
  disposition_reason text,

  -- Empreinte du corps brut. On conserve de quoi prouver qu'on a bien reçu
  -- ce qu'on a traité, sans conserver la charge utile complète, qui peut
  -- contenir des données du porteur.
  payload_digest text not null,

  signature_verified boolean not null default false,

  received_at timestamptz not null default now(),
  processed_at timestamptz,

  constraint billing_webhook_events_unique_event unique (provider, provider_event_id)
);

create index if not exists billing_webhook_events_org_idx
  on public.billing_webhook_events (organization_id, received_at desc)
  where organization_id is not null;

create index if not exists billing_webhook_events_received_idx
  on public.billing_webhook_events (received_at desc);

-- -----------------------------------------------------------------------------
-- RLS — aucun accès client, ni lecture ni écriture
-- -----------------------------------------------------------------------------
-- Ce journal est une donnée d'infrastructure. Aucune policy n'est créée :
-- avec RLS activée et zéro policy, ni `anon` ni `authenticated` ne voient
-- quoi que ce soit. Seul le rôle de service, côté serveur, y accède.

alter table public.billing_webhook_events enable row level security;

revoke all on public.billing_webhook_events from anon, authenticated;

comment on table public.billing_webhook_events is
  'ALIGN-04A — journal des webhooks provider. Unicité (provider, provider_event_id) '
  'garantissant l''idempotence. Aucun accès client. Aucun secret stocké.';

commit;

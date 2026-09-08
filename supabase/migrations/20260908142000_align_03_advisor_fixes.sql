begin;

-- =============================================================================
-- ALIGN-03 — Correctifs Advisors
-- =============================================================================
-- Les Advisors performance signalent deux clés étrangères sans index couvrant,
-- introduites par la migration ALIGN-03. Même précédent que
-- align_01_advisor_fixes et align_02_advisor_fixes.
-- Aucun changement fonctionnel, aucune donnée touchée.
-- =============================================================================

create index if not exists billing_events_actor_idx
  on public.billing_events (actor_user_id)
  where actor_user_id is not null;

create index if not exists billing_payment_attempts_invoice_idx
  on public.billing_payment_attempts (invoice_id)
  where invoice_id is not null;

commit;

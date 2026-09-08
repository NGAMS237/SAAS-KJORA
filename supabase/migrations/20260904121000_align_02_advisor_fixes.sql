begin;

-- =============================================================================
-- ALIGN-02 — Correctifs Advisors
-- =============================================================================
-- Les Advisors performance signalent deux clés étrangères sans index couvrant
-- sur public.onboarding_states, introduites par la migration ALIGN-02.
-- Ces index partiels suivent le précédent align_01_advisor_fixes / lot_6c3_advisor_indexes.
-- Aucun changement fonctionnel, aucune donnée touchée.
-- =============================================================================

create index if not exists onboarding_states_first_property_idx
  on public.onboarding_states (first_property_id)
  where first_property_id is not null;

create index if not exists onboarding_states_first_unit_idx
  on public.onboarding_states (first_unit_id)
  where first_unit_id is not null;

commit;

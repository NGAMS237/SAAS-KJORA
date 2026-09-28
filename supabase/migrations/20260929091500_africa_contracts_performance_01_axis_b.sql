-- =============================================================================
-- AFRICA-CONTRACTS-PERFORMANCE-01 — AXE B
-- =============================================================================
-- Bug constaté et vérifié (voir rapport du lot) : la clause « Modalités de
-- paiement » d'un contrat généré disparaît TOUJOURS, quelle que soit la
-- Location. La cause n'est pas un bug d'affichage mais une donnée jamais
-- câblée : `public.generate_lease_contract` (Lot 6F, patché par
-- PATCH-6F-UX) filtre la section avec `section->>'condition' =
-- 'payment_terms_present' and false` — un filtre inconditionnellement faux —
-- et remplit le jeton `{{lease.payment_terms}}` avec une chaîne vide
-- littérale (`'payment_terms','')`. Il n'existe alors aucune colonne
-- `leases.payment_terms` : la fonctionnalité a été dessinée dans le modèle
-- de contrat (jeton, condition) mais jamais reliée à une source de données
-- réelle.
--
-- Conformément au mandat (« Modalités de paiement » : afficher les
-- conditions réellement enregistrées, ou signaler clairement leur absence et
-- laisser l'utilisateur compléter — ne jamais fabriquer de valeur par
-- défaut), ce correctif :
--   1. ajoute une vraie colonne `leases.payment_terms` (texte libre,
--      optionnelle, 3 à 1000 caractères si renseignée) ;
--   2. l'ouvre en écriture à `authenticated` (mêmes grants par colonne que
--      le reste de `leases`) ;
--   3. relie `generate_lease_contract` à cette colonne réelle : la clause
--      n'apparaît que si un texte a réellement été saisi, et le jeton reflète
--      ce texte — jamais un texte inventé.
-- Le complément (champ de saisie côté formulaire Location, message
-- d'avertissement côté parcours contrat quand l'information manque) est
-- livré dans le code applicatif de ce même lot.
-- =============================================================================

begin;

alter table public.leases add column if not exists payment_terms text
  check (payment_terms is null or char_length(trim(payment_terms)) between 3 and 1000);

comment on column public.leases.payment_terms is
  'AFRICA-CONTRACTS-PERFORMANCE-01 — texte libre optionnel décrivant les modalités de paiement convenues (méthode acceptée, référence de virement, etc.). Alimente {{lease.payment_terms}} dans les contrats ; absent, la clause correspondante est omise plutôt que fabriquée.';

grant insert (payment_terms) on table public.leases to authenticated;
grant update (payment_terms) on table public.leases to authenticated;

-- Même signature que la version Lot 6F / PATCH-6F-UX : `create or replace`
-- la remplace bel et bien (pas de nouvelle surcharge). Seules les deux
-- lignes annotées ci-dessous changent par rapport à la version précédente.
create or replace function public.generate_lease_contract(target_lease_id uuid, target_template_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_lease public.leases%rowtype; selected_template public.contract_templates%rowtype;
  selected_profile public.organization_profiles%rowtype; selected_tenant public.tenants%rowtype;
  selected_property public.properties%rowtype; selected_unit public.units%rowtype; selected_settings public.organization_contract_settings%rowtype;
  new_id uuid; filtered_sections jsonb;
begin
  select * into selected_lease from public.leases where id = target_lease_id;
  if selected_lease.id is null or not (select private.has_capability(selected_lease.organization_id,'contract.manage')) then
    raise exception 'not_found' using errcode = '42501';
  end if;
  -- ALIGN-01 plan feature gate (contracts = Essentiel+)
  if not (select public.org_has_feature(selected_lease.organization_id,'contracts')) then
    raise exception 'PLAN_FEATURE_NOT_AVAILABLE' using errcode='42501',
      detail=format('{"code":"PLAN_FEATURE_NOT_AVAILABLE","feature":"contracts"}');
  end if;
  select * into selected_template from public.contract_templates where id = target_template_id and status = 'active'
    and (is_system or organization_id = selected_lease.organization_id);
  if selected_template.id is null then raise exception 'invalid_template' using errcode = '22023'; end if;
  select * into selected_profile from public.organization_profiles where organization_id = selected_lease.organization_id;
  select * into selected_tenant from public.tenants where organization_id = selected_lease.organization_id and id = selected_lease.tenant_id;
  select * into selected_property from public.properties where organization_id = selected_lease.organization_id and id = selected_lease.property_id;
  select * into selected_unit from public.units where organization_id = selected_lease.organization_id and id = selected_lease.unit_id;
  select * into selected_settings from public.organization_contract_settings where organization_id = selected_lease.organization_id;
  select coalesce(jsonb_agg(section order by ordinality), '[]'::jsonb) into filtered_sections
    from jsonb_array_elements(selected_template.sections) with ordinality as item(section, ordinality)
    where section->>'condition' = 'always'
      or (section->>'condition' = 'deposit_positive' and selected_lease.security_deposit_xaf > 0)
      or (section->>'condition' = 'charges_positive' and selected_lease.recurring_charges_xaf > 0)
      or (section->>'condition' = 'initial_payment_positive' and selected_lease.initial_prepayment_amount_xaf > 0)
      or (section->>'condition' = 'end_date_present' and selected_lease.end_date is not null)
      -- AFRICA-CONTRACTS-PERFORMANCE-01 — AXE B : la clause n'est plus
      -- inconditionnellement exclue. Elle apparaît uniquement si des
      -- modalités ont réellement été saisies sur la Location.
      or (section->>'condition' = 'payment_terms_present' and coalesce(trim(selected_lease.payment_terms), '') <> '');
  insert into public.lease_contracts (
    organization_id,lease_id,tenant_id,template_id,template_version,language,reference,
    template_snapshot,data_snapshot,content_snapshot,stamp_snapshot,created_by
  ) values (
    selected_lease.organization_id,selected_lease.id,selected_lease.tenant_id,selected_template.id,
    selected_template.version,selected_template.language,(select private.contract_reference(selected_lease.organization_id)),
    jsonb_build_object('id',selected_template.id,'familyKey',selected_template.family_key,'name',selected_template.name,'version',selected_template.version,'language',selected_template.language),
    jsonb_build_object(
      'organization',jsonb_build_object('id',selected_lease.organization_id,'name',selected_profile.name,'currency',selected_profile.currency_code,'country',selected_profile.country_code),
      'lessor',jsonb_build_object('displayName',coalesce(selected_settings.stamp_company,selected_profile.name),'phone',selected_settings.stamp_phone,'address',selected_settings.stamp_short_address),
      'tenant',jsonb_build_object('id',selected_tenant.id,'name',selected_tenant.full_name,'email',selected_tenant.email,'phone',selected_tenant.phone),
      'property',jsonb_build_object('id',selected_property.id,'name',selected_property.name,'locality',selected_property.locality,'type',selected_property.type),
      'unit',jsonb_build_object('id',selected_unit.id,'label',selected_unit.label,'type',selected_unit.type),
      'lease',jsonb_build_object('id',selected_lease.id,'status',selected_lease.status,'start_date',selected_lease.start_date,
        'end_date',selected_lease.end_date,'end_date_sentence',case when selected_lease.end_date is null then '' else
          case when selected_template.language='fr' then ' et se termine le ' else ' and ends on ' end || selected_lease.end_date::text end,
        'base_rent',selected_lease.base_rent_xaf,'charges',selected_lease.recurring_charges_xaf,'deposit',selected_lease.security_deposit_xaf,
        -- AFRICA-CONTRACTS-PERFORMANCE-01 — AXE B : jeton alimenté par la
        -- vraie colonne (jamais une valeur inventée) ; vide si non renseignée.
        'initial_payment',selected_lease.initial_prepayment_amount_xaf,'frequency',selected_lease.billing_frequency,'due_day',selected_lease.due_day,'payment_terms',coalesce(selected_lease.payment_terms,''))
    ), filtered_sections,
    case when selected_settings.organization_id is null then '{}'::jsonb else jsonb_build_object(
      'enabled',selected_settings.stamp_enabled,'name',selected_settings.stamp_name,'company',selected_settings.stamp_company,
      'phone',selected_settings.stamp_phone,'address',selected_settings.stamp_short_address,'position',selected_settings.stamp_position) end,
    (select auth.uid())
  ) returning id into new_id;
  perform private.write_contract_audit(new_id,'contract.generated',jsonb_build_object('lease_id',selected_lease.id,'template_id',selected_template.id,'template_version',selected_template.version));
  return new_id;
exception when unique_violation then raise exception 'contract_already_exists' using errcode = '23505';
end; $$;

commit;

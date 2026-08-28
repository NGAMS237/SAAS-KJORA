-- Advisor hardening: cover every nullable/user and tenant-scoped foreign key
-- introduced by Lot 6C3. No row or behavior changes.

create index financial_documents_created_by_idx
  on public.financial_documents (created_by);
create index financial_documents_invalidated_by_idx
  on public.financial_documents (invalidated_by);

create index message_deliveries_requested_by_idx
  on public.message_deliveries (requested_by);
create index message_deliveries_tenant_idx
  on public.message_deliveries (organization_id, tenant_id);

create index notifications_document_idx
  on public.notifications (organization_id, document_id);
create index notifications_lease_idx
  on public.notifications (organization_id, lease_id);
create index notifications_tenant_idx
  on public.notifications (organization_id, tenant_id);

create index organization_communication_settings_updated_by_idx
  on public.organization_communication_settings (updated_by);

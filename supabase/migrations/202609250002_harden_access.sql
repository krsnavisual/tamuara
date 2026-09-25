-- Narrow client reads to the fields the editor needs. Token material and
-- provider/audit records are read only by vetted server handlers.
begin;

-- A paid order must belong to the invitation owner recorded on that order.
alter table public.invitations
  add constraint invitations_id_owner_unique unique (id, owner_id);
alter table public.orders
  add constraint orders_invitation_owner_fk
  foreign key (invitation_id, owner_id)
  references public.invitations (id, owner_id);

-- A published invitation always has a publication snapshot to render.
alter table public.invitations
  add constraint invitations_published_has_snapshot
  check (status <> 'published' or active_publication_id is not null);

revoke select on public.invitation_drafts, public.guests,
  public.payment_events, public.audit_logs from authenticated;

grant select (invitation_id, content, theme_id, schema_version, revision,
  updated_by, updated_at) on public.invitation_drafts to authenticated;
grant select (id, invitation_id, display_name, group_name, quota,
  marked_sent, created_at) on public.guests to authenticated;

-- RLS remains active on every table, including tables with no client grant.
commit;

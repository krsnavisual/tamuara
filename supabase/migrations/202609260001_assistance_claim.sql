-- An authenticated platform admin can see unassigned assisted requests and
-- claim one through the document's compare-and-swap version. No invitation
-- content, brief, or payment detail is returned by the queue.
begin;

create function public.list_assistance_queue()
returns table(invitation_id uuid, document_version integer, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor_id and p.role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  return query
  select d.invitation_id, d.version, d.updated_at
    from public.invitation_documents d
    join public.invitations i on i.id = d.invitation_id
    join public.entitlements e on e.invitation_id = i.id
    join public.orders o on o.id = e.order_id and o.invitation_id = i.id
    where d.state #>> '{service,status}' = 'submitted'
      and d.state ->> 'assignedAdminId' is null
      and e.expires_at > now()
      and o.status = 'paid'
      and o.plan_id = 'assisted'
      and o.owner_id = i.owner_id
    order by d.updated_at, d.invitation_id;
end;
$$;

create function public.claim_assistance(
  p_invitation_id uuid,
  p_expected_version integer
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_version integer;
  v_state jsonb;
  v_service_status text;
  v_assigned_admin_id text;
  v_entitlement_expires_at timestamptz;
  v_order_status text;
  v_plan_id text;
  v_order_owner_id uuid;
  v_invitation_owner_id uuid;
  v_next_version integer;
begin
  if v_actor_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor_id and p.role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_invitation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'INVALID_ASSISTANCE_CLAIM' using errcode = '22023';
  end if;

  -- Lock every record that determines eligibility. Competing claims serialize
  -- on the document row, then re-read its assignment and version.
  select d.version, d.state, d.state #>> '{service,status}',
         d.state ->> 'assignedAdminId', e.expires_at,
         o.status, o.plan_id, o.owner_id, i.owner_id
    into v_version, v_state, v_service_status, v_assigned_admin_id,
         v_entitlement_expires_at, v_order_status, v_plan_id,
         v_order_owner_id, v_invitation_owner_id
    from public.invitation_documents d
    join public.invitations i on i.id = d.invitation_id
    join public.entitlements e on e.invitation_id = i.id
    join public.orders o on o.id = e.order_id and o.invitation_id = i.id
    where d.invitation_id = p_invitation_id
    for update of d, i, e, o;

  if not found then
    raise exception 'ASSISTANCE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v_version <> p_expected_version then
    raise exception 'INVITATION_VERSION_CONFLICT' using errcode = 'P0001';
  end if;
  if v_service_status is distinct from 'submitted'
     or v_assigned_admin_id is not null
     or v_entitlement_expires_at <= now()
     or v_order_status is distinct from 'paid'
     or v_plan_id is distinct from 'assisted'
     or v_order_owner_id is distinct from v_invitation_owner_id then
    raise exception 'ASSISTANCE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_next_version := v_version + 1;
  update public.invitation_documents
    set state = jsonb_set(v_state, '{assignedAdminId}', to_jsonb(v_actor_id::text), true),
        version = v_next_version,
        updated_at = now()
    where invitation_id = p_invitation_id;
  update public.invitations set updated_at = now() where id = p_invitation_id;

  -- A stale membership cannot keep an unrelated admin's read access.
  delete from public.invitation_members
    where invitation_id = p_invitation_id and role = 'assigned_admin'
      and user_id <> v_actor_id;
  insert into public.invitation_members(invitation_id, user_id, role)
    values (p_invitation_id, v_actor_id, 'assigned_admin')
    on conflict (invitation_id, user_id)
    do update set role = 'assigned_admin';

  insert into public.audit_logs(invitation_id, actor_id, action, metadata)
    values (p_invitation_id, v_actor_id, 'assistance.claimed',
      jsonb_build_object('documentVersion', v_next_version));
  return v_next_version;
end;
$$;

revoke all on function public.list_assistance_queue() from public, anon, authenticated, service_role;
revoke all on function public.claim_assistance(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_assistance_queue() to authenticated;
grant execute on function public.claim_assistance(uuid, integer) to authenticated;

commit;

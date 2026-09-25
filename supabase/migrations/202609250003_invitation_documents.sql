-- Transitional persistence for the existing invitation domain model.
-- Each document belongs to one invitation; all mutations use the CAS RPC.
begin;

create table public.invitation_documents (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  version integer not null check (version > 0),
  preview_token_hash text generated always as (state ->> 'previewTokenHash') stored not null unique
    check (preview_token_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.invitation_documents enable row level security;
revoke all on public.invitation_documents from public, anon, authenticated;
grant all on public.invitation_documents to service_role;

create function public.commit_invitation_document(
  p_invitation_id uuid,
  p_expected_version integer,
  p_state jsonb,
  p_actor_id uuid default null,
  p_action text default null
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_admin_id uuid;
  v_admin_role text;
  v_slug text;
  v_status text;
  v_expires_at timestamptz;
  v_entitlement_expires_at timestamptz;
  v_existing_version integer;
  v_existing_state jsonb;
  v_existing_status text;
  v_active_publication_id uuid;
  v_next_publication_id uuid;
  v_publication jsonb;
  v_action text;
begin
  if p_expected_version is null or p_expected_version < 0
     or p_state is null or jsonb_typeof(p_state) <> 'object'
     or p_state ->> 'id' is distinct from p_invitation_id::text then
    raise exception 'INVALID_INVITATION_DOCUMENT' using errcode = '22023';
  end if;

  v_owner_id := (p_state ->> 'ownerId')::uuid;
  v_slug := p_state ->> 'slug';
  v_status := p_state ->> 'status';
  v_expires_at := nullif(p_state ->> 'expiresAt', '')::timestamptz;
  v_admin_id := nullif(p_state ->> 'assignedAdminId', '')::uuid;
  v_action := coalesce(nullif(p_action, ''), 'invitation.commit');

  if v_owner_id is null or v_slug is null or v_status is null
     or v_status not in ('draft', 'published', 'archived')
     or char_length(v_action) > 80
     or v_action !~ '^[a-z][a-z0-9_.-]*$' then
    raise exception 'INVALID_INVITATION_DOCUMENT' using errcode = '22023';
  end if;

  if v_admin_id is not null then
    select role into v_admin_role from public.profiles where id = v_admin_id;
    if v_admin_role is distinct from 'admin' then
      raise exception 'INVALID_ASSIGNED_ADMIN' using errcode = '22023';
    end if;
  end if;

  if p_expected_version = 0 then
    if v_status <> 'draft' then
      raise exception 'NEW_INVITATION_MUST_BE_DRAFT' using errcode = '22023';
    end if;
    if p_actor_id is not null and p_actor_id <> v_owner_id then
      raise exception 'INVALID_AUDIT_ACTOR' using errcode = '22023';
    end if;
    insert into public.invitations(id, owner_id, slug, status, expires_at)
      values (p_invitation_id, v_owner_id, v_slug, v_status, v_expires_at)
      on conflict (id) do nothing;
    if not found then
      raise exception 'INVITATION_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    insert into public.invitation_documents(invitation_id, state, version)
      values (p_invitation_id, p_state, 1);

    if v_admin_id is not null then
      insert into public.invitation_members(invitation_id, user_id, role)
        values (p_invitation_id, v_admin_id, 'assigned_admin');
    end if;
    insert into public.audit_logs(invitation_id, actor_id, action, metadata)
      values (p_invitation_id, p_actor_id, v_action, jsonb_build_object('documentVersion', 1));
    if coalesce(p_state #> '{content,gifts}', '[]'::jsonb) <> '[]'::jsonb then
      insert into public.audit_logs(invitation_id, actor_id, action, metadata)
        values (p_invitation_id, p_actor_id, 'gift_details.changed', jsonb_build_object('documentVersion', 1));
    end if;
    return 1;
  end if;

  select d.version, d.state, i.status, i.active_publication_id
    into v_existing_version, v_existing_state, v_existing_status, v_active_publication_id
    from public.invitation_documents d
    join public.invitations i on i.id = d.invitation_id
    where d.invitation_id = p_invitation_id and i.owner_id = v_owner_id
    for update of d, i;
  if not found or v_existing_version <> p_expected_version then
    raise exception 'INVITATION_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  if p_actor_id is not null and p_actor_id <> v_owner_id and not exists (
    select 1 from public.invitation_members
      where invitation_id = p_invitation_id and user_id = p_actor_id
        and role = 'assigned_admin'
  ) then
    raise exception 'INVALID_AUDIT_ACTOR' using errcode = '22023';
  end if;

  if v_slug <> (select slug from public.invitations where id = p_invitation_id)
     and exists (select 1 from public.invitation_publications where invitation_id = p_invitation_id) then
    raise exception 'PUBLISHED_INVITATION_SLUG_LOCKED' using errcode = '22023';
  end if;

  v_next_publication_id := null;
  if v_status = 'published' then
    v_publication := p_state -> 'published';
    if jsonb_typeof(v_publication) is distinct from 'object'
       or jsonb_typeof(v_publication -> 'content') is distinct from 'object'
       or (v_publication ->> 'theme') is null
       or (v_publication ->> 'revision') is null then
      raise exception 'PUBLISHED_SNAPSHOT_REQUIRED' using errcode = '22023';
    end if;

    if v_existing_status <> 'published' or v_active_publication_id is null
       or v_publication is distinct from v_existing_state -> 'published' then
      v_entitlement_expires_at := nullif(p_state #>> '{entitlement,expiresAt}', '')::timestamptz;
      if v_entitlement_expires_at is null or v_entitlement_expires_at <= now() then
        raise exception 'ACTIVE_ENTITLEMENT_REQUIRED' using errcode = '22023';
      end if;
      insert into public.invitation_publications(
        invitation_id, content, theme_id, draft_revision, approved_by, published_at
      ) values (
        p_invitation_id,
        v_publication -> 'content',
        v_publication ->> 'theme',
        (v_publication ->> 'revision')::integer,
        v_owner_id,
        coalesce(nullif(v_publication ->> 'publishedAt', '')::timestamptz, now())
      ) returning id into v_next_publication_id;
    else
      v_next_publication_id := v_active_publication_id;
    end if;
  end if;

  update public.invitations
    set slug = v_slug,
        status = v_status,
        active_publication_id = v_next_publication_id,
        expires_at = v_expires_at,
        updated_at = now()
    where id = p_invitation_id;

  update public.invitation_documents
    set state = p_state, version = v_existing_version + 1, updated_at = now()
    where invitation_id = p_invitation_id;

  delete from public.invitation_members
    where invitation_id = p_invitation_id and role = 'assigned_admin'
      and (v_admin_id is null or user_id <> v_admin_id);
  if v_admin_id is not null then
    insert into public.invitation_members(invitation_id, user_id, role)
      values (p_invitation_id, v_admin_id, 'assigned_admin')
      on conflict (invitation_id, user_id)
      do update set role = 'assigned_admin';
  end if;

  insert into public.audit_logs(invitation_id, actor_id, action, metadata)
    values (p_invitation_id, p_actor_id, v_action,
      jsonb_build_object('documentVersion', v_existing_version + 1));
  if coalesce(v_existing_state #> '{content,gifts}', '[]'::jsonb)
     is distinct from coalesce(p_state #> '{content,gifts}', '[]'::jsonb) then
    insert into public.audit_logs(invitation_id, actor_id, action, metadata)
      values (p_invitation_id, p_actor_id, 'gift_details.changed',
        jsonb_build_object('documentVersion', v_existing_version + 1));
  end if;

  return v_existing_version + 1;
end;
$$;

revoke all on function public.commit_invitation_document(uuid, integer, jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.commit_invitation_document(uuid, integer, jsonb, uuid, text)
  to service_role;

commit;

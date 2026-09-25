begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(29);

insert into auth.users(id, email) values
  ('11000000-0000-4000-8000-000000000001', 'document-owner@test.tamuara.local'),
  ('11000000-0000-4000-8000-000000000002', 'document-admin@test.tamuara.local');
update public.profiles set role = 'admin'
  where id = '11000000-0000-4000-8000-000000000002';

create function pg_temp.stale_write_rejected() returns boolean
language plpgsql as $$
begin
  perform public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 1,
    (select state from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  );
  return false;
exception when raise_exception then
  return sqlerrm = 'INVITATION_VERSION_CONFLICT';
end;
$$;
create function pg_temp.slug_change_rejected() returns boolean
language plpgsql as $$
begin
  perform public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 6,
    (select state || jsonb_build_object('slug', 'changed-after-publish')
      from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  );
  return false;
exception when invalid_parameter_value then
  return sqlerrm = 'PUBLISHED_INVITATION_SLUG_LOCKED';
end;
$$;
create function pg_temp.nonadmin_assignment_rejected() returns boolean
language plpgsql as $$
begin
  perform public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 6,
    (select state || jsonb_build_object('assignedAdminId', '11000000-0000-4000-8000-000000000001')
      from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  );
  return false;
exception when invalid_parameter_value then
  return sqlerrm = 'INVALID_ASSIGNED_ADMIN';
end;
$$;
create function pg_temp.missing_entitlement_rejected() returns boolean
language plpgsql as $$
begin
  perform public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 2,
    (select state || jsonb_build_object(
      'status', 'published',
      'published', jsonb_build_object(
        'content', jsonb_build_object('opening', 'Hello'),
        'theme', 'classic', 'revision', 2, 'publishedAt', now()::text
      )
    ) from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  );
  return false;
exception when invalid_parameter_value then
  return sqlerrm = 'ACTIVE_ENTITLEMENT_REQUIRED';
end;
$$;

select extensions.ok(not has_table_privilege('authenticated', 'public.invitation_documents', 'SELECT'), 'document state is server-only');
select extensions.ok(not has_function_privilege('authenticated', 'public.commit_invitation_document(uuid,integer,jsonb,uuid,text)', 'EXECUTE'), 'browser cannot call document commit');

set local role service_role;

select extensions.is(
  public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 0,
    jsonb_build_object(
      'id', '21000000-0000-4000-8000-000000000001',
      'ownerId', '11000000-0000-4000-8000-000000000001',
      'slug', 'document-a', 'status', 'draft', 'version', 1,
      'content', jsonb_build_object('gifts', jsonb_build_array()),
      'previewTokenHash', repeat('a', 64)
    )
  ), 1, 'initial commit creates invitation and document atomically'
);
select extensions.is((select count(*)::integer from public.invitations where slug = 'document-a'), 1, 'invitation metadata created');
select extensions.is((select count(*)::integer from public.invitation_documents where preview_token_hash = repeat('a', 64)), 1, 'preview hash is indexed from document');
select extensions.is((select count(*)::integer from public.audit_logs where invitation_id = '21000000-0000-4000-8000-000000000001' and action = 'invitation.commit'), 1, 'initial commit is audited');

select extensions.is(
  public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 1,
    (select state || jsonb_build_object(
      'slug', 'document-b',
      'previewTokenHash', repeat('b', 64),
      'content', jsonb_build_object('gifts', jsonb_build_array(jsonb_build_object('number', '1234567890'))),
      'assignedAdminId', '11000000-0000-4000-8000-000000000002'
    ) from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  ), 2, 'matching version updates draft'
);
select extensions.is((select slug from public.invitations where id = '21000000-0000-4000-8000-000000000001'), 'document-b', 'slug metadata follows document');
select extensions.is((select count(*)::integer from public.invitation_members where invitation_id = '21000000-0000-4000-8000-000000000001' and role = 'assigned_admin'), 1, 'assigned admin membership is synchronized');
select extensions.is((select count(*)::integer from public.invitation_documents where preview_token_hash = repeat('b', 64)), 1, 'preview token rotation updates lookup');
select extensions.is((select count(*)::integer from public.audit_logs where invitation_id = '21000000-0000-4000-8000-000000000001' and action = 'gift_details.changed'), 1, 'gift change receives separate audit event');
select extensions.ok((select bool_and(metadata::text not like '%1234567890%') from public.audit_logs where invitation_id = '21000000-0000-4000-8000-000000000001'), 'audit metadata excludes bank account number');

select extensions.ok(pg_temp.stale_write_rejected(), 'stale document update is rejected');
select extensions.is((select count(*)::integer from public.audit_logs where invitation_id = '21000000-0000-4000-8000-000000000001'), 3, 'rejected commit does not write audit');
select extensions.ok(pg_temp.missing_entitlement_rejected(), 'publication without active entitlement is rejected');

select extensions.is(
  public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 2,
    (select state || jsonb_build_object(
      'status', 'published',
      'published', jsonb_build_object(
        'content', jsonb_build_object('opening', 'Hello'),
        'theme', 'classic', 'revision', 2, 'publishedAt', now()::text
      ),
      'entitlement', jsonb_build_object('expiresAt', (now() + interval '1 year')::text)
    ) from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  ), 3, 'publishing commits new document version'
);
select extensions.ok((select active_publication_id is not null from public.invitations where id = '21000000-0000-4000-8000-000000000001'), 'published metadata points to snapshot');
select extensions.is((select count(*)::integer from public.invitation_publications where invitation_id = '21000000-0000-4000-8000-000000000001'), 1, 'first publication is immutable row');

select extensions.is(
  public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 3,
    (select state || jsonb_build_object('guestCount', 1)
      from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001'),
    null, 'public.rsvp'
  ), 4, 'unrelated document mutation uses CAS'
);
select extensions.is((select count(*)::integer from public.invitation_publications where invitation_id = '21000000-0000-4000-8000-000000000001'), 1, 'unrelated mutation does not duplicate publication');
select extensions.is((select count(*)::integer from public.audit_logs where invitation_id = '21000000-0000-4000-8000-000000000001' and action = 'public.rsvp'), 1, 'guest mutation writes server-supplied action');

select extensions.is(
  public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 4,
    (select (state || jsonb_build_object('status', 'draft')) - 'assignedAdminId'
      from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  ), 5, 'unpublish retains document history'
);
select extensions.ok((select active_publication_id is null from public.invitations where id = '21000000-0000-4000-8000-000000000001'), 'unpublish removes active snapshot pointer');
select extensions.is((select count(*)::integer from public.invitation_members where invitation_id = '21000000-0000-4000-8000-000000000001' and role = 'assigned_admin'), 0, 'removed admin loses membership');

select extensions.is(
  public.commit_invitation_document(
    '21000000-0000-4000-8000-000000000001', 5,
    (select state || jsonb_build_object('status', 'published')
      from public.invitation_documents
      where invitation_id = '21000000-0000-4000-8000-000000000001')
  ), 6, 'republishing uses the retained snapshot content'
);
select extensions.is((select count(*)::integer from public.invitation_publications where invitation_id = '21000000-0000-4000-8000-000000000001'), 2, 'republish creates new immutable publication');
select extensions.ok(pg_temp.slug_change_rejected(), 'slug is locked after first publication');
select extensions.ok(pg_temp.nonadmin_assignment_rejected(), 'owner profile cannot be assigned as platform admin');

set local role authenticated;
set local request.jwt.claim.sub = '11000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.invitations), 0, 'removed admin loses invitation read access');

select * from extensions.finish();
rollback;

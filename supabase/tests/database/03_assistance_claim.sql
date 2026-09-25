begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(41);

insert into auth.users(id, email) values
  ('31000000-0000-4000-8000-000000000001', 'claim-owner@test.tamuara.local'),
  ('31000000-0000-4000-8000-000000000002', 'claim-admin-a@test.tamuara.local'),
  ('31000000-0000-4000-8000-000000000003', 'claim-admin-b@test.tamuara.local'),
  ('31000000-0000-4000-8000-000000000004', 'claim-other@test.tamuara.local');
update public.profiles set role = 'admin'
  where id in ('31000000-0000-4000-8000-000000000002',
               '31000000-0000-4000-8000-000000000003');

insert into public.invitations(id, owner_id, slug)
select ('41000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '31000000-0000-4000-8000-000000000001', 'claim-' || n::text
  from generate_series(1, 8) n;
insert into public.invitation_documents(invitation_id, state, version)
select i.id,
       jsonb_build_object(
         'id', i.id::text,
         'ownerId', i.owner_id::text,
         'slug', i.slug,
         'status', 'draft',
         'version', 7,
         'previewTokenHash', repeat('a', 63) || split_part(i.slug, '-', 2),
         'secretField', 'private brief and bank data',
         'content', jsonb_build_object('gifts', jsonb_build_array(jsonb_build_object('number', '1234567890'))),
         'service', jsonb_build_object('status', case when i.slug = 'claim-8' then 'in_progress' else 'submitted' end),
         'assignedAdminId', case when i.slug = 'claim-7'
           then '31000000-0000-4000-8000-000000000003' else null end
       ),
       3
  from public.invitations i where i.slug like 'claim-%';
insert into public.invitation_members(invitation_id, user_id, role)
values ('41000000-0000-4000-8000-000000000007',
        '31000000-0000-4000-8000-000000000003', 'assigned_admin');

-- 1 and 2 are eligible; 3 is unpaid, 4 is self-service, 5 is expired,
-- 6 has no entitlement, 7 is assigned, and 8 is already in progress.
insert into public.orders(invitation_id, owner_id, plan_id, amount_idr,
  status, plan_snapshot, entitlement_expires_at, paid_at)
select i.id, i.owner_id,
       case when i.slug = 'claim-4' then 'mandiri' else 'assisted' end,
       599000,
       case when i.slug = 'claim-3' then 'pending' else 'paid' end,
       '{}'::jsonb,
       now() + interval '1 year',
       case when i.slug = 'claim-3' then null else now() end
  from public.invitations i where i.slug <> 'claim-6';
insert into public.entitlements(invitation_id, order_id, plan_snapshot, expires_at)
select o.invitation_id, o.id, '{}'::jsonb,
       case when i.slug = 'claim-5' then now() - interval '1 day'
            else now() + interval '1 year' end
  from public.orders o
  join public.invitations i on i.id = o.invitation_id;

select extensions.ok(not has_function_privilege('anon', 'public.list_assistance_queue()', 'EXECUTE'), 'anonymous role cannot list queue');
select extensions.ok(not has_function_privilege('anon', 'public.claim_assistance(uuid,integer)', 'EXECUTE'), 'anonymous role cannot claim');
select extensions.ok(has_function_privilege('authenticated', 'public.list_assistance_queue()', 'EXECUTE'), 'authenticated role can invoke guarded queue');
select extensions.ok(has_function_privilege('authenticated', 'public.claim_assistance(uuid,integer)', 'EXECUTE'), 'authenticated role can invoke guarded claim');
select extensions.ok(not has_table_privilege('authenticated', 'public.invitation_documents', 'SELECT'), 'queue does not grant document reads');
select extensions.is((select count(*)::integer from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'tamuara_member_media_read'), 0,
  'direct authenticated Storage media policy is removed');
select extensions.is((select public from storage.buckets
  where id = 'tamuara-private'), false, 'invitation media bucket remains private');

set local role authenticated;
set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000001';
select extensions.throws_ok('select * from public.list_assistance_queue()', '42501', 'ADMIN_REQUIRED', 'owner cannot list platform queue');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000001', 3)$$,
  '42501', 'ADMIN_REQUIRED', 'owner cannot claim request');

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000004';
select extensions.throws_ok('select * from public.list_assistance_queue()', '42501', 'ADMIN_REQUIRED', 'non-admin user cannot list queue');

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.list_assistance_queue()), 2, 'queue contains only unassigned paid assisted requests');
select extensions.is((select document_version from public.list_assistance_queue()
  where invitation_id = '41000000-0000-4000-8000-000000000001'), 3, 'queue exposes CAS document version');
select extensions.is((select count(*)::integer from public.list_assistance_queue() q,
  lateral jsonb_object_keys(to_jsonb(q)) field
  where q.invitation_id = '41000000-0000-4000-8000-000000000001'), 3, 'queue exposes exactly three metadata fields');
select extensions.ok((select bool_and(to_jsonb(q)::text not like '%private brief%')
  from public.list_assistance_queue() q), 'queue omits private document content');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000001', 0)$$,
  '22023', 'INVALID_ASSISTANCE_CLAIM', 'zero CAS version is invalid');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000099', 3)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'unknown invitation cannot be claimed');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000001', 2)$$,
  'P0001', 'INVITATION_VERSION_CONFLICT', 'stale CAS version is rejected');
select extensions.is(public.claim_assistance('41000000-0000-4000-8000-000000000001', 3), 4,
  'valid claim atomically advances document CAS version');
select extensions.is((select count(*)::integer from public.list_assistance_queue()), 1,
  'claimed request disappears from queue');

set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000003';
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000001', 3)$$,
  'P0001', 'INVITATION_VERSION_CONFLICT', 'second admin cannot claim with stale version');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000001', 4)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'second admin cannot claim at current version');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000003', 3)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'unpaid order does not qualify');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000004', 3)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'self-service paid order does not qualify');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000005', 3)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'expired entitlement does not qualify');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000006', 3)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'missing entitlement does not qualify');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000007', 3)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'already assigned request cannot be taken');
select extensions.throws_ok(
  $$select public.claim_assistance('41000000-0000-4000-8000-000000000008', 3)$$,
  'P0001', 'ASSISTANCE_UNAVAILABLE', 'request outside submitted status cannot be taken');

reset role;
select extensions.is((select state ->> 'assignedAdminId' from public.invitation_documents
  where invitation_id = '41000000-0000-4000-8000-000000000001'),
  '31000000-0000-4000-8000-000000000002', 'claim records the chosen admin in document state');
select extensions.is((select version from public.invitation_documents
  where invitation_id = '41000000-0000-4000-8000-000000000001'), 4,
  'rejected claims do not advance document version');
select extensions.is((select (state ->> 'version')::integer from public.invitation_documents
  where invitation_id = '41000000-0000-4000-8000-000000000001'), 7,
  'claim leaves editor revision unchanged');
select extensions.is((select state ->> 'secretField' from public.invitation_documents
  where invitation_id = '41000000-0000-4000-8000-000000000001'),
  'private brief and bank data', 'claim preserves unrelated document fields');
select extensions.is((select state #>> '{content,gifts,0,number}' from public.invitation_documents
  where invitation_id = '41000000-0000-4000-8000-000000000001'),
  '1234567890', 'claim preserves gift data');
select extensions.is((select count(*)::integer from public.invitation_members
  where invitation_id = '41000000-0000-4000-8000-000000000001'
    and user_id = '31000000-0000-4000-8000-000000000002'
    and role = 'assigned_admin'), 1, 'claim grants membership only to chosen admin');
select extensions.is((select count(*)::integer from public.audit_logs
  where invitation_id = '41000000-0000-4000-8000-000000000001'
    and actor_id = '31000000-0000-4000-8000-000000000002'
    and action = 'assistance.claimed'
    and metadata = '{"documentVersion":4}'::jsonb), 1, 'claim writes sanitized audit event');
select extensions.is((select count(*)::integer from public.audit_logs
  where action = 'assistance.claimed'), 1, 'rejected claims write no audit event');

set local role authenticated;
set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.invitations
  where id = '41000000-0000-4000-8000-000000000001'), 1,
  'assigned admin can read invitation through RLS');

reset role;
update public.profiles set role = 'owner'
  where id = '31000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.invitation_members
  where invitation_id = '41000000-0000-4000-8000-000000000001'
    and user_id = '31000000-0000-4000-8000-000000000002'), 1,
  'demotion leaves the old membership row in place');
set local role authenticated;
set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000002';
select extensions.is(private.can_access_invitation('41000000-0000-4000-8000-000000000001'), false,
  'demoted assigned admin loses access despite old membership');
select extensions.is((select count(*)::integer from public.invitations
  where id = '41000000-0000-4000-8000-000000000001'), 0,
  'demoted assigned admin cannot read invitation directly through RLS');

reset role;
insert into public.invitation_members(invitation_id, user_id, role)
values ('41000000-0000-4000-8000-000000000002',
        '31000000-0000-4000-8000-000000000004', 'editor');
set local role authenticated;
set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000004';
select extensions.is((select count(*)::integer from public.invitations
  where id = '41000000-0000-4000-8000-000000000002'), 1,
  'editor membership retains its existing read access');

reset role;
update public.profiles set role = 'admin'
  where id = '31000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '31000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.invitations
  where id = '41000000-0000-4000-8000-000000000001'), 1,
  'restored admin role restores assigned invitation read access');

select * from extensions.finish();
rollback;

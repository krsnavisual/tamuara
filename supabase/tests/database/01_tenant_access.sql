begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner-a@test.tamuara.local'),
  ('10000000-0000-4000-8000-000000000002', 'owner-b@test.tamuara.local'),
  ('10000000-0000-4000-8000-000000000003', 'admin@test.tamuara.local'),
  ('10000000-0000-4000-8000-000000000004', 'other@test.tamuara.local');
update public.profiles set role = 'admin'
  where id = '10000000-0000-4000-8000-000000000003';

insert into public.invitations(id, owner_id, slug) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'wedding-a'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'wedding-b');
insert into public.invitation_members(invitation_id, user_id, role) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'assigned_admin');
insert into public.invitation_drafts(
  invitation_id, theme_id, preview_token_hash, preview_token_ciphertext, updated_by
) values
  ('20000000-0000-4000-8000-000000000001', 'classic', repeat('a', 64), 'cipher-a', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', 'minimal', repeat('b', 64), 'cipher-b', '10000000-0000-4000-8000-000000000002');
insert into public.events(id, invitation_id, starts_at, timezone) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', now() + interval '1 month', 'Asia/Jakarta'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', now() + interval '1 month', 'Asia/Makassar');
insert into public.guests(id, invitation_id, display_name, quota, token_hash, token_ciphertext) values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Tamu A', 2, repeat('c', 64), 'guest-cipher-a'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Tamu B', 2, repeat('d', 64), 'guest-cipher-b');

create function pg_temp.cross_guest_event_rejected() returns boolean
language plpgsql as $$
begin
  insert into public.guest_events(invitation_id, guest_id, event_id)
    values ('20000000-0000-4000-8000-000000000001',
            '40000000-0000-4000-8000-000000000001',
            '30000000-0000-4000-8000-000000000002');
  return false;
exception when foreign_key_violation then return true;
end;
$$;
create function pg_temp.cross_owner_order_rejected() returns boolean
language plpgsql as $$
begin
  insert into public.orders(invitation_id, owner_id, plan_id, amount_idr,
    plan_snapshot, entitlement_expires_at)
    values ('20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002', 'mandiri', 249000,
            '{}'::jsonb, now() + interval '1 year');
  return false;
exception when foreign_key_violation then return true;
end;
$$;

select extensions.ok(pg_temp.cross_guest_event_rejected(), 'guest/event cannot cross invitations');
select extensions.ok(pg_temp.cross_owner_order_rejected(), 'order owner must match invitation owner');
select extensions.ok(not has_table_privilege('authenticated', 'public.guests', 'INSERT'), 'browser cannot insert guests directly');
select extensions.ok(not has_column_privilege('authenticated', 'public.guests', 'token_hash', 'SELECT'), 'guest token hash is server-only');
select extensions.ok(not has_column_privilege('authenticated', 'public.guests', 'token_ciphertext', 'SELECT'), 'guest token ciphertext is server-only');
select extensions.ok(not has_column_privilege('authenticated', 'public.invitation_drafts', 'preview_token_hash', 'SELECT'), 'preview hash is server-only');
select extensions.ok(not has_column_privilege('authenticated', 'public.invitation_drafts', 'preview_token_ciphertext', 'SELECT'), 'preview ciphertext is server-only');
select extensions.ok(not has_table_privilege('authenticated', 'public.payment_events', 'SELECT'), 'payment events are server-only');
select extensions.ok(not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT'), 'audit records are server-only');
select extensions.ok(not has_table_privilege('anon', 'public.invitations', 'SELECT'), 'anonymous clients cannot read invitation records');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select extensions.is((select count(*)::integer from public.invitations), 1, 'owner A sees one invitation');
select extensions.is((select count(*)::integer from public.guests), 1, 'owner A sees only own guests');
select extensions.is((select count(*)::integer from public.invitation_drafts), 1, 'owner A sees only own draft');
select extensions.is((select count(*)::integer from public.profiles), 1, 'owner A sees only own profile');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select extensions.is((select count(*)::integer from public.invitations), 1, 'assigned admin sees assigned invitation');
select extensions.is((select count(*)::integer from public.guests), 1, 'assigned admin sees assigned guests');
select extensions.is((select count(*)::integer from public.profiles), 1, 'admin sees only own profile');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.invitations), 1, 'owner B sees one invitation');
select extensions.is((select count(*)::integer from public.guests), 1, 'owner B sees only own guests');

set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';
select extensions.is((select count(*)::integer from public.invitations), 0, 'unassigned user sees no invitations');

select * from extensions.finish();
rollback;

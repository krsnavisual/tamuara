begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

insert into auth.users(id,email) values
  ('32000000-0000-4000-8000-000000000001','payment-owner@test.tamuara.local'),
  ('32000000-0000-4000-8000-000000000002','payment-admin@test.tamuara.local'),
  ('32000000-0000-4000-8000-000000000003','payment-other@test.tamuara.local');
update public.profiles set role='admin' where id='32000000-0000-4000-8000-000000000002';
insert into public.invitations(id,owner_id,slug)
select ('42000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '32000000-0000-4000-8000-000000000001','payment-'||n from generate_series(1,8) n;
insert into public.invitation_documents(invitation_id,state,version)
select i.id,jsonb_build_object('id',i.id,'ownerId',i.owner_id,'slug',i.slug,'status','draft',
  'version',7,'previewTokenHash',repeat('b',62)||lpad(split_part(i.slug,'-',2),2,'0'),
  'previewTokenEncrypted','preserve-secret','content',jsonb_build_object(
    'bride',jsonb_build_object('fullName','Preserved name'),
    'gifts',jsonb_build_array(jsonb_build_object('number','123456789')),
    'events',jsonb_build_array(jsonb_build_object('date','2027-01-15','timezone','Asia/Jayapura'))),
  'guests',jsonb_build_array(jsonb_build_object('id','secret-guest','tokenHash','private-hash')),
  'rsvps',jsonb_build_array(jsonb_build_object('guestId','secret-guest','count',2)),
  'wishes',jsonb_build_array(jsonb_build_object('message','private-wish')),
  'service',jsonb_build_object('status','none','brief','private brief','messages','[]'::jsonb),
  'orders','[]'::jsonb),3 from public.invitations i where i.slug like 'payment-%';
insert into public.invitation_members(invitation_id,user_id,role)
values('42000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','assigned_admin');
create temporary table payment_test_results(key text primary key,result jsonb);
grant all on payment_test_results to service_role;

select extensions.is((select count(*)::integer from public.plans where active),0,
  'migration does not activate catalog plans');
select extensions.ok(not has_table_privilege('anon','public.payment_checkout_sessions','SELECT'),
  'anonymous clients cannot read private payment sessions');
select extensions.ok(not has_table_privilege('authenticated','public.payment_checkout_sessions','SELECT'),
  'authenticated clients cannot read private payment sessions');
select extensions.ok(not has_table_privilege('authenticated','public.payment_events','SELECT'),
  'payment events are service-only');
select extensions.ok(not has_function_privilege('authenticated',
  'public.reserve_payment_checkout(uuid,uuid,integer,text,text)','EXECUTE'),
  'owner JWT cannot call reservation RPC');
select extensions.ok(not has_function_privilege('anon',
  'public.apply_verified_payment_status(uuid,text,bigint,text,text)','EXECUTE'),
  'anonymous role cannot apply verified status');
select extensions.ok(not has_function_privilege('authenticated',
  'public.save_payment_checkout_redirect(uuid,text)','EXECUTE'),
  'authenticated clients cannot save a provider redirect');
select extensions.ok(not has_function_privilege('authenticated',
  'public.get_payment_checkout(uuid,uuid)','EXECUTE'),
  'browser roles cannot read checkout through server RPC');
select extensions.ok((select bool_and(not prosecdef and proconfig=array['search_path=""']::text[])
  from pg_proc where pronamespace='public'::regnamespace
    and proname in ('reserve_payment_checkout','get_payment_checkout',
      'save_payment_checkout_redirect','apply_verified_payment_status')),
  'payment RPCs use invoker privileges and fixed empty search path');

set local role service_role;
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000001',7,'mandiri','payment_test_key_01')$$,
  'P0001','PAYMENT_ORDER_NOT_FOUND','another owner cannot reserve a checkout');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001',7,'mandiri','payment_test_key_01')$$,
  'P0001','PAYMENT_ORDER_NOT_FOUND','assigned admin cannot purchase for the couple');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',6,'mandiri','payment_test_key_01')$$,
  'P0001','INVITATION_VERSION_CONFLICT','new checkout rejects stale editor version');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'mandiri','payment_test_key_01')$$,
  'P0001','PAYMENT_PLAN_UNAVAILABLE','inactive plan fails closed');
update public.plans set active=true;
update public.plans set features='{"guestLimit":"500","photoLimit":20,"maxRevisions":0}' where id='mandiri';
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'mandiri','payment_test_key_01')$$,
  'P0001','PAYMENT_PLAN_UNAVAILABLE','string features cannot produce invalid entitlement snapshots');
update public.plans set features='{"guestLimit":500,"photoLimit":20,"maxRevisions":0}' where id='mandiri';
insert into payment_test_results values('first',public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'mandiri','payment_test_key_01'));
select extensions.is((select result->>'createClaimed' from payment_test_results where key='first'),'true',
  'first reservation owns the only provider creation claim');
select extensions.is((select result->>'checkoutState' from payment_test_results where key='first'),'creating',
  'new reservation reports creating');
select extensions.is((select (result->>'amountIdr')::bigint from payment_test_results where key='first'),249000::bigint,
  'server catalog determines immutable exact price');
select extensions.is((select (result->>'expiresAt')::timestamptz from payment_test_results where key='first'),
  '2028-01-15T23:59:59+09:00'::timestamptz,'expiry is one year after last event in its timezone');
insert into payment_test_results values('retry',public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',1,'mandiri','payment_test_key_01'));
select extensions.is((select result->>'orderId' from payment_test_results where key='retry'),
  (select result->>'orderId' from payment_test_results where key='first'),'same-key retry reuses the order despite changed version');
select extensions.is((select result->>'createClaimed' from payment_test_results where key='retry'),'false',
  'repeat never acquires another provider create claim');
select extensions.is((select result->>'checkoutState' from payment_test_results where key='retry'),'uncertain',
  'crash before redirect persistence remains uncertain');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'assisted','payment_test_key_01')$$,
  'P0001','PAYMENT_CHECKOUT_OPEN','open checkout blocks another plan and idempotency scope');
select extensions.is((select count(*)::integer from public.orders where invitation_id='42000000-0000-4000-8000-000000000001'),1,
  'retries and blocked second plan produce exactly one order');
select extensions.is((select state->>'version' from public.invitation_documents where invitation_id='42000000-0000-4000-8000-000000000001'),
  '7','reservation preserves editor version');
select extensions.is((select version from public.invitation_documents where invitation_id='42000000-0000-4000-8000-000000000001'),
  4,'reservation increments database CAS version');
select extensions.throws_ok($$select public.get_payment_checkout('32000000-0000-4000-8000-000000000003',
  (select (result->>'orderId')::uuid from payment_test_results where key='first'))$$,
  'P0001','PAYMENT_ORDER_NOT_FOUND','checkout read binds to owner');
select extensions.throws_ok($$select public.save_payment_checkout_redirect(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'https://app.midtrans.com/snap/v3/live-link')$$,
  '22023','INVALID_PAYMENT_REDIRECT','live provider redirect is forbidden at this stage');
select extensions.throws_ok($$select public.save_payment_checkout_redirect(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'https://evil.example/snap/v3/link')$$,
  '22023','INVALID_PAYMENT_REDIRECT','arbitrary redirects cannot enter session storage');
select extensions.is(public.save_payment_checkout_redirect(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'https://app.sandbox.midtrans.com/snap/v3/redirection/test-link')->>'checkoutState','ready',
  'saving sandbox redirect atomically makes pending checkout ready');
select extensions.lives_ok($$select public.save_payment_checkout_redirect(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'https://app.sandbox.midtrans.com/snap/v3/redirection/test-link')$$,'same redirect persistence is idempotent');
select extensions.throws_ok($$select public.save_payment_checkout_redirect(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'https://app.sandbox.midtrans.com/snap/v3/conflicting-link')$$,
  'P0001','PAYMENT_REDIRECT_CONFLICT','competing create responses cannot replace saved redirect');
select extensions.ok((select state::text not like '%midtrans.com%' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'private provider URL never enters invitation document');
select extensions.throws_ok($$select public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'transaction_one',1,'settlement','paid')$$,
  '22023','PAYMENT_AMOUNT_MISMATCH','exact amount mismatch cannot activate access');
select extensions.is((select count(*)::integer from public.entitlements),0,
  'reservation and amount mismatch grant no entitlement');

-- A current edit is preserved when provider status arrives; payment sync never
-- uses a stale entire document supplied by the caller.
update public.invitation_documents set state=jsonb_set(state,'{content,bride,fullName}','"Latest edited name"')
  where invitation_id='42000000-0000-4000-8000-000000000001';
update public.plans set features='{"guestLimit":999,"photoLimit":99,"maxRevisions":0}' where id='mandiri';
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'transaction_one',249000,'settlement','paid')->>'status','paid','verified settlement activates order');
select extensions.is((select plan_snapshot->>'guestLimit' from public.entitlements
  where invitation_id='42000000-0000-4000-8000-000000000001'),'500',
  'entitlement uses frozen order features rather than changed catalog');
select extensions.is((select state#>>'{content,bride,fullName}' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'Latest edited name',
  'payment sync preserves most recent editor content');
select extensions.is((select state#>>'{guests,0,tokenHash}' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'private-hash','payment sync preserves guest tokens');
select extensions.is((select state#>>'{rsvps,0,count}' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'2','payment sync preserves RSVP state');
select extensions.is((select state#>>'{wishes,0,message}' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'private-wish','payment sync preserves moderation data');
select extensions.is((select status from public.invitations where id='42000000-0000-4000-8000-000000000001'),
  'draft','paid never automatically publishes an invitation');
select extensions.is((select state->>'version' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'7','settlement preserves editor approval version');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'transaction_one',249000,'pending','pending')->>'status','paid','verified pending cannot regress paid');
select extensions.lives_ok($$select public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'transaction_one',249000,'settlement','paid')$$,'repeated paid status is idempotent');
select extensions.is((select count(*)::integer from public.payment_events where provider_transaction_id='transaction_one'),2,
  'events deduplicate by order transaction provider status and state');
select extensions.throws_ok($$select public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'other_transaction',249000,'settlement','paid')$$,
  '22023','PAYMENT_TRANSACTION_MISMATCH','transaction binding is immutable');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'mandiri','payment_test_key_same')$$,
  'P0001','PAYMENT_PURCHASE_UNAVAILABLE','active same plan cannot be repurchased');
update public.plans set amount_idr=299000 where id='mandiri';
insert into payment_test_results values('upgrade',public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'assisted','payment_test_upgrade'));
select extensions.is((select (result->>'amountIdr')::bigint from payment_test_results where key='upgrade'),350000::bigint,
  'upgrade credits actual frozen paid base price despite changed catalog');
select extensions.is((select plan_snapshot->>'baseOrderId' from public.orders
  where id=(select (result->>'orderId')::uuid from payment_test_results where key='upgrade')),
  (select result->>'orderId' from payment_test_results where key='first'),
  'upgrade snapshot records the funding base order');
update public.plans set amount_idr=249000 where id='mandiri';
select extensions.is((select result->>'expiresAt' from payment_test_results where key='upgrade'),
  (select result->>'expiresAt' from payment_test_results where key='first'),'upgrade preserves expiry and grants no renewal');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='upgrade'),
  'transaction_upgrade',350000,'settlement','paid')->>'status','paid','assisted upgrade activates');
select extensions.is((select state#>>'{service,status}' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'submitted','assisted payment enters unassigned admin queue');
select extensions.is((select state#>>'{service,brief}' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'private brief','upgrade preserves service brief');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'assisted','payment_test_upgrade_again')$$,
  'P0001','PAYMENT_PURCHASE_UNAVAILABLE','active assisted cannot purchase another plan');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='first'),
  'transaction_one',249000,'refund','refunded')->>'status','refunded','full refund marks only matching order');
select extensions.is((select count(*)::integer from public.entitlements
  where invitation_id='42000000-0000-4000-8000-000000000001'),0,
  'funding base refund revokes dependent assisted entitlement');
select extensions.is((select status from public.orders
  where id=(select (result->>'orderId')::uuid from payment_test_results where key='upgrade')),
  'review','funding base refund places dependent upgrade in manual review');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='upgrade'),
  'transaction_upgrade',350000,'deny','failed')->>'status','review',
  'dependent upgrade remains in review after further verified reversal');
select extensions.is((select count(*)::integer from public.entitlements
  where invitation_id='42000000-0000-4000-8000-000000000001'),0,'review revokes matching entitlement');
select extensions.ok((select not(state?'entitlement') from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000001'),'review removes document entitlement too');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='upgrade'),
  'transaction_upgrade',350000,'capture','paid')->>'status','review','stale distinct paid event cannot restore reviewed access');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001',7,'mandiri','payment_test_after_review')$$,
  'P0001','PAYMENT_CHECKOUT_OPEN','review requires manual resolution before another purchase');

insert into payment_test_results values('refund',public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002',7,'assisted','payment_test_refund'));
select extensions.is(public.save_payment_checkout_redirect(
  (select (result->>'orderId')::uuid from payment_test_results where key='refund'),
  'https://app.sandbox.midtrans.com/snap/v2/vtweb/test-link')->>'checkoutState','ready',
  'official Snap v2 vtweb redirect shape is accepted');
select public.apply_verified_payment_status((select (result->>'orderId')::uuid from payment_test_results where key='refund'),
  'transaction_refund',599000,'settlement','paid');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='refund'),
  'transaction_refund',599000,'refund','refunded')->>'status','refunded','full refund revokes purchased order');
select extensions.is((select count(*)::integer from public.entitlements
  where invitation_id='42000000-0000-4000-8000-000000000002'),0,'refund removes SQL entitlement');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='refund'),
  'transaction_refund',599000,'capture','paid')->>'status','refunded','refunded is terminal even for new paid event fingerprint');
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002',7,'mandiri','payment_test_after_refund')$$,
  'P0001','PAYMENT_PURCHASE_UNAVAILABLE','refund does not silently permit renewal');

insert into payment_test_results values('expiry',public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003',7,'mandiri','payment_test_expiry'));
select public.apply_verified_payment_status((select (result->>'orderId')::uuid from payment_test_results where key='expiry'),
  'transaction_expiry',249000,'settlement','paid');
update public.entitlements set expires_at=now()-interval '1 second'
  where invitation_id='42000000-0000-4000-8000-000000000003';
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003',7,'assisted','payment_test_expired_upgrade')$$,
  'P0001','PAYMENT_PURCHASE_UNAVAILABLE','expired entitlement cannot be renewed by upgrade');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='expiry'),
  'transaction_expiry',249000,'expire','expired')->>'status','review',
  'verified expiry after paid enters review and closes access');
select extensions.is((select count(*)::integer from public.entitlements
  where invitation_id='42000000-0000-4000-8000-000000000003'),0,
  'paid reversal closes matching SQL entitlement');
update public.invitation_documents set state=jsonb_set(state,'{content,events,0,date}','"2027-02-30"')
  where invitation_id='42000000-0000-4000-8000-000000000004';
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000004',7,'mandiri','payment_test_bad_date')$$,
  '22023','INVALID_PAYMENT_EVENT_DATES','impossible calendar date cannot create an order');
update public.invitation_documents set state=jsonb_set(state,'{content,events}','[]')
  where invitation_id='42000000-0000-4000-8000-000000000005';
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000005',7,'mandiri','payment_test_no_dates')$$,
  '22023','INVALID_PAYMENT_EVENT_DATES','empty dates cannot create an order');
update public.invitation_documents set state=jsonb_set(state,'{content,events,0,date}','"2020-01-01"')
  where invitation_id='42000000-0000-4000-8000-000000000006';
select extensions.throws_ok($$select public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000006',7,'mandiri','payment_test_old_date')$$,
  'P0001','PAYMENT_PURCHASE_UNAVAILABLE','already expired event coverage cannot be purchased');
select extensions.is((select count(*)::integer from public.orders where invitation_id in
  ('42000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000005','42000000-0000-4000-8000-000000000006')),0,
  'invalid date checks create no partial financial rows');

insert into payment_test_results values('fence',public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000007',7,'mandiri','payment_test_terminal_fence'));
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='fence'),
  'transaction_fence',249000,'deny','failed')->>'status','failed','verified initial deny marks failed');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='fence'),
  'transaction_fence',249000,'pending','pending')->>'status','failed','late pending cannot reopen a terminal negative status');
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='fence'),
  'transaction_fence',249000,'settlement','paid')->>'status','review',
  'late success after terminal failure requires review instead of restoring access');
select extensions.is((select count(*)::integer from public.entitlements
  where invitation_id='42000000-0000-4000-8000-000000000007'),0,'terminal-failure race never grants access');

insert into payment_test_results values('cancel',public.reserve_payment_checkout(
  '32000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000008',7,'mandiri','payment_test_cancel'));
select extensions.is(public.apply_verified_payment_status(
  (select (result->>'orderId')::uuid from payment_test_results where key='cancel'),
  'transaction_cancel',249000,'cancel','cancelled')->>'status','canceled',
  'provider cancelled maps to existing SQL canceled spelling');
select extensions.is((select state#>>'{orders,0,status}' from public.invitation_documents
  where invitation_id='42000000-0000-4000-8000-000000000008'),'cancelled',
  'SQL canceled projects frontend cancelled spelling');

reset role;
set local role authenticated;
set local request.jwt.claim.sub='32000000-0000-4000-8000-000000000002';
select extensions.is((select count(*)::integer from public.orders),0,'assigned admin cannot read owner purchase records');
set local request.jwt.claim.sub='32000000-0000-4000-8000-000000000003';
select extensions.is((select count(*)::integer from public.orders),0,'another owner cannot read orders');
set local request.jwt.claim.sub='32000000-0000-4000-8000-000000000001';
select extensions.is((select count(*)::integer from public.orders),6,'owner can read only own financial records');
select extensions.throws_ok($$select public.get_payment_checkout(null,'42000000-0000-4000-8000-000000000001')$$,
  '42501',null,'even owner cannot execute service-only checkout RPC');
select extensions.throws_ok('select * from public.payment_checkout_sessions','42501',null,
  'owner JWT cannot read provider links or creation claims directly');
reset role;
select * from extensions.finish();
rollback;

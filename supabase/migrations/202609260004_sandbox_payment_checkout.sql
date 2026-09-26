-- Sandbox orchestration only. Catalog activation is a separate operator action.
begin;

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('created','pending','paid','failed','expired','canceled','refunded','review'));
alter table public.payment_events add column payment_state text;

create table public.payment_checkout_sessions (
  order_id uuid primary key references public.orders(id) on delete cascade,
  invitation_id uuid not null references public.invitations(id),
  owner_id uuid not null references public.profiles(id),
  plan_id text not null references public.plans(id),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128
    and idempotency_key ~ '^[A-Za-z0-9_-]+$'),
  provider text not null default 'midtrans' check (provider = 'midtrans'),
  environment text not null default 'sandbox' check (environment = 'sandbox'),
  create_claimed_at timestamptz not null default now(),
  redirect_url text check (redirect_url ~ '^https://app\.sandbox\.midtrans\.com/snap/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$'),
  provider_transaction_id text unique check (provider_transaction_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, invitation_id, plan_id, idempotency_key),
  foreign key (order_id, invitation_id) references public.orders(id, invitation_id) on delete cascade
);
alter table public.payment_checkout_sessions enable row level security;
revoke all on public.payment_checkout_sessions from public, anon, authenticated;
grant all on public.payment_checkout_sessions to service_role;
-- Assigned administrators may edit an invitation, but purchase records are owner-only.
drop policy member_read on public.orders;
create policy order_owner_read on public.orders for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.payment_events from anon, authenticated;

create function public.get_payment_checkout(p_owner_id uuid, p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  select jsonb_build_object('orderId',o.id,'invitationId',o.invitation_id,
      'ownerId',o.owner_id,'planId',o.plan_id,'amountIdr',o.amount_idr,
      'currency','IDR','status',o.status,'redirectUrl',s.redirect_url,
      'transactionId',s.provider_transaction_id,'expiresAt',o.entitlement_expires_at,
      'checkoutState',case when s.redirect_url is null then 'uncertain' else 'ready' end)
    into v_result from public.orders o
    join public.payment_checkout_sessions s on s.order_id=o.id
    where o.id=p_order_id and (p_owner_id is null or o.owner_id=p_owner_id);
  if v_result is null then
    raise exception 'PAYMENT_ORDER_NOT_FOUND' using errcode='P0001';
  end if;
  return v_result;
end;
$$;

-- Rebuild only financial fields from their authoritative rows. Caller holds
-- document/invitation locks before acquiring order/session locks.
create function private.sync_payment_document(p_invitation_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_state jsonb; v_orders jsonb; v_entitlement jsonb; v_expires timestamptz;
begin
  select state into v_state from public.invitation_documents where invitation_id=p_invitation_id;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',o.id,'plan',o.plan_id,'amount',o.amount_idr,
      'status',case when o.status='created' then 'pending'
        when o.status='canceled' then 'cancelled' else o.status end,
      'createdAt',o.created_at,'paidAt',o.paid_at,
      'entitlementSnapshot',jsonb_build_object('orderId',o.id,'plan',o.plan_id,
        'guestLimit',o.plan_snapshot->'guestLimit','photoLimit',o.plan_snapshot->'photoLimit',
        'maxRevisions',o.plan_snapshot->'maxRevisions','expiresAt',o.entitlement_expires_at)
    )) order by o.created_at,o.id),'[]'::jsonb)
    into v_orders from public.orders o where o.invitation_id=p_invitation_id;
  select jsonb_build_object('orderId',e.order_id,'plan',o.plan_id,
      'guestLimit',e.plan_snapshot->'guestLimit','photoLimit',e.plan_snapshot->'photoLimit',
      'maxRevisions',e.plan_snapshot->'maxRevisions','expiresAt',e.expires_at),e.expires_at
    into v_entitlement,v_expires from public.entitlements e
    join public.orders o on o.id=e.order_id and o.invitation_id=e.invitation_id
    where e.invitation_id=p_invitation_id and o.status='paid';
  v_state:=jsonb_set(v_state,'{orders}',v_orders,true);
  if v_entitlement is null then
    v_state:=v_state-'entitlement'-'expiresAt';
  else
    v_state:=jsonb_set(v_state,'{entitlement}',v_entitlement,true);
    v_state:=jsonb_set(v_state,'{expiresAt}',to_jsonb(v_expires),true);
    if v_entitlement->>'plan'='assisted' and v_state#>>'{service,status}'='none' then
      v_state:=jsonb_set(v_state,'{service,status}','"submitted"'::jsonb,true);
    end if;
  end if;
  update public.invitation_documents set state=v_state,version=version+1,updated_at=now()
    where invitation_id=p_invitation_id;
  update public.invitations set expires_at=v_expires,updated_at=now() where id=p_invitation_id;
end;
$$;
revoke all on function private.sync_payment_document(uuid) from public,anon,authenticated;
grant execute on function private.sync_payment_document(uuid) to service_role;

create function public.reserve_payment_checkout(
  p_owner_id uuid,p_invitation_id uuid,p_expected_editor_version integer,
  p_plan_id text,p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_state jsonb; v_owner uuid; v_invitation_status text; v_order_id uuid;
  v_plan public.plans%rowtype; v_current_order public.orders%rowtype;
  v_entitlement public.entitlements%rowtype; v_amount bigint; v_expires timestamptz;
  v_event jsonb; v_date date; v_zone text; v_base_order_id uuid;
begin
  if p_owner_id is null or p_invitation_id is null or p_expected_editor_version is null
    or p_expected_editor_version<1 or p_plan_id not in ('mandiri','assisted')
    or p_plan_id is null or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'INVALID_PAYMENT_CHECKOUT' using errcode='22023';
  end if;
  select d.state,i.owner_id,i.status into v_state,v_owner,v_invitation_status
    from public.invitation_documents d join public.invitations i on i.id=d.invitation_id
    where i.id=p_invitation_id for update of d,i;
  if not found or v_owner is distinct from p_owner_id then
    raise exception 'PAYMENT_ORDER_NOT_FOUND' using errcode='P0001';
  end if;
  select s.order_id into v_order_id from public.payment_checkout_sessions s
    where s.owner_id=p_owner_id and s.invitation_id=p_invitation_id
      and s.plan_id=p_plan_id and s.idempotency_key=p_idempotency_key;
  if found then
    return public.get_payment_checkout(p_owner_id,v_order_id)||jsonb_build_object('createClaimed',false);
  end if;
  if (v_state->>'version')::integer is distinct from p_expected_editor_version then
    raise exception 'INVITATION_VERSION_CONFLICT' using errcode='P0001';
  end if;
  if v_invitation_status='archived' then
    raise exception 'PAYMENT_PURCHASE_UNAVAILABLE' using errcode='P0001';
  end if;
  if exists(select 1 from public.orders o where o.invitation_id=p_invitation_id
      and o.status in ('created','pending','review')) then
    raise exception 'PAYMENT_CHECKOUT_OPEN' using errcode='P0001';
  end if;
  select * into v_plan from public.plans where id=p_plan_id and active for share;
  if not found then raise exception 'PAYMENT_PLAN_UNAVAILABLE' using errcode='P0001'; end if;
  if jsonb_typeof(v_plan.features) is distinct from 'object'
    or jsonb_typeof(v_plan.features->'guestLimit') is distinct from 'number'
    or jsonb_typeof(v_plan.features->'photoLimit') is distinct from 'number'
    or jsonb_typeof(v_plan.features->'maxRevisions') is distinct from 'number'
    or coalesce(v_plan.features->>'guestLimit','') !~ '^[1-9][0-9]{0,5}$'
    or coalesce(v_plan.features->>'photoLimit','') !~ '^[1-9][0-9]{0,5}$'
    or coalesce(v_plan.features->>'maxRevisions','') !~ '^[0-9]{1,5}$' then
    raise exception 'PAYMENT_PLAN_UNAVAILABLE' using errcode='P0001';
  end if;
  v_amount:=v_plan.amount_idr;
  select * into v_entitlement from public.entitlements where invitation_id=p_invitation_id for update;
  if found then
    select * into v_current_order from public.orders where id=v_entitlement.order_id for update;
    if v_entitlement.expires_at<=now() or v_current_order.status<>'paid'
      or v_current_order.plan_id<>'mandiri' or p_plan_id<>'assisted' then
      raise exception 'PAYMENT_PURCHASE_UNAVAILABLE' using errcode='P0001';
    end if;
    -- Upgrade credit is what this owner actually paid, frozen on the base
    -- order, rather than today's potentially changed catalog price.
    v_amount:=v_amount-v_current_order.amount_idr;
    v_base_order_id:=v_current_order.id;
    v_expires:=v_entitlement.expires_at;
  else
    -- A previously purchased invitation cannot silently become a renewal.
    if exists(select 1 from public.orders where invitation_id=p_invitation_id and paid_at is not null) then
      raise exception 'PAYMENT_PURCHASE_UNAVAILABLE' using errcode='P0001';
    end if;
    if jsonb_typeof(v_state#>'{content,events}') is distinct from 'array'
      or jsonb_array_length(v_state#>'{content,events}')=0 then
      raise exception 'INVALID_PAYMENT_EVENT_DATES' using errcode='22023';
    end if;
    for v_event in select value from jsonb_array_elements(v_state#>'{content,events}') loop
      v_zone:=v_event->>'timezone';
      if coalesce(v_event->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or v_zone is null or v_zone not in ('Asia/Jakarta','Asia/Makassar','Asia/Jayapura') then
        raise exception 'INVALID_PAYMENT_EVENT_DATES' using errcode='22023';
      end if;
      begin v_date:=(v_event->>'date')::date;
      exception when others then raise exception 'INVALID_PAYMENT_EVENT_DATES' using errcode='22023'; end;
      if to_char(v_date,'YYYY-MM-DD')<>v_event->>'date' then
        raise exception 'INVALID_PAYMENT_EVENT_DATES' using errcode='22023';
      end if;
      v_expires:=greatest(v_expires,((v_date+interval '1 year')::date+time '23:59:59') at time zone v_zone);
    end loop;
  end if;
  if v_amount<=0 or v_amount>9007199254740991 or v_expires<=now() then
    raise exception 'PAYMENT_PURCHASE_UNAVAILABLE' using errcode='P0001';
  end if;
  insert into public.orders(invitation_id,owner_id,plan_id,amount_idr,status,plan_snapshot,entitlement_expires_at)
    values(p_invitation_id,p_owner_id,p_plan_id,v_amount,'created',
      v_plan.features||jsonb_strip_nulls(jsonb_build_object('planId',v_plan.id,'displayName',v_plan.display_name,
        'catalogAmountIdr',v_plan.amount_idr,'currency','IDR','baseOrderId',v_base_order_id)),v_expires) returning id into v_order_id;
  insert into public.payment_checkout_sessions(order_id,invitation_id,owner_id,plan_id,idempotency_key)
    values(v_order_id,p_invitation_id,p_owner_id,p_plan_id,p_idempotency_key);
  perform private.sync_payment_document(p_invitation_id);
  return public.get_payment_checkout(p_owner_id,v_order_id)
    ||jsonb_build_object('createClaimed',true,'checkoutState','creating');
end;
$$;

create function public.save_payment_checkout_redirect(p_order_id uuid,p_redirect_url text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_invitation uuid; v_existing text;
begin
  if p_redirect_url is null or p_redirect_url !~ '^https://app\.sandbox\.midtrans\.com/snap/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$' then
    raise exception 'INVALID_PAYMENT_REDIRECT' using errcode='22023';
  end if;
  select invitation_id into v_invitation from public.orders where id=p_order_id;
  perform 1 from public.invitation_documents d join public.invitations i on i.id=d.invitation_id
    where i.id=v_invitation for update of d,i;
  perform 1 from public.orders where id=p_order_id for update;
  select redirect_url into v_existing from public.payment_checkout_sessions where order_id=p_order_id for update;
  if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND' using errcode='P0001'; end if;
  if v_existing is not null and v_existing<>p_redirect_url then
    raise exception 'PAYMENT_REDIRECT_CONFLICT' using errcode='P0001';
  end if;
  update public.payment_checkout_sessions set redirect_url=p_redirect_url,updated_at=now() where order_id=p_order_id;
  update public.orders set status='pending' where id=p_order_id and status='created';
  if found then perform private.sync_payment_document(v_invitation); end if;
  return public.get_payment_checkout(null,p_order_id);
end;
$$;

-- Input must come from a server-authenticated provider status lookup. Never
-- expose this RPC to browser roles or feed unverified notification fields.
create function public.apply_verified_payment_status(
  p_order_id uuid,p_transaction_id text,p_amount_idr bigint,
  p_provider_status text,p_payment_state text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_invitation uuid; v_order public.orders%rowtype; v_transaction text;
  v_dedup text; v_status text; v_entitlement_order uuid; v_entitlement_created timestamptz;
begin
  if p_transaction_id is null or p_transaction_id !~ '^[A-Za-z0-9_-]{1,100}$'
    or p_provider_status is null or char_length(p_provider_status) not between 1 and 100
    or p_payment_state is null or p_payment_state not in
      ('pending','paid','failed','cancelled','expired','refunded','review') then
    raise exception 'INVALID_VERIFIED_PAYMENT' using errcode='22023';
  end if;
  select invitation_id into v_invitation from public.orders where id=p_order_id;
  perform 1 from public.invitation_documents d join public.invitations i on i.id=d.invitation_id
    where i.id=v_invitation for update of d,i;
  select * into v_order from public.orders where id=p_order_id for update;
  select provider_transaction_id into v_transaction from public.payment_checkout_sessions
    where order_id=p_order_id for update;
  if not found then raise exception 'PAYMENT_ORDER_NOT_FOUND' using errcode='P0001'; end if;
  if p_amount_idr is distinct from v_order.amount_idr then
    raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode='22023';
  end if;
  if v_transaction is not null and v_transaction<>p_transaction_id then
    raise exception 'PAYMENT_TRANSACTION_MISMATCH' using errcode='22023';
  end if;
  update public.payment_checkout_sessions set provider_transaction_id=p_transaction_id,updated_at=now()
    where order_id=p_order_id;
  v_dedup:='midtrans:sandbox:'||md5(jsonb_build_array(p_order_id,p_transaction_id,p_provider_status,p_payment_state)::text);
  insert into public.payment_events(invitation_id,order_id,provider,deduplication_key,
      provider_transaction_id,provider_status,verified_amount_idr,payment_state)
    values(v_invitation,p_order_id,'midtrans',v_dedup,p_transaction_id,p_provider_status,p_amount_idr,p_payment_state)
    on conflict(deduplication_key) do nothing;
  if not found then return public.get_payment_checkout(null,p_order_id); end if;
  -- Review/refund are terminal pending operator resolution. A stale success
  -- event can neither restore access nor silently resolve a dispute.
  if v_order.status in ('refunded','review') then return public.get_payment_checkout(null,p_order_id); end if;
  v_status:=case when p_payment_state='cancelled' then 'canceled' else p_payment_state end;
  if v_order.status in ('failed','canceled','expired') then
    if v_status='pending' then return public.get_payment_checkout(null,p_order_id); end if;
    if v_status='paid' then v_status:='review'; end if;
  end if;
  if v_order.status='paid' and v_status in ('failed','canceled','expired') then
    v_status:='review';
  end if;
  if v_order.status='paid' and v_status not in ('refunded','review') then
    return public.get_payment_checkout(null,p_order_id);
  end if;
  select e.order_id,o.created_at into v_entitlement_order,v_entitlement_created
    from public.entitlements e join public.orders o on o.id=e.order_id
    where e.invitation_id=v_invitation for update of e;
  if v_status='paid' and v_entitlement_order is not null and v_entitlement_order<>p_order_id
    and v_entitlement_created>v_order.created_at then
    v_status:='review';
  end if;
  update public.orders set status=v_status,
    paid_at=case when v_status='paid' then coalesce(paid_at,now()) else paid_at end where id=p_order_id;
  if v_status='paid' then
    insert into public.entitlements(invitation_id,order_id,plan_snapshot,expires_at)
      values(v_invitation,p_order_id,v_order.plan_snapshot,v_order.entitlement_expires_at)
      on conflict(invitation_id) do update set order_id=excluded.order_id,
        plan_snapshot=excluded.plan_snapshot,expires_at=excluded.expires_at,activated_at=now();
  elsif v_status in ('refunded','review') then
    delete from public.entitlements where invitation_id=v_invitation and order_id=p_order_id;
    -- An assisted upgrade was funded partly by its Mandiri base. Reversing
    -- that base invalidates the dependent purchase, including one still
    -- pending provider completion. Unrelated orders are untouched.
    delete from public.entitlements e using public.orders dependent
      where e.invitation_id=v_invitation and e.order_id=dependent.id
        and dependent.invitation_id=v_invitation
        and dependent.plan_snapshot->>'baseOrderId'=p_order_id::text;
    update public.orders set status='review' where invitation_id=v_invitation
      and plan_snapshot->>'baseOrderId'=p_order_id::text
      and status in ('created','pending','paid');
  end if;
  perform private.sync_payment_document(v_invitation);
  insert into public.audit_logs(invitation_id,actor_id,action,metadata)
    values(v_invitation,null,'payment.status_verified',jsonb_build_object('orderId',p_order_id,'status',v_status,'environment','sandbox'));
  return public.get_payment_checkout(null,p_order_id);
end;
$$;

revoke all on function public.get_payment_checkout(uuid,uuid),
  public.reserve_payment_checkout(uuid,uuid,integer,text,text),
  public.save_payment_checkout_redirect(uuid,text),
  public.apply_verified_payment_status(uuid,text,bigint,text,text)
  from public,anon,authenticated;
grant execute on function public.get_payment_checkout(uuid,uuid),
  public.reserve_payment_checkout(uuid,uuid,integer,text,text),
  public.save_payment_checkout_redirect(uuid,text),
  public.apply_verified_payment_status(uuid,text,bigint,text,text) to service_role;
commit;

-- Initial production schema. Not connected to the local JSON repository yet.
-- All writes are server-only until transactional RPCs and provider adapters are implemented.
begin;
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now()
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  active_publication_id uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invitations_owner_idx on public.invitations(owner_id);
create table public.invitation_members (
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('editor', 'assigned_admin')),
  created_at timestamptz not null default now(),
  primary key (invitation_id, user_id)
);
create index invitation_members_user_idx on public.invitation_members(user_id);
create table public.invitation_drafts (
  invitation_id uuid primary key references public.invitations(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  theme_id text not null check (theme_id in ('classic', 'floral', 'minimal')),
  schema_version integer not null default 1,
  revision integer not null default 1 check (revision > 0),
  preview_token_hash text not null unique check (preview_token_hash ~ '^[a-f0-9]{64}$'),
  preview_token_ciphertext text not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.invitation_publications (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  content jsonb not null,
  theme_id text not null check (theme_id in ('classic', 'floral', 'minimal')),
  theme_version integer not null default 1,
  draft_revision integer not null check (draft_revision > 0),
  approved_by uuid not null references public.profiles(id),
  published_at timestamptz not null default now(),
  unique (id, invitation_id)
);
alter table public.invitations add constraint active_publication_same_invitation_fk
  foreign key (active_publication_id, id) references public.invitation_publications(id, invitation_id) deferrable initially deferred;
create table public.events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null check (timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  archived_at timestamptz,
  unique (id, invitation_id),
  check (ends_at is null or ends_at > starts_at)
);
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 160),
  group_name text not null default 'Umum',
  quota integer not null check (quota between 1 and 20),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_ciphertext text not null,
  marked_sent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, invitation_id)
);
create table public.guest_events (
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  guest_id uuid not null,
  event_id uuid not null,
  primary key (invitation_id, guest_id, event_id),
  foreign key (guest_id, invitation_id) references public.guests(id, invitation_id) on delete cascade,
  foreign key (event_id, invitation_id) references public.events(id, invitation_id) on delete cascade
);
create table public.rsvps (
  invitation_id uuid not null,
  guest_id uuid not null,
  event_id uuid not null,
  status text not null check (status in ('attending', 'declined')),
  attending_count integer not null check (attending_count between 0 and 20),
  updated_at timestamptz not null default now(),
  primary key (invitation_id, guest_id, event_id),
  foreign key (invitation_id, guest_id, event_id) references public.guest_events(invitation_id, guest_id, event_id) on delete cascade,
  check ((status = 'declined' and attending_count = 0) or (status = 'attending' and attending_count >= 1))
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  guest_id uuid not null,
  message text not null check (char_length(message) between 2 and 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  foreign key (guest_id, invitation_id) references public.guests(id, invitation_id) on delete cascade
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 8388608),
  created_at timestamptz not null default now(),
  check (split_part(object_path, '/', 1) = invitation_id::text)
);
create table public.gift_methods (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.plans (
  id text primary key check (id in ('mandiri', 'assisted')),
  display_name text not null,
  amount_idr bigint not null check (amount_idr > 0),
  features jsonb not null,
  active boolean not null default false
);
insert into public.plans(id, display_name, amount_idr, features) values
  ('mandiri', 'Cerita Mandiri', 249000, '{"guestLimit":500,"photoLimit":20,"maxRevisions":0}'),
  ('assisted', 'Dirangkai Bersama', 599000, '{"guestLimit":500,"photoLimit":20,"maxRevisions":2}');
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id),
  owner_id uuid not null references public.profiles(id),
  plan_id text not null references public.plans(id),
  amount_idr bigint not null check (amount_idr > 0),
  status text not null default 'created' check (status in ('created', 'pending', 'paid', 'failed', 'expired', 'canceled')),
  plan_snapshot jsonb not null,
  entitlement_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (id, invitation_id)
);
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  order_id uuid not null,
  provider text not null,
  deduplication_key text not null unique,
  provider_transaction_id text not null,
  provider_status text not null,
  verified_amount_idr bigint not null,
  received_at timestamptz not null default now(),
  foreign key (order_id, invitation_id) references public.orders(id, invitation_id)
);
create table public.entitlements (
  invitation_id uuid primary key references public.invitations(id),
  order_id uuid not null,
  plan_snapshot jsonb not null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (order_id, invitation_id) references public.orders(id, invitation_id)
);
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id) on delete cascade,
  assigned_admin_id uuid references public.profiles(id),
  status text not null default 'submitted' check (status in ('submitted', 'in_progress', 'awaiting_review', 'revision_requested', 'approved', 'completed')),
  brief text not null default '',
  revision_count integer not null default 0 check (revision_count >= 0),
  approved_draft_revision integer,
  created_at timestamptz not null default now(),
  unique (id, invitation_id)
);
create table public.service_messages (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  service_request_id uuid not null,
  author_id uuid not null references public.profiles(id),
  message text not null check (char_length(message) between 1 and 3000),
  created_at timestamptz not null default now(),
  foreign key (service_request_id, invitation_id) references public.service_requests(id, invitation_id) on delete cascade
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations(id),
  actor_id uuid references public.profiles(id),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function private.can_access_invitation(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invitations i where i.id = target and i.owner_id = (select auth.uid()))
    or exists (select 1 from public.invitation_members m where m.invitation_id = target and m.user_id = (select auth.uid()));
$$;
revoke all on function private.can_access_invitation(uuid) from public;
grant execute on function private.can_access_invitation(uuid) to authenticated, service_role;

create function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name, role)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'Pasangan Tamuara'), 100), 'owner');
  return new;
end;
$$;
revoke all on function private.on_auth_user_created() from public;
create trigger create_profile_after_signup after insert on auth.users for each row execute function private.on_auth_user_created();

create function private.enforce_rsvp_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
declare allowed_count integer;
begin
  select quota into allowed_count from public.guests where id = new.guest_id and invitation_id = new.invitation_id for share;
  if allowed_count is null or new.attending_count > allowed_count then raise exception 'RSVP exceeds guest quota'; end if;
  return new;
end;
$$;
revoke all on function private.enforce_rsvp_quota() from public;
create trigger validate_rsvp_quota before insert or update on public.rsvps for each row execute function private.enforce_rsvp_quota();

alter table public.profiles enable row level security;
create policy profile_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
alter table public.invitations enable row level security;
create policy invitation_member_read on public.invitations for select to authenticated using (private.can_access_invitation(id));
alter table public.plans enable row level security;
create policy plans_active_read on public.plans for select to anon, authenticated using (active);

do $$
declare tab text;
begin
  foreach tab in array array['invitation_members','invitation_drafts','invitation_publications','events','guests','guest_events','rsvps','messages','media_assets','gift_methods','orders','payment_events','entitlements','service_requests','service_messages','audit_logs']
  loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('create policy member_read on public.%I for select to authenticated using (private.can_access_invitation(invitation_id))', tab);
    execute format('create index %I on public.%I (invitation_id)', tab || '_invitation_idx', tab);
  end loop;
end $$;

-- Explicit grants: authenticated clients can read only rows permitted by RLS.
-- No public table accepts browser-originated writes. Service-role handlers must recheck auth and membership.
revoke all on public.profiles, public.invitations, public.invitation_members, public.invitation_drafts,
  public.invitation_publications, public.events, public.guests, public.guest_events, public.rsvps,
  public.messages, public.media_assets, public.gift_methods, public.plans, public.orders,
  public.payment_events, public.entitlements, public.service_requests, public.service_messages, public.audit_logs from anon, authenticated;
grant select on public.profiles, public.invitations, public.invitation_members, public.invitation_drafts,
  public.invitation_publications, public.events, public.guests, public.guest_events, public.rsvps,
  public.messages, public.media_assets, public.gift_methods, public.plans, public.orders,
  public.payment_events, public.entitlements, public.service_requests, public.service_messages, public.audit_logs to authenticated;
grant select on public.plans to anon;
grant all on public.profiles, public.invitations, public.invitation_members, public.invitation_drafts,
  public.invitation_publications, public.events, public.guests, public.guest_events, public.rsvps,
  public.messages, public.media_assets, public.gift_methods, public.plans, public.orders,
  public.payment_events, public.entitlements, public.service_requests, public.service_messages, public.audit_logs to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tamuara-private', 'tamuara-private', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy tamuara_member_media_read on storage.objects for select to authenticated
using (bucket_id = 'tamuara-private' and case
  when split_part(name, '/', 1) ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  then private.can_access_invitation(split_part(name, '/', 1)::uuid)
  else false end);
commit;

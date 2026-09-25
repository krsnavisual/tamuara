-- An assigned_admin membership is valid only while the member is a platform admin.
-- This closes direct table and Storage reads after an admin role is revoked.
begin;

create or replace function private.can_access_invitation(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invitations i
    where i.id = target and i.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.invitation_members m
    join public.profiles p on p.id = m.user_id
    where m.invitation_id = target
      and m.user_id = (select auth.uid())
      and (m.role = 'editor' or (m.role = 'assigned_admin' and p.role = 'admin'))
  );
$$;
revoke all on function private.can_access_invitation(uuid) from public;
grant execute on function private.can_access_invitation(uuid) to authenticated, service_role;

commit;

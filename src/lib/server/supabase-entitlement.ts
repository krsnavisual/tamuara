import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredInvitation } from "./store";

interface EntitlementAuthority {
  invitation_id: string;
  order_id: string;
  expires_at: string;
  orders: {
    id: string;
    invitation_id: string;
    owner_id: string;
    plan_id: string;
    status: string;
    entitlement_expires_at: string;
  };
  invitations: { id: string; owner_id: string };
}

/** JSON documents are display snapshots; SQL payment records authorize access. */
export async function hasActiveSupabaseEntitlement(
  admin: SupabaseClient,
  invitation: StoredInvitation,
): Promise<boolean> {
  const snapshot = invitation.entitlement;
  if (!snapshot || Date.parse(snapshot.expiresAt) <= Date.now()) return false;
  const result = await admin
    .from("entitlements")
    .select(
      "invitation_id,order_id,expires_at,orders!inner(id,invitation_id,owner_id,plan_id,status,entitlement_expires_at),invitations!inner(id,owner_id)",
    )
    .eq("invitation_id", invitation.id)
    .maybeSingle();
  // A missing or unavailable payment record can never grant public access.
  if (result.error || !result.data) return false;
  const row = result.data as unknown as EntitlementAuthority;
  const order = row.orders;
  const owner = row.invitations;
  const now = Date.now();
  return (
    row.invitation_id === invitation.id &&
    Date.parse(snapshot.expiresAt) > now &&
    Date.parse(row.expires_at) > now &&
    !!order &&
    !!owner &&
    owner.id === invitation.id &&
    owner.owner_id === invitation.ownerId &&
    order.id === row.order_id &&
    order.id === snapshot.orderId &&
    order.invitation_id === invitation.id &&
    order.owner_id === owner.owner_id &&
    order.status === "paid" &&
    (order.plan_id === "mandiri" || order.plan_id === "assisted") &&
    order.plan_id === snapshot.plan &&
    Date.parse(order.entitlement_expires_at) > now
  );
}

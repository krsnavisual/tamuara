import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoredInvitation } from "../src/lib/server/store";
import { hasActiveSupabaseEntitlement } from "../src/lib/server/supabase-entitlement";

function fixture() {
  const invitation = {
    id: "11111111-1111-4111-8111-111111111111",
    ownerId: "22222222-2222-4222-8222-222222222222",
    entitlement: {
      orderId: "33333333-3333-4333-8333-333333333333",
      plan: "mandiri",
      expiresAt: "2031-12-12T00:00:00.000Z",
    },
  } as StoredInvitation;
  const row = {
    invitation_id: invitation.id,
    order_id: invitation.entitlement!.orderId,
    expires_at: invitation.entitlement!.expiresAt,
    orders: {
      id: invitation.entitlement!.orderId,
      invitation_id: invitation.id,
      owner_id: invitation.ownerId,
      plan_id: "mandiri",
      status: "paid",
      entitlement_expires_at: invitation.entitlement!.expiresAt,
    },
    invitations: { id: invitation.id, owner_id: invitation.ownerId },
  };
  let missing = false;
  let failed = false;
  const admin = {
    from(table: string) {
      assert.equal(table, "entitlements");
      return {
        select(columns: string) {
          assert.match(columns, /orders!inner/);
          assert.match(columns, /invitations!inner/);
          return {
            eq(column: string, value: string) {
              assert.equal(column, "invitation_id");
              assert.equal(value, invitation.id);
              return {
                async maybeSingle() {
                  return {
                    data: missing ? null : row,
                    error: failed ? { code: "unavailable" } : null,
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return {
    row,
    invitation,
    authorized: () => hasActiveSupabaseEntitlement(admin, invitation),
    remove: () => {
      missing = true;
    },
    fail: () => {
      failed = true;
    },
  };
}

test("SQL payment authority accepts both paid plans with matching invitation and snapshot", async () => {
  const data = fixture();
  assert.equal(await data.authorized(), true);
  data.row.orders.plan_id = "assisted";
  data.invitation.entitlement!.plan = "assisted";
  assert.equal(await data.authorized(), true);
});

test("SQL payment authority rejects revoked, unpaid, expired and misbound records", async (t) => {
  const cases: Array<[string, (data: ReturnType<typeof fixture>) => void]> = [
    ["entitlement deleted", (data) => data.remove()],
    ["database unavailable", (data) => data.fail()],
    [
      "entitlement expired",
      (data) => {
        data.row.expires_at = "2000-01-01";
      },
    ],
    [
      "order expired",
      (data) => {
        data.row.orders.entitlement_expires_at = "2000-01-01";
      },
    ],
    [
      "order canceled",
      (data) => {
        data.row.orders.status = "canceled";
      },
    ],
    [
      "order pending",
      (data) => {
        data.row.orders.status = "pending";
      },
    ],
    [
      "wrong order invitation",
      (data) => {
        data.row.orders.invitation_id = "foreign";
      },
    ],
    [
      "wrong entitlement invitation",
      (data) => {
        data.row.invitation_id = "foreign";
      },
    ],
    [
      "wrong order owner",
      (data) => {
        data.row.orders.owner_id = "foreign";
      },
    ],
    [
      "wrong document owner",
      (data) => {
        data.invitation.ownerId = "foreign";
      },
    ],
    [
      "wrong SQL invitation",
      (data) => {
        data.row.invitations.id = "foreign";
      },
    ],
    [
      "unknown plan",
      (data) => {
        data.row.orders.plan_id = "custom";
      },
    ],
    [
      "snapshot plan mismatch",
      (data) => {
        data.invitation.entitlement!.plan = "assisted";
      },
    ],
    [
      "snapshot order mismatch",
      (data) => {
        data.invitation.entitlement!.orderId = "foreign";
      },
    ],
    [
      "foreign joined order",
      (data) => {
        data.row.orders.id = "foreign";
      },
    ],
    [
      "invalid SQL expiry",
      (data) => {
        data.row.expires_at = "invalid";
      },
    ],
    [
      "invalid snapshot expiry",
      (data) => {
        data.invitation.entitlement!.expiresAt = "invalid";
      },
    ],
    [
      "missing snapshot",
      (data) => {
        data.invitation.entitlement = undefined;
      },
    ],
  ];
  for (const [name, mutate] of cases)
    await t.test(name, async () => {
      const data = fixture();
      mutate(data);
      assert.equal(await data.authorized(), false);
    });
});

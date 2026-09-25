import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../src/lib/server/errors";
import {
  makeStoredGuest,
  type StoredInvitation,
} from "../src/lib/server/store";
import { createSupabaseWorkspaceAdapter } from "../src/lib/server/supabase-workspace";
import type { User } from "../src/lib/types";

const key = "1a".repeat(32);
const ownerA: User = {
  id: "11000000-0000-4000-8000-000000000001",
  email: "a@example.test",
  name: "Pasangan A",
  role: "owner",
};
const ownerB: User = {
  id: "11000000-0000-4000-8000-000000000002",
  email: "b@example.test",
  name: "Pasangan B",
  role: "owner",
};

type Row = Record<string, unknown>;

function fixture() {
  const tables: Record<string, Row[]> = {
    invitations: [],
    invitation_members: [],
    invitation_documents: [],
  };
  const commits: Row[] = [];
  let conflictOnce = false;

  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select(_columns: string) {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return query;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return query;
      },
      async maybeSingle() {
        const row = tables[table].find((item) =>
          filters.every((filter) => filter(item)),
        );
        return { data: row ? structuredClone(row) : null, error: null };
      },
      then<T>(resolve: (value: { data: Row[]; error: null }) => T) {
        const rows = tables[table].filter((row) =>
          filters.every((filter) => filter(row)),
        );
        return Promise.resolve(
          resolve({ data: structuredClone(rows), error: null }),
        );
      },
    };
    return query;
  }

  const admin = {
    from,
    async rpc(name: string, args: Row) {
      assert.equal(name, "commit_invitation_document");
      commits.push(structuredClone(args));
      const id = args.p_invitation_id;
      const state = structuredClone(args.p_state) as StoredInvitation;
      const expected = args.p_expected_version as number;
      const row = tables.invitation_documents.find(
        (entry) => entry.invitation_id === id,
      );
      if (conflictOnce) {
        conflictOnce = false;
        return {
          data: null,
          error: { code: "P0001", message: "INVITATION_VERSION_CONFLICT" },
        };
      }
      if (expected === 0 && !row) {
        if (tables.invitations.some((entry) => entry.slug === state.slug))
          return {
            data: null,
            error: { code: "23505", message: "duplicate slug" },
          };
        tables.invitations.push({
          id,
          owner_id: state.ownerId,
          slug: state.slug,
          status: state.status,
        });
        tables.invitation_documents.push({
          invitation_id: id,
          state,
          version: 1,
        });
        return { data: 1, error: null };
      }
      if (!row || row.version !== expected)
        return {
          data: null,
          error: { code: "P0001", message: "INVITATION_VERSION_CONFLICT" },
        };
      row.state = state;
      row.version = expected + 1;
      const metadata = tables.invitations.find((entry) => entry.id === id)!;
      metadata.slug = state.slug;
      metadata.status = state.status;
      return { data: row.version, error: null };
    },
  } as unknown as SupabaseClient;

  const adapter = createSupabaseWorkspaceAdapter({ admin, key });
  return {
    adapter,
    tables,
    commits,
    conflictNext() {
      conflictOnce = true;
    },
    state(): StoredInvitation {
      return tables.invitation_documents[0].state as StoredInvitation;
    },
  };
}

function hasStatus(status: number) {
  return (error: unknown) =>
    error instanceof AppError && error.status === status;
}

test("Supabase adapter lists only owned invitations and audits verified actor", async () => {
  const data = fixture();
  const created = await data.adapter.mutateWorkspace(ownerA, {
    action: "create",
    payload: { brideName: "Ayu", groomName: "Bima", theme: "classic" },
  });
  assert.equal(created.mode, "supabase");
  assert.equal(created.invitations.length, 1);
  assert.equal((await data.adapter.getWorkspace(ownerB)).invitations.length, 0);
  assert.equal(data.commits[0].p_actor_id, ownerA.id);
  assert.equal(data.commits[0].p_action, "invitation.create");
  await assert.rejects(
    data.adapter.mutateWorkspace(ownerB, {
      action: "archive",
      invitationId: created.invitations[0].id,
    }),
    hasStatus(404),
  );
  assert.equal(data.commits.length, 1);
});

test("Supabase adapter uses document CAS and blocks production demo payment", async () => {
  const data = fixture();
  const created = await data.adapter.mutateWorkspace(ownerA, {
    action: "create",
    payload: { brideName: "Ayu", groomName: "Bima", theme: "classic" },
  });
  const invitation = created.invitations[0];
  await assert.rejects(
    data.adapter.mutateWorkspace(ownerA, {
      action: "checkout",
      invitationId: invitation.id,
      payload: { plan: "mandiri" },
    }),
    hasStatus(503),
  );
  data.conflictNext();
  await assert.rejects(
    data.adapter.mutateWorkspace(ownerA, {
      action: "regeneratePreview",
      invitationId: invitation.id,
      version: invitation.version,
    }),
    hasStatus(409),
  );
  assert.equal(data.state().version, invitation.version);
  const updated = await data.adapter.mutateWorkspace(ownerA, {
    action: "regeneratePreview",
    invitationId: invitation.id,
    version: invitation.version,
  });
  assert.equal(updated.invitations[0].version, invitation.version + 1);
  assert.equal(data.commits.at(-1)?.p_expected_version, 1);
  assert.equal(data.commits.at(-1)?.p_action, "invitation.regeneratePreview");
});

test("Supabase assistance waits for a real admin assignment and preserves one already assigned", async () => {
  const data = fixture();
  const created = await data.adapter.mutateWorkspace(ownerA, {
    action: "create",
    payload: { brideName: "Ayu", groomName: "Bima", theme: "classic" },
  });
  const invitationId = created.invitations[0].id;
  data.state().entitlement = {
    orderId: "TEST-ASSISTED",
    plan: "assisted",
    guestLimit: 500,
    photoLimit: 20,
    maxRevisions: 2,
    expiresAt: "2031-12-12T00:00:00.000Z",
  };

  const submitted = await data.adapter.mutateWorkspace(ownerA, {
    action: "requestAssistance",
    invitationId,
    payload: { brief: "Bantu menata cerita pernikahan kami." },
  });
  assert.equal(submitted.invitations[0].service.status, "submitted");
  assert.equal(submitted.invitations[0].assignedAdminId, undefined);
  assert.equal(
    (data.commits.at(-1)?.p_state as StoredInvitation).assignedAdminId,
    undefined,
  );

  const realAdminId = "11000000-0000-4000-8000-000000000003";
  data.state().assignedAdminId = realAdminId;
  const resubmitted = await data.adapter.mutateWorkspace(ownerA, {
    action: "requestAssistance",
    invitationId,
    payload: { brief: "Bantu juga memeriksa foto pilihan kami." },
  });
  assert.equal(resubmitted.invitations[0].assignedAdminId, realAdminId);
  assert.equal(
    (data.commits.at(-1)?.p_state as StoredInvitation).assignedAdminId,
    realAdminId,
  );
});

test("Supabase public adapter scopes guest access and retries an RSVP conflict", async () => {
  const data = fixture();
  await data.adapter.mutateWorkspace(ownerA, {
    action: "create",
    payload: { brideName: "Ayu", groomName: "Bima", theme: "classic" },
  });
  const state = data.state();
  const event = state.content.events[0];
  event.date = "2030-12-12";
  event.location = "Bogor";
  state.content.rsvpDeadline = "2030-12-10";
  state.guests.push(
    makeStoredGuest(
      {
        name: "Sahabat",
        group: "Teman",
        quota: 2,
        eventIds: [event.id],
        sent: false,
      },
      key,
    ),
  );
  state.published = {
    content: structuredClone(state.content),
    theme: state.theme,
    revision: state.version,
    publishedAt: new Date().toISOString(),
  };
  state.entitlement = {
    orderId: "TEST",
    plan: "mandiri",
    guestLimit: 500,
    photoLimit: 20,
    maxRevisions: 0,
    expiresAt: "2031-12-12T00:00:00.000Z",
  };
  state.status = "published";
  data.tables.invitations[0].status = "published";
  const token = (await data.adapter.getWorkspace(ownerA)).invitations[0]
    .guests[0].token;

  const anonymous = await data.adapter.getPublicInvitation(state.slug);
  assert.equal(anonymous.guest, undefined);
  assert.deepEqual(anonymous.rsvps, []);
  await assert.rejects(
    data.adapter.getPublicInvitation(
      state.slug,
      "invalid-guest-token-" + "x".repeat(40),
    ),
    hasStatus(404),
  );
  data.conflictNext();
  const response = await data.adapter.mutatePublicInvitation(state.slug, {
    action: "rsvp",
    guestToken: token,
    eventId: event.id,
    status: "attending",
    count: 2,
  });
  assert.equal(response.mode, "supabase");
  assert.equal(response.rsvps[0].count, 2);
  assert.equal(data.state().rsvps.length, 1);
  assert.equal(data.commits.at(-1)?.p_actor_id, null);
  assert.equal(data.commits.at(-1)?.p_action, "public.rsvp");

  await data.adapter.mutatePublicInvitation(state.slug, {
    action: "wish",
    guestToken: token,
    message: "Selamat berbahagia!",
  });
  const commitsAfterWish = data.commits.length;
  await data.adapter.mutatePublicInvitation(state.slug, {
    action: "wish",
    guestToken: token,
    message: "Selamat berbahagia!",
  });
  assert.equal(data.commits.length, commitsAfterWish);
  assert.equal(data.state().wishes.length, 1);
});

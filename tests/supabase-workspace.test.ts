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
const assignedAdmin: User = {
  id: "11000000-0000-4000-8000-000000000003",
  email: "admin@example.test",
  name: "Admin Pendamping",
  role: "admin",
};

type Row = Record<string, unknown>;

function fixture() {
  const tables: Record<string, Row[]> = {
    invitations: [],
    invitation_members: [],
    invitation_documents: [],
    media_assets: [],
    entitlements: [],
  };
  const commits: Row[] = [];
  let conflictOnce = false;
  let onConflict: (() => void) | undefined;

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
        onConflict?.();
        onConflict = undefined;
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
    conflictNext(callback?: () => void) {
      conflictOnce = true;
      onConflict = callback;
    },
    activateEntitlement() {
      const state = tables.invitation_documents[0].state as StoredInvitation;
      assert.ok(state.entitlement);
      tables.entitlements.push({
        invitation_id: state.id,
        order_id: state.entitlement.orderId,
        expires_at: state.entitlement.expiresAt,
        orders: {
          id: state.entitlement.orderId,
          invitation_id: state.id,
          owner_id: state.ownerId,
          plan_id: state.entitlement.plan,
          status: "paid",
          entitlement_expires_at: state.entitlement.expiresAt,
        },
        invitations: { id: state.id, owner_id: state.ownerId },
      });
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
  assert.equal(data.commits.at(-1)?.p_action, "invitation.regenerate_preview");
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
  assert.equal(data.commits.at(-1)?.p_action, "invitation.request_assistance");

  data.state().service.status = "in_progress";
  const commitsBeforeRetry = data.commits.length;
  await assert.rejects(
    data.adapter.mutateWorkspace(ownerA, {
      action: "requestAssistance",
      invitationId,
      payload: { brief: "Jangan kembali ke antrean." },
    }),
    hasStatus(409),
  );
  assert.equal(data.state().service.status, "in_progress");
  assert.equal(data.commits.length, commitsBeforeRetry);
});

test("Supabase save accepts media from its invitation and rejects another couple's media", async () => {
  const data = fixture();
  const first = (
    await data.adapter.mutateWorkspace(ownerA, {
      action: "create",
      payload: { brideName: "Ayu", groomName: "Bima", theme: "classic" },
    })
  ).invitations[0];
  const second = (
    await data.adapter.mutateWorkspace(ownerB, {
      action: "create",
      payload: { brideName: "Citra", groomName: "Dewa", theme: "floral" },
    })
  ).invitations[0];
  const ownMediaId = "22000000-0000-4000-8000-000000000001";
  const foreignMediaId = "22000000-0000-4000-8000-000000000002";
  for (const [id, invitationId] of [
    [ownMediaId, first.id],
    [foreignMediaId, second.id],
  ])
    data.tables.media_assets.push({
      id,
      invitation_id: invitationId,
      object_path: `${invitationId}/${id}.webp`,
      mime_type: "image/webp",
      size_bytes: 1024,
      created_at: new Date().toISOString(),
    });

  const saved = await data.adapter.mutateWorkspace(ownerA, {
    action: "save",
    invitationId: first.id,
    version: first.version,
    payload: {
      content: {
        ...first.content,
        coverUrl: `/api/media/${ownMediaId}`,
        gallery: [`/api/media/${ownMediaId}`],
      },
      theme: first.theme,
      slug: first.slug,
    },
  });
  assert.equal(
    saved.invitations[0].content.coverUrl,
    `/api/media/${ownMediaId}`,
  );

  const commitsAfterSave = data.commits.length;
  await assert.rejects(
    data.adapter.mutateWorkspace(ownerA, {
      action: "save",
      invitationId: first.id,
      version: saved.invitations[0].version,
      payload: {
        content: {
          ...saved.invitations[0].content,
          gallery: [`/api/media/${foreignMediaId}`],
        },
        theme: first.theme,
        slug: first.slug,
      },
    }),
    hasStatus(403),
  );
  assert.equal(data.commits.length, commitsAfterSave);
});

test("assigned admin can save media belonging to the assigned invitation", async () => {
  const data = fixture();
  const invitation = (
    await data.adapter.mutateWorkspace(ownerA, {
      action: "create",
      payload: { brideName: "Ayu", groomName: "Bima", theme: "classic" },
    })
  ).invitations[0];
  const mediaId = "22000000-0000-4000-8000-000000000003";
  data.state().assignedAdminId = assignedAdmin.id;
  data.tables.invitation_members.push({
    invitation_id: invitation.id,
    user_id: assignedAdmin.id,
    role: "assigned_admin",
  });
  data.tables.media_assets.push({
    id: mediaId,
    invitation_id: invitation.id,
    object_path: `${invitation.id}/${mediaId}.webp`,
    mime_type: "image/webp",
    size_bytes: 1024,
    created_at: new Date().toISOString(),
  });
  const updated = await data.adapter.mutateWorkspace(assignedAdmin, {
    action: "save",
    invitationId: invitation.id,
    version: invitation.version,
    payload: {
      content: { ...invitation.content, coverUrl: `/api/media/${mediaId}` },
      theme: invitation.theme,
      slug: invitation.slug,
    },
  });
  assert.equal(
    updated.invitations[0].content.coverUrl,
    `/api/media/${mediaId}`,
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
  event.address = "Jalan Pernikahan 1, Bogor";
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
  data.activateEntitlement();
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

  // SQL expiration must revoke access even when the JSON snapshot stays active.
  const authority = data.tables.entitlements[0];
  authority.expires_at = "2000-01-01T00:00:00.000Z";
  await assert.rejects(
    data.adapter.getPublicInvitation(state.slug, token),
    hasStatus(404),
  );
  await assert.rejects(
    data.adapter.mutatePublicInvitation(state.slug, {
      action: "wish",
      guestToken: token,
      message: "Tidak boleh tersimpan setelah paket dicabut.",
    }),
    hasStatus(404),
  );
  await assert.rejects(
    data.adapter.mutateWorkspace(ownerA, {
      action: "publish",
      invitationId: state.id,
      version: data.state().version,
    }),
    hasStatus(402),
  );
  assert.equal(data.commits.length, commitsAfterWish);

  authority.expires_at = state.entitlement.expiresAt;
  await data.adapter.mutateWorkspace(ownerA, {
    action: "publish",
    invitationId: state.id,
    version: data.state().version,
  });
  const commitsBeforeRetry = data.commits.length;
  data.conflictNext(() => {
    data.tables.entitlements.length = 0;
  });
  await assert.rejects(
    data.adapter.mutatePublicInvitation(state.slug, {
      action: "rsvp",
      guestToken: token,
      eventId: event.id,
      status: "declined",
      count: 0,
    }),
    hasStatus(404),
  );
  // The first CAS failed; the second attempt must re-check payment authority.
  assert.equal(data.commits.length, commitsBeforeRetry + 1);
  assert.equal(data.state().rsvps[0].status, "attending");
  await assert.rejects(
    data.adapter.getPublicInvitation(state.slug),
    hasStatus(404),
  );
});

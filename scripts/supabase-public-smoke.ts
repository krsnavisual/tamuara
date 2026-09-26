/** Real-provider publication and guest checks; uses only the parent run's fixtures. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { Invitation, PublicInvitation, Workspace } from "../src/lib/types";

type Cookie = { name: string; value: string };

function request(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  cookies: Cookie[] = [],
) {
  const origin = "http://127.0.0.1:3001";
  const result = new NextRequest(`${origin}${path}`, {
    method,
    headers: {
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of cookies) result.cookies.set(cookie.name, cookie.value);
  return result;
}

export async function runPublicFlowSmoke({
  admin,
  invitationId,
  ownerCookies,
  adminCookies,
  otherOwnerCookies,
  mediaUrl,
  mediaId,
}: {
  admin: SupabaseClient;
  invitationId: string;
  ownerCookies: Cookie[];
  adminCookies: Cookie[];
  otherOwnerCookies: Cookie[];
  mediaUrl: string;
  mediaId: string;
}) {
  const { GET: workspaceGet, POST: workspacePost } =
    await import("../src/app/api/workspace/route");
  const { GET: publicGet, POST: publicPost } =
    await import("../src/app/api/public/[slug]/route");
  const { GET: mediaGet } = await import("../src/app/api/media/[id]/route");
  const mediaContext = { params: Promise.resolve({ id: mediaId }) };
  async function current(cookies = ownerCookies): Promise<Invitation> {
    const response = await workspaceGet(
      request("/api/workspace", "GET", undefined, cookies),
    );
    assert.equal(response.status, 200, "Load publication workspace failed");
    const result = ((await response.json()) as Workspace).invitations.find(
      (item) => item.id === invitationId,
    );
    assert.ok(result, "Publication invitation was missing");
    return result;
  }
  async function mutate(
    action: string,
    payload: Record<string, unknown> = {},
    cookies = ownerCookies,
    version?: number,
  ) {
    const response = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        {
          action,
          invitationId,
          payload,
          ...(version === undefined ? {} : { version }),
        },
        cookies,
      ),
    );
    assert.equal(response.status, 200, `Publication mutation ${action} failed`);
    return ((await response.json()) as Workspace).invitations.find(
      (item) => item.id === invitationId,
    )!;
  }
  let invitation = await current();
  const content = structuredClone(invitation.content);
  content.opening = "Versi terbit sintetis";
  content.events[0] = {
    ...content.events[0],
    date: "2027-10-20",
    location: "Taman Uji",
    address: "Alamat sintetis",
  };
  const eventA = content.events[0].id;
  const eventB = randomUUID();
  content.events.push({
    ...content.events[0],
    id: eventB,
    title: "Acara keluarga",
    time: "15:00",
    endTime: "17:00",
  });
  content.gifts = [
    {
      id: randomUUID(),
      bank: "Bank Uji",
      name: "Pasangan Sintetis",
      number: "1234567890",
    },
  ];
  content.showGifts = false;
  content.rsvpDeadline = "2027-10-19";
  invitation = await mutate(
    "save",
    { content, theme: invitation.theme, slug: invitation.slug },
    adminCookies,
    invitation.version,
  );
  const prematureApproval = await workspacePost(
    request(
      "/api/workspace",
      "POST",
      {
        action: "updateService",
        invitationId,
        version: invitation.version,
        payload: { status: "approved" },
      },
      ownerCookies,
    ),
  );
  assert.equal(
    prematureApproval.status,
    400,
    "Owner approved before admin review",
  );
  invitation = await mutate(
    "updateService",
    { status: "awaiting_review" },
    adminCookies,
  );
  invitation = await mutate(
    "updateService",
    { status: "approved" },
    ownerCookies,
    invitation.version,
  );
  const adminPublish = await workspacePost(
    request(
      "/api/workspace",
      "POST",
      { action: "publish", invitationId, version: invitation.version },
      adminCookies,
    ),
  );
  assert.equal(adminPublish.status, 403, "Admin published owner's invitation");
  const stalePublish = await workspacePost(
    request(
      "/api/workspace",
      "POST",
      { action: "publish", invitationId, version: invitation.version - 1 },
      ownerCookies,
    ),
  );
  assert.equal(
    stalePublish.status,
    409,
    "Stale publication version was accepted",
  );
  invitation = await mutate("publish", {}, ownerCookies, invitation.version);
  const slug = invitation.slug;
  const context = { params: Promise.resolve({ slug }) };
  const path = `/api/public/${slug}`;
  async function read(token?: string) {
    return publicGet(
      request(
        `${path}${token ? `?guest=${encodeURIComponent(token)}` : ""}`,
        "GET",
      ),
      context,
    );
  }
  async function answer(input: Record<string, unknown>) {
    return publicPost(request(path, "POST", input), context);
  }
  async function snapshotCount() {
    const result = await admin
      .from("invitation_publications")
      .select("id", { count: "exact", head: true })
      .eq("invitation_id", invitationId);
    assert.ifError(result.error);
    return result.count;
  }
  assert.equal(
    await snapshotCount(),
    1,
    "Initial publication snapshot was not created once",
  );
  const metadata = await admin
    .from("invitations")
    .select("active_publication_id")
    .eq("id", invitationId)
    .single();
  assert.ifError(metadata.error);
  assert.ok(metadata.data.active_publication_id);
  const anonymous = await read();
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.headers.get("cache-control"), "no-store");
  const publicView = (await anonymous.json()) as PublicInvitation;
  assert.equal(publicView.content.opening, content.opening);
  assert.deepEqual(publicView.content.gifts, []);
  assert.deepEqual(publicView.rsvps, []);
  assert.equal(publicView.guest, undefined);
  for (const field of [
    "ownerId",
    "assignedAdminId",
    "orders",
    "guests",
    "previewToken",
    "service",
    "entitlement",
  ])
    assert.equal(field in publicView, false, `Public output exposed ${field}`);
  const publicMedia = await mediaGet(request(mediaUrl, "GET"), mediaContext);
  assert.equal(publicMedia.status, 200, "Published media was unavailable");
  assert.equal(publicMedia.headers.get("cache-control"), "private, no-store");

  invitation = await mutate("addGuests", {
    guests: [
      { name: "Tamu A", group: "Sahabat", quota: 2, eventIds: [eventA] },
      { name: "Tamu B", group: "Keluarga", quota: 1, eventIds: [eventB] },
    ],
  });
  const guestA = invitation.guests[0];
  const guestB = invitation.guests[1];
  const scoped = await read(guestA.token);
  assert.equal(scoped.status, 200);
  const scopedView = (await scoped.json()) as PublicInvitation;
  assert.deepEqual(
    scopedView.content.events.map((event) => event.id),
    [eventA],
  );
  assert.equal(scopedView.guest?.quota, 2);
  assert.equal("token" in scopedView.guest!, false);
  assert.equal(
    (
      await answer({
        action: "rsvp",
        eventId: eventA,
        status: "attending",
        count: 1,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await answer({
        action: "rsvp",
        guestToken: guestA.token,
        eventId: eventB,
        status: "attending",
        count: 1,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await answer({
        action: "rsvp",
        guestToken: guestA.token,
        eventId: eventA,
        status: "attending",
        count: 3,
      })
    ).status,
    400,
  );

  const otherCreate = await workspacePost(
    request(
      "/api/workspace",
      "POST",
      {
        action: "create",
        payload: {
          brideName: `Other ${randomUUID().slice(0, 6)}`,
          groomName: "Owner",
          theme: "minimal",
        },
      },
      otherOwnerCookies,
    ),
  );
  assert.equal(otherCreate.status, 200);
  const otherInvitation = ((await otherCreate.json()) as Workspace)
    .invitations[0];
  const otherGuests = await workspacePost(
    request(
      "/api/workspace",
      "POST",
      {
        action: "addGuests",
        invitationId: otherInvitation.id,
        payload: {
          guests: [
            {
              name: "Other tenant guest",
              group: "Uji",
              quota: 1,
              eventIds: [otherInvitation.content.events[0].id],
            },
          ],
        },
      },
      otherOwnerCookies,
    ),
  );
  assert.equal(otherGuests.status, 200);
  const foreignToken = ((await otherGuests.json()) as Workspace).invitations[0]
    .guests[0].token;
  assert.equal(
    (await read(foreignToken)).status,
    404,
    "Foreign invitation token opened publication",
  );
  assert.equal(
    (
      await answer({
        action: "rsvp",
        guestToken: foreignToken,
        eventId: eventA,
        status: "attending",
        count: 1,
      })
    ).status,
    404,
  );

  const beforeRsvp = await current();
  const concurrent = await Promise.all([
    answer({
      action: "rsvp",
      guestToken: guestA.token,
      eventId: eventA,
      status: "attending",
      count: 2,
    }),
    answer({
      action: "rsvp",
      guestToken: guestB.token,
      eventId: eventB,
      status: "attending",
      count: 1,
    }),
  ]);
  for (const result of concurrent)
    assert.equal(result.status, 200, "Concurrent RSVP lost a write");
  const afterConcurrent = await current();
  assert.equal(afterConcurrent.rsvps.length, 2);
  assert.equal(
    afterConcurrent.version,
    beforeRsvp.version,
    "RSVP changed editor revision",
  );
  const repeated = await answer({
    action: "rsvp",
    guestToken: guestA.token,
    eventId: eventA,
    status: "attending",
    count: 1,
  });
  assert.equal(repeated.status, 200);
  const repeatedView = (await repeated.json()) as PublicInvitation;
  assert.equal(repeatedView.rsvps.length, 1);
  assert.equal(repeatedView.rsvps[0].count, 1);
  const wish = {
    action: "wish",
    guestToken: guestA.token,
    message: "Selamat untuk pasangan sintetis",
  };
  const pending = await answer(wish);
  assert.equal(pending.status, 200);
  assert.deepEqual(((await pending.json()) as PublicInvitation).wishes, []);
  assert.equal((await answer(wish)).status, 200);
  invitation = await current();
  assert.equal(invitation.wishes.length, 1, "Duplicate wish was stored twice");
  invitation = await mutate("moderateWish", {
    wishId: invitation.wishes[0].id,
    status: "approved",
  });
  const moderated = await read();
  const moderatedView = (await moderated.json()) as PublicInvitation;
  assert.equal(moderatedView.wishes.length, 1);
  assert.equal(moderatedView.wishes[0].guestId, "");
  assert.deepEqual(moderatedView.rsvps, []);
  assert.equal(
    await snapshotCount(),
    1,
    "Guest activity created extra publication snapshots",
  );

  invitation = await mutate("regenerateGuestToken", { guestId: guestA.id });
  const newGuestToken = invitation.guests.find(
    (guest) => guest.id === guestA.id,
  )!.token;
  assert.notEqual(newGuestToken, guestA.token);
  assert.equal((await read(guestA.token)).status, 404);
  assert.equal(
    (
      await answer({
        action: "wish",
        guestToken: guestA.token,
        message: "Token lama",
      })
    ).status,
    404,
  );
  assert.equal((await read(newGuestToken)).status, 200);

  const editedContent = {
    ...invitation.content,
    opening: "Draf yang diperbarui",
  };
  invitation = await mutate(
    "save",
    { content: editedContent, theme: "floral", slug },
    ownerCookies,
    invitation.version,
  );
  const unchangedPublic = await read();
  const unchangedView = (await unchangedPublic.json()) as PublicInvitation;
  assert.equal(
    unchangedView.content.opening,
    content.opening,
    "Draft edit leaked into published snapshot",
  );
  assert.equal(unchangedView.theme, publicView.theme);
  assert.equal(await snapshotCount(), 1);
  invitation = await mutate("unpublish");
  assert.equal((await read()).status, 404);
  assert.equal(
    (await mediaGet(request(mediaUrl, "GET"), mediaContext)).status,
    404,
  );
  const unpublishedMetadata = await admin
    .from("invitations")
    .select("active_publication_id")
    .eq("id", invitationId)
    .single();
  assert.ifError(unpublishedMetadata.error);
  assert.equal(unpublishedMetadata.data.active_publication_id, null);
  invitation = await mutate("publish", {}, ownerCookies, invitation.version);
  assert.equal(
    await snapshotCount(),
    2,
    "Republish did not create one new snapshot",
  );
  const updatedPublic = await read();
  assert.equal(
    ((await updatedPublic.json()) as PublicInvitation).content.opening,
    editedContent.opening,
  );

  const entitlement = await admin
    .from("entitlements")
    .select("expires_at")
    .eq("invitation_id", invitationId)
    .single();
  assert.ifError(entitlement.error);
  const expired = await admin
    .from("entitlements")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("invitation_id", invitationId);
  assert.ifError(expired.error);
  assert.equal(
    (await read()).status,
    404,
    "Expired SQL entitlement still serves publication",
  );
  assert.equal(
    (await mediaGet(request(mediaUrl, "GET"), mediaContext)).status,
    404,
    "Expired SQL entitlement still serves public media",
  );
  assert.equal(
    (
      await answer({
        action: "rsvp",
        guestToken: newGuestToken,
        eventId: eventA,
        status: "declined",
        count: 0,
      })
    ).status,
    404,
  );
  const deniedPublish = await workspacePost(
    request(
      "/api/workspace",
      "POST",
      { action: "publish", invitationId, version: invitation.version },
      ownerCookies,
    ),
  );
  assert.equal(
    deniedPublish.status,
    402,
    "Expired SQL entitlement allowed publication",
  );
  const restored = await admin
    .from("entitlements")
    .update({ expires_at: entitlement.data.expires_at })
    .eq("invitation_id", invitationId);
  assert.ifError(restored.error);
  assert.equal((await read()).status, 200);
  invitation = await mutate("deleteGuest", { guestId: guestA.id });
  assert.equal((await read(newGuestToken)).status, 404);
  assert.equal(
    (
      await answer({
        action: "wish",
        guestToken: newGuestToken,
        message: "Tamu dihapus",
      })
    ).status,
    404,
  );
  invitation = await mutate("archive");
  assert.equal((await read()).status, 404);
  assert.equal(
    (await mediaGet(request(mediaUrl, "GET"), mediaContext)).status,
    404,
  );
  await mutate("unpublish");
}

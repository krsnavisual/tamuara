import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { authenticate, logout } from "../src/lib/server/auth";
import { getWorkspace, mutateWorkspace } from "../src/lib/server/workspace";
import {
  getPreview,
  getPublicInvitation,
  mutatePublicInvitation,
} from "../src/lib/server/public";
import { readMedia, uploadMedia } from "../src/lib/server/media";
import { AppError, ensureLocalMode } from "../src/lib/server/errors";
import type { Invitation } from "../src/lib/types";

let directory: string;
const previousDirectory = process.env.TAMUARA_DATA_DIR;
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "tamuara-backend-"));
  process.env.TAMUARA_DATA_DIR = directory;
});
after(async () => {
  if (previousDirectory === undefined) delete process.env.TAMUARA_DATA_DIR;
  else process.env.TAMUARA_DATA_DIR = previousDirectory;
  await fs.rm(directory, { recursive: true, force: true });
});
const fails = (status: number) => (error: unknown) =>
  error instanceof AppError && error.status === status;

async function customer(label: string) {
  return authenticate({
    action: "register",
    name: `Pasangan ${label}`,
    email: `${label}@example.test`,
    password: "password-test-123",
  });
}
async function create(token: string, bride = "Dina", groom = "Raka") {
  return (
    await mutateWorkspace(token, {
      action: "create",
      payload: { brideName: bride, groomName: groom, theme: "classic" },
    })
  ).invitations[0];
}
async function fill(token: string, invitation: Invitation) {
  const content = structuredClone(invitation.content);
  content.events[0] = {
    ...content.events[0],
    date: "2030-06-12",
    location: "Gedung Contoh",
    address: "Jalan Contoh 10",
  };
  return (
    await mutateWorkspace(token, {
      action: "save",
      invitationId: invitation.id,
      version: invitation.version,
      payload: { content, theme: invitation.theme, slug: invitation.slug },
    })
  ).invitations.find((entry) => entry.id === invitation.id)!;
}
async function pay(token: string, invitation: Invitation, plan = "mandiri") {
  let item = (
    await mutateWorkspace(token, {
      action: "checkout",
      invitationId: invitation.id,
      payload: { plan },
    })
  ).invitations.find((entry) => entry.id === invitation.id)!;
  item = (
    await mutateWorkspace(token, {
      action: "demoPay",
      invitationId: item.id,
      payload: { orderId: item.orders.at(-1)!.id },
    })
  ).invitations.find((entry) => entry.id === invitation.id)!;
  return item;
}
async function publish(token: string, invitation: Invitation) {
  return (
    await mutateWorkspace(token, {
      action: "publish",
      invitationId: invitation.id,
      version: invitation.version,
    })
  ).invitations.find((entry) => entry.id === invitation.id)!;
}

test("authenticated owners cannot read or mutate another invitation; registration cannot escalate role", async () => {
  const a = await customer("isolation-a");
  const b = await customer("isolation-b");
  const invitation = await create(a.token);
  assert.equal((await getWorkspace(b.token)).invitations.length, 0);
  await assert.rejects(
    mutateWorkspace(b.token, {
      action: "unpublish",
      invitationId: invitation.id,
    }),
    fails(404),
  );
  await assert.rejects(getWorkspace("forged-token"), fails(401));
  const injected = await authenticate({
    action: "register",
    name: "Role test",
    email: "role-test@example.test",
    password: "password-test-123",
    role: "admin",
  });
  assert.equal(injected.user.role, "owner");
  const admin = await authenticate({ action: "demo", role: "admin" });
  assert.ok(
    !(await getWorkspace(admin.token)).invitations.some(
      (entry) => entry.id === invitation.id,
    ),
  );
  await logout(a.token);
  await assert.rejects(getWorkspace(a.token), fails(401));
});

test("checkout is server priced, payment is idempotent, publication explicit, drafts isolated and versions checked", async () => {
  const owner = await customer("publication");
  let invitation = await fill(owner.token, await create(owner.token));
  await assert.rejects(publish(owner.token, invitation), fails(402));
  const checkout = await mutateWorkspace(owner.token, {
    action: "checkout",
    invitationId: invitation.id,
    payload: { plan: "mandiri", amount: 1, status: "paid" },
  });
  invitation = checkout.invitations[0];
  assert.equal(invitation.orders[0].amount, 249000);
  assert.equal(invitation.orders[0].status, "pending");
  invitation = await pay(owner.token, invitation);
  await mutateWorkspace(owner.token, {
    action: "demoPay",
    invitationId: invitation.id,
    payload: { orderId: invitation.orders[0].id },
  });
  assert.equal(
    (await getWorkspace(owner.token)).invitations[0].orders.length,
    1,
  );
  assert.equal(invitation.status, "draft");
  await assert.rejects(getPublicInvitation(invitation.slug), fails(404));
  invitation = await publish(owner.token, invitation);
  const before = await getPublicInvitation(invitation.slug);
  const oldVersion = invitation.version;
  const content = { ...invitation.content, opening: "Perubahan privat" };
  invitation = (
    await mutateWorkspace(owner.token, {
      action: "save",
      invitationId: invitation.id,
      version: oldVersion,
      payload: { content, theme: invitation.theme, slug: invitation.slug },
    })
  ).invitations[0];
  assert.equal(
    (await getPublicInvitation(invitation.slug)).content.opening,
    before.content.opening,
  );
  assert.equal(
    (await getPreview(invitation.previewToken)).content.opening,
    "Perubahan privat",
  );
  await assert.rejects(
    mutateWorkspace(owner.token, {
      action: "save",
      invitationId: invitation.id,
      version: oldVersion,
      payload: { content, theme: invitation.theme, slug: invitation.slug },
    }),
    fails(409),
  );
  const previousPreview = invitation.previewToken;
  invitation = (
    await mutateWorkspace(owner.token, {
      action: "regeneratePreview",
      invitationId: invitation.id,
    })
  ).invitations[0];
  await assert.rejects(getPreview(previousPreview), fails(404));
  assert.equal((await getPreview(invitation.previewToken)).preview, true);
  invitation = await publish(owner.token, invitation);
  assert.equal(
    (await getPublicInvitation(invitation.slug)).content.opening,
    "Perubahan privat",
  );
});

test("guest token scope, event permission, quotas, idempotent RSVP and moderated wishes", async () => {
  const owner = await customer("guests");
  let invitation = await publish(
    owner.token,
    await pay(owner.token, await fill(owner.token, await create(owner.token))),
  );
  invitation = (
    await mutateWorkspace(owner.token, {
      action: "addGuests",
      invitationId: invitation.id,
      payload: {
        guests: [
          {
            name: "Tamu Pertama",
            group: "Keluarga",
            quota: 2,
            eventIds: [invitation.content.events[0].id],
          },
          {
            name: "Tamu Kedua",
            group: "Sahabat",
            quota: 1,
            eventIds: [invitation.content.events[0].id],
          },
        ],
      },
    })
  ).invitations[0];
  const [guest, other] = invitation.guests;
  const eventId = invitation.content.events[0].id;
  await assert.rejects(
    mutatePublicInvitation(invitation.slug, {
      action: "rsvp",
      guestToken: guest.token,
      eventId,
      status: "attending",
      count: 3,
    }),
    fails(400),
  );
  await assert.rejects(
    mutatePublicInvitation(invitation.slug, {
      action: "rsvp",
      guestToken: guest.token,
      eventId: "another-event",
      status: "attending",
      count: 1,
    }),
    fails(403),
  );
  await assert.rejects(
    getPublicInvitation("ayu-dan-bima", guest.token),
    fails(404),
  );
  await mutatePublicInvitation(invitation.slug, {
    action: "rsvp",
    guestToken: guest.token,
    eventId,
    status: "attending",
    count: 2,
  });
  await mutatePublicInvitation(invitation.slug, {
    action: "rsvp",
    guestToken: guest.token,
    eventId,
    status: "attending",
    count: 1,
    guestId: other.id,
  });
  assert.equal(
    (await getPublicInvitation(invitation.slug, guest.token)).rsvps.length,
    1,
  );
  assert.equal(
    (await getPublicInvitation(invitation.slug, guest.token)).rsvps[0].count,
    1,
  );
  assert.equal(
    (await getPublicInvitation(invitation.slug, other.token)).rsvps.length,
    0,
  );
  const general = await getPublicInvitation(invitation.slug);
  assert.equal(general.guest, undefined);
  assert.deepEqual(general.rsvps, []);
  assert.ok(!("guests" in general));
  await mutatePublicInvitation(invitation.slug, {
    action: "wish",
    guestToken: guest.token,
    message: "Semoga berbahagia!",
    name: "Nama palsu",
  });
  await mutatePublicInvitation(invitation.slug, {
    action: "wish",
    guestToken: guest.token,
    message: "Semoga berbahagia!",
  });
  assert.equal((await getPublicInvitation(invitation.slug)).wishes.length, 0);
  invitation = (await getWorkspace(owner.token)).invitations[0];
  assert.equal(invitation.wishes.length, 1);
  assert.equal(invitation.wishes[0].name, guest.name);
  invitation = (
    await mutateWorkspace(owner.token, {
      action: "moderateWish",
      invitationId: invitation.id,
      payload: { wishId: invitation.wishes[0].id, status: "approved" },
    })
  ).invitations[0];
  assert.equal((await getPublicInvitation(invitation.slug)).wishes.length, 1);
  const oldToken = guest.token;
  invitation = (
    await mutateWorkspace(owner.token, {
      action: "regenerateGuestToken",
      invitationId: invitation.id,
      payload: { guestId: guest.id },
    })
  ).invitations[0];
  await assert.rejects(
    getPublicInvitation(invitation.slug, oldToken),
    fails(404),
  );
  assert.equal(
    (await getPublicInvitation(invitation.slug, invitation.guests[0].token))
      .rsvps[0].count,
    1,
  );
  const raw = await fs.readFile(path.join(directory, "tamuara.json"), "utf8");
  assert.ok(!raw.includes(invitation.guests[0].token));
  assert.ok(!raw.includes(invitation.previewToken));
  assert.ok(!raw.includes(owner.token));
});

test("admin assignment, review permissions, revision limits, and owner-only publish", async () => {
  const owner = await customer("assistance");
  const admin = await authenticate({ action: "demo", role: "admin" });
  let invitation = await pay(
    owner.token,
    await fill(owner.token, await create(owner.token)),
    "assisted",
  );
  assert.ok(
    (await getWorkspace(admin.token)).invitations.some(
      (entry) => entry.id === invitation.id,
    ),
  );
  await assert.rejects(publish(admin.token, invitation), fails(403));
  await assert.rejects(
    mutateWorkspace(owner.token, {
      action: "updateService",
      invitationId: invitation.id,
      payload: { status: "in_progress" },
    }),
    fails(400),
  );
  await mutateWorkspace(admin.token, {
    action: "updateService",
    invitationId: invitation.id,
    payload: { status: "in_progress" },
  });
  await mutateWorkspace(admin.token, {
    action: "updateService",
    invitationId: invitation.id,
    payload: { status: "awaiting_review" },
  });
  await mutateWorkspace(owner.token, {
    action: "updateService",
    invitationId: invitation.id,
    payload: {
      status: "revision_requested",
      message: "Tolong periksa judul acara.",
    },
  });
  invitation = (await getWorkspace(owner.token)).invitations[0];
  assert.equal(invitation.service.revisions, 1);
  await mutateWorkspace(admin.token, {
    action: "updateService",
    invitationId: invitation.id,
    payload: { status: "in_progress" },
  });
  await mutateWorkspace(admin.token, {
    action: "updateService",
    invitationId: invitation.id,
    payload: { status: "awaiting_review" },
  });
  invitation = (await getWorkspace(owner.token)).invitations[0];
  await assert.rejects(
    mutateWorkspace(owner.token, {
      action: "updateService",
      invitationId: invitation.id,
      version: invitation.version - 1,
      payload: { status: "approved" },
    }),
    fails(409),
  );
  invitation = (
    await mutateWorkspace(owner.token, {
      action: "updateService",
      invitationId: invitation.id,
      version: invitation.version,
      payload: { status: "approved" },
    })
  ).invitations[0];
  invitation = await publish(owner.token, invitation);
  assert.equal(invitation.status, "published");
});

test("media stays private until publication and cross-invitation references are rejected", async () => {
  const owner = await customer("media");
  const outsider = await customer("media-other");
  let invitation = await fill(owner.token, await create(owner.token));
  const otherInvitation = await fill(
    outsider.token,
    await create(outsider.token),
  );
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#f7e4de" },
  })
    .png()
    .toBuffer();
  const uploaded = await uploadMedia(
    owner.token,
    invitation.id,
    new File([new Uint8Array(bytes)], "image.png", { type: "image/png" }),
  );
  const mediaId = uploaded.url.split("/").at(-1)!;
  await assert.rejects(readMedia(mediaId), fails(404));
  await assert.rejects(readMedia(mediaId, outsider.token), fails(404));
  assert.equal((await readMedia(mediaId, owner.token)).mime, "image/webp");
  assert.equal(
    (await readMedia(mediaId, undefined, invitation.previewToken)).mime,
    "image/webp",
  );
  await assert.rejects(
    mutateWorkspace(outsider.token, {
      action: "save",
      invitationId: otherInvitation.id,
      version: otherInvitation.version,
      payload: {
        content: { ...otherInvitation.content, coverUrl: uploaded.url },
        theme: otherInvitation.theme,
        slug: otherInvitation.slug,
      },
    }),
    fails(403),
  );
  invitation = (
    await mutateWorkspace(owner.token, {
      action: "save",
      invitationId: invitation.id,
      version: invitation.version,
      payload: {
        content: { ...invitation.content, coverUrl: uploaded.url },
        theme: invitation.theme,
        slug: invitation.slug,
      },
    })
  ).invitations[0];
  invitation = await publish(owner.token, await pay(owner.token, invitation));
  assert.equal((await readMedia(mediaId)).mime, "image/webp");
  await mutateWorkspace(owner.token, {
    action: "unpublish",
    invitationId: invitation.id,
  });
  await assert.rejects(readMedia(mediaId), fails(404));
});

test("production fails closed without explicitly opting into local preview", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousPreview = process.env.TAMUARA_LOCAL_PREVIEW;
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.TAMUARA_LOCAL_PREVIEW;
    assert.throws(() => ensureLocalMode(), fails(503));
  } finally {
    if (previousNodeEnv === undefined)
      Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
    if (previousPreview === undefined) delete process.env.TAMUARA_LOCAL_PREVIEW;
    else process.env.TAMUARA_LOCAL_PREVIEW = previousPreview;
  }
});

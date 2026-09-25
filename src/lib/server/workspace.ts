import { randomUUID } from "node:crypto";
import type {
  Invitation,
  InvitationContent,
  Mutation,
  ServiceStatus,
  User,
  Workspace,
} from "../types";
import { PLANS } from "../catalog";
import { publicUser, requireUser } from "./auth";
import { decryptToken, encryptToken, hashToken, newToken } from "./crypto";
import { AppError, assert } from "./errors";
import {
  audit,
  makePreview,
  makeStoredGuest,
  withStore,
  type Store,
  type StoredInvitation,
} from "./store";
import {
  textValue,
  theme,
  validateContent,
  validateForPublication,
} from "./validation";

export function canAccess(invitation: StoredInvitation, user: User) {
  return (
    invitation.ownerId === user.id ||
    (user.role === "admin" && invitation.assignedAdminId === user.id)
  );
}

export function requireInvitation(
  store: Store,
  id: unknown,
  user: User,
  ownerOnly = false,
): StoredInvitation {
  const invitation = store.invitations.find(
    (entry) => entry.id === id && canAccess(entry, user),
  );
  assert(invitation, 404, "Undangan tidak ditemukan.");
  if (ownerOnly)
    assert(
      invitation.ownerId === user.id,
      403,
      "Tindakan ini hanya dapat dilakukan pemilik undangan.",
    );
  return invitation;
}

function outputInvitation(
  invitation: StoredInvitation,
  key: string,
): Invitation {
  const {
    previewTokenHash: _hash,
    previewTokenEncrypted,
    entitlement: _entitlement,
    guests,
    orders,
    ...rest
  } = invitation;
  return {
    ...rest,
    previewToken: decryptToken(previewTokenEncrypted, key),
    guests: guests.map(
      ({ tokenHash: _tokenHash, tokenEncrypted, ...guest }) => ({
        ...guest,
        token: decryptToken(tokenEncrypted, key),
      }),
    ),
    orders: orders.map(({ entitlementSnapshot: _snapshot, ...order }) => order),
  };
}

export function outputWorkspace(
  store: Store,
  user: User,
  key: string,
): Workspace {
  return {
    user: publicUser(user),
    invitations: store.invitations
      .filter((invitation) => canAccess(invitation, user))
      .map((invitation) => outputInvitation(invitation, key)),
    mode: "demo",
  };
}

export async function getWorkspace(token?: string) {
  return withStore(
    ({ store, key }) => outputWorkspace(store, requireUser(store, token), key),
    false,
  );
}

function makeSlug(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function newContent(bride: string, groom: string): InvitationContent {
  return {
    bride: { name: bride, fullName: bride, parents: "" },
    groom: { name: groom, fullName: groom, parents: "" },
    opening:
      "Dengan penuh rasa syukur dan bahagia, kami mengundang Anda untuk menjadi bagian dari hari istimewa kami.",
    closing: "Kehadiran dan doa restu Anda adalah hadiah terindah bagi kami.",
    coverUrl: "/images/wedding-cover.jpg",
    gallery: [],
    events: [
      {
        id: randomUUID(),
        title: "Resepsi Pernikahan",
        date: "",
        time: "11:00",
        endTime: "14:00",
        timezone: "Asia/Jakarta",
        location: "",
        address: "",
        mapUrl: "",
      },
    ],
    stories: [],
    gifts: [],
    showGifts: false,
    musicUrl: "",
    rsvpDeadline: "",
  };
}

function ownerOnly(invitation: StoredInvitation, user: User) {
  assert(
    invitation.ownerId === user.id,
    403,
    "Tindakan ini hanya dapat dilakukan pemilik undangan.",
  );
}

function activeEntitlement(invitation: StoredInvitation) {
  assert(
    invitation.entitlement &&
      new Date(invitation.entitlement.expiresAt).getTime() > Date.now(),
    402,
    "Aktifkan paket undangan sebelum menerbitkan.",
    "PAYMENT_REQUIRED",
  );
  return invitation.entitlement;
}

function inputPayload(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    400,
    "Data tindakan tidak valid.",
  );
  return value as Record<string, unknown>;
}

export async function mutateWorkspace(
  token: string | undefined,
  input: Mutation,
) {
  return withStore(({ store, key }) =>
    mutateWorkspaceInStore(store, requireUser(store, token), key, input, {
      assistanceAdminId: "demo-admin",
    }),
  );
}

export function mutateWorkspaceInStore(
  store: Store,
  user: User,
  key: string,
  input: Mutation,
  options: { assistanceAdminId?: string } = {},
) {
  const payload = inputPayload(input.payload);
  const now = new Date().toISOString();
  if (input.action === "create") {
    assert(
      user.role === "owner",
      403,
      "Pembuatan undangan dilakukan dari akun pasangan.",
    );
    assert(
      store.invitations.filter((entry) => entry.ownerId === user.id).length <
        20,
      400,
      "Batas 20 undangan untuk akun pengembangan sudah tercapai.",
    );
    const bride = textValue(payload.brideName, "Nama mempelai", 100, true);
    const groom = textValue(payload.groomName, "Nama mempelai", 100, true);
    let slug = makeSlug(`${bride}-dan-${groom}`) || "kisah-kami";
    if (store.invitations.some((entry) => entry.slug === slug))
      slug += `-${randomUUID().slice(0, 6)}`;
    const invitation: StoredInvitation = {
      id: randomUUID(),
      ownerId: user.id,
      slug,
      status: "draft",
      theme: theme(payload.theme),
      content: newContent(bride, groom),
      version: 1,
      guests: [],
      rsvps: [],
      wishes: [],
      orders: [],
      service: { status: "none", brief: "", revisions: 0, messages: [] },
      ...makePreview(key),
      createdAt: now,
      updatedAt: now,
    };
    store.invitations.unshift(invitation);
    audit(store, invitation.id, user.id, "invitation.created");
    return outputWorkspace(store, user, key);
  }
  const invitation = requireInvitation(store, input.invitationId, user);
  if (input.action === "save" || input.action === "publish")
    assert(
      Number.isInteger(input.version),
      400,
      "Versi draf diperlukan. Muat ulang undangan.",
    );
  if (input.version !== undefined)
    assert(
      input.version === invitation.version,
      409,
      "Undangan telah diubah. Muat ulang sebelum menyimpan agar perubahan tidak tertimpa.",
      "VERSION_CONFLICT",
    );
  switch (input.action) {
    case "save": {
      const content = validateContent(payload.content, store, invitation.id);
      const nextTheme = theme(payload.theme);
      const slug = textValue(payload.slug, "Alamat undangan", 80, true);
      assert(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
        400,
        "Alamat undangan hanya boleh berisi huruf kecil, angka, dan tanda hubung.",
      );
      assert(
        !invitation.published || slug === invitation.slug,
        400,
        "Alamat undangan yang pernah diterbitkan tidak dapat diganti agar tautan tamu tetap berlaku.",
      );
      assert(
        !store.invitations.some(
          (entry) => entry.id !== invitation.id && entry.slug === slug,
        ),
        409,
        "Alamat undangan sudah digunakan.",
      );
      if (
        JSON.stringify(content.gifts) !==
        JSON.stringify(invitation.content.gifts)
      )
        audit(store, invitation.id, user.id, "gift_details.changed");
      invitation.content = content;
      invitation.theme = nextTheme;
      invitation.slug = slug;
      if (
        invitation.service.status === "approved" ||
        invitation.service.status === "completed"
      )
        invitation.service.status = "awaiting_review";
      break;
    }
    case "publish": {
      ownerOnly(invitation, user);
      activeEntitlement(invitation);
      validateForPublication(invitation.content);
      invitation.published = {
        content: structuredClone(invitation.content),
        theme: invitation.theme,
        revision: invitation.version,
        publishedAt: now,
      };
      invitation.status = "published";
      if (invitation.service.status !== "none")
        invitation.service.status = "approved";
      break;
    }
    case "unpublish":
      ownerOnly(invitation, user);
      invitation.status = "draft";
      break;
    case "archive":
      ownerOnly(invitation, user);
      invitation.status = "archived";
      break;
    case "addGuests": {
      assert(
        Array.isArray(payload.guests) &&
          payload.guests.length > 0 &&
          payload.guests.length <= 500,
        400,
        "Tambahkan 1–500 penerima sekaligus.",
      );
      assert(
        invitation.guests.length + payload.guests.length <=
          (invitation.entitlement?.guestLimit ?? 500),
        400,
        "Batas 500 penerima undangan tercapai.",
      );
      const validEvents = new Set(
        invitation.content.events.map((event) => event.id),
      );
      for (const entry of payload.guests) {
        const item = inputPayload(entry);
        const name = textValue(item.name, "Nama penerima", 160, true);
        const group = textValue(item.group ?? "Umum", "Grup", 80);
        assert(
          typeof item.quota === "number" &&
            Number.isInteger(item.quota) &&
            item.quota >= 1 &&
            item.quota <= 20,
          400,
          "Kuota penerima harus 1–20 orang.",
        );
        assert(
          Array.isArray(item.eventIds) &&
            item.eventIds.length > 0 &&
            item.eventIds.every(
              (id) => typeof id === "string" && validEvents.has(id),
            ),
          400,
          "Pilih acara yang tersedia untuk penerima.",
        );
        invitation.guests.push(
          makeStoredGuest(
            {
              name,
              group,
              quota: item.quota,
              eventIds: [...new Set(item.eventIds as string[])],
              sent: false,
            },
            key,
          ),
        );
      }
      break;
    }
    case "updateGuest": {
      const guest = invitation.guests.find(
        (entry) => entry.id === payload.guestId,
      );
      assert(guest, 404, "Penerima tidak ditemukan.");
      assert(
        typeof payload.sent === "boolean",
        400,
        "Penanda terkirim tidak valid.",
      );
      guest.sent = payload.sent;
      break;
    }
    case "deleteGuest": {
      assert(
        invitation.guests.some((entry) => entry.id === payload.guestId),
        404,
        "Penerima tidak ditemukan.",
      );
      invitation.guests = invitation.guests.filter(
        (entry) => entry.id !== payload.guestId,
      );
      invitation.rsvps = invitation.rsvps.filter(
        (entry) => entry.guestId !== payload.guestId,
      );
      invitation.wishes = invitation.wishes.filter(
        (entry) => entry.guestId !== payload.guestId,
      );
      break;
    }
    case "regenerateGuestToken": {
      const guest = invitation.guests.find(
        (entry) => entry.id === payload.guestId,
      );
      assert(guest, 404, "Penerima tidak ditemukan.");
      const guestToken = newToken();
      guest.tokenHash = hashToken(guestToken);
      guest.tokenEncrypted = encryptToken(guestToken, key);
      break;
    }
    case "regeneratePreview":
      Object.assign(invitation, makePreview(key));
      break;
    case "moderateWish": {
      const wish = invitation.wishes.find(
        (entry) => entry.id === payload.wishId,
      );
      assert(wish, 404, "Ucapan tidak ditemukan.");
      assert(
        payload.status === "approved" ||
          payload.status === "hidden" ||
          payload.status === "pending",
        400,
        "Status ucapan tidak valid.",
      );
      wish.status = payload.status;
      break;
    }
    case "checkout": {
      ownerOnly(invitation, user);
      assert(
        payload.plan === "mandiri" || payload.plan === "assisted",
        400,
        "Paket tidak tersedia.",
      );
      const plan = PLANS.find((entry) => entry.id === payload.plan)!;
      if (
        invitation.entitlement &&
        new Date(invitation.entitlement.expiresAt).getTime() > Date.now()
      ) {
        assert(
          invitation.entitlement.plan === "mandiri" && plan.id === "assisted",
          400,
          "Paket ini sudah aktif.",
        );
      }
      assert(
        invitation.content.events.length > 0 &&
          invitation.content.events.every((event) => event.date),
        400,
        "Isi tanggal acara sebelum checkout agar masa aktif paket dapat ditentukan.",
      );
      const pending = invitation.orders.find(
        (order) => order.plan === plan.id && order.status === "pending",
      );
      if (pending) return outputWorkspace(store, user, key);
      const id = `DEMO-${randomUUID()}`;
      const eventDate = invitation.content.events
        .map((event) => event.date)
        .sort()
        .at(-1)!;
      const expires = new Date(`${eventDate}T23:59:59+07:00`);
      expires.setUTCFullYear(expires.getUTCFullYear() + 1);
      const expiresAt =
        invitation.entitlement?.expiresAt || expires.toISOString();
      const amount =
        plan.price -
        (invitation.entitlement?.plan === "mandiri"
          ? PLANS.find((entry) => entry.id === "mandiri")!.price
          : 0);
      invitation.orders.push({
        id,
        plan: plan.id,
        amount,
        status: "pending",
        createdAt: now,
        entitlementSnapshot: {
          orderId: id,
          plan: plan.id,
          guestLimit: 500,
          photoLimit: 20,
          maxRevisions: plan.id === "assisted" ? 2 : 0,
          expiresAt,
        },
      });
      break;
    }
    case "demoPay": {
      ownerOnly(invitation, user);
      const order = invitation.orders.find(
        (entry) => entry.id === payload.orderId,
      );
      assert(
        order && order.id.startsWith("DEMO-"),
        404,
        "Pesanan simulasi tidak ditemukan.",
      );
      if (order.status === "paid") return outputWorkspace(store, user, key);
      assert(
        order.status === "pending" && order.entitlementSnapshot,
        400,
        "Pesanan tidak dapat diaktifkan.",
      );
      order.status = "paid";
      order.paidAt = now;
      invitation.entitlement = structuredClone(order.entitlementSnapshot);
      invitation.expiresAt = invitation.entitlement.expiresAt;
      if (order.plan === "assisted") {
        invitation.assignedAdminId = "demo-admin";
        if (invitation.service.status === "none")
          invitation.service.status = "submitted";
      }
      break;
    }
    case "requestAssistance": {
      ownerOnly(invitation, user);
      assert(
        activeEntitlement(invitation).plan === "assisted",
        402,
        "Aktifkan paket Dirangkai Bersama untuk mendapatkan bantuan admin.",
      );
      const brief = textValue(payload.brief, "Brief", 5000, true);
      invitation.service.brief = brief;
      invitation.service.status = "submitted";
      invitation.assignedAdminId ??= options.assistanceAdminId;
      break;
    }
    case "updateService": {
      assert(
        invitation.service.status !== "none",
        400,
        "Layanan bantuan belum diaktifkan.",
      );
      if (payload.status === "approved")
        assert(
          Number.isInteger(input.version),
          400,
          "Versi draf diperlukan untuk persetujuan. Muat ulang undangan.",
        );
      if (payload.message !== undefined) {
        const message = textValue(payload.message, "Pesan", 3000, true);
        assert(
          invitation.service.messages.length < 500,
          400,
          "Batas pesan layanan tercapai.",
        );
        invitation.service.messages.push({
          id: randomUUID(),
          author: user.name,
          text: message,
          createdAt: now,
        });
      }
      if (payload.status !== undefined) {
        const status = payload.status as ServiceStatus;
        const current = invitation.service.status;
        if (user.id === invitation.ownerId) {
          assert(
            (status === "revision_requested" || status === "approved") &&
              current === "awaiting_review",
            400,
            "Persetujuan atau revisi tersedia setelah admin mengirim draf untuk diperiksa.",
          );
          if (status === "revision_requested") {
            assert(
              invitation.service.revisions <
                (invitation.entitlement?.maxRevisions ?? 2),
              400,
              "Dua putaran revisi sudah digunakan. Hubungi tim untuk bantuan tambahan.",
            );
            invitation.service.revisions += 1;
          }
        } else {
          const allowed =
            (status === "in_progress" &&
              ["submitted", "revision_requested"].includes(current)) ||
            (status === "awaiting_review" && current === "in_progress") ||
            (status === "completed" && current === "approved");
          assert(allowed, 400, "Perubahan tahapan layanan tidak sesuai.");
        }
        invitation.service.status = status;
      }
      break;
    }
    default:
      throw new AppError(400, "Tindakan tidak dikenal.");
  }
  invitation.version += 1;
  invitation.updatedAt = now;
  audit(store, invitation.id, user.id, `invitation.${input.action}`);
  return outputWorkspace(store, user, key);
}

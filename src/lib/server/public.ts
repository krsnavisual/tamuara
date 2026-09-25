import { randomUUID } from "node:crypto";
import type { PublicInvitation, RSVP } from "../types";
import { hashToken } from "./crypto";
import { AppError, assert } from "./errors";
import {
  withStore,
  type Store,
  type StoredGuest,
  type StoredInvitation,
} from "./store";
import { textValue } from "./validation";

export function isPublic(invitation: StoredInvitation) {
  return (
    invitation.status === "published" &&
    !!invitation.published &&
    !!invitation.entitlement &&
    new Date(invitation.entitlement.expiresAt).getTime() > Date.now()
  );
}

function findPublic(store: Store, slug: string) {
  const invitation = store.invitations.find(
    (entry) => entry.slug === slug && isPublic(entry),
  );
  assert(
    invitation?.published,
    404,
    "Undangan belum terbit atau sudah tidak aktif.",
  );
  return invitation;
}

function findGuest(invitation: StoredInvitation, token?: string) {
  if (!token) return undefined;
  assert(
    token.length >= 32 && token.length <= 100,
    404,
    "Tautan penerima tidak valid.",
  );
  const guest = invitation.guests.find(
    (entry) => entry.tokenHash === hashToken(token),
  );
  assert(guest, 404, "Tautan penerima tidak valid atau sudah diganti.");
  return guest;
}

function publicOutput(
  invitation: StoredInvitation,
  guest?: StoredGuest,
): PublicInvitation {
  const content = structuredClone(invitation.published!.content);
  if (!content.showGifts) content.gifts = [];
  if (guest)
    content.events = content.events.filter((event) =>
      guest.eventIds.includes(event.id),
    );
  return {
    slug: invitation.slug,
    theme: invitation.published!.theme,
    content,
    guest: guest
      ? {
          id: guest.id,
          name: guest.name,
          quota: guest.quota,
          eventIds: guest.eventIds.filter((id) =>
            content.events.some((event) => event.id === id),
          ),
        }
      : undefined,
    rsvps: guest
      ? invitation.rsvps.filter(
          (entry) =>
            entry.guestId === guest.id &&
            content.events.some((event) => event.id === entry.eventId),
        )
      : [],
    wishes: invitation.wishes
      .filter((entry) => entry.status === "approved")
      .map((entry) => ({ ...entry, guestId: "" })),
    preview: false,
    mode: "demo",
  };
}

export async function getPublicInvitation(slug: string, guestToken?: string) {
  return withStore(
    ({ store }) => publicInvitationFromStore(store, slug, guestToken),
    false,
  );
}

export function publicInvitationFromStore(
  store: Store,
  slug: string,
  guestToken?: string,
) {
  const invitation = findPublic(store, slug);
  return publicOutput(invitation, findGuest(invitation, guestToken));
}

export async function getPreview(token: string) {
  return withStore(({ store }) => previewFromStore(store, token), false);
}

export function previewFromStore(store: Store, token: string) {
  assert(
    token.length >= 32 && token.length <= 100,
    404,
    "Pratinjau tidak ditemukan.",
  );
  const invitation = store.invitations.find(
    (entry) =>
      entry.previewTokenHash === hashToken(token) &&
      entry.status !== "archived",
  );
  assert(invitation, 404, "Tautan pratinjau tidak valid atau sudah diganti.");
  const content = structuredClone(invitation.content);
  const previewUrl = (url: string) =>
    url.startsWith("/api/media/")
      ? `${url}?preview=${encodeURIComponent(token)}`
      : url;
  content.coverUrl = previewUrl(content.coverUrl);
  content.gallery = content.gallery.map(previewUrl);
  if (!content.showGifts) content.gifts = [];
  return {
    slug: invitation.slug,
    theme: invitation.theme,
    content,
    rsvps: [],
    wishes: [],
    preview: true,
    mode: "demo",
  } satisfies PublicInvitation;
}

export async function mutatePublicInvitation(
  slug: string,
  input: Record<string, unknown>,
) {
  return withStore(({ store }) =>
    mutatePublicInvitationInStore(store, slug, input),
  );
}

export function mutatePublicInvitationInStore(
  store: Store,
  slug: string,
  input: Record<string, unknown>,
) {
  const invitation = findPublic(store, slug);
  assert(
    typeof input.guestToken === "string" && input.guestToken.length <= 100,
    403,
    "Buka tautan pribadi Anda untuk mengirim jawaban.",
  );
  const guest = findGuest(invitation, input.guestToken);
  assert(guest, 403, "Tautan pribadi diperlukan.");
  const now = new Date().toISOString();
  if (input.action === "rsvp") {
    const event = invitation.published!.content.events.find(
      (entry) =>
        entry.id === input.eventId && guest.eventIds.includes(entry.id),
    );
    assert(event, 403, "Acara ini tidak tersedia untuk penerima tersebut.");
    const deadline = invitation.published!.content.rsvpDeadline;
    const offset =
      event.timezone === "Asia/Jayapura"
        ? "+09:00"
        : event.timezone === "Asia/Makassar"
          ? "+08:00"
          : "+07:00";
    if (deadline)
      assert(
        Date.now() <= new Date(`${deadline}T23:59:59${offset}`).getTime(),
        400,
        "Batas waktu konfirmasi kehadiran telah berakhir.",
      );
    assert(
      input.status === "attending" || input.status === "declined",
      400,
      "Pilih hadir atau tidak hadir.",
    );
    assert(
      typeof input.count === "number" && Number.isInteger(input.count),
      400,
      "Jumlah kehadiran tidak valid.",
    );
    assert(
      input.status === "declined"
        ? input.count === 0
        : input.count >= 1 && input.count <= guest.quota,
      400,
      `Jumlah hadir maksimal ${guest.quota} orang; pilih 0 untuk tidak hadir.`,
    );
    const rsvp: RSVP = {
      guestId: guest.id,
      eventId: event.id,
      status: input.status,
      count: input.count,
      updatedAt: now,
    };
    const index = invitation.rsvps.findIndex(
      (entry) => entry.guestId === guest.id && entry.eventId === event.id,
    );
    if (index >= 0) invitation.rsvps[index] = rsvp;
    else invitation.rsvps.push(rsvp);
  } else if (input.action === "wish") {
    const message = textValue(input.message, "Ucapan", 1000, true);
    assert(message.length >= 2, 400, "Ucapan minimal dua karakter.");
    if (
      !invitation.wishes.some(
        (entry) => entry.guestId === guest.id && entry.message === message,
      )
    ) {
      assert(
        invitation.wishes.filter((entry) => entry.guestId === guest.id).length <
          5,
        400,
        "Maksimal lima ucapan per penerima.",
      );
      invitation.wishes.push({
        id: randomUUID(),
        guestId: guest.id,
        name: guest.name,
        message,
        status: "pending",
        createdAt: now,
      });
    }
  } else throw new AppError(400, "Tindakan tidak dikenal.");
  return publicOutput(invitation, guest);
}

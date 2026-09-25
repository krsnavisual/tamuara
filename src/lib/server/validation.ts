import { z } from "zod";
import type { InvitationContent, ThemeId } from "../types";
import { AppError, assert } from "./errors";
import type { Store } from "./store";

const short = z.string().trim().max(200);
const date = z
  .string()
  .refine(
    (value) =>
      value === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
        new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value),
    "Tanggal tidak valid",
  );
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const safeUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (!value) return true;
    if (/^\/images\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes(".."))
      return true;
    if (/^\/api\/media\/[a-f0-9-]{36}$/.test(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Gunakan URL HTTPS atau gambar yang diunggah.");
const person = z.object({
  name: short,
  fullName: short,
  parents: z.string().trim().max(400),
});
const schema = z.object({
  bride: person,
  groom: person,
  opening: z.string().max(3000),
  closing: z.string().max(3000),
  coverUrl: safeUrl,
  gallery: z.array(safeUrl).max(20),
  events: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: short,
        date,
        time,
        endTime: time.or(z.literal("")),
        timezone: z.enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"]),
        location: short,
        address: z.string().max(1000),
        mapUrl: safeUrl,
      }),
    )
    .max(5),
  stories: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: short,
        date: z.string().max(100),
        body: z.string().max(3000),
      }),
    )
    .max(10),
  gifts: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        bank: short,
        name: short,
        number: z.string().trim().max(100),
      }),
    )
    .max(5),
  showGifts: z.boolean(),
  musicUrl: safeUrl,
  rsvpDeadline: date,
});

export function validateContent(
  value: unknown,
  store: Store,
  invitationId: string,
): InvitationContent {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new AppError(
      400,
      `Isi undangan tidak valid: ${parsed.error.issues[0]?.path.join(".") || "konten"}.`,
    );
  const content = parsed.data;
  assert(
    new Set(content.events.map((event) => event.id)).size ===
      content.events.length,
    400,
    "ID acara harus berbeda.",
  );
  const urls = [content.coverUrl, content.musicUrl, ...content.gallery];
  for (const url of urls) {
    if (url.startsWith("/api/media/"))
      assert(
        store.media.some(
          (asset) =>
            asset.id === url.split("/").at(-1) &&
            asset.invitationId === invitationId,
        ),
        403,
        "Gambar bukan milik undangan ini.",
      );
  }
  return content;
}

export function validateForPublication(content: InvitationContent) {
  assert(
    content.bride.name &&
      content.groom.name &&
      content.bride.fullName &&
      content.groom.fullName,
    400,
    "Lengkapi nama kedua mempelai sebelum menerbitkan.",
  );
  assert(content.events.length > 0, 400, "Tambahkan minimal satu acara.");
  for (const event of content.events) {
    assert(
      event.title && event.date && event.location && event.address,
      400,
      "Lengkapi nama, tanggal, tempat, dan alamat setiap acara.",
    );
    assert(
      !event.endTime || event.endTime > event.time,
      400,
      "Jam selesai acara harus setelah jam mulai.",
    );
  }
  if (content.showGifts)
    assert(
      content.gifts.length > 0 &&
        content.gifts.every((gift) => gift.bank && gift.name && gift.number),
      400,
      "Lengkapi detail rekening hadiah atau nonaktifkan amplop digital.",
    );
}

export function theme(value: unknown): ThemeId {
  assert(
    value === "classic" || value === "floral" || value === "minimal",
    400,
    "Tema tidak tersedia.",
  );
  return value;
}

export function textValue(
  value: unknown,
  field: string,
  max = 200,
  required = false,
) {
  assert(
    typeof value === "string" &&
      value.length <= max &&
      (!required || value.trim().length > 0),
    400,
    `${field} tidak valid.`,
  );
  return value.trim();
}

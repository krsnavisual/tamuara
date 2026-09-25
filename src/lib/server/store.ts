import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { Guest, Invitation, Order, User } from "../types";
import { encryptToken, hashToken, newToken } from "./crypto";
import { ensureLocalMode } from "./errors";

export interface StoredUser extends User {
  passwordHash?: string;
  demo?: boolean;
}
export interface StoredGuest extends Omit<Guest, "token"> {
  tokenHash: string;
  tokenEncrypted: string;
}
export interface Entitlement {
  orderId: string;
  plan: "mandiri" | "assisted";
  guestLimit: number;
  photoLimit: number;
  maxRevisions: number;
  expiresAt: string;
}
export interface StoredOrder extends Order {
  entitlementSnapshot?: Entitlement;
}
export interface StoredInvitation extends Omit<
  Invitation,
  "guests" | "previewToken" | "orders"
> {
  guests: StoredGuest[];
  orders: StoredOrder[];
  previewTokenHash: string;
  previewTokenEncrypted: string;
  entitlement?: Entitlement;
}
export interface AuditEntry {
  id: string;
  invitationId: string;
  actorId: string;
  action: string;
  createdAt: string;
  detail?: string;
}
export interface MediaAsset {
  id: string;
  invitationId: string;
  filename: string;
  mime: string;
  size: number;
  createdAt: string;
}
export interface Store {
  schemaVersion: 1;
  users: StoredUser[];
  sessions: { tokenHash: string; userId: string; expiresAt: string }[];
  invitations: StoredInvitation[];
  audit: AuditEntry[];
  media: MediaAsset[];
}
export interface StoreContext {
  store: Store;
  key: string;
  directory: string;
}
const globalState = globalThis as typeof globalThis & {
  tamuaraWrites?: Map<string, Promise<unknown>>;
};
const queues = (globalState.tamuaraWrites ??= new Map());

export function dataDirectory() {
  return path.resolve(
    /* turbopackIgnore: true */
    process.env.TAMUARA_DATA_DIR || path.join(process.cwd(), ".data"),
  );
}

export function makeStoredGuest(
  input: Omit<Guest, "token" | "id">,
  key: string,
): StoredGuest {
  const token = newToken();
  return {
    ...input,
    id: randomUUID(),
    tokenHash: hashToken(token),
    tokenEncrypted: encryptToken(token, key),
  };
}

export function makePreview(key: string) {
  const token = newToken();
  return {
    previewTokenHash: hashToken(token),
    previewTokenEncrypted: encryptToken(token, key),
  };
}

function seed(key: string): Store {
  const now = new Date().toISOString();
  const eventId = "event-resepsi-demo";
  const guestA = makeStoredGuest(
    {
      name: "Sahabat Tamuara",
      group: "Sahabat",
      quota: 2,
      eventIds: [eventId],
      sent: false,
    },
    key,
  );
  const guestB = makeStoredGuest(
    {
      name: "Keluarga Pratama",
      group: "Keluarga",
      quota: 4,
      eventIds: [eventId],
      sent: true,
    },
    key,
  );
  const content: Invitation["content"] = {
    bride: {
      name: "Ayu",
      fullName: "Ayu Maharani",
      parents: "Putri dari Bapak Hendra & Ibu Ratna",
    },
    groom: {
      name: "Bima",
      fullName: "Bima Pratama",
      parents: "Putra dari Bapak Wijaya & Ibu Laras",
    },
    opening:
      "Dengan penuh rasa syukur dan bahagia, kami mengundang Bapak, Ibu, serta sahabat untuk menjadi bagian dari hari istimewa kami.",
    closing:
      "Kehadiran dan doa restu Anda adalah hadiah terindah bagi perjalanan baru kami. Sampai bertemu di hari bahagia.",
    coverUrl: "/images/wedding-cover.jpg",
    gallery: ["/images/wedding-detail.jpg"],
    events: [
      {
        id: eventId,
        title: "Resepsi Pernikahan",
        date: "2026-12-12",
        time: "11:00",
        endTime: "14:00",
        timezone: "Asia/Jakarta",
        location: "Taman Kencana",
        address: "Bogor, Jawa Barat · lokasi contoh",
        mapUrl: "https://maps.google.com/?q=Taman+Kencana+Bogor",
      },
    ],
    stories: [
      {
        id: "story-demo-1",
        title: "Berawal dari pertemuan",
        date: "2022",
        body: "Pertemuan sederhana menjadi awal dari banyak cerita yang ingin kami tulis bersama.",
      },
      {
        id: "story-demo-2",
        title: "Memilih untuk bersama",
        date: "2026",
        body: "Setelah tumbuh dan belajar bersama, kami memilih melangkah menuju rumah yang sama.",
      },
    ],
    gifts: [],
    showGifts: false,
    musicUrl: "",
    rsvpDeadline: "2026-12-10",
  };
  return {
    schemaVersion: 1,
    users: [
      {
        id: "demo-owner",
        name: "Ayu & Bima",
        email: "pasangan@demo.tamuara.local",
        role: "owner",
        demo: true,
      },
      {
        id: "demo-admin",
        name: "Nadia · Tim Tamuara",
        email: "admin@demo.tamuara.local",
        role: "admin",
        demo: true,
      },
    ],
    sessions: [],
    audit: [],
    media: [],
    invitations: [
      {
        id: "invitation-demo",
        ownerId: "demo-owner",
        assignedAdminId: "demo-admin",
        slug: "ayu-dan-bima",
        status: "published",
        theme: "classic",
        content,
        published: {
          content: structuredClone(content),
          theme: "classic",
          revision: 1,
          publishedAt: now,
        },
        version: 1,
        guests: [guestA, guestB],
        rsvps: [
          {
            guestId: guestB.id,
            eventId,
            status: "attending",
            count: 3,
            updatedAt: now,
          },
        ],
        wishes: [
          {
            id: randomUUID(),
            guestId: guestB.id,
            name: guestB.name,
            message:
              "Selamat menempuh perjalanan baru. Semoga selalu penuh kasih dan kebahagiaan!",
            status: "approved",
            createdAt: now,
          },
          {
            id: randomUUID(),
            guestId: guestA.id,
            name: guestA.name,
            message:
              "Turut berbahagia untuk kalian berdua. Sampai bertemu di hari istimewa!",
            status: "pending",
            createdAt: now,
          },
        ],
        orders: [
          {
            id: "DEMO-SEED",
            plan: "assisted",
            amount: 599000,
            status: "paid",
            createdAt: now,
            paidAt: now,
          },
        ],
        service: {
          status: "in_progress",
          brief:
            "Bantu kami menyiapkan undangan yang hangat dengan nuansa klasik. Semua nama dan acara ini adalah contoh.",
          revisions: 0,
          messages: [],
        },
        ...makePreview(key),
        entitlement: {
          orderId: "DEMO-SEED",
          plan: "assisted",
          guestLimit: 500,
          photoLimit: 20,
          maxRevisions: 2,
          expiresAt: "2027-12-12T16:59:59.000Z",
        },
        createdAt: now,
        updatedAt: now,
        expiresAt: "2027-12-12T16:59:59.000Z",
      },
    ],
  };
}

async function atomicWrite(filename: string, data: string) {
  const temp = `${filename}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, data, { mode: 0o600 });
  await fs.rename(temp, filename);
}

async function load(directory: string): Promise<StoreContext> {
  await fs.mkdir(directory, { recursive: true });
  const keyfile = path.join(directory, "encryption.key");
  let key: string;
  try {
    key = (await fs.readFile(keyfile, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    key = randomBytes(32).toString("hex");
    await fs.writeFile(keyfile, key, { mode: 0o600, flag: "wx" });
  }
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new Error("Invalid local encryption key");
  let store: Store;
  try {
    store = JSON.parse(
      await fs.readFile(path.join(directory, "tamuara.json"), "utf8"),
    ) as Store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    store = seed(key);
    await atomicWrite(
      path.join(directory, "tamuara.json"),
      JSON.stringify(store, null, 2),
    );
  }
  if (store.schemaVersion !== 1)
    throw new Error("Unsupported local data schema");
  return { store, key, directory };
}

// A single-process development repository. Production uses a transactional database.
export async function withStore<T>(
  fn: (context: StoreContext) => Promise<T> | T,
  write = true,
): Promise<T> {
  ensureLocalMode();
  const directory = dataDirectory();
  const previous = queues.get(directory) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const context = await load(directory);
      const result = await fn(context);
      if (write)
        await atomicWrite(
          path.join(directory, "tamuara.json"),
          JSON.stringify(context.store, null, 2),
        );
      return result;
    });
  queues.set(directory, current);
  try {
    return await current;
  } finally {
    if (queues.get(directory) === current) queues.delete(directory);
  }
}

export function audit(
  store: Store,
  invitationId: string,
  actorId: string,
  action: string,
  detail?: string,
) {
  store.audit.push({
    id: randomUUID(),
    invitationId,
    actorId,
    action,
    detail,
    createdAt: new Date().toISOString(),
  });
}

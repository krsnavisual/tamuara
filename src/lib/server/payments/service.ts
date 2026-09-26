import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mutation, PlanId, User, Workspace } from "../../types";
import { AppError, assert } from "../errors";
import { sandboxPaymentConfig, sandboxPaymentsEnabled } from "./config";
import {
  createMidtransAdapter,
  MidtransError,
  type MidtransStatus,
} from "./midtrans";

type PaymentRecord = {
  orderId: string;
  invitationId: string;
  ownerId: string;
  planId: PlanId;
  amountIdr: number;
  currency: "IDR";
  status: string;
  redirectUrl: string | null;
  transactionId: string | null;
  expiresAt: string;
  createClaimed?: boolean;
  checkoutState: "creating" | "ready" | "uncertain";
};
type Dependencies = {
  admin: SupabaseClient;
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
};
const uuid =
  /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

export function safeSandboxRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (
      url.origin === "https://app.sandbox.midtrans.com" &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/snap/") &&
      !url.hash
    )
      return url.href;
  } catch {
    /* Invalid persisted URLs are never returned to browsers. */
  }
}

function paymentError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof MidtransError) {
    if (
      [
        "INVALID_SIGNATURE",
        "INVALID_NOTIFICATION",
        "ORDER_MISMATCH",
        "INVALID_TRANSACTION_ID",
      ].includes(error.code)
    )
      throw new AppError(
        400,
        "Notifikasi pembayaran tidak valid.",
        "INVALID_PAYMENT_NOTIFICATION",
      );
    throw new AppError(
      503,
      "Status pembayaran belum dapat dikonfirmasi. Periksa pesanan kembali sebelum mencoba pembayaran lain.",
      error.code,
    );
  }
  throw new AppError(
    503,
    "Pencatatan pembayaran belum tersedia. Coba periksa status kembali.",
    "PAYMENT_STORAGE_UNAVAILABLE",
  );
}

function databaseError(error: { message?: string } | null) {
  if (!error) return;
  const message = error.message || "";
  if (message.includes("PAYMENT_OWNER_REQUIRED"))
    throw new AppError(
      403,
      "Pembayaran hanya dapat dikelola pemilik undangan.",
    );
  if (message.includes("INVITATION_VERSION_CONFLICT"))
    throw new AppError(
      409,
      "Undangan telah berubah. Muat ulang sebelum memilih paket.",
      "VERSION_CONFLICT",
    );
  if (message.includes("PAYMENT_ORDER_NOT_FOUND"))
    throw new AppError(404, "Pesanan tidak ditemukan.");
  if (message.includes("PAYMENT_PLAN_UNAVAILABLE"))
    throw new AppError(
      503,
      "Paket belum tersedia untuk pembayaran sandbox.",
      "PAYMENT_NOT_CONFIGURED",
    );
  if (message.includes("PAYMENT_CHECKOUT_OPEN"))
    throw new AppError(
      409,
      "Periksa pesanan yang masih terbuka sebelum memilih paket lain.",
      "PAYMENT_OPEN_ORDER",
    );
  if (message.includes("PAYMENT_IDEMPOTENCY_CONFLICT"))
    throw new AppError(
      409,
      "Percobaan pembayaran ini sudah digunakan untuk paket lain.",
      "PAYMENT_IDEMPOTENCY_CONFLICT",
    );
  if (message.includes("PAYMENT_PURCHASE_UNAVAILABLE"))
    throw new AppError(
      409,
      "Paket ini sudah pernah diaktifkan. Perpanjangan belum tersedia.",
      "PAYMENT_ALREADY_ACTIVE",
    );
  if (message.includes("INVALID_PAYMENT_EVENT_DATES"))
    throw new AppError(
      400,
      "Isi tanggal dan zona waktu acara yang valid sebelum memilih paket.",
    );
  if (message.includes("INVALID_PAYMENT_CHECKOUT"))
    throw new AppError(400, "Data percobaan pembayaran tidak valid.");
  if (
    message.includes("PAYMENT_AMOUNT_MISMATCH") ||
    message.includes("PAYMENT_TRANSACTION_MISMATCH") ||
    message.includes("INVALID_VERIFIED_PAYMENT")
  )
    throw new AppError(
      400,
      "Identitas atau nominal pembayaran tidak cocok.",
      "INVALID_PAYMENT_NOTIFICATION",
    );
  throw new AppError(
    503,
    "Pencatatan pembayaran belum tersedia.",
    "PAYMENT_STORAGE_UNAVAILABLE",
  );
}

function record(value: unknown): PaymentRecord {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    503,
    "Pesanan belum dapat dibaca.",
    "PAYMENT_STORAGE_UNAVAILABLE",
  );
  const row = value as PaymentRecord;
  assert(
    uuid.test(row.orderId) &&
      uuid.test(row.invitationId) &&
      uuid.test(row.ownerId) &&
      (row.planId === "mandiri" || row.planId === "assisted") &&
      row.currency === "IDR" &&
      Number.isSafeInteger(row.amountIdr) &&
      row.amountIdr > 0 &&
      Number.isFinite(Date.parse(row.expiresAt)),
    503,
    "Pesanan belum dapat dibaca.",
    "PAYMENT_STORAGE_UNAVAILABLE",
  );
  return row;
}

export function createPaymentService(deps: Dependencies) {
  const env = deps.env ?? process.env;
  function provider() {
    return createMidtransAdapter(sandboxPaymentConfig(env), {
      fetch: deps.fetch,
    });
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await deps.admin.rpc(name, args);
    databaseError(result.error);
    return record(result.data);
  }
  async function getOrder(ownerId: string | null, orderId: unknown) {
    assert(
      typeof orderId === "string" && uuid.test(orderId),
      400,
      "ID pesanan tidak valid.",
    );
    return rpc("get_payment_checkout", {
      p_owner_id: ownerId,
      p_order_id: orderId,
    });
  }
  async function apply(row: PaymentRecord, status: MidtransStatus) {
    // The database validates the binding again under lock and commits atomically.
    return rpc("apply_verified_payment_status", {
      p_order_id: row.orderId,
      p_transaction_id: status.transactionId,
      p_amount_idr: status.amountIdr,
      p_provider_status: status.transactionStatus,
      p_payment_state: status.paymentState,
    });
  }

  return {
    async checkout(user: User, input: Mutation) {
      assert(
        user.role === "owner",
        403,
        "Pembayaran hanya dapat dikelola pemilik undangan.",
      );
      const adapter = provider(); // Configuration is checked before any reservation.
      const payload = input.payload || {};
      assert(
        typeof input.invitationId === "string" &&
          uuid.test(input.invitationId) &&
          Number.isInteger(input.version) &&
          input.version! > 0,
        400,
        "Undangan dan versi diperlukan.",
      );
      assert(
        payload.plan === "mandiri" || payload.plan === "assisted",
        400,
        "Paket tidak tersedia.",
      );
      assert(
        typeof payload.idempotencyKey === "string" &&
          uuid.test(payload.idempotencyKey),
        400,
        "ID percobaan pembayaran diperlukan.",
      );
      const row = await rpc("reserve_payment_checkout", {
        p_owner_id: user.id,
        p_invitation_id: input.invitationId,
        p_expected_editor_version: input.version,
        p_plan_id: payload.plan,
        p_idempotency_key: payload.idempotencyKey,
      });
      if (!row.createClaimed) return;
      try {
        const session = await adapter.createTransaction({
          orderId: row.orderId,
          amountIdr: row.amountIdr,
          currency: row.currency,
        });
        await rpc("save_payment_checkout_redirect", {
          p_order_id: row.orderId,
          p_redirect_url: session.redirectUrl,
        });
      } catch (error) {
        // Reservation records the one-time claim BEFORE network I/O. An uncertain
        // response or process crash must not create another provider transaction.
        paymentError(error);
      }
    },
    async refresh(user: User, orderId: unknown) {
      assert(
        user.role === "owner",
        403,
        "Pembayaran hanya dapat dikelola pemilik undangan.",
      );
      const adapter = provider();
      const row = await getOrder(user.id, orderId);
      try {
        await apply(
          row,
          await adapter.getStatus(
            {
              orderId: row.orderId,
              amountIdr: row.amountIdr,
              currency: row.currency,
            },
            row.transactionId ?? undefined,
          ),
        );
      } catch (error) {
        // A Snap session without a selected method normally has no status yet.
        // 404 is neither permission to retry creation nor evidence of failure.
        if (
          error instanceof MidtransError &&
          error.code === "PAYMENT_NOT_FOUND"
        )
          return;
        paymentError(error);
      }
    },
    async webhook(body: Record<string, unknown>) {
      const adapter = provider();
      const row = await getOrder(null, body.order_id);
      try {
        await apply(
          row,
          await adapter.verifyNotification(
            body,
            {
              orderId: row.orderId,
              amountIdr: row.amountIdr,
              currency: row.currency,
            },
            row.transactionId ?? undefined,
          ),
        );
      } catch (error) {
        paymentError(error);
      }
    },
    async decorateWorkspace(
      user: User,
      workspace: Workspace,
    ): Promise<Workspace> {
      const sanitized: Workspace = {
        ...workspace,
        invitations: workspace.invitations.map((inv) => ({
          ...inv,
          orders:
            user.role === "owner" && inv.ownerId === user.id
              ? inv.orders.map((o) => ({ ...o, paymentUrl: undefined }))
              : [],
        })),
      };
      if (!sandboxPaymentsEnabled(env))
        return {
          ...sanitized,
          payments: { enabled: false, environment: "sandbox", plans: [] },
        };
      const catalog = await deps.admin
        .from("plans")
        .select("id,display_name,amount_idr,features")
        .eq("active", true);
      databaseError(catalog.error);
      const plans = (catalog.data || []).flatMap((p) => {
        const f = p.features;
        if (
          (p.id !== "mandiri" && p.id !== "assisted") ||
          !Number.isSafeInteger(p.amount_idr) ||
          p.amount_idr <= 0 ||
          typeof p.display_name !== "string" ||
          !f ||
          !Number.isSafeInteger(f.guestLimit) ||
          f.guestLimit <= 0 ||
          f.guestLimit > 999999 ||
          !Number.isSafeInteger(f.photoLimit) ||
          f.photoLimit <= 0 ||
          f.photoLimit > 999999 ||
          !Number.isSafeInteger(f.maxRevisions) ||
          f.maxRevisions < 0 ||
          f.maxRevisions > 99999
        )
          return [];
        return [
          {
            id: p.id as PlanId,
            name: p.display_name,
            price: p.amount_idr,
            features: [
              `Tautan personal untuk ${f.guestLimit} penerima`,
              `Galeri hingga ${f.photoLimit} foto`,
              "RSVP & ucapan tamu",
              ...(p.id === "assisted"
                ? ["Admin pendamping", `${f.maxRevisions} putaran revisi`]
                : []),
            ],
          },
        ];
      });
      const result: Workspace = {
        ...sanitized,
        payments: { enabled: plans.length > 0, environment: "sandbox", plans },
      };
      if (user.role !== "owner" || !workspace.invitations.length) return result;
      // Session URLs are bearer capabilities, so only the owner receives them.
      const sessions = await deps.admin
        .from("payment_checkout_sessions")
        .select("order_id,redirect_url")
        .eq("owner_id", user.id)
        .in(
          "invitation_id",
          workspace.invitations.map((i) => i.id),
        );
      databaseError(sessions.error);
      const byOrder = new Map(
        (sessions.data || []).map((s) => [s.order_id, s]),
      );
      result.invitations = sanitized.invitations.map((inv) => ({
        ...inv,
        orders: inv.orders.map((o) => {
          const session = byOrder.get(o.id);
          if (!session) return o;
          const url = safeSandboxRedirect(session.redirect_url);
          return {
            ...o,
            paymentUrl: o.status === "pending" ? url : undefined,
            checkoutState: url ? ("ready" as const) : ("uncertain" as const),
          };
        }),
      }));
      return result;
    },
  };
}

import { createHash, timingSafeEqual } from "node:crypto";

// Dormant provider adapter: no routes import this module and it grants no entitlement.
export type MidtransEnvironment = "sandbox" | "production";
export type MidtransOrderSnapshot = Readonly<{
  orderId: string;
  amountIdr: number;
  currency: "IDR";
}>;
export type MidtransPaymentState =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "review";
export type MidtransStatus = Readonly<{
  orderId: string;
  amountIdr: number;
  transactionId: string;
  transactionStatus: string;
  paymentState: MidtransPaymentState;
}>;
type Config = Readonly<{
  serverKey: string;
  environment: MidtransEnvironment;
}>;
type ErrorCode =
  | "PAYMENT_NOT_CONFIGURED"
  | "INVALID_ORDER"
  | "INVALID_TRANSACTION_ID"
  | "INVALID_NOTIFICATION"
  | "INVALID_SIGNATURE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_INVALID_RESPONSE"
  | "PAYMENT_NOT_FOUND"
  | "ORDER_MISMATCH";

export class MidtransError extends Error {
  constructor(public readonly code: ErrorCode) {
    // Never attach provider payloads or transport causes: they can contain secrets/PII.
    super(code);
    this.name = "MidtransError";
  }
}

const orderPattern = /^[a-zA-Z0-9._~-]{1,50}$/;
const transactionPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const responseLimit = 64 * 1024;

export function readMidtransConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Config {
  const flag = env.MIDTRANS_IS_PRODUCTION;
  const serverKey = env.MIDTRANS_SERVER_KEY;
  if (
    (flag !== undefined &&
      flag !== "" &&
      flag !== "false" &&
      flag !== "true") ||
    !serverKey ||
    serverKey.length > 512 ||
    /[\s:]/.test(serverKey)
  ) {
    throw new MidtransError("PAYMENT_NOT_CONFIGURED");
  }
  const environment = flag === "true" ? "production" : "sandbox";
  // Catch accidentally mixing known sandbox credentials with a live endpoint.
  if (environment === "production" && serverKey.startsWith("SB-")) {
    throw new MidtransError("PAYMENT_NOT_CONFIGURED");
  }
  return Object.freeze({ serverKey, environment });
}

/** Parse provider IDR strings without rounding or floating point arithmetic. */
export function parseMidtransIdr(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,16}(?:\.0{1,2})?$/.test(value)) {
    throw new MidtransError("PROVIDER_INVALID_RESPONSE");
  }
  const integer = BigInt(value.split(".")[0]);
  if (integer <= 0n || integer > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MidtransError("PROVIDER_INVALID_RESPONSE");
  }
  return Number(integer);
}

function snapshot(input: MidtransOrderSnapshot): MidtransOrderSnapshot {
  if (
    !input ||
    typeof input.orderId !== "string" ||
    !orderPattern.test(input.orderId) ||
    input.currency !== "IDR" ||
    !Number.isSafeInteger(input.amountIdr) ||
    input.amountIdr <= 0
  ) {
    throw new MidtransError("INVALID_ORDER");
  }
  return Object.freeze({
    orderId: input.orderId,
    amountIdr: input.amountIdr,
    currency: "IDR",
  });
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MidtransError("PROVIDER_INVALID_RESPONSE");
  }
  return value as Record<string, unknown>;
}

function parseStatus(
  value: unknown,
  order: MidtransOrderSnapshot,
  lookupTransactionId?: string,
): MidtransStatus {
  const body = object(value);
  if (
    body.order_id !== order.orderId ||
    parseMidtransIdr(body.gross_amount) !== order.amountIdr ||
    (lookupTransactionId !== undefined &&
      body.transaction_id !== lookupTransactionId) ||
    (body.currency !== undefined && body.currency !== "IDR")
  ) {
    throw new MidtransError("ORDER_MISMATCH");
  }
  if (
    typeof body.transaction_id !== "string" ||
    !transactionPattern.test(body.transaction_id) ||
    typeof body.transaction_status !== "string" ||
    !/^[a-zA-Z_]{1,32}$/.test(body.transaction_status) ||
    typeof body.status_code !== "string" ||
    !/^\d{3}$/.test(body.status_code)
  ) {
    throw new MidtransError("PROVIDER_INVALID_RESPONSE");
  }
  const status = body.transaction_status.toLowerCase();
  const fraud =
    typeof body.fraud_status === "string"
      ? body.fraud_status.toLowerCase()
      : body.fraud_status;
  let paymentState: MidtransPaymentState = "review";
  if (status === "settlement" || status === "capture") {
    if (
      body.status_code === "200" &&
      (status === "capture"
        ? body.payment_type === "credit_card" && fraud === "accept"
        : fraud === undefined || fraud === "accept")
    ) {
      paymentState = "paid";
    }
  } else if (status === "pending" || status === "authorize") {
    paymentState = "pending";
  } else if (status === "deny" || status === "failure") {
    paymentState = "failed";
  } else if (status === "cancel") {
    paymentState = "cancelled";
  } else if (status === "expire") {
    paymentState = "expired";
  } else if (status === "refund") {
    paymentState = "refunded";
  }
  return Object.freeze({
    orderId: order.orderId,
    amountIdr: order.amountIdr,
    transactionId: body.transaction_id,
    transactionStatus: status,
    paymentState,
  });
}

export function createMidtransAdapter(
  config: Config,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
) {
  // Revalidate even when called directly rather than through the env reader.
  if (config.environment !== "sandbox" && config.environment !== "production") {
    throw new MidtransError("PAYMENT_NOT_CONFIGURED");
  }
  const settings = readMidtransConfig({
    MIDTRANS_SERVER_KEY: config.serverKey,
    MIDTRANS_IS_PRODUCTION: String(config.environment === "production"),
  });
  const requestFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new MidtransError("PAYMENT_NOT_CONFIGURED");
  }
  const appOrigin =
    settings.environment === "production"
      ? "https://app.midtrans.com"
      : "https://app.sandbox.midtrans.com";
  const apiOrigin =
    settings.environment === "production"
      ? "https://api.midtrans.com"
      : "https://api.sandbox.midtrans.com";

  async function request(url: string, method: "GET" | "POST", body?: unknown) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await requestFetch(url, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${settings.serverKey}:`).toString("base64")}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        // Do not forward the server credential across a provider redirect.
        redirect: "error",
        cache: "no-store",
      });
      if (response.status === 404 && method === "GET") {
        throw new MidtransError("PAYMENT_NOT_FOUND");
      }
      if (!response.ok) {
        throw new MidtransError(
          response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED",
        );
      }
      if (!response.body) throw new MidtransError("PROVIDER_INVALID_RESPONSE");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > responseLimit) {
            await reader.cancel();
            throw new MidtransError("PROVIDER_INVALID_RESPONSE");
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return object(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        throw new MidtransError("PROVIDER_INVALID_RESPONSE");
      }
    } catch (error) {
      if (controller.signal.aborted)
        throw new MidtransError("PROVIDER_TIMEOUT");
      if (error instanceof MidtransError) throw error;
      throw new MidtransError("PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getStatus(
    input: MidtransOrderSnapshot,
    transactionId?: string,
  ): Promise<MidtransStatus> {
    const order = snapshot(input);
    if (
      transactionId !== undefined &&
      (typeof transactionId !== "string" ||
        !transactionPattern.test(transactionId))
    ) {
      throw new MidtransError("INVALID_TRANSACTION_ID");
    }
    // DANA/BI SNAP require the provider transaction ID rather than order ID.
    // Both lookup forms are still checked against the stored order and amount.
    const body = await request(
      `${apiOrigin}/v2/${encodeURIComponent(transactionId ?? order.orderId)}/status`,
      "GET",
    );
    // Snap can return a JSON 404 while the customer has not selected a method.
    if (body.status_code === "404")
      throw new MidtransError("PAYMENT_NOT_FOUND");
    return parseStatus(body, order, transactionId);
  }

  return Object.freeze({
    async createTransaction(input: MidtransOrderSnapshot) {
      const order = snapshot(input);
      const body = await request(`${appOrigin}/snap/v1/transactions`, "POST", {
        transaction_details: {
          order_id: order.orderId,
          gross_amount: order.amountIdr,
        },
        credit_card: { secure: true },
      });
      if (
        typeof body.token !== "string" ||
        !/^[a-zA-Z0-9_-]{1,256}$/.test(body.token) ||
        typeof body.redirect_url !== "string"
      ) {
        throw new MidtransError("PROVIDER_INVALID_RESPONSE");
      }
      let redirect: URL;
      try {
        redirect = new URL(body.redirect_url);
      } catch {
        throw new MidtransError("PROVIDER_INVALID_RESPONSE");
      }
      if (
        redirect.origin !== appOrigin ||
        redirect.username ||
        redirect.password ||
        !redirect.pathname.startsWith("/snap/")
      ) {
        throw new MidtransError("PROVIDER_INVALID_RESPONSE");
      }
      // A token/redirect proves only that a session exists, never that it is paid.
      return Object.freeze({ token: body.token, redirectUrl: redirect.href });
    },
    getStatus,
    async verifyNotification(
      value: unknown,
      input: MidtransOrderSnapshot,
      transactionId?: string,
    ) {
      const order = snapshot(input);
      let body: Record<string, unknown>;
      try {
        body = object(value);
        if (
          body.order_id !== order.orderId ||
          parseMidtransIdr(body.gross_amount) !== order.amountIdr ||
          typeof body.status_code !== "string" ||
          !/^\d{3}$/.test(body.status_code) ||
          (body.transaction_id !== undefined &&
            (typeof body.transaction_id !== "string" ||
              !transactionPattern.test(body.transaction_id)))
        ) {
          throw new MidtransError("INVALID_NOTIFICATION");
        }
      } catch {
        throw new MidtransError("INVALID_NOTIFICATION");
      }
      if (
        typeof body.signature_key !== "string" ||
        !/^[a-fA-F0-9]{128}$/.test(body.signature_key)
      ) {
        throw new MidtransError("INVALID_SIGNATURE");
      }
      const expected = createHash("sha512")
        .update(
          `${body.order_id}${body.status_code}${body.gross_amount}${settings.serverKey}`,
        )
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(body.signature_key, "hex"))) {
        throw new MidtransError("INVALID_SIGNATURE");
      }
      // transaction_status/fraud_status/transaction_id are not in the signature.
      // The notification ID is only a lookup hint, never payment authority. A
      // stored provider ID takes precedence, and the authenticated result must
      // match that lookup ID, the stored order and its exact amount.
      return getStatus(
        order,
        transactionId ?? (body.transaction_id as string | undefined),
      );
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { AppError } from "./errors";

export const SESSION_COOKIE = "tamuara_session";
const state = globalThis as typeof globalThis & {
  tamuaraRateLimits?: Map<string, { count: number; until: number }>;
};
const limits = (state.tamuaraRateLimits ??= new Map());

export function rateLimit(key: string, max = 80, windowMs = 60_000) {
  const now = Date.now();
  if (limits.size > 10_000) {
    for (const [entry, value] of limits)
      if (value.until <= now) limits.delete(entry);
    if (limits.size > 10_000)
      throw new AppError(
        429,
        "Terlalu banyak permintaan. Coba kembali sebentar lagi.",
      );
  }
  let entry = limits.get(key);
  if (!entry || entry.until <= now) {
    entry = { count: 0, until: now + windowMs };
    limits.set(key, entry);
  }
  entry.count += 1;
  if (entry.count > max)
    throw new AppError(
      429,
      "Terlalu banyak permintaan. Coba kembali sebentar lagi.",
      "RATE_LIMITED",
    );
}

export function checkOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  // Next can normalize the internal URL to localhost; the browser uses the actual Host.
  const expectedOrigin = process.env.TAMUARA_APP_URL
    ? new URL(process.env.TAMUARA_APP_URL).origin
    : `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
  if (
    (origin && origin !== expectedOrigin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    throw new AppError(
      403,
      "Permintaan berasal dari situs yang tidak diizinkan.",
      "INVALID_ORIGIN",
    );
  }
}

export async function readJson(
  request: NextRequest,
  limit = 1_000_000,
): Promise<Record<string, unknown>> {
  checkOrigin(request);
  return readJsonBody(request, limit);
}

/** Provider webhooks use signatures, not browser Origin, for authentication. */
export async function readJsonBody(
  request: NextRequest,
  limit: number,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "Gunakan format JSON.");
  if (Number(request.headers.get("content-length")) > limit)
    throw new AppError(413, "Data terlalu besar.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Data tidak tersedia.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new AppError(413, "Data terlalu besar.");
    }
    chunks.push(value);
  }
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result as Record<string, unknown>;
  } catch {
    throw new AppError(400, "Data JSON tidak valid.");
  }
}

export function jsonResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return jsonResponse(
      { error: error.message, code: error.code },
      error.status,
    );
  console.error(
    "Tamuara request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return jsonResponse(
    {
      error: "Terjadi kesalahan server. Silakan coba kembali.",
      code: "INTERNAL_ERROR",
    },
    500,
  );
}

export function sessionToken(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export function setSession(
  response: NextResponse,
  token: string,
  request: NextRequest,
) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

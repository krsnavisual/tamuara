import type { NextRequest } from "next/server";
import { isSupabaseMode } from "@/lib/server/backend-config";
import { AppError, assert } from "@/lib/server/errors";
import { errorResponse, jsonResponse, rateLimit, readJson } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RpcError = { code?: string; message?: string };

function unavailable(): never {
  throw new AppError(
    503,
    "Antrean bantuan belum tersedia.",
    "ADMIN_QUEUE_UNAVAILABLE",
  );
}

function rpcError(error: RpcError): AppError {
  if (error.code === "P0001") {
    if (error.message === "INVITATION_VERSION_CONFLICT") {
      return new AppError(
        409,
        "Permintaan telah berubah. Muat ulang antrean bantuan.",
        "INVITATION_VERSION_CONFLICT",
      );
    }
    if (error.message === "ASSISTANCE_UNAVAILABLE") {
      return new AppError(
        404,
        "Permintaan bantuan tidak tersedia.",
        "ASSISTANCE_UNAVAILABLE",
      );
    }
  }
  if (error.code === "42501" && error.message === "ADMIN_REQUIRED") {
    return new AppError(403, "Akses admin diperlukan.", "ADMIN_REQUIRED");
  }
  if (error.code === "22023" && error.message === "INVALID_ASSISTANCE_CLAIM") {
    return new AppError(400, "Permintaan tidak valid.", "INVALID_ASSISTANCE_CLAIM");
  }
  return new AppError(
    503,
    "Layanan admin sementara tidak tersedia.",
    "ADMIN_SERVICE_UNAVAILABLE",
  );
}

function requireSupabase() {
  if (!isSupabaseMode()) unavailable();
}

function parseQueue(data: unknown) {
  if (!Array.isArray(data)) unavailable();
  return data.map((row: unknown) => {
    if (!row || typeof row !== "object") unavailable();
    const item = row as Record<string, unknown>;
    if (
      typeof item.invitation_id !== "string" ||
      !Number.isSafeInteger(item.document_version) ||
      typeof item.updated_at !== "string"
    ) {
      unavailable();
    }
    return {
      invitationId: item.invitation_id,
      documentVersion: item.document_version,
      updatedAt: item.updated_at,
    };
  });
}

export async function GET(request: NextRequest) {
  let auth: ReturnType<typeof createSupabaseServerClient> | undefined;
  try {
    requireSupabase();
    auth = createSupabaseServerClient(request);
    const user = await auth.getUser();
    assert(user.role === "admin", 403, "Akses admin diperlukan.", "ADMIN_REQUIRED");
    rateLimit(`admin-assistance:list:${user.id}`, 60);
    const { data, error } = await auth.client.rpc("list_assistance_queue");
    if (error) throw rpcError(error);
    return auth.applyCookies(jsonResponse({ requests: parseQueue(data) }));
  } catch (error) {
    const response = errorResponse(error);
    return auth ? auth.applyCookies(response) : response;
  }
}

export async function POST(request: NextRequest) {
  let auth: ReturnType<typeof createSupabaseServerClient> | undefined;
  try {
    requireSupabase();
    const input = await readJson(request, 2_000);
    assert(
      typeof input.invitationId === "string" &&
        /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
          input.invitationId,
        ),
      400,
      "ID undangan tidak valid.",
    );
    assert(
      typeof input.expectedVersion === "number" &&
        Number.isSafeInteger(input.expectedVersion) &&
        input.expectedVersion > 0 &&
        input.expectedVersion <= 2_147_483_647,
      400,
      "Versi undangan tidak valid.",
    );
    auth = createSupabaseServerClient(request);
    const user = await auth.getUser();
    assert(user.role === "admin", 403, "Akses admin diperlukan.", "ADMIN_REQUIRED");
    rateLimit(`admin-assistance:claim:${user.id}`, 20);
    const { data, error } = await auth.client.rpc("claim_assistance", {
      p_invitation_id: input.invitationId,
      p_expected_version: input.expectedVersion,
    });
    if (error) throw rpcError(error);
    if (!Number.isSafeInteger(data) || data < 1) unavailable();
    return auth.applyCookies(jsonResponse({ ok: true }));
  } catch (error) {
    const response = errorResponse(error);
    return auth ? auth.applyCookies(response) : response;
  }
}

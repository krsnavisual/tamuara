import type { NextRequest } from "next/server";
import { isSupabaseMode } from "@/lib/server/backend-config";
import { createSupabaseServerClient } from "@/lib/server/supabase-auth";
import { uploadSupabaseMedia } from "@/lib/server/supabase-media";
import { AppError, assert } from "@/lib/server/errors";
import {
  checkOrigin,
  errorResponse,
  jsonResponse,
  rateLimit,
  sessionToken,
} from "@/lib/server/http";
import { uploadMedia } from "@/lib/server/media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let auth: ReturnType<typeof createSupabaseServerClient> | undefined;
  try {
    checkOrigin(request);
    let user;
    if (isSupabaseMode()) {
      auth = createSupabaseServerClient(request);
      user = await auth.getUser();
      rateLimit(`media:${user.id}`, 20);
    } else {
      assert(sessionToken(request), 401, "Silakan masuk terlebih dahulu.");
      rateLimit(`media:${sessionToken(request)}`, 20);
    }
    const contentType = request.headers.get("content-type") || "";
    assert(
      contentType.startsWith("multipart/form-data"),
      415,
      "Format unggahan tidak valid.",
    );
    const limit = 9 * 1024 * 1024;
    assert(
      Number(request.headers.get("content-length") || 0) <= limit,
      413,
      "Ukuran unggahan terlalu besar.",
    );
    const reader = request.body?.getReader();
    assert(reader, 400, "File belum dipilih.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new AppError(413, "Ukuran unggahan terlalu besar.");
      }
      chunks.push(value);
    }
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "Content-Type": contentType },
    }).formData();
    const file = form.get("file");
    const invitationId = form.get("invitationId");
    assert(
      file instanceof File && typeof invitationId === "string",
      400,
      "Pilih file dan undangan yang sesuai.",
    );
    const response = jsonResponse(
      auth
        ? await uploadSupabaseMedia(
            request,
            invitationId,
            file,
            async () => user!,
          )
        : await uploadMedia(sessionToken(request), invitationId, file),
    );
    return auth ? auth.applyCookies(response) : response;
  } catch (error) {
    const response = errorResponse(error);
    return auth ? auth.applyCookies(response) : response;
  }
}

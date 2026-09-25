import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, sessionToken } from "@/lib/server/http";
import { readMedia } from "@/lib/server/media";
import { isSupabaseMode } from "@/lib/server/backend-config";
import { createSupabaseServerClient } from "@/lib/server/supabase-auth";
import { readSupabaseMedia } from "@/lib/server/supabase-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let auth: ReturnType<typeof createSupabaseServerClient> | undefined;
  try {
    const id = (await context.params).id;
    const preview = request.nextUrl.searchParams.get("preview") || undefined;
    if (isSupabaseMode()) auth = createSupabaseServerClient(request);
    const result = auth
      ? await readSupabaseMedia(id, request, preview, () => auth!.getUser())
      : await readMedia(id, sessionToken(request), preview);
    const response = new NextResponse(new Uint8Array(result.bytes), {
      headers: {
        "Content-Type": result.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
    return auth ? auth.applyCookies(response) : response;
  } catch (error) {
    const response = errorResponse(error);
    return auth ? auth.applyCookies(response) : response;
  }
}

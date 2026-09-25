import type { NextRequest } from "next/server";
import {
  errorResponse,
  jsonResponse,
  rateLimit,
  readJson,
} from "@/lib/server/http";
import {
  getPublicInvitation,
  mutatePublicInvitation,
} from "@/lib/server/public";
import { hashToken } from "@/lib/server/crypto";
import { isSupabaseMode } from "@/lib/server/backend-config";
import {
  getSupabasePublicInvitation,
  mutateSupabasePublicInvitation,
} from "@/lib/server/supabase-workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    if (isSupabaseMode())
      return jsonResponse(
        await getSupabasePublicInvitation(
          (await context.params).slug,
          request.nextUrl.searchParams.get("guest") || undefined,
        ),
      );
    return jsonResponse(
      await getPublicInvitation(
        (await context.params).slug,
        request.nextUrl.searchParams.get("guest") || undefined,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    const input = await readJson(request, 10_000);
    const { slug } = await context.params;
    rateLimit(`public:${slug}`, 150);
    rateLimit(`guest:${hashToken(String(input.guestToken || ""))}`, 20);
    if (isSupabaseMode())
      return jsonResponse(await mutateSupabasePublicInvitation(slug, input));
    return jsonResponse(await mutatePublicInvitation(slug, input));
  } catch (error) {
    return errorResponse(error);
  }
}

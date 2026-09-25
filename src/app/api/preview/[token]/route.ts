import type { NextRequest } from "next/server";
import { errorResponse, jsonResponse, rateLimit } from "@/lib/server/http";
import { getPreview } from "@/lib/server/public";
import { hashToken } from "@/lib/server/crypto";
import { isSupabaseMode } from "@/lib/server/backend-config";
import { getSupabasePreview } from "@/lib/server/supabase-workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    rateLimit(`preview:${hashToken(token)}`, 100);
    if (isSupabaseMode()) return jsonResponse(await getSupabasePreview(token));
    return jsonResponse(await getPreview(token));
  } catch (error) {
    return errorResponse(error);
  }
}

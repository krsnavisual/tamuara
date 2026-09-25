import type { NextRequest } from "next/server";
import type { Mutation } from "@/lib/types";
import { assert } from "@/lib/server/errors";
import {
  errorResponse,
  jsonResponse,
  rateLimit,
  readJson,
  sessionToken,
} from "@/lib/server/http";
import { getWorkspace, mutateWorkspace } from "@/lib/server/workspace";
import { isSupabaseMode } from "@/lib/server/backend-config";
import { createSupabaseServerClient } from "@/lib/server/supabase-auth";
import {
  getSupabaseWorkspace,
  mutateSupabaseWorkspace,
} from "@/lib/server/supabase-workspace";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (isSupabaseMode()) {
      const auth = createSupabaseServerClient(request);
      try {
        return auth.applyCookies(
          jsonResponse(await getSupabaseWorkspace(await auth.getUser())),
        );
      } catch (error) {
        return auth.applyCookies(errorResponse(error));
      }
    }
    return jsonResponse(await getWorkspace(sessionToken(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request);
    assert(typeof input.action === "string", 400, "Tindakan diperlukan.");
    if (isSupabaseMode()) {
      const auth = createSupabaseServerClient(request);
      try {
        const user = await auth.getUser();
        rateLimit(`workspace:${user.id}`, 120);
        return auth.applyCookies(
          jsonResponse(
            await mutateSupabaseWorkspace(user, input as unknown as Mutation),
          ),
        );
      } catch (error) {
        return auth.applyCookies(errorResponse(error));
      }
    }
    rateLimit(`workspace:${sessionToken(request) || "anonymous"}`, 120);
    return jsonResponse(
      await mutateWorkspace(
        sessionToken(request),
        input as unknown as Mutation,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

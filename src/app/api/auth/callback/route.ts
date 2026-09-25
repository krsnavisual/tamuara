import { NextRequest, NextResponse } from "next/server";
import { backendMode } from "@/lib/server/backend-config";
import { errorResponse } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let auth: ReturnType<typeof createSupabaseServerClient> | undefined;
  try {
    if (backendMode() !== "supabase") {
      return NextResponse.redirect(new URL("/masuk", request.url));
    }
    auth = createSupabaseServerClient(request);
    const code = request.nextUrl.searchParams.get("code");
    const canonical =
      process.env.TAMUARA_APP_URL || new URL(request.url).origin;
    const recovery = request.nextUrl.searchParams.get("flow") === "recovery";
    const failureUrl = new URL(
      recovery
        ? "/masuk?auth=recovery_failed"
        : "/masuk?auth=confirmation_failed",
      canonical,
    );
    if (!code || code.length > 2048) {
      return auth.applyCookies(NextResponse.redirect(failureUrl));
    }
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { error } = await auth.client.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) {
      return auth.applyCookies(NextResponse.redirect(failureUrl));
    }
    await auth.getUser();
    return auth.applyCookies(
      NextResponse.redirect(
        new URL(recovery ? "/atur-kata-sandi" : "/app", canonical),
      ),
    );
  } catch (error) {
    const response = errorResponse(error);
    return auth ? auth.applyCookies(response) : response;
  }
}

import type { NextRequest } from "next/server";
import { isSupabaseMode } from "@/lib/server/backend-config";
import { assert } from "@/lib/server/errors";
import {
  errorResponse,
  jsonResponse,
  rateLimit,
  readJsonBody,
} from "@/lib/server/http";
import { sandboxPaymentConfig } from "@/lib/server/payments/config";
import { createPaymentService } from "@/lib/server/payments/service";
import { getSupabaseAdmin } from "@/lib/server/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assert(
      isSupabaseMode(),
      503,
      "Pembayaran sandbox memerlukan Supabase.",
      "PAYMENT_NOT_CONFIGURED",
    );
    sandboxPaymentConfig();
    rateLimit("midtrans:webhook", 240);
    const body = await readJsonBody(request, 32 * 1024);
    await createPaymentService({ admin: getSupabaseAdmin() }).webhook(body);
    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}

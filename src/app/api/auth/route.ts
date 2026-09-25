import type { NextRequest } from "next/server";
import { authenticate, logout } from "@/lib/server/auth";
import { backendMode } from "@/lib/server/backend-config";
import { AppError, assert } from "@/lib/server/errors";
import { createSupabaseServerClient } from "@/lib/server/supabase-auth";
import {
  clearSession,
  errorResponse,
  jsonResponse,
  rateLimit,
  readJson,
  sessionToken,
  setSession,
} from "@/lib/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let supabaseAuth: ReturnType<typeof createSupabaseServerClient> | undefined;
  try {
    const input = await readJson(request, 5000);
    rateLimit("auth:all", 100, 60_000);
    rateLimit(
      `auth:${String(input.email ?? input.role ?? "logout")
        .toLowerCase()
        .slice(0, 254)}`,
      15,
      60_000,
    );
    if (backendMode() === "supabase") {
      supabaseAuth = createSupabaseServerClient(request);
      const action = input.action;
      if (action === "demo") {
        throw new AppError(403, "Akun demo hanya tersedia pada mode lokal.");
      }
      if (action === "logout") {
        const { error } = await supabaseAuth.client.auth.signOut({
          scope: "local",
        });
        if (error)
          throw new AppError(503, "Tidak dapat keluar. Silakan coba kembali.");
        const response = jsonResponse({ ok: true });
        clearSession(response);
        return supabaseAuth.applyCookies(response);
      }
      assert(
        action === "login" ||
          action === "register" ||
          action === "recover" ||
          action === "updatePassword",
        400,
        "Aksi autentikasi tidak dikenal.",
      );
      const appUrl = process.env.TAMUARA_APP_URL || new URL(request.url).origin;
      if (action === "updatePassword") {
        const nextPassword =
          typeof input.password === "string" ? input.password : "";
        assert(
          nextPassword.length >= 8 && nextPassword.length <= 128,
          400,
          "Kata sandi harus berisi 8–128 karakter.",
        );
        await supabaseAuth.getUser();
        const { error } = await supabaseAuth.client.auth.updateUser({
          password: nextPassword,
        });
        if (error)
          throw new AppError(400, "Kata sandi belum dapat diperbarui.");
        return supabaseAuth.applyCookies(
          jsonResponse({ ok: true, mode: "supabase" }),
        );
      }
      const email =
        typeof input.email === "string" ? input.email.toLowerCase().trim() : "";
      assert(
        email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        400,
        "Alamat email tidak valid.",
      );
      if (action === "recover") {
        const { error } = await supabaseAuth.client.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: new URL(
              "/api/auth/callback?flow=recovery",
              appUrl,
            ).toString(),
          },
        );
        if (error)
          throw new AppError(
            503,
            "Email pemulihan belum dapat dikirim. Silakan coba kembali.",
          );
        return supabaseAuth.applyCookies(
          jsonResponse({
            ok: true,
            mode: "supabase",
            message: "Jika akun terdaftar, email pemulihan akan dikirim.",
          }),
        );
      }
      const password = typeof input.password === "string" ? input.password : "";
      assert(
        password.length >= 8 && password.length <= 128,
        400,
        "Kata sandi harus berisi 8–128 karakter.",
      );
      if (action === "register") {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        assert(
          name.length >= 2 && name.length <= 100,
          400,
          "Nama harus berisi 2–100 karakter.",
        );
        const { data, error } = await supabaseAuth.client.auth.signUp({
          email,
          password,
          options: {
            data: { name },
            emailRedirectTo: new URL("/api/auth/callback", appUrl).toString(),
          },
        });
        if (error || !data.user) {
          throw new AppError(
            400,
            "Pendaftaran gagal. Periksa email dan kata sandi.",
          );
        }
        if (!data.session) {
          return supabaseAuth.applyCookies(
            jsonResponse({ mode: "supabase", requiresEmailConfirmation: true }),
          );
        }
      } else {
        const { error } = await supabaseAuth.client.auth.signInWithPassword({
          email,
          password,
        });
        if (error)
          throw new AppError(401, "Email atau kata sandi tidak sesuai.");
      }
      // The signed-in identity and role are read from Auth and profiles, not
      // from submitted metadata (including a possible client-supplied role).
      const user = await supabaseAuth.getUser();
      return supabaseAuth.applyCookies(
        jsonResponse({ user, mode: "supabase" }),
      );
    }
    if (input.action === "logout") {
      await logout(sessionToken(request));
      const response = jsonResponse({ ok: true });
      clearSession(response);
      return response;
    }
    const result = await authenticate(input);
    const response = jsonResponse({ user: result.user, mode: "demo" });
    setSession(response, result.token, request);
    return response;
  } catch (error) {
    const response = errorResponse(error);
    return supabaseAuth ? supabaseAuth.applyCookies(response) : response;
  }
}

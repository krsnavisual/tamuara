import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";
import type { User } from "@/lib/types";
import { AppError } from "./errors";
import { backendMode, supabaseApiKeys } from "./backend-config";

function credentials() {
  if (backendMode() !== "supabase") {
    throw new AppError(
      503,
      "Backend Supabase belum aktif.",
      "BACKEND_NOT_CONFIGURED",
    );
  }
  const { publishableKey, secretKey } = supabaseApiKeys();
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: publishableKey!,
    secretKey: secretKey!,
  };
}

/**
 * Creates a request-scoped SSR client. Call applyCookies on every response after
 * using auth, including responses from endpoints that only read data, so a
 * refreshed session reaches the browser.
 */
export function createSupabaseServerClient(request: NextRequest) {
  const { url, publishableKey } = credentials();
  const cookieJar = new Map(
    request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]),
  );
  const pendingCookies = new Map<
    string,
    { name: string; value: string; options: Record<string, unknown> }
  >();
  const pendingHeaders = new Map<string, string>();
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return [...cookieJar].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          cookieJar.set(cookie.name, cookie.value);
          pendingCookies.set(cookie.name, cookie);
        }
        for (const [name, value] of Object.entries(headers)) {
          pendingHeaders.set(name, value);
        }
      },
    },
  });

  async function getUser(): Promise<User> {
    // The user returned by getSession() is taken from an untrusted cookie.
    // getUser() asks Supabase Auth to verify the session before authorization.
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user?.id || !auth.user.email) {
      throw new AppError(
        401,
        "Silakan masuk terlebih dahulu.",
        "UNAUTHENTICATED",
      );
    }
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("display_name, role")
      .eq("id", auth.user.id)
      .single();
    if (profileError || !profile) {
      throw new AppError(
        503,
        "Profil akun belum tersedia.",
        "PROFILE_UNAVAILABLE",
      );
    }
    if (profile.role !== "owner" && profile.role !== "admin") {
      throw new AppError(403, "Peran akun tidak diizinkan.", "INVALID_ROLE");
    }
    return {
      id: auth.user.id,
      email: auth.user.email,
      name: profile.display_name,
      role: profile.role,
    };
  }

  function applyCookies<T extends NextResponse>(response: T): T {
    const secure =
      new URL(process.env.TAMUARA_APP_URL || request.url).protocol === "https:";
    for (const { name, value, options } of pendingCookies.values()) {
      response.cookies.set({
        ...options,
        name,
        value,
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
      });
    }
    if (pendingCookies.size) {
      // @supabase/ssr supplies these headers when auth cookies are written.
      for (const [name, value] of pendingHeaders)
        response.headers.set(name, value);
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  }

  return { client, getUser, applyCookies };
}

export async function getSupabaseUser(request: NextRequest): Promise<User> {
  return createSupabaseServerClient(request).getUser();
}

export const getSupabaseIdentity = getSupabaseUser;

/** Uses the elevated key only in server handlers after their own authorization. */
export function getSupabaseAdmin() {
  const { url, secretKey } = credentials();
  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

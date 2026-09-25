import { AppError } from "./errors";

export type BackendMode = "local" | "supabase";

/** Prefer current Supabase API keys while accepting legacy projects. */
export function supabaseApiKeys() {
  return {
    publishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    secretKey:
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/** Selects the storage and authentication backend without silently using demo data in production. */
export function backendMode(): BackendMode {
  const requested = process.env.TAMUARA_BACKEND;
  if (requested && requested !== "local" && requested !== "supabase") {
    throw new AppError(
      503,
      "Mode backend Tamuara tidak dikenal.",
      "BACKEND_NOT_CONFIGURED",
    );
  }

  if (requested === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { publishableKey, secretKey } = supabaseApiKeys();
    const encryptionKey = process.env.TAMUARA_TOKEN_ENCRYPTION_KEY;
    if (!url || !publishableKey || !secretKey || !encryptionKey) {
      throw new AppError(
        503,
        "Koneksi Supabase belum dikonfigurasi.",
        "BACKEND_NOT_CONFIGURED",
      );
    }
    if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
      throw new AppError(
        503,
        "Kunci enkripsi token tidak valid.",
        "BACKEND_NOT_CONFIGURED",
      );
    }
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== "https:" &&
        !(
          parsed.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(parsed.hostname)
        )
      ) {
        throw new Error("Insecure Supabase URL");
      }
    } catch {
      throw new AppError(
        503,
        "URL Supabase tidak valid.",
        "BACKEND_NOT_CONFIGURED",
      );
    }
    const appUrl = process.env.TAMUARA_APP_URL;
    if (process.env.NODE_ENV === "production" && !appUrl) {
      throw new AppError(
        503,
        "URL aplikasi belum dikonfigurasi.",
        "BACKEND_NOT_CONFIGURED",
      );
    }
    if (appUrl) {
      try {
        const parsed = new URL(appUrl);
        if (
          parsed.username ||
          parsed.password ||
          parsed.search ||
          parsed.hash ||
          (parsed.protocol !== "https:" &&
            !(
              parsed.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(parsed.hostname)
            ))
        ) {
          throw new Error("Invalid app URL");
        }
      } catch {
        throw new AppError(
          503,
          "URL aplikasi tidak valid.",
          "BACKEND_NOT_CONFIGURED",
        );
      }
    }
    return "supabase";
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.TAMUARA_LOCAL_PREVIEW !== "true"
  ) {
    throw new AppError(
      503,
      "Layanan produksi belum dikonfigurasi.",
      "BACKEND_NOT_CONFIGURED",
    );
  }
  return "local";
}

export function isSupabaseMode() {
  return backendMode() === "supabase";
}

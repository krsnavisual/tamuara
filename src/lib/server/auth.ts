import { randomUUID } from "node:crypto";
import type { User } from "../types";
import { AppError, assert, ensureLocalMode } from "./errors";
import { hashPassword, hashToken, newToken, verifyPassword } from "./crypto";
import { withStore, type Store, type StoredUser } from "./store";

export function publicUser(user: StoredUser): User {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function requireUser(store: Store, token?: string): StoredUser {
  assert(
    token && token.length <= 100,
    401,
    "Silakan masuk terlebih dahulu.",
    "UNAUTHENTICATED",
  );
  const session = store.sessions.find(
    (entry) =>
      entry.tokenHash === hashToken(token) &&
      new Date(entry.expiresAt).getTime() > Date.now(),
  );
  const user =
    session && store.users.find((entry) => entry.id === session.userId);
  assert(user, 401, "Sesi berakhir. Silakan masuk kembali.", "UNAUTHENTICATED");
  return user;
}

export async function authenticate(
  input: Record<string, unknown>,
): Promise<{ user: User; token: string }> {
  ensureLocalMode();
  return withStore(({ store }) => {
    let user: StoredUser | undefined;
    if (input.action === "demo") {
      assert(
        input.role === "owner" || input.role === "admin",
        400,
        "Pilih peran demo yang tersedia.",
      );
      user = store.users.find((entry) => entry.id === `demo-${input.role}`);
    } else if (input.action === "login" || input.action === "register") {
      const email =
        typeof input.email === "string" ? input.email.toLowerCase().trim() : "";
      const password = typeof input.password === "string" ? input.password : "";
      assert(
        email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        400,
        "Alamat email tidak valid.",
      );
      assert(
        password.length >= 8 && password.length <= 128,
        400,
        "Kata sandi harus berisi 8–128 karakter.",
      );
      if (input.action === "register") {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        assert(
          name.length >= 2 && name.length <= 100,
          400,
          "Nama harus berisi 2–100 karakter.",
        );
        assert(
          !store.users.some((entry) => entry.email === email),
          409,
          "Email sudah digunakan. Silakan masuk.",
        );
        user = {
          id: randomUUID(),
          email,
          name,
          role: "owner",
          passwordHash: hashPassword(password),
        };
        store.users.push(user);
      } else {
        user = store.users.find(
          (entry) => entry.email === email && !entry.demo,
        );
        if (!user?.passwordHash || !verifyPassword(password, user.passwordHash))
          throw new AppError(401, "Email atau kata sandi tidak sesuai.");
      }
    } else throw new AppError(400, "Aksi autentikasi tidak dikenal.");
    assert(user, 404, "Akun demo belum tersedia.");
    const token = newToken();
    store.sessions = store.sessions.filter(
      (entry) => new Date(entry.expiresAt).getTime() > Date.now(),
    );
    store.sessions.push({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    return { user: publicUser(user), token };
  });
}

export async function logout(token?: string) {
  if (!token) return;
  await withStore(({ store }) => {
    store.sessions = store.sessions.filter(
      (entry) => entry.tokenHash !== hashToken(token),
    );
  });
}

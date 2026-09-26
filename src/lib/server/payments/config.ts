import { AppError } from "../errors";
import { readMidtransConfig } from "./midtrans";

export function sandboxPaymentConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  // Live payments require a separate, explicitly reviewed activation stage.
  if (
    env.TAMUARA_PAYMENT_MODE !== "sandbox" ||
    env.MIDTRANS_IS_PRODUCTION === "true"
  ) {
    throw new AppError(
      503,
      "Pembayaran belum tersedia. Akun merchant sandbox belum dikonfigurasi.",
      "PAYMENT_NOT_CONFIGURED",
    );
  }
  try {
    const config = readMidtransConfig(env);
    if (config.environment !== "sandbox" || !config.serverKey.startsWith("SB-"))
      throw new Error();
    return config;
  } catch {
    throw new AppError(
      503,
      "Konfigurasi pembayaran sandbox belum lengkap.",
      "PAYMENT_NOT_CONFIGURED",
    );
  }
}

export function sandboxPaymentsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  try {
    sandboxPaymentConfig(env);
    return true;
  } catch {
    return false;
  }
}

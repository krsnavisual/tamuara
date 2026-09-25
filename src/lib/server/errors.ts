export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function assert(
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition {
  if (!condition) throw new AppError(status, message, code);
}

export function ensureLocalMode() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.TAMUARA_LOCAL_PREVIEW !== "true"
  ) {
    throw new AppError(
      503,
      "Layanan produksi belum dikonfigurasi. Penyimpanan demo hanya tersedia untuk pengembangan lokal.",
      "PRODUCTION_NOT_CONFIGURED",
    );
  }
}

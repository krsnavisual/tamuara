import type { NextConfig } from "next";
const config: NextConfig = {
  ...(process.env.TAMUARA_E2E_DIST_DIR === "true"
    ? { distDir: ".next-e2e" }
    : {}),
  poweredByHeader: false,
  devIndicators: false,
  logging: { incomingRequests: false },
  outputFileTracingExcludes: {
    "*": [
      "./.data/**/*",
      "./backups/**/*",
      "./test-results/**/*",
      "./docs/**/*",
      "./brand/**/*",
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;

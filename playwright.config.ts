import { defineConfig } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.TAMUARA_E2E_PORT || "3002");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    env: {
      TAMUARA_BACKEND: "local",
      TAMUARA_APP_URL: baseURL,
      TAMUARA_DATA_DIR: path.join(process.cwd(), ".data", "playwright"),
      TAMUARA_E2E_DIST_DIR: "true",
    },
    reuseExistingServer: false,
    timeout: 90000,
  },
});

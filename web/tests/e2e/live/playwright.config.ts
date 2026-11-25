import { defineConfig, devices } from "@playwright/test";
import { env } from "node:process";

const authState = (project: "DESKTOP" | "MOBILE") => {
  const storageState = env[`E2E_STORAGE_STATE_${project}`];
  return storageState === undefined ? {} : { storageState };
};

export default defineConfig({
  testDir: ".",
  testMatch: "site.spec.ts",
  outputDir: env["E2E_OUTPUT_DIR"] ?? "../../../test-results/live",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: env["E2E_BASE_URL"] ?? "https://hse.nalinor.dev",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    channel: "chromium",
    launchOptions: { args: ["--disable-gpu"] },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        ...authState("DESKTOP"),
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], ...authState("MOBILE"), defaultBrowserType: "chromium" },
    },
  ],
});

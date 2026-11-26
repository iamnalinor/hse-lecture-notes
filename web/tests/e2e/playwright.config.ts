import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const isCI = (env["CI"] ?? "") !== "";

export default defineConfig({
  testDir: ".",
  outputDir: path.join(projectRoot, "test-results"),
  testMatch: "**/*.spec.ts",
  testIgnore: "**/live/**",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: path.join(projectRoot, "playwright-report") }],
  ],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium",
        launchOptions: { args: ["--disable-gpu"] },
      },
    },
  ],
  webServer: {
    cwd: projectRoot,
    command: "bun run dev --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !isCI,
    env: {
      VITE_CHAT_API_URL: "http://127.0.0.1:8787",
      VITE_TURNSTILE_SITE_KEY: "e2e",
      VITE_TELEGRAM_CLIENT_ID: "e2e",
    },
  },
});

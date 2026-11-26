import { env } from "node:process";

/** Production builds require explicit repository configuration. Never substitute deployment values. */
const required = ["VITE_CHAT_API_URL", "VITE_TURNSTILE_SITE_KEY", "VITE_TELEGRAM_CLIENT_ID"];
const missing = required.filter((name) => (env[name]?.trim() ?? "") === "");
if (missing.length > 0) {
  throw new Error(`Set GitHub Actions repository variables: ${missing.join(", ")}`);
}

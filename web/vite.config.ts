import type { Plugin } from "vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const GA_ID = "G-0FYSMRT6KK";

/** Google Analytics only in the production build: `bun dev` and tests do not count as visits. */
const analytics = (): Plugin => ({
  apply: "build",
  name: "google-analytics",
  transformIndexHtml: () => [
    {
      // gtag.js (~150 KB) waits for the page's own load and an idle moment: on a slow phone it
      // competed with the app bundle for the first paint. Calls before it lands queue in dataLayer.
      children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');
addEventListener('load', function () {
  (window.requestIdleCallback || setTimeout)(function () {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=${GA_ID}';
    document.head.appendChild(s);
  });
});`,
      injectTo: "head",
      tag: "script",
    },
  ],
});

export default defineConfig({
  server: { watch: { ignored: ["**/playwright-report/**", "**/test-results/**"] } },
  // GitHub Pages serves the project site from /<repo>/ (the deploy workflow sets BASE_PATH).
  base: process.env["BASE_PATH"] ?? "/",
  build: { chunkSizeWarningLimit: 700, sourcemap: false },
  define: { "import.meta.env.BUILD_TIME": JSON.stringify(new Date().toISOString()) },
  plugins: [react(), tailwindcss(), analytics()],
  resolve: { alias: { "#web": new URL("src", import.meta.url).pathname } },
  test: {
    css: false,
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/support/setup.ts"],
  },
});

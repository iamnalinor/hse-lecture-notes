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
      attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${GA_ID}` },
      injectTo: "head",
      tag: "script",
    },
    {
      children: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`,
      injectTo: "head",
      tag: "script",
    },
  ],
});

export default defineConfig({
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
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
});

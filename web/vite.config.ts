import type { Plugin } from "vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { renderToString } from "katex";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { z } from "zod";

import { COURSES } from "./src/domain/courses.ts";
import { LabelIndexSchema } from "./src/domain/schemas.ts";
import { labelStats } from "./src/domain/stats.ts";
import { HERO_FORMULAS } from "./src/features/home/formulas.ts";

const policyText = readFileSync("../backend/policy.json", "utf8");
const chatPolicy = z
  .object({ maxQuestionChars: z.number().int().positive() })
  .parse(JSON.parse(policyText));

const GA_ID = "G-0FYSMRT6KK";

/** The id of this build: shown in the footer, and in `version.json` for the chat's «new version» check. */
const BUILD_TIME = new Date().toISOString();

/** `version.json` in the build: the deployed copy tells a page that lost its chunks whether it is old. */
const buildVersion = (): Plugin => ({
  apply: "build",
  name: "build-version",
  writeBundle: (options) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- the build's own output directory
    writeFileSync(
      path.join(options.dir ?? "dist", "version.json"),
      JSON.stringify({ id: BUILD_TIME }),
    );
  },
});

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

const homeFormulas = [
  ...Object.entries(HERO_FORMULAS),
  ...COURSES.map(({ id, symbol }) => [id, symbol] as const),
];
const homeMathHtml = Object.fromEntries(
  homeFormulas.map(([name, tex]) => [name, renderToString(tex)]),
);

// The desktop counter costs one number in the bundle, instead of a full label-index request.
const countStatements = (): null | number => {
  if (!existsSync("public/data/index.json")) {
    return null;
  }
  const index = LabelIndexSchema.parse(JSON.parse(readFileSync("public/data/index.json", "utf8")));
  const { definitions, theorems } = labelStats(
    COURSES.flatMap(({ id }) => Object.values(index[id] ?? {})),
  );
  return definitions + theorems;
};

export default defineConfig({
  server: { watch: { ignored: ["**/playwright-report/**", "**/test-results/**"] } },
  // GitHub Pages serves the project site from /<repo>/ (the deploy workflow sets BASE_PATH).
  base: process.env["BASE_PATH"] ?? "/",
  build: { chunkSizeWarningLimit: 700, sourcemap: false },
  define: {
    "import.meta.env.BUILD_TIME": JSON.stringify(BUILD_TIME),
    CHAT_DEFAULT_QUESTION_LIMIT: JSON.stringify(chatPolicy.maxQuestionChars),
    HOME_STATEMENTS: JSON.stringify(countStatements()),
    HOME_MATH_HTML: JSON.stringify(homeMathHtml),
  },
  plugins: [react(), tailwindcss(), analytics(), buildVersion()],
  resolve: { alias: { "#web": new URL("src", import.meta.url).pathname } },
  test: {
    css: false,
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/support/setup.ts"],
  },
});

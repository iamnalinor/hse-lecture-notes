/**
Draws the link preview pictures (`public/og/<id>.png`, see `OgImageId` in `src/domain/seo.ts`): the
site's own and one per course, in the colours and the font of the site, the course symbol as on its
card. The pictures are committed: run this after a course's name, lecturer or symbol changes.

    bun scripts/og-images.ts

Needs Chromium of Playwright 1.63 (`npx playwright@1.63.0 install chromium`, or `PLAYWRIGHT_BROWSERS_PATH`).
*/
import { renderToString } from "katex";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

import { type CourseInfo, COURSES } from "../src/domain/courses.ts";
import { OG_IMAGE_SIZE, type OgImageId, ogImagePath, SITE_NAME } from "../src/domain/seo.ts";

const fileUrl = (relative: string): string =>
  pathToFileURL(fileURLToPath(new URL(relative, import.meta.url))).href;

const FONT_WEIGHTS = [400, 600, 900] as const;
const fontFaces = FONT_WEIGHTS.map((weight) => {
  const url = fileUrl(`../src/styles/fonts/hse-sans-${String(weight)}.woff2`);
  return `@font-face { font-family: "HSE Sans"; font-weight: ${String(weight)}; src: url("${url}"); }`;
}).join("\n");

const STYLE = `
${fontFaces}
* { box-sizing: border-box; margin: 0; }
body {
  width: ${String(OG_IMAGE_SIZE.width)}px; height: ${String(OG_IMAGE_SIZE.height)}px;
  background: #fcfbf7; color: #1d1b18; font-family: "HSE Sans", sans-serif;
  padding: 64px 72px; display: flex; flex-direction: column; position: relative;
}
.brand { display: flex; align-items: center; gap: 20px; font-size: 30px; font-weight: 600; color: #6b665e; }
.logo {
  width: 64px; height: 64px; border-radius: 14px; background: #0f2d69; color: #fff;
  display: grid; place-items: center; font-size: 28px; font-weight: 900;
}
.symbol { position: absolute; top: 58px; right: 72px; font-size: 54px; color: #8c867b; }
.kicker { margin-top: auto; font-size: 26px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b665e; }
h1 { margin-top: 18px; max-width: 900px; font-size: 92px; line-height: 1; font-weight: 900; }
.note { margin-top: 26px; font-size: 34px; color: #6b665e; }
footer {
  margin-top: 48px; padding-top: 26px; border-top: 2px solid #e3ded3;
  display: flex; justify-content: space-between; font-size: 28px; color: #6b665e;
}
footer b { color: #0f2d69; font-weight: 600; }
`;

const tex = (source: string): string => renderToString(source, { throwOnError: true });

type Card = {
  readonly kicker: string;
  readonly note: string;
  readonly symbol: string;
  readonly title: string;
};

const html = ({ kicker, note, symbol, title }: Card): string => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fileUrl("../node_modules/katex/dist/katex.min.css")}">
<style>${STYLE}</style></head>
<body>
  <div class="brand"><span class="logo">ПИ</span>${SITE_NAME} ВШЭ</div>
  <div class="symbol">${symbol}</div>
  <div class="kicker">${kicker}</div>
  <h1>${title}</h1>
  <p class="note">${note}</p>
  <footer><b>hse.nalinor.dev</b><span>Теория · глоссарий · подготовка к КР и коллоквиумам</span></footer>
</body></html>`;

const courseCard = (course: CourseInfo): Card => ({
  kicker: "Конспекты лекций · 2026/27",
  note: `Лектор — ${course.lecturer}`,
  symbol: tex(course.symbol),
  title: course.name,
});

const siteCard: Card = {
  kicker: "1 курс · 2026/27",
  note: "Алгебра · Математический анализ · Дискретная математика",
  symbol: tex(COURSES.map((course) => course.symbol).join(String.raw`\quad `)),
  title: "Конспекты лекций",
};

const cards = new Map<OgImageId, Card>([
  ["site", siteCard],
  ...COURSES.map((course): [OgImageId, Card] => [course.id, courseCard(course)]),
]);

const workDir = await mkdtemp(path.join(tmpdir(), "og-images-"));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: OG_IMAGE_SIZE });
  for (const [id, card] of cards) {
    const file = path.join(workDir, `${id}.html`);
    await Bun.write(file, html(card));
    await page.goto(pathToFileURL(file).href);
    // A string: the callback runs in the page, not in this script.
    await page.waitForFunction("document.fonts.status === 'loaded'");
    const out = fileURLToPath(new URL(`../public/${ogImagePath(id)}`, import.meta.url));
    await page.screenshot({ path: out });
    console.log(`public/${ogImagePath(id)}`);
  }
} finally {
  await browser.close();
  await rm(workDir, { force: true, recursive: true });
}

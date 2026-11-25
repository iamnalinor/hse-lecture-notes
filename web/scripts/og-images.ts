/**
Draws the link preview pictures (`public/og/<id>.png`, see `OgImageId` in `src/domain/seo.ts`): the
site's own and one per course, in the colours and the font of the site, the course symbol as on its
card. The pictures are committed: run this after a course's name, lecturer or symbol changes.

    bun scripts/og-images.ts

Needs Chromium of Playwright 1.64 (`npx playwright@1.64.1 install chromium`, or `PLAYWRIGHT_BROWSERS_PATH`).
*/
import { renderToString } from "katex";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

import { type CourseId, type CourseInfo, COURSES } from "../src/domain/courses.ts";
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
  background: #fafaf8; color: #1c1c1e; font-family: "HSE Sans", sans-serif;
  padding: 64px 72px; display: flex; flex-direction: column; position: relative;
}
.brand { display: flex; align-items: center; gap: 20px; font-size: 30px; font-weight: 600; color: #5f5f63; }
.logo {
  width: 64px; height: 64px; border-radius: 14px; background: #0f2d69;
  display: grid; place-items: center;
}
.symbol { position: absolute; top: 58px; right: 72px; color: #727276; }
.brand small { font-size: inherit; font-weight: 400; color: #727276; }
h1 { margin-top: auto; max-width: 900px; line-height: 1; font-weight: 900; }
.note { margin-top: 26px; font-size: 34px; color: #5f5f63; }
footer {
  margin-top: 48px; padding-top: 26px; border-top: 2px solid #e4e4e1;
  display: flex; justify-content: space-between; font-size: 28px; color: #5f5f63;
}
footer b { color: #0f2d69; font-weight: 600; }
`;

const tex = (source: string): string => renderToString(source, { throwOnError: true });

type Card = {
  /** Said after the site's name in the brand line, in brackets (the site card: the year of study). */
  readonly brandNote?: string;
  readonly note: string;
  /** What the site has for the card's course (or for all of them): the footer line. */
  readonly offer: string;
  readonly symbol: string;
  /** Font size of a course symbol in px. */
  readonly symbolSize?: number;
  readonly title: string;
  /** Font size of the title in px: a long course name must fit in two lines. */
  readonly titleSize?: number;
};

const symbolHtml = (symbol: string, size: number): string =>
  symbol === "" ? "" : `<div class="symbol" style="font-size: ${String(size)}px">${symbol}</div>`;

const html = ({
  brandNote,
  note,
  offer,
  symbol,
  symbolSize = 54,
  title,
  titleSize = 92,
}: Card): string => `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fileUrl("../node_modules/katex/dist/katex.min.css")}">
<style>${STYLE}</style></head>
<body>
  <div class="brand"><span class="logo"><svg viewBox="0 0 32 32" width="64" height="64"><path fill="#fff" d="M9.01 6.25H23.49V11.07H17.99L23.45 14.75V17.25L17.99 20.93H23.49V25.75H9.01V21.62L17.33 16L9.01 10.38Z"/></svg></span><span>${SITE_NAME} ВШЭ${brandNote === undefined ? "" : ` <small>(${brandNote})</small>`}</span></div>
  ${symbolHtml(symbol, symbolSize)}
  <h1 style="font-size: ${String(titleSize)}px">${title}</h1>
  <p class="note">${note}</p>
  <footer><b>hse.nalinor.dev</b><span>${offer}</span></footer>
</body></html>`;

/**
What each course has on the site besides lectures, for the footer of its card. Written by hand, not
collected from the data: update it and rerun this script when a course gets its first preparation
page for a test or colloquium (`context/site.md` reminds of this too).
*/
const OFFER: Readonly<Record<CourseId, string>> = {
  aiya: "Теория · ПУД",
  algebra: "Теория · ПУД · подготовка к КР и экзамену",
  calculus: "Теория · ПУД · подготовка к КР, коллоквиуму и квизам",
  discrete: "Теория · ПУД · подготовка к КР",
};

const courseCard = (course: CourseInfo): Card => ({
  note: `Лектор — ${course.lecturer}`,
  offer: OFFER[course.id],
  symbol: tex(course.symbol),
  title: course.name,
  // At 92px a title longer than ~25 characters takes three lines and pushes the footer off the card.
  titleSize: course.name.length > 25 ? 72 : 92,
});

const siteCard: Card = {
  brandNote: "1 курс 2026/27",
  note: COURSES.map((course) => course.name).join(" · "),
  offer: "Теория · ПУД · подготовка к КР и коллоквиумам",
  symbol: "",
  title: "Конспекты лекций",
};

const cards = new Map<OgImageId, Card>([
  ["site", siteCard],
  ...COURSES.map((course): [OgImageId, Card] => [course.id, courseCard(course)]),
]);

const workDir = await mkdtemp(path.join(tmpdir(), "og-images-"));
// PLAYWRIGHT_CHROMIUM: a Chromium of another Playwright version (e.g. a preinstalled one).
const executablePath = process.env["PLAYWRIGHT_CHROMIUM"];
const browser = await chromium.launch(executablePath === undefined ? {} : { executablePath });
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

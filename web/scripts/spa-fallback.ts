/**
GitHub Pages has no SPA fallback: an unknown path serves `404.html` with status 404. Two things make
deep links (`/algebra/04_sep23_determinant_properties/`) work properly:

- `404.html` is the app shell, so any path still boots the router;
- every known page also gets its own `<path>/index.html`: the same shell, but served with 200 and
  with its own title, description, canonical URL and breadcrumbs (`src/domain/seo.ts`), so links,
  previews and search engines see a real page.

The same list of pages becomes `sitemap.xml` and `llms.txt` (with `robots.txt` beside them).
*/
import { COURSE_DOC_DESCRIPTIONS, courseDocTitle } from "../src/domain/course-docs.ts";
import { type CourseInfo, COURSES } from "../src/domain/courses.ts";
import { prepDescription } from "../src/domain/preps.ts";
import { CatalogSchema } from "../src/domain/schemas.ts";
import {
  escapeHtml,
  headTags,
  type LlmsSection,
  llmsTxt,
  noscriptBody,
  robotsTxt,
  SITE_DESCRIPTION,
  SITE_NAME,
  sitemapXml,
  type SitePage,
} from "../src/domain/seo.ts";

const dist = new URL("../dist/", import.meta.url);

const shell = await Bun.file(new URL("index.html", dist)).text();
await Bun.write(new URL("404.html", dist), shell);

const TITLE = /<title>.*?<\/title>/u;
const DESCRIPTION = /(<meta name="description" content=")[^"]*(")/u;
const OG_DESCRIPTION = /(<meta property="og:description" content=")[^"]*(")/u;
const OG_TITLE = /(<meta property="og:title" content=")[^"]*(")/u;

/** Replaces the part of the shell that the pattern finds; a missing tag fails the build. */
const replaceIn = (
  html: string,
  pattern: RegExp | string,
  replace: (open: string, close: string) => string,
): string => {
  if (typeof pattern === "string" ? !html.includes(pattern) : !pattern.test(html)) {
    throw new Error(`index.html has no ${String(pattern)}: the page copies would lose it`);
  }
  return html.replace(pattern, (_all, open: string, close: string) => replace(open, close));
};

const render = (page: SitePage): string => {
  const [title, text] = [escapeHtml(page.name), escapeHtml(page.description)];
  const isHome = page.route === "";
  const fullTitle = isHome ? SITE_NAME : `${title} — ${SITE_NAME}`;
  const steps: [RegExp | string, (open: string, close: string) => string][] = [
    [TITLE, () => `<title>${fullTitle}</title>`],
    [DESCRIPTION, (open, close) => `${open}${text}${close}`],
    [OG_DESCRIPTION, (open, close) => `${open}${text}${close}`],
    [OG_TITLE, (open, close) => `${open}${isHome ? SITE_NAME : title}${close}`],
    ["</head>", () => `  ${headTags(page)}\n  </head>`],
    ["<body>", () => `<body>\n    ${noscriptBody(page)}`],
  ];
  let html = shell;
  for (const [pattern, replace] of steps) {
    html = replaceIn(html, pattern, replace);
  }
  return html;
};

const isPresent = async (path: string): Promise<boolean> =>
  await Bun.file(new URL(path, dist)).exists();

const home: SitePage = {
  crumbs: [],
  description: SITE_DESCRIPTION,
  name: SITE_NAME,
  pdf: undefined,
  route: "",
  source: undefined,
};

const catalogFile = Bun.file(new URL("data/courses.json", dist));
if (!(await catalogFile.exists())) {
  // CI checks of web/ build without notes data; Pages always has it (and its smoke test checks a copy).
  console.log("dist/404.html written; no data/courses.json, page shells skipped");
  process.exit(0);
}
const catalog = CatalogSchema.parse(await catalogFile.json());

/** Pages of one course, the course page first; only documents that exist (a copy of a missing one would be a 200 for nothing). */
const coursePages = async ({ id: course, name, summary }: CourseInfo): Promise<SitePage[]> => {
  const coursePage: SitePage = {
    crumbs: [],
    description: `Конспекты лекций по курсу «${name}», ПИ ФКН ВШЭ 2026/27. ${summary}`,
    name,
    pdf: undefined,
    route: course,
    source: undefined,
  };
  const inCourse = { crumbs: [{ name, route: course }] };
  const docs = [];
  for (const doc of ["theory", "program"] as const) {
    if (await isPresent(`data/${course}/${doc}/meta.json`)) {
      docs.push({
        ...inCourse,
        description: `${name}: ${COURSE_DOC_DESCRIPTIONS[doc]}`,
        name: courseDocTitle(name, doc),
        pdf: `pdf/${course}-${doc}.pdf`,
        route: `${course}/${doc}`,
        source: `${doc}/${course}.md`,
      });
    }
  }
  if (await isPresent(`data/${course}/glossary.json`)) {
    docs.push({
      ...inCourse,
      description: `${name}: термины курса по лекциям`,
      name: `${name}: глоссарий`,
      pdf: undefined,
      route: `${course}/glossary`,
      source: undefined,
    });
  }
  const preps = (catalog.preps[course] ?? []).map(({ id, title }) => ({
    ...inCourse,
    description: `${name}: ${prepDescription(id)}`,
    name: title,
    pdf: `pdf/${course}-${id}.pdf`,
    route: `${course}/${id}`,
    source: `prep/${course}/${id}.md`,
  }));
  const lectures = (catalog.lectures[course] ?? []).map(({ lecture, title, weekId }) => ({
    ...inCourse,
    description: `Конспект лекции ${String(lecture)} по курсу «${name}» (ПИ ФКН ВШЭ): ${title}`,
    name: `${name}, лекция ${String(lecture)}: ${title}`,
    pdf: `pdf/${course}-${weekId}.pdf`,
    route: `${course}/${weekId}`,
    source: `notes/${course}/${weekId}.md`,
  }));
  return [coursePage, ...lectures, ...docs, ...preps];
};

const sections: LlmsSection[] = await Promise.all(
  COURSES.map(async (course) => ({ pages: await coursePages(course), title: course.name })),
);
const pages = sections.flatMap((section) => section.pages);
await Promise.all([
  Bun.write(new URL("index.html", dist), render(home)),
  ...pages.map(
    async (page) => await Bun.write(new URL(`${page.route}/index.html`, dist), render(page)),
  ),
  Bun.write(new URL("sitemap.xml", dist), sitemapXml([home, ...pages])),
  Bun.write(new URL("robots.txt", dist), robotsTxt()),
  Bun.write(new URL("llms.txt", dist), llmsTxt(home.description, sections)),
]);
console.log(
  `dist/404.html, ${String(pages.length)} page shells, sitemap.xml, robots.txt and llms.txt written`,
);

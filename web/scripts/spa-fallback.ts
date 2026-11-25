/**
GitHub Pages has no SPA fallback: an unknown path serves `404.html` with status 404. Two things make
deep links (`/algebra/04_sep23_determinant_properties/`) work properly:

- `404.html` is the app shell, so any path still boots the router;
- every known page also gets its own `<path>/index.html`: the same shell, but served with 200 and
  with its own title, description, canonical URL and breadcrumbs (`src/domain/seo.ts`), so links,
  previews and search engines see a real page; a lecture, the theory, the program and a prep carry
  their whole text (`fragment.html`) for clients that do not run scripts.

The same list of pages becomes `sitemap.xml` and `llms.txt` (with `robots.txt` beside them), and every
page gets its Markdown at `<path>.md`. Dates come from git: the first and the last commit of a page's
source (a shallow clone has no history, then the pages carry no dates rather than wrong ones).
*/
import { COURSE_DOC_DESCRIPTIONS, courseDocTitle } from "../src/domain/course-docs.ts";
import { type CourseInfo, COURSES } from "../src/domain/courses.ts";
import { pdfFile } from "../src/domain/paths.ts";
import { prepDescription } from "../src/domain/preps.ts";
import { CatalogSchema } from "../src/domain/schemas.ts";
import {
  escapeHtml,
  fallbackArticle,
  fallbackBody,
  headTags,
  type LlmsSection,
  llmsTxt,
  markdownUrl,
  pageUrl,
  robotsTxt,
  SITE_DESCRIPTION,
  SITE_NAME,
  sitemapXml,
  type SitePage,
  snippet,
} from "../src/domain/seo.ts";

const dist = new URL("../dist/", import.meta.url);
const repo = new URL("../../", import.meta.url);

const git = (...args: string[]): string =>
  Bun.spawnSync(["git", ...args], { cwd: repo.pathname }).stdout.toString();

type SourceDates = { readonly created: string; readonly modified: string };

/** First and last commit date of every Markdown source, from one `git log` over the content folders. */
const gitDates = (): Map<string, SourceDates> => {
  const dates = new Map<string, SourceDates>();
  if (git("rev-parse", "--is-shallow-repository").trim() !== "false") {
    console.warn("git history is shallow or missing: pages get no dates");
    return dates;
  }
  const log = git(
    "log",
    "--format=%x00%cI",
    "--name-only",
    "--",
    "notes",
    "theory",
    "prep",
    "program",
  );
  // Newest commit first: the first date seen is the last change, the last one seen is the creation.
  for (const commit of log.split("\0").slice(1)) {
    const [date = "", ...files] = commit.split("\n").filter((line) => line !== "");
    for (const file of files) {
      const known = dates.get(file);
      dates.set(file, { created: date, modified: known?.modified ?? date });
    }
  }
  return dates;
};
const sourceDates = gitDates();
const withDates = (page: SitePage): SitePage => {
  const known = page.source === undefined ? undefined : sourceDates.get(page.source);
  return known === undefined ? page : { ...page, ...known };
};
const newest = (pages: readonly SitePage[]): string | undefined =>
  pages
    .map((page) => page.modified)
    .filter((date) => date !== undefined)
    .toSorted((a, b) => Date.parse(b) - Date.parse(a))[0];

const shell = await Bun.file(new URL("index.html", dist)).text();

const TITLE = /<title>.*?<\/title>/u;
const DESCRIPTION = /(<meta name="description" content=")[^"]*(")/u;
const OG_DESCRIPTION = /(<meta property="og:description" content=")[^"]*(")/u;
const OG_TITLE = /(<meta property="og:title" content=")[^"]*(")/u;
const ROOT = '<div id="root">';

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

/** The text of a lecture, the theory, the program or a prep: `data/<route>/fragment.html`, if built. */
const articleOf = async (page: SitePage): Promise<string | undefined> => {
  if (page.source === undefined) {
    return undefined;
  }
  const fragment = Bun.file(new URL(`data/${page.route}/fragment.html`, dist));
  if (!(await fragment.exists())) {
    // A page with a source but no text: the data pull is broken, the copy still has its links.
    console.warn(`dist/data/${page.route}/fragment.html is missing: its page copy has no text`);
    return undefined;
  }
  return fallbackArticle(await fragment.text(), page.route);
};

const render = async (page: SitePage, children: readonly SitePage[] = []): Promise<string> => {
  const article = await articleOf(page);
  const [title, text] = [escapeHtml(page.name), escapeHtml(snippet(page.description))];
  const isHome = page.route === "";
  const fullTitle = isHome ? SITE_NAME : `${title} — ${SITE_NAME}`;
  const steps: [RegExp | string, (open: string, close: string) => string][] = [
    [TITLE, () => `<title>${fullTitle}</title>`],
    [DESCRIPTION, (open, close) => `${open}${text}${close}`],
    [OG_DESCRIPTION, (open, close) => `${open}${text}${close}`],
    [OG_TITLE, (open, close) => `${open}${isHome ? SITE_NAME : title}${close}`],
    ["</head>", () => `  ${headTags(page)}\n  </head>`],
    [ROOT, () => `${ROOT}${fallbackBody(page, { article, children })}`],
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
  image: "site",
  name: SITE_NAME,
  pdf: undefined,
  route: "",
  source: undefined,
};

/** Any unknown path (a stale link, a renamed lecture): no canonical or breadcrumbs, only where the text lies. */
const notFound: SitePage = {
  ...home,
  description:
    "Такой страницы нет: возможно, лекцию переименовали. Список всех страниц — в llms.txt.",
  name: "Страница не найдена",
};
await Bun.write(
  new URL("404.html", dist),
  replaceIn(shell, ROOT, () => `${ROOT}${fallbackBody(notFound, { isNotFound: true })}`),
);

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
    image: course,
    name,
    pdf: undefined,
    route: course,
    source: undefined,
  };
  const inCourse = { crumbs: [{ name, route: course }], image: course };
  const docs = [];
  for (const doc of ["theory", "program"] as const) {
    if (await isPresent(`data/${course}/${doc}/meta.json`)) {
      docs.push({
        ...inCourse,
        description: `${name}: ${COURSE_DOC_DESCRIPTIONS[doc]}`,
        name: courseDocTitle(name, doc),
        pdf: `pdf/${pdfFile(course, doc)}`,
        route: `${course}/${doc}`,
        source: `${doc}/${course}.md`,
      });
    }
  }
  const preps = (catalog.preps[course] ?? []).map(({ id, title }) => ({
    ...inCourse,
    description: `${name}: ${prepDescription(id)}`,
    name: title,
    pdf: `pdf/${pdfFile(course, id)}`,
    route: `${course}/${id}`,
    source: `prep/${course}/${id}.md`,
  }));
  const lectures = (catalog.lectures[course] ?? []).map(({ lecture, title, weekId }) => ({
    ...inCourse,
    description: `Конспект лекции ${String(lecture)} по курсу «${name}» (ПИ ФКН ВШЭ): ${title}`,
    name: `${name}, лекция ${String(lecture)}: ${title}`,
    pdf: `pdf/${pdfFile(course, weekId)}`,
    route: `${course}/${weekId}`,
    source: `notes/${course}/${weekId}.md`,
  }));
  const children = [...lectures, ...docs, ...preps].map((page) => withDates(page));
  return [{ ...coursePage, modified: newest(children) }, ...children];
};

/** A page as Markdown: its source with front matter, or for a course page the list of its pages. */
const markdownOf = async (page: SitePage, children: readonly SitePage[]): Promise<string> => {
  if (page.source !== undefined) {
    return await Bun.file(new URL(page.source, repo)).text();
  }
  return [
    `# ${page.name}`,
    "",
    `> ${page.description}`,
    "",
    `Страница: ${pageUrl(page.route)}`,
    "",
    ...children.map(
      (child) => `- [${child.name}](${markdownUrl(child.route)}): ${child.description}`,
    ),
    "",
  ].join("\n");
};

const sections: LlmsSection[] = await Promise.all(
  COURSES.map(async (course) => ({ pages: await coursePages(course), title: course.name })),
);
const pages = sections.flatMap((section) => section.pages);
const site: SitePage = { ...home, modified: newest(pages) };
const llms = llmsTxt(home.description, sections);
await Promise.all([
  (async () => {
    await Bun.write(new URL("index.html", dist), await render(site));
  })(),
  Bun.write(new URL("index.md", dist), llms),
  // The course page comes first in its section and lists the Markdown of the rest.
  ...sections.flatMap((section) => {
    const [coursePage, ...children] = section.pages;
    return section.pages.map(async (page) => {
      const html = await (page === coursePage ? render(page, children) : render(page));
      await Bun.write(new URL(`${page.route}/index.html`, dist), html);
      await Bun.write(
        new URL(`${page.route}.md`, dist),
        await markdownOf(page, page === coursePage ? children : []),
      );
    });
  }),
  Bun.write(new URL("sitemap.xml", dist), sitemapXml([site, ...pages])),
  Bun.write(new URL("robots.txt", dist), robotsTxt()),
  Bun.write(new URL("llms.txt", dist), llms),
]);
console.log(
  `dist/404.html, ${String(pages.length)} page shells with .md, sitemap.xml, robots.txt and llms.txt written`,
);

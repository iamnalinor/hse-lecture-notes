/**
What search engines and LLMs read without running the app. `scripts/spa-fallback.ts` puts these tags
into the shell of every page and writes `sitemap.xml`, `robots.txt` and `llms.txt` next to them.
The Markdown sources live in the public repository: an LLM reads them better than the rendered page.
*/
export const SITE_NAME = "Конспекты ПИ ФКН";
/** The same text is in `index.html`: the shell of the home page. */
export const SITE_DESCRIPTION =
  "Конспекты лекций 1 курса ПИ ФКН ВШЭ 2026/27: алгебра, математический анализ, дискретная математика. Теория, глоссарий, подготовка к контрольным и коллоквиумам, PDF.";
export const SITE_URL = "https://hse.nalinor.dev/";
export const REPO_URL = "https://github.com/iamnalinor/hse-lecture-notes";
const RAW_URL = "https://raw.githubusercontent.com/iamnalinor/hse-lecture-notes/main/";

export type Crumb = {
  readonly name: string;
  /** `algebra`; "" is the home page. */
  readonly route: string;
};

export type SitePage = Crumb & {
  /** Crumbs between the home page and this one: the course of a lecture. */
  readonly crumbs: readonly Crumb[];
  readonly description: string;
  /** `pdf/algebra-theory.pdf`. */
  readonly pdf: string | undefined;
  /** Path of the Markdown source in the repository: `notes/algebra/01_sep03_matrices.md`. */
  readonly source: string | undefined;
};

export const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Directory URL with a slash: Pages redirects `/algebra/theory` to `/algebra/theory/` anyway. */
export const pageUrl = (route: string): string =>
  route === "" ? SITE_URL : `${SITE_URL}${route}/`;

export const sourceUrl = (source: string): string => `${RAW_URL}${source}`;

const jsonLd = (data: object): string =>
  // `<` inside a string must not close the script tag.
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "<")}</script>`;

const structuredData = (page: SitePage): object => {
  if (page.route === "") {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      description: page.description,
      inLanguage: "ru",
      name: SITE_NAME,
      url: SITE_URL,
    };
  }
  const trail = [{ name: SITE_NAME, route: "" }, ...page.crumbs, page];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, at) => ({
      "@type": "ListItem",
      item: pageUrl(crumb.route),
      name: crumb.name,
      position: at + 1,
    })),
  };
};

/** Goes right before `</head>`: the address search engines should keep, the source, the crumbs. */
export const headTags = (page: SitePage): string => {
  const url = escapeHtml(pageUrl(page.route));
  const source =
    page.source === undefined
      ? []
      : [
          `<link rel="alternate" type="text/markdown" href="${escapeHtml(sourceUrl(page.source))}" />`,
        ];
  return [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:url" content="${url}" />`,
    ...source,
    jsonLd(structuredData(page)),
  ].join("\n    ");
};

/** For clients that do not run scripts (LLM fetchers, simple crawlers): what the page is and where its text lies. */
export const noscriptBody = (page: SitePage): string => {
  const link = (href: string, text: string): string => `<a href="${escapeHtml(href)}">${text}</a>`;
  const links = [
    ...(page.source === undefined
      ? []
      : [link(sourceUrl(page.source), "Текст страницы в Markdown")]),
    ...(page.pdf === undefined ? [] : [link(SITE_URL + page.pdf, "PDF")]),
    link(REPO_URL, "Исходники всех конспектов на GitHub"),
    link(`${SITE_URL}llms.txt`, "Список страниц для LLM"),
  ];
  const items = links.map((link) => `<li>${link}</li>`).join("");
  return [
    "<noscript>",
    `<h1>${escapeHtml(page.name)}</h1>`,
    `<p>${escapeHtml(page.description)}</p>`,
    `<ul>${items}</ul>`,
    "</noscript>",
  ].join("");
};

export const sitemapXml = (pages: readonly SitePage[]): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages.map((page) => `  <url><loc>${escapeHtml(pageUrl(page.route))}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");

export const robotsTxt = (): string =>
  ["User-agent: *", "Allow: /", "", `Sitemap: ${SITE_URL}sitemap.xml`, ""].join("\n");

export type LlmsSection = {
  readonly pages: readonly SitePage[];
  readonly title: string;
};

const llmsLine = (page: SitePage): string => {
  const source = page.source === undefined ? "" : `, Markdown: ${sourceUrl(page.source)}`;
  return `- [${page.name}](${pageUrl(page.route)}): ${page.description}${source}`;
};

/** https://llmstxt.org: a map of the site with links to the Markdown each page is built from. */
export const llmsTxt = (summary: string, sections: readonly LlmsSection[]): string =>
  [
    `# ${SITE_NAME}`,
    "",
    `> ${summary}`,
    "",
    "Сайт — одностраничное приложение: без JavaScript страницы пустые. Читайте Markdown-исходники:",
    `весь репозиторий — ${REPO_URL}, конспекты лекций — notes/<курс>/<week_id>.md, теория курса — theory/<курс>.md,`,
    "план учебной дисциплины — program/<курс>.md, подготовка к контрольным и коллоквиумам — prep/<курс>/<id>.md.",
    "Формулы — LaTeX, блоки (определения, теоремы, задачи) — fenced divs Pandoc с метками вида {#thm:lec04:laplace}.",
    ...sections.flatMap(({ pages, title }) => [
      "",
      `## ${title}`,
      "",
      ...pages.map((page) => llmsLine(page)),
    ]),
    "",
  ].join("\n");

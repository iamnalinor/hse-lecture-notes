import { describe, expect, it } from "vitest";

import shell from "../../index.html?raw";
import {
  FALLBACK_CLASS,
  fallbackArticle,
  fallbackBody,
  headTags,
  llmsTxt,
  pageUrl,
  robotsTxt,
  routeOf,
  SITE_DESCRIPTION,
  sitemapXml,
  type SitePage,
} from "./seo.ts";

const lecture: SitePage = {
  crumbs: [{ name: "Алгебра", route: "algebra" }],
  description: "Конспект лекции 1: матрицы <и> «операции»",
  image: "algebra",
  name: "Алгебра, лекция 1: матрицы",
  pdf: "pdf/algebra-01_sep03_matrices.pdf",
  route: "algebra/01_sep03_matrices",
  source: "notes/algebra/01_sep03_matrices.md",
};
const home: SitePage = {
  crumbs: [],
  description: SITE_DESCRIPTION,
  image: "site",
  name: "Конспекты ПИ ФКН",
  pdf: undefined,
  route: "",
  source: undefined,
};

describe("seo", () => {
  it("gives every page an address with a slash, as Pages serves it", () => {
    expect(pageUrl(routeOf("/"))).toBe("https://hse.nalinor.dev/");
    expect(pageUrl(routeOf("/algebra/theory/"))).toBe("https://hse.nalinor.dev/algebra/theory/");
    expect(pageUrl("")).toBe("https://hse.nalinor.dev/");
    expect(pageUrl("algebra/theory")).toBe("https://hse.nalinor.dev/algebra/theory/");
  });

  it("points the page to its canonical address, its Markdown source and its crumbs", () => {
    const tags = headTags(lecture);
    expect(tags).toContain(
      '<link rel="canonical" href="https://hse.nalinor.dev/algebra/01_sep03_matrices/" />',
    );
    expect(tags).toContain(
      "https://raw.githubusercontent.com/iamnalinor/hse-lecture-notes/main/notes/algebra/01_sep03_matrices.md",
    );
    const json = /<script type="application\/ld\+json">(?<data>.*)<\/script>/u.exec(tags)?.groups?.[
      "data"
    ];
    expect(JSON.parse(json ?? "{}")).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { item: "https://hse.nalinor.dev/", position: 1 },
        { item: "https://hse.nalinor.dev/algebra/", name: "Алгебра", position: 2 },
        { name: "Алгебра, лекция 1: матрицы", position: 3 },
      ],
    });
    expect(headTags(home)).toContain('"@type":"WebSite"');
  });

  it("shows the course picture in link previews", () => {
    const tags = headTags(lecture);
    expect(tags).toContain(
      '<meta property="og:image" content="https://hse.nalinor.dev/og/algebra.png" />',
    );
    expect(tags).toContain(
      '<meta property="og:image:alt" content="Алгебра: конспекты лекций ПИ ФКН" />',
    );
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(headTags(home)).toContain("https://hse.nalinor.dev/og/site.png");
  });

  it("escapes the text it puts into HTML, also inside JSON-LD", () => {
    expect(fallbackBody(lecture)).toContain("матрицы &lt;и&gt; «операции»");
    const tags = headTags({ ...lecture, name: "</script><b>" });
    expect(tags.split("</script>")).toHaveLength(2);
    expect(tags).toContain(String.raw`\u003c/script>\u003cb>`);
  });

  it("carries the page text with LaTeX, pictures from data/ and headings under the title", () => {
    const fragment = [
      '<section class="level1"><h1>Контекст</h1>',
      '<p>Пусть <span class="math inline">a_{ij}</span>, см. <a href="../02_sep09_gauss/#x" class="ref">2.7</a>.</p>',
      '<span class="nb-eq"><span\nclass="math display">\\det A = 0</span></span>',
      '<figure><img src="fig/abc.svg" alt="Рис. 1.2"></figure></section>',
    ].join("");
    const article = fallbackArticle(fragment, lecture.route);
    expect(article).toContain("<h2>Контекст</h2>");
    expect(article).toContain('href="../02_sep09_gauss/#x"');
    expect(article).toContain(String.raw`<span class="math inline">\(a_{ij}\)</span>`);
    expect(article).toContain(String.raw`<span class="math display">\[\det A = 0\]</span>`);
    expect(article).toContain(
      '<img loading="lazy" src="../../data/algebra/01_sep03_matrices/fig/abc.svg"',
    );
    const body = fallbackBody(lecture, { article });
    expect(body).toContain(`<article>\n${article}\n</article>`);
    expect(body.match(/<h1>/gu)).toHaveLength(1);
    expect(fallbackBody(lecture)).not.toContain("<article>");
  });

  it("points clients without scripts to the Markdown of this very page, outside <noscript>", () => {
    const body = fallbackBody(lecture);
    expect(body).not.toContain("noscript");
    expect(body).toContain(
      'href="https://raw.githubusercontent.com/iamnalinor/hse-lecture-notes/main/notes/algebra/01_sep03_matrices.md"',
    );
    expect(body).toContain('href="https://hse.nalinor.dev/llms.txt"');
    expect(fallbackBody(home)).toContain('href="https://hse.nalinor.dev/llms.txt"');
    expect(fallbackBody(home, { children: [lecture] })).toContain(
      '<a href="https://raw.githubusercontent.com/iamnalinor/hse-lecture-notes/main/notes/algebra/01_sep03_matrices.md">Алгебра, лекция 1: матрицы</a>',
    );
    expect(fallbackBody(home)).not.toContain("Markdown страниц раздела");
    expect(headTags(lecture)).toContain(
      '<link rel="alternate" type="text/plain" href="https://hse.nalinor.dev/llms.txt" title="llms.txt" />',
    );
  });

  it("hides the text fallback from browsers that run scripts", () => {
    expect(fallbackBody(home)).toContain(`<div class="${FALLBACK_CLASS}">`);
    expect(shell).toContain(`html[data-theme] .${FALLBACK_CLASS} {`);
    expect(shell).toContain('<div id="root"></div>');
  });

  it("lists the pages for search engines and LLMs", () => {
    expect(sitemapXml([home, lecture])).toContain(
      "<loc>https://hse.nalinor.dev/algebra/01_sep03_matrices/</loc>",
    );
    expect(robotsTxt()).toContain("Sitemap: https://hse.nalinor.dev/sitemap.xml");
    const llms = llmsTxt("Конспекты", [{ pages: [lecture], title: "Алгебра" }]);
    expect(llms).toMatch(/^# Конспекты ПИ ФКН\n\n> Конспекты\n/u);
    expect(llms).toContain(
      "## Алгебра\n\n- [Алгебра, лекция 1: матрицы](https://raw.githubusercontent.com/iamnalinor/hse-lecture-notes/main/notes/algebra/01_sep03_matrices.md)",
    );
    expect(llms).toContain("https://github.com/iamnalinor/hse-lecture-notes");
  });

  it("describes the home page as its shell does", () => {
    expect(shell).toContain(`<meta name="description" content="${SITE_DESCRIPTION}" />`);
  });
});

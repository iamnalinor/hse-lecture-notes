import { describe, expect, it } from "vitest";

import shell from "../../index.html?raw";
import {
  headTags,
  llmsTxt,
  noscriptBody,
  pageUrl,
  robotsTxt,
  SITE_DESCRIPTION,
  sitemapXml,
  type SitePage,
} from "./seo.ts";

const lecture: SitePage = {
  crumbs: [{ name: "Алгебра", route: "algebra" }],
  description: "Конспект лекции 1: матрицы <и> «операции»",
  name: "Алгебра, лекция 1: матрицы",
  pdf: "pdf/algebra-01_sep03_matrices.pdf",
  route: "algebra/01_sep03_matrices",
  source: "notes/algebra/01_sep03_matrices.md",
};
const home: SitePage = {
  crumbs: [],
  description: SITE_DESCRIPTION,
  name: "Конспекты ПИ ФКН",
  pdf: undefined,
  route: "",
  source: undefined,
};

describe("seo", () => {
  it("gives every page an address with a slash, as Pages serves it", () => {
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

  it("escapes the text it puts into HTML, also inside JSON-LD", () => {
    expect(noscriptBody(lecture)).toContain("матрицы &lt;и&gt; «операции»");
    expect(headTags({ ...lecture, name: "</script>" })).not.toContain("</script><");
  });

  it("lists the pages for search engines and LLMs", () => {
    expect(sitemapXml([home, lecture])).toContain(
      "<loc>https://hse.nalinor.dev/algebra/01_sep03_matrices/</loc>",
    );
    expect(robotsTxt()).toContain("Sitemap: https://hse.nalinor.dev/sitemap.xml");
    const llms = llmsTxt("Конспекты", [{ pages: [lecture], title: "Алгебра" }]);
    expect(llms).toMatch(/^# Конспекты ПИ ФКН\n\n> Конспекты\n/u);
    expect(llms).toContain(
      "## Алгебра\n\n- [Алгебра, лекция 1: матрицы](https://hse.nalinor.dev/algebra/01_sep03_matrices/)",
    );
    expect(llms).toContain("https://github.com/iamnalinor/hse-lecture-notes");
  });

  it("describes the home page as its shell does", () => {
    expect(shell).toContain(`<meta name="description" content="${SITE_DESCRIPTION}" />`);
  });
});

/**
GitHub Pages has no SPA fallback: an unknown path serves `404.html` with status 404. Two things make
deep links (`/algebra/04_sep23_determinant_properties/`) work properly:

- `404.html` is the app shell, so any path still boots the router;
- every known page also gets its own `<path>/index.html`: the same shell, but served with 200 and
  with its own title and description, so links, previews and search engines see a real page.
*/
import { COURSES } from "../src/domain/courses.ts";
import { CatalogSchema } from "../src/domain/schemas.ts";

const dist = new URL("../dist/", import.meta.url);
const SITE = "Конспекты ПИ ФКН";

const shell = await Bun.file(new URL("index.html", dist)).text();
await Bun.write(new URL("404.html", dist), shell);

const escapeHtml = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

const TITLE = /<title>.*?<\/title>/u;
const DESCRIPTION = /(<meta name="description" content=")[^"]*(")/u;
const OG_DESCRIPTION = /(<meta property="og:description" content=")[^"]*(")/u;
const OG_TITLE = /(<meta property="og:title" content=")[^"]*(")/u;

/** Replaces the `content` of the meta tag that the pattern finds; a missing tag fails the build. */
const withMeta = (html: string, pattern: RegExp, value: string): string => {
  if (!pattern.test(html)) {
    throw new Error(`index.html has no tag for ${String(pattern)}: the page copies would lose it`);
  }
  return html.replace(pattern, (_all, open: string, close: string) => `${open}${value}${close}`);
};

const page = (title: string, description: string): string => {
  const [safeTitle, safeText] = [escapeHtml(title), escapeHtml(description)];
  if (!TITLE.test(shell)) {
    throw new Error("index.html has no <title>");
  }
  const titled = shell.replace(TITLE, () => `<title>${safeTitle} — ${SITE}</title>`);
  const withDescription = withMeta(titled, DESCRIPTION, safeText);
  return withMeta(withMeta(withDescription, OG_DESCRIPTION, safeText), OG_TITLE, safeTitle);
};

const isPresent = async (path: string): Promise<boolean> =>
  await Bun.file(new URL(path, dist)).exists();

const catalogFile = Bun.file(new URL("data/courses.json", dist));
if (!(await catalogFile.exists())) {
  // CI checks of web/ build without notes data; Pages always has it (and its smoke test checks a copy).
  console.log("dist/404.html written; no data/courses.json, page shells skipped");
  process.exit(0);
}
const catalog = CatalogSchema.parse(await catalogFile.json());
const pages = new Map<string, string>();
for (const { id: course, name } of COURSES) {
  pages.set(course, page(name, `${name}: конспекты лекций ПИ ФКН ВШЭ`));
  // Only documents that exist: a copy for a course without theory would be a 200 for nothing.
  if (await isPresent(`data/${course}/theory/meta.json`)) {
    pages.set(`${course}/theory`, page(`${name}: теория`, `${name}: определения и теоремы курса`));
  }
  if (await isPresent(`data/${course}/glossary.json`)) {
    pages.set(
      `${course}/glossary`,
      page(`${name}: глоссарий`, `${name}: термины курса по лекциям`),
    );
  }
  const preps = catalog.preps[course] ?? [];
  for (const { id, title } of preps) {
    pages.set(`${course}/${id}`, page(title, `${name}: темы, методы и задачи к контрольной`));
  }
  const lectures = catalog.lectures[course] ?? [];
  for (const { lecture, title, weekId } of lectures) {
    pages.set(
      `${course}/${weekId}`,
      page(
        `${name}, лекция ${String(lecture)}: ${title}`,
        `Конспект лекции ${String(lecture)}: ${title}`,
      ),
    );
  }
}
await Promise.all(
  [...pages].map(
    async ([route, html]) => await Bun.write(new URL(`${route}/index.html`, dist), html),
  ),
);
console.log(`dist/404.html and ${String(pages.size)} page shells written`);

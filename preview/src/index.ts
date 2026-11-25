/**
hse-preview.nalinor.dev: one domain for the site previews of all pull requests.

- `/` → the repository's pull requests;
- `/pr-<N>/…` → the preview version of PR N (`pr-<N>-hse-lecture-notes.nalinor.workers.dev`, uploaded by
  `build.yml`, built with `BASE_PATH=/pr-<N>/`), proxied with the prefix stripped;
- the rest → 404; nothing is indexed.

One origin for every PR: Telegram Login, Turnstile and the chat API's ALLOWED_ORIGINS list it once.
*/
export const PULLS_URL = "https://github.com/iamnalinor/hse-lecture-notes/pulls";
const UPSTREAM_SUFFIX = "-hse-lecture-notes.nalinor.workers.dev";
const PR_PATH = /^\/pr-(\d{1,6})(\/.*)?$/u;
const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" };

const text = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: { ...NOINDEX, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });

/** The address of a request inside the preview of its PR, or a response for anything else. */
export function route(url: URL): { upstream: URL; prefix: string } | Response {
  if (url.pathname === "/") return Response.redirect(PULLS_URL, 302);
  if (url.pathname === "/robots.txt") return text(200, "User-agent: *\nDisallow: /\n");
  const match = PR_PATH.exec(url.pathname);
  if (match === null) return text(404, `Нет такого превью. Открытые PR: ${PULLS_URL}`);
  const [, pr, rest] = match;
  const prefix = `/pr-${pr}`;
  // The app's base is /pr-N/: without the slash its router and relative links break.
  if (rest === undefined) return Response.redirect(`${url.origin}${prefix}/${url.search}`, 301);
  return { prefix, upstream: new URL(`${rest}${url.search}`, `https://pr-${pr}${UPSTREAM_SUFFIX}`) };
}

/** A redirect of the upstream points back under the PR's prefix on this domain. */
export function rewriteLocation(location: string, upstream: URL, prefix: string): string {
  const target = new URL(location, upstream);
  return target.host === upstream.host ? `${prefix}${target.pathname}${target.search}${target.hash}` : location;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const routed = route(new URL(request.url));
    if (routed instanceof Response) return routed;
    const { prefix, upstream } = routed;
    const response = await fetch(new Request(upstream, request), { redirect: "manual" });
    if (response.status === 404 && upstream.pathname === "/") {
      return text(404, `Превью ${prefix.slice(1)} еще нет или PR из форка. Открытые PR: ${PULLS_URL}`);
    }
    const headers = new Headers(response.headers);
    const location = headers.get("Location");
    if (location !== null) headers.set("Location", rewriteLocation(location, upstream, prefix));
    for (const [name, value] of Object.entries(NOINDEX)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

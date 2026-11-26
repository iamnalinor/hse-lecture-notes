import { expect, test } from "bun:test";

import { PULLS_URL, rewriteLocation, route } from "../src/index";

const at = (path: string) => route(new URL(`https://hse-preview.nalinor.dev${path}`));

test("the root goes to the pull requests, robots.txt forbids indexing", async () => {
  const root = at("/");
  expect(root instanceof Response && root.headers.get("Location")).toBe(PULLS_URL);
  const robots = at("/robots.txt");
  expect(robots instanceof Response && (await robots.text())).toContain("Disallow: /");
});

test("a PR path is proxied to its alias without the prefix, query kept", () => {
  const routed = at("/pr-45/calculus/kr2/?q=1");
  expect(routed).not.toBeInstanceOf(Response);
  if (routed instanceof Response) return;
  expect(routed.prefix).toBe("/pr-45");
  expect(routed.upstream.href).toBe(
    "https://pr-45-hse-lecture-notes.nalinor.workers.dev/calculus/kr2/?q=1",
  );
});

test("a PR without the trailing slash is redirected to it", () => {
  const routed = at("/pr-45?x=1");
  expect(routed instanceof Response && routed.headers.get("Location")).toBe(
    "https://hse-preview.nalinor.dev/pr-45/?x=1",
  );
});

test("anything else is a 404", () => {
  for (const path of ["/pr-/", "/pr-abc/", "/x", "/pr-1234567/"]) {
    const routed = at(path);
    expect(routed instanceof Response && routed.status).toBe(404);
  }
});

test("upstream redirects stay under the PR prefix; foreign ones are untouched", () => {
  const upstream = new URL("https://pr-45-hse-lecture-notes.nalinor.workers.dev/algebra/theory");
  expect(rewriteLocation("/algebra/theory/", upstream, "/pr-45")).toBe("/pr-45/algebra/theory/");
  expect(rewriteLocation("https://github.com/x", upstream, "/pr-45")).toBe("https://github.com/x");
});

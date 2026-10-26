import { describe, expect, it } from "vitest";

import { extractBlock, extractPreview } from "./extract-preview.ts";

const FRAGMENT = `<p>до</p>
<div id="prob:colloq1:sup" class="nb nb-problem" data-type="problem">
  <div class="nb-body"><p>Найдите <span id="eq:inner" class="nb-eq">sup</span>.</p></div>
</div>
<div class="nb-answer"><p>Ответ: 1.</p></div>
<div class="nb-solution"><p>Решение.</p></div>
<p>после</p>
<div id="thm:lec06:bw" class="nb nb-theorem"><div class="nb-body"><p>Б.</p><p>В.</p></div></div>`;

describe("extractBlock", () => {
  it("takes a problem together with its answer and solution", () => {
    const html = extractBlock(FRAGMENT, "prob:colloq1:sup") ?? "";
    expect(html).toContain("Найдите");
    expect(html).toContain("Ответ: 1.");
    expect(html).toContain("Решение.");
    expect(html).not.toContain("после");
  });

  it("drops the ids of the block and everything inside", () => {
    const html = extractBlock(FRAGMENT, "prob:colloq1:sup") ?? "";
    expect(html).not.toContain("id=");
    expect(html).toContain('class="nb-eq"');
  });

  it("keeps the whole body, unlike a hover preview", () => {
    expect(extractBlock(FRAGMENT, "thm:lec06:bw")).toContain("В.");
    expect(extractPreview(FRAGMENT, "thm:lec06:bw")).toContain("В.");
    expect(extractBlock(FRAGMENT, "thm:lec06:bw")).toContain('class="nb nb-theorem"');
  });

  it("returns nothing for an unknown label", () => {
    expect(extractBlock(FRAGMENT, "thm:lec06:none")).toBeUndefined();
  });
});

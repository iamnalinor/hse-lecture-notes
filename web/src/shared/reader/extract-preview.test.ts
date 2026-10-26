import { describe, expect, it } from "vitest";

import { extractBlock, extractPreview } from "./extract-preview.ts";

const FRAGMENT = `<p>до</p>
<div id="prob:colloq1:sup" class="nb nb-problem" data-type="problem">
  <div class="nb-body"><p>Найдите <span id="eq:inner" class="nb-eq">sup</span>.</p></div>
</div>
<div class="nb-answer"><p>Ответ: 1.</p></div>
<div class="nb-solution"><p>Решение.</p></div>
<p>после</p>
<div id="thm:lec06:bw" class="nb nb-theorem"><div class="nb-body"><p>Б.</p><p>В.</p></div></div>
<p>Ниже «бесконечно много членов» — это номера.</p>
<div class="nb-proof"><p><em>Доказательство.</em> Делим пополам.</p></div>
<div class="nb-proof"><p>Второй пункт.</p></div>
<div id="def:lec06:x" class="nb nb-definition"><div class="nb-body"><p>Опр.</p></div></div>
<div class="nb-proof"><p>Чужое доказательство.</p></div>`;

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

  it("attaches the proof that follows a statement only when asked", () => {
    expect(extractBlock(FRAGMENT, "thm:lec06:bw")).not.toContain("Делим пополам");
    const html = extractBlock(FRAGMENT, "thm:lec06:bw", true) ?? "";
    expect(html).toContain("Делим пополам");
    expect(html).toContain("Второй пункт.");
    // the paragraph in between stays on its page, the next block and its proof are not ours
    expect(html).not.toContain("бесконечно много членов");
    expect(html).not.toContain("Опр.");
  });

  it("does not take a proof across another block", () => {
    expect(extractBlock(FRAGMENT, "prob:colloq1:sup", true)).not.toContain("Делим пополам");
  });

  it("returns nothing for an unknown label", () => {
    expect(extractBlock(FRAGMENT, "thm:lec06:none")).toBeUndefined();
  });
});

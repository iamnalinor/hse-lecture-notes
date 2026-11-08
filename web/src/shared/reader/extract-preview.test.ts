import { describe, expect, it } from "vitest";

import { extractAnswerPart, extractPreview } from "./extract-preview.ts";

const FRAGMENT = `<p>до</p>
<div id="prob:colloq1:sup" class="nb nb-problem" data-type="problem">
  <div class="nb-body"><p>Найдите <span id="eq:inner" class="nb-eq">sup</span>.</p></div>
</div>
<div class="nb-answer"><p>Ответ: 1.</p></div>
<div class="nb-solution"><p>Решение.</p></div>
<p>после</p>
<span id="eq:lec06:x" class="nb-eq" data-number="6.2">x = 1</span>
<div id="thm:lec06:bw" class="nb nb-theorem"><div class="nb-head"><span class="nb-name">Теорема 6.1
(Больцано–Вейерштрасс)</span></div><div class="nb-body"><p>Б.</p><p>В.</p></div></div>
<p>Ниже «бесконечно много членов» — это номера.</p>
<div class="nb-proof"><p><em>Доказательство.</em> Делим пополам.</p></div>
<div class="nb-proof"><p>Второй пункт.</p></div>
<div id="def:lec06:x" class="nb nb-definition"><div class="nb-body"><p>Опр.</p></div></div>
<div class="nb-proof"><p>Чужое доказательство.</p></div>`;

const part = (id: string, shouldAttachProof = false) =>
  extractAnswerPart(FRAGMENT, id, shouldAttachProof);

describe("extractAnswerPart", () => {
  it("gives a problem's answer and solution, not its statement", () => {
    const html = part("prob:colloq1:sup")?.html ?? "";
    expect(html).toContain("Ответ: 1.");
    expect(html).toContain("Решение.");
    expect(html).not.toContain("Найдите");
    expect(html).not.toContain("после");
  });

  it("drops the card: only the content of the block, without ids", () => {
    const html = part("thm:lec06:bw")?.html ?? "";
    expect(html).toBe("<p>Б.</p><p>В.</p>");
    expect(extractPreview(FRAGMENT, "thm:lec06:bw")).toContain("В.");
  });

  it("names the block as its card does, on one line", () => {
    expect(part("thm:lec06:bw")?.name).toBe("Теорема 6.1 (Больцано–Вейерштрасс)");
    expect(part("eq:lec06:x")?.name).toBe("Формула (6.2)");
  });

  it("attaches the proof that follows a statement only when asked", () => {
    expect(part("thm:lec06:bw")?.html).not.toContain("Делим пополам");
    const html = part("thm:lec06:bw", true)?.html ?? "";
    expect(html).toContain("Делим пополам");
    expect(html).toContain("Второй пункт.");
    expect(html).not.toContain("nb-proof");
    // the paragraph in between stays on its page, the next block and its proof are not ours
    expect(html).not.toContain("бесконечно много членов");
    expect(html).not.toContain("Опр.");
  });

  it("does not take a proof across another block", () => {
    expect(part("prob:colloq1:sup", true)?.html).not.toContain("Делим пополам");
  });

  it("takes a formula whole, without its id", () => {
    expect(part("eq:lec06:x")?.html).toBe('<span class="nb-eq" data-number="6.2">x = 1</span>');
  });

  it("returns nothing for an unknown label", () => {
    expect(part("thm:lec06:none")).toBeUndefined();
  });
});

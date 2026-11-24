import { afterEach, expect, it } from "vitest";

import { selectParagraphOnTripleClick } from "./selection-paragraph.ts";

afterEach(() => {
  globalThis.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

it.each([
  [
    "assistant list",
    '<div class="ai-answer"><ul><li>До <span>x</span> после.</li><li>Соседний пункт.</li></ul></div>',
  ],
  [
    "assistant heading",
    '<div class="ai-answer"><h2>До <span>x</span> после.</h2><p>Соседний абзац.</p></div>',
  ],
  [
    "notes list",
    '<div class="prose-notes"><ol><li>До <span>x</span> после.</li><li>Соседний пункт.</li></ol></div>',
  ],
  [
    "table cell",
    '<div class="prose-notes"><table><tbody><tr><td>До <span>x</span> после.</td><td>Соседняя ячейка.</td></tr></tbody></table></div>',
  ],
  [
    "definition",
    '<div class="prose-notes"><dl><dt>Термин</dt><dd>До <span>x</span> после.</dd></dl></div>',
  ],
  ["user message", '<div class="ai-bubble">До <span>x</span> после.</div>'],
  [
    "quote",
    '<div class="ai-quote"><span class="ai-quote-src">Источник</span><span class="ai-quote-txt">До <span>x</span> после.</span></div>',
  ],
])("selects the whole %s across inline elements without adjacent blocks", (_label, html) => {
  document.body.append(document.createRange().createContextualFragment(html));
  const inline = document.querySelector("span:not(.ai-quote-src, .ai-quote-txt)");
  if (inline === null) {
    throw new Error("missing inline text");
  }
  document.addEventListener("mousedown", selectParagraphOnTripleClick, { once: true });
  inline.dispatchEvent(
    new MouseEvent("mousedown", { detail: 3, button: 0, bubbles: true, cancelable: true }),
  );
  expect(globalThis.getSelection()?.toString()).toBe("До x после.");
});

it.each([
  '<div class="ai-answer"><pre><code>До <span>x</span> после.</code></pre></div>',
  '<div class="prose-notes"><div contenteditable="true"><p>До <span>x</span> после.</p></div></div>',
  "<button>До <span>x</span> после.</button>",
])("preserves native selection in code, editors and interface controls: %s", (html) => {
  document.body.append(document.createRange().createContextualFragment(html));
  const inline = document.querySelector("span");
  if (inline === null) {
    throw new Error("missing inline text");
  }
  const range = document.createRange();
  range.selectNodeContents(inline);
  globalThis.getSelection()?.addRange(range);
  document.addEventListener("mousedown", selectParagraphOnTripleClick, { once: true });
  const event = new MouseEvent("mousedown", {
    detail: 3,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  inline.dispatchEvent(event);
  expect(globalThis.getSelection()?.toString()).toBe("x");
  expect(event.defaultPrevented).toBe(false);
});

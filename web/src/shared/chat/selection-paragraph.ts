/** Native triple-click selection can stop at KaTeX inline-block boundaries. */
export const selectParagraphOnTripleClick = (event: MouseEvent): void => {
  if (
    event.detail !== 3 ||
    event.button !== 0 ||
    !(event.target instanceof Element) ||
    event.target.closest(
      'pre, input, textarea, [contenteditable]:not([contenteditable="false"])',
    ) !== null
  ) {
    return;
  }
  const paragraph = event.target.closest(
    ":is(.prose-notes, .ai-answer) :is(p, li, dt, dd, td, th, h1, h2, h3, h4, h5, h6), .ai-bubble, .ai-quote-txt",
  );
  if (paragraph === null) {
    return;
  }
  const selection = globalThis.getSelection();
  if (selection === null) {
    return;
  }
  event.preventDefault();
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  selection.removeAllRanges();
  selection.addRange(range);
};

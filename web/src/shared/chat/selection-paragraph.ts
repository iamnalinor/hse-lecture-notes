/** Native triple-click selection can stop at KaTeX inline-block boundaries. */
export const selectParagraphOnTripleClick = (event: MouseEvent): void => {
  if (event.detail !== 3 || event.button !== 0 || !(event.target instanceof Element)) {
    return;
  }
  const paragraph = event.target.closest(".prose-notes p, .ai-answer p");
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

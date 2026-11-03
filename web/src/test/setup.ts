import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has `<dialog>` but not its modal API: enough of it for the search dialog.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.open = false;
  // Browsers queue the event; firing it at once would hide StrictMode bugs.
  setTimeout(() => {
    this.dispatchEvent(new Event("close"));
  });
};

// jsdom does no layout: scrolling an element into view is a no-op (the table of contents calls it).
Element.prototype.scrollIntoView = function scrollIntoView() {
  // nothing to scroll
};

afterEach(() => {
  cleanup();
});

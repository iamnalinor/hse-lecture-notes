import type { Page } from "@playwright/test";

/**
Chromium cannot open a soft keyboard, so the visual viewport is replaced by a controllable one: the
page sees the same events and numbers a phone sends when the keyboard opens (a shorter `height`).
*/
export const installFakeVisualViewport = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const target = new EventTarget();
    const fake = Object.assign(target, {
      height: globalThis.innerHeight,
      offsetLeft: 0,
      offsetTop: 0,
      width: globalThis.innerWidth,
    });
    Object.defineProperties(globalThis, {
      visualViewport: { configurable: true, value: fake },
      __setKeyboard: {
        value: (keyboardHeight: number) => {
          fake.height = globalThis.innerHeight - keyboardHeight;
          target.dispatchEvent(new Event("resize"));
        },
      },
    });
  });
};

export const setKeyboardHeight = async (page: Page, keyboardHeight: number): Promise<void> => {
  await page.evaluate((height) => {
    (globalThis as unknown as { __setKeyboard: (n: number) => void }).__setKeyboard(height);
  }, keyboardHeight);
};

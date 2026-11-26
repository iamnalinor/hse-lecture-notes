import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useKeyboardInset } from "#web/shared/chat/use-keyboard-inset.ts";

const root = document.documentElement;

const installViewport = () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  Object.defineProperty(globalThis, "visualViewport", { configurable: true, value: viewport });
  return viewport;
};

describe("useKeyboardInset", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("720px") })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "visualViewport");
    root.removeAttribute("style");
  });

  it("follows the visible rectangle while the chat is open on a phone and cleans up", () => {
    const viewport = installViewport();
    const { rerender } = renderHook(
      ({ isOpen }) => {
        useKeyboardInset(isOpen);
      },
      { initialProps: { isOpen: true } },
    );
    expect(root.style.getPropertyValue("--ai-vv-height")).toBe("800px");
    viewport.height = 460;
    viewport.offsetTop = 12;
    act(() => {
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(root.style.getPropertyValue("--ai-vv-height")).toBe("460px");
    expect(root.style.getPropertyValue("--ai-vv-top")).toBe("12px");
    rerender({ isOpen: false });
    expect(root.style.getPropertyValue("--ai-vv-height")).toBe("");
    viewport.height = 300;
    viewport.dispatchEvent(new Event("resize"));
    expect(root.style.getPropertyValue("--ai-vv-height")).toBe("");
  });

  it("does nothing on a wide screen", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    installViewport();
    renderHook(() => {
      useKeyboardInset(true);
    });
    expect(root.style.getPropertyValue("--ai-vv-height")).toBe("");
  });
});

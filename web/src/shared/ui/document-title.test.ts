import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDocumentTitle } from "./document-title.ts";

describe("useDocumentTitle", () => {
  it("sets the title of the page with the site name", () => {
    renderHook(() => {
      useDocumentTitle("Алгебра");
    });
    expect(document.title).toBe("Алгебра — Конспекты ПИ ФКН");
  });

  it("gives the site title back when the page unmounts", () => {
    const { unmount } = renderHook(() => {
      useDocumentTitle("Алгебра, лекция 4");
    });
    unmount();
    expect(document.title).toBe("Конспекты ПИ ФКН");
  });
});

import { afterEach, expect, it, vi } from "vitest";

import { watchSelectionEnd } from "./selection-events.ts";

afterEach(() => {
  vi.useRealTimers();
});
it("keeps native touch selection active after pointer cancellation", () => {
  vi.useFakeTimers();
  const update = vi.fn();
  const cleanup = watchSelectionEnd(update, vi.fn());
  try {
    for (const type of ["pointerdown", "touchstart", "pointercancel", "selectionchange"]) {
      document.dispatchEvent(new Event(type));
    }
    vi.advanceTimersByTime(300);
    expect(update).not.toHaveBeenCalled();
    document.dispatchEvent(new Event("touchend"));
    vi.runAllTimers();
    expect(update).toHaveBeenCalledOnce();
  } finally {
    cleanup();
  }
});
it("waits for native handle changes to settle and cancels pending updates on cleanup", () => {
  vi.useFakeTimers();
  const update = vi.fn();
  const cleanup = watchSelectionEnd(update, vi.fn());
  document.dispatchEvent(new Event("selectionchange"));
  vi.advanceTimersByTime(170);
  document.dispatchEvent(new Event("selectionchange"));
  vi.advanceTimersByTime(170);
  expect(update).not.toHaveBeenCalled();
  vi.advanceTimersByTime(10);
  expect(update).toHaveBeenCalledOnce();
  document.dispatchEvent(new Event("selectionchange"));
  cleanup();
  vi.runAllTimers();
  expect(update).toHaveBeenCalledOnce();
});

it("waits until Shift is released between keyboard selection steps", () => {
  vi.useFakeTimers();
  const update = vi.fn();
  const cleanup = watchSelectionEnd(update, vi.fn());
  try {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft" }));
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", shiftKey: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowRight", code: "ArrowRight", shiftKey: true }),
    );
    vi.advanceTimersByTime(300);
    expect(update).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft" }));
    vi.runAllTimers();
    expect(update).toHaveBeenCalledOnce();
  } finally {
    cleanup();
  }
});

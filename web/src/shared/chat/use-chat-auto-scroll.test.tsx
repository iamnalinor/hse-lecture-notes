import { fireEvent, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { makeAssistantMsg } from "./chat-stream-helpers.ts";
import { useChatAutoScroll } from "./use-chat-auto-scroll.ts";

it("pauses streaming autoscroll on upward input and resumes only when the user reaches the bottom", () => {
  const el = document.createElement("div");
  document.body.append(el);
  let height = 1000;
  Object.defineProperties(el, {
    scrollHeight: { get: () => height },
    clientHeight: { value: 300 },
  });
  const scrollTo = vi.fn();
  el.scrollTo = scrollTo;
  const message = makeAssistantMsg({ course: "", docId: "" });
  const ref = { current: el };
  const { rerender } = renderHook(
    ({ text }) => {
      useChatAutoScroll(ref, {
        messages: [{ ...message, contentTex: text }],
        isLoading: false,
      });
    },
    { initialProps: { text: "" } },
  );
  expect(scrollTo).toHaveBeenCalledWith({ behavior: "instant", top: 1000 });
  scrollTo.mockClear();
  el.scrollTop = 660;
  fireEvent.wheel(el, { deltaY: -40 });
  fireEvent.scroll(el);
  height = 1100;
  rerender({ text: "new token" });
  expect(scrollTo).not.toHaveBeenCalled();
  expect(el.scrollTop).toBe(660);
  el.scrollTop = 800;
  fireEvent.scroll(el);
  height = 1200;
  rerender({ text: "new token and more" });
  expect(scrollTo).toHaveBeenCalledWith({ behavior: "instant", top: 1200 });
  scrollTo.mockClear();
  fireEvent.wheel(el, { deltaY: -10 });
  rerender({ text: "another token before the native scroll event" });
  expect(scrollTo).not.toHaveBeenCalled();
  el.remove();
});

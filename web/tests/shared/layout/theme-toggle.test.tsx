import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { ThemeToggle } from "#web/shared/layout/theme-toggle.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "startViewTransition");
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
});

test("reduced motion changes and persists the theme without starting an animation", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const start = vi.fn();
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Тёмная тема" }));
  expect(document.documentElement.dataset["theme"]).toBe("dark");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(start).not.toHaveBeenCalled();
});

test("animated switch updates the theme and unlocks the button when it finishes", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const start = vi.fn((update: () => void) => {
    update();
    return { finished: Promise.resolve(), ready: Promise.resolve() };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Тёмная тема" }));
  expect(start).toHaveBeenCalledOnce();
  expect(localStorage.getItem("theme")).toBe("dark");
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Светлая тема" })).toBeEnabled();
  });
});

test("browsers without View Transitions still switch themes", async () => {
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Тёмная тема" }));
  expect(document.documentElement.dataset["theme"]).toBe("dark");
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Светлая тема" })).toBeEnabled();
  });
});

test("a skipped snapshot still saves the theme and unlocks its button", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const start = vi.fn((update: () => void) => {
    update();
    return { ready: Promise.reject(new Error("Snapshot skipped")), finished: Promise.resolve() };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Тёмная тема" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Светлая тема" })).toBeEnabled();
  });
  expect(localStorage.getItem("theme")).toBe("dark");
});

const stubReveal = () => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const start = vi.fn((update: () => void) => {
    update();
    return { finished: Promise.resolve(), ready: Promise.resolve() };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  const animate = vi.fn(() => ({ finished: Promise.resolve() }));
  Object.defineProperty(document.documentElement, "animate", {
    value: animate,
    configurable: true,
  });
  return animate;
};

const firstAnimation = (animate: ReturnType<typeof stubReveal>) => {
  const call = animate.mock.calls[0] as unknown as [Keyframe[], KeyframeAnimationOptions];
  return { keyframes: call[0], options: call[1] };
};

test("to dark, the new theme grows from the button as a soft circle (Telegram Android)", async () => {
  const animate = stubReveal();
  render(<ThemeToggle />);
  const button = screen.getByRole("button", { name: "Тёмная тема" });
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 20, 40, 40));
  fireEvent.click(button);
  await waitFor(() => {
    expect(animate).toHaveBeenCalledOnce();
  });
  const { keyframes, options } = firstAnimation(animate);
  expect(options).toMatchObject({ duration: 450, pseudoElement: "::view-transition-new(root)" });
  expect(keyframes[0]).toMatchObject({ maskSize: "0px 0px", maskPosition: "120px 40px" });
  expect(document.documentElement.dataset["themeReveal"]).toBeUndefined();
});

test("to light, the old dark snapshot shrinks into the button", async () => {
  document.documentElement.dataset["theme"] = "dark";
  localStorage.setItem("theme", "dark");
  const animate = stubReveal();
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Светлая тема" }));
  await waitFor(() => {
    expect(animate).toHaveBeenCalledOnce();
  });
  const { keyframes, options } = firstAnimation(animate);
  expect(options).toMatchObject({ pseudoElement: "::view-transition-old(root)" });
  expect(keyframes.at(-1)).toMatchObject({ maskSize: "0px 0px" });
});

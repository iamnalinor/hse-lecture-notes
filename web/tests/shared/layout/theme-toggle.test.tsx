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
  render(<ThemeToggle place="bar" />);
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
  render(<ThemeToggle place="bar" />);
  fireEvent.click(screen.getByRole("button", { name: "Тёмная тема" }));
  expect(start).toHaveBeenCalledOnce();
  expect(localStorage.getItem("theme")).toBe("dark");
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Светлая тема" })).toBeEnabled();
  });
});

test("browsers without View Transitions still switch themes", async () => {
  render(<ThemeToggle place="bar" />);
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
  render(<ThemeToggle place="bar" />);
  fireEvent.click(screen.getByRole("button", { name: "Тёмная тема" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Светлая тема" })).toBeEnabled();
  });
  expect(localStorage.getItem("theme")).toBe("dark");
});

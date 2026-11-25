import { useState } from "react";

import { MoonIcon, SunIcon } from "#web/shared/ui/icons.tsx";

import { setTheme, useTheme } from "./theme.ts";

/** Soft edge as a share of the radius and timing, as in Telegram Android's `ThemeRevealView`. */
const SOFT_EDGE = 0.4;
const REVEAL_MS = 450;
const EASE_IN_OUT_QUAD = "cubic-bezier(0.455, 0.03, 0.515, 0.955)";

type Point = { readonly x: number; readonly y: number };

const centerOf = (element: HTMLElement): Point => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

/** Keyframes of a radial mask whose circle (with a soft rim) is centred on `origin`. */
const circle = ({ x, y }: Point, radius: number): Keyframe => ({
  maskPosition: `${String(x - radius)}px ${String(y - radius)}px`,
  maskSize: `${String(2 * radius)}px ${String(2 * radius)}px`,
});

/** To dark the new theme grows from the button; to light the old dark one shrinks into it. */
const reveal = (origin: Point, isToDark: boolean): Animation => {
  const far = Math.max(
    Math.hypot(origin.x, origin.y),
    Math.hypot(innerWidth - origin.x, origin.y),
    Math.hypot(origin.x, innerHeight - origin.y),
    Math.hypot(innerWidth - origin.x, innerHeight - origin.y),
  );
  const frames = [circle(origin, 0), circle(origin, far / (1 - SOFT_EDGE))];
  return document.documentElement.animate(isToDark ? frames : frames.toReversed(), {
    duration: REVEAL_MS,
    easing: EASE_IN_OUT_QUAD,
    fill: "both",
    pseudoElement: isToDark ? "::view-transition-new(root)" : "::view-transition-old(root)",
  });
};

const switchTheme = async (theme: "dark" | "light", origin: Point): Promise<void> => {
  const update = () => {
    setTheme(theme);
  };
  if (
    typeof document.startViewTransition !== "function" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  const root = document.documentElement;
  root.dataset["themeReveal"] = theme;
  const transition = document.startViewTransition(update);
  try {
    await transition.ready;
    reveal(origin, theme === "dark");
  } catch {
    // Hidden tabs and skipped snapshots still apply the selected theme.
  }
  try {
    await transition.finished;
  } catch {
    // A skipped animation must not leave its button disabled.
  } finally {
    delete root.dataset["themeReveal"];
  }
};

export const ThemeToggle = () => {
  const theme = useTheme();
  const [isSwitching, setIsSwitching] = useState(false);
  const isDark = theme === "dark";
  const label = isDark ? "Светлая тема" : "Тёмная тема";
  return (
    <button
      aria-label={label}
      className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-rule bg-card text-ink hover:bg-wash"
      disabled={isSwitching}
      onClick={async (event) => {
        setIsSwitching(true);
        try {
          await switchTheme(isDark ? "light" : "dark", centerOf(event.currentTarget));
        } finally {
          setIsSwitching(false);
        }
      }}
      type="button"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
};

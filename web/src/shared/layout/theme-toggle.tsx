import { useState } from "react";

import { MoonIcon, SunIcon } from "#web/shared/ui/icons.tsx";

import { setTheme, useTheme } from "./theme.ts";

type Props = {
  /** `bar` — an icon in the top bar; `footer` — icon and words at the page end (phones). */
  readonly place: "bar" | "footer";
};

const switchTheme = async (theme: "dark" | "light"): Promise<void> => {
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
  const transition = document.startViewTransition(update);
  try {
    await transition.ready;
  } catch {
    // Hidden tabs and skipped snapshots still apply the selected theme.
  }
  try {
    await transition.finished;
  } catch {
    // A skipped animation must not leave its button disabled.
  }
};

export const ThemeToggle = ({ place }: Props) => {
  const theme = useTheme();
  const [isSwitching, setIsSwitching] = useState(false);
  const isDark = theme === "dark";
  const label = isDark ? "Светлая тема" : "Тёмная тема";
  return (
    <button
      aria-label={place === "bar" ? label : undefined}
      className={
        place === "bar"
          ? "flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-rule bg-card text-ink"
          : "-ml-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-muted hover:text-ink md:hidden"
      }
      disabled={isSwitching}
      onClick={async () => {
        setIsSwitching(true);
        try {
          await switchTheme(isDark ? "light" : "dark");
        } finally {
          setIsSwitching(false);
        }
      }}
      type="button"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {place === "footer" && label}
    </button>
  );
};

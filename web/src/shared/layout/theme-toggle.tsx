import { MoonIcon, SunIcon } from "#web/shared/ui/icons.tsx";

import { setTheme, useTheme } from "./theme.ts";

type Props = {
  /** `bar` — an icon in the top bar; `footer` — icon and words at the page end (phones). */
  readonly place: "bar" | "footer";
};

export const ThemeToggle = ({ place }: Props) => {
  const theme = useTheme();
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
      onClick={() => {
        setTheme(isDark ? "light" : "dark");
      }}
      type="button"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
      {place === "footer" && label}
    </button>
  );
};

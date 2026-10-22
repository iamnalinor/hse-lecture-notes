import { Link, NavLink } from "react-router";

import { COURSES } from "#web/domain/courses.ts";
import { paths } from "#web/domain/paths.ts";
import { SearchButton } from "#web/shared/search/search-button.tsx";

import { ThemeToggle } from "./theme-toggle.tsx";

export const TopBar = () => (
  <header className="border-b border-rule bg-paper">
    <div className="mx-auto flex min-h-15 max-w-[1360px] flex-wrap items-center gap-x-7 gap-y-1 px-4 py-2 sm:px-8">
      <Link
        className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.01em] text-ink no-underline"
        to={paths.home()}
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-brand text-xs font-black text-white">
          ПИ
        </span>
        <span>
          Конспекты ФКН <span className="font-normal text-faint">2026/27</span>
        </span>
      </Link>
      <nav
        aria-label="Курсы"
        className="order-last -mx-2 flex w-full gap-1 overflow-x-auto md:order-0 md:mx-0 md:w-auto"
      >
        {COURSES.map((course) => (
          <NavLink
            className="rounded-md px-3 py-2 text-[14.5px] whitespace-nowrap text-muted no-underline aria-[current=page]:bg-wash aria-[current=page]:font-semibold aria-[current=page]:text-ink"
            key={course.id}
            to={paths.course(course.id)}
          >
            {course.short}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <SearchButton />
        <ThemeToggle />
      </div>
    </div>
  </header>
);

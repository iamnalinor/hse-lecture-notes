import { Link, NavLink } from "react-router";

import { COURSES } from "#web/domain/courses.ts";
import { paths } from "#web/domain/paths.ts";
import { HeaderSearch } from "#web/shared/search/header-search.tsx";

import { ThemeToggle } from "./theme-toggle.tsx";

export const TopBar = () => (
  <header className="border-b border-rule bg-paper">
    <div className="relative mx-auto flex min-h-15 max-w-[1360px] items-center gap-x-2 px-4 py-2 sm:gap-x-4 sm:px-8 md:gap-x-7">
      <Link
        className="flex items-center gap-2.5 text-subhead font-bold tracking-[0.01em] text-ink no-underline"
        to={paths.home()}
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-brand text-caption font-black text-white">
          ПИ
        </span>
        <span className="sr-only whitespace-nowrap sm:not-sr-only md:sr-only lg:not-sr-only">
          Конспекты ФКН <span className="font-normal text-faint">2026/27</span>
        </span>
      </Link>
      <nav
        aria-label="Курсы"
        className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto md:flex-none md:gap-1"
      >
        {COURSES.map((course) => (
          <NavLink
            className="rounded-md px-2.5 py-2 text-subhead whitespace-nowrap text-muted no-underline focus-visible:-outline-offset-2 aria-[current=page]:bg-wash aria-[current=page]:font-semibold aria-[current=page]:text-ink sm:px-3"
            key={course.id}
            to={paths.course(course.id)}
          >
            {course.short}
          </NavLink>
        ))}
      </nav>
      <div className="flex shrink-0 items-center justify-end gap-1 md:ml-auto md:gap-2">
        <HeaderSearch />
        <ThemeToggle place="bar" />
      </div>
    </div>
  </header>
);

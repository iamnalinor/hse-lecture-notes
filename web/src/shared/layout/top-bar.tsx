import { Link, NavLink } from "react-router";

import { COURSES } from "#web/domain/courses.ts";
import { paths } from "#web/domain/paths.ts";
import { ChatToggleButton } from "#web/shared/chat/panel/toggle-button.tsx";
import { HeaderSearch } from "#web/shared/search/header-search.tsx";

import { ThemeToggle } from "./theme-toggle.tsx";

export const TopBar = () => (
  <header className="@container border-b border-rule bg-paper" data-site-header="">
    <div className="relative mx-auto flex min-h-13 max-w-[1360px] items-center gap-x-1 px-4 py-2 min-[380px]:gap-x-2 sm:min-h-15 sm:gap-x-4 sm:px-8 md:gap-x-7">
      <Link
        className="flex items-center gap-2.5 text-subhead font-bold tracking-[0.01em] text-ink no-underline"
        to={paths.home()}
      >
        {/* Phones: the same 44 px as the search field and the buttons beside it; 28 px from 640 px. */}
        <span className="flex size-11 items-center justify-center rounded-[22%] bg-brand text-white sm:size-7">
          {/* Σ drawn to HSE Sans proportions (the same path as public/favicon.svg). */}
          <svg aria-hidden="true" className="size-full" viewBox="0 0 32 32">
            <path
              d="M9.01 6.25H23.49V11.07H17.99L23.45 14.75V17.25L17.99 20.93H23.49V25.75H9.01V21.62L17.33 16L9.01 10.38Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="sr-only whitespace-nowrap @min-[76rem]:not-sr-only">
          Конспекты ФКН <span className="font-normal text-faint">2026/27</span>
        </span>
      </Link>
      <nav aria-label="Курсы" className="hidden shrink-0 gap-1 @4xl:flex" data-course-nav="">
        {COURSES.map((course) => (
          <NavLink
            className="flex min-h-8 items-center rounded-md px-1.5 py-1 text-footnote whitespace-nowrap text-muted no-underline focus-visible:-outline-offset-2 aria-[current=page]:bg-wash aria-[current=page]:font-semibold aria-[current=page]:text-ink min-[380px]:px-2 min-[380px]:text-subhead sm:min-h-10 sm:px-3"
            key={course.id}
            to={paths.course(course.id)}
          >
            {course.short}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 max-[21rem]:flex-none md:flex-none md:gap-2">
        <HeaderSearch />
        <ChatToggleButton />
        <ThemeToggle />
      </div>
    </div>
  </header>
);

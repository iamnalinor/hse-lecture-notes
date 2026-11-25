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
          {/* Σ built from HSE Sans 600 metrics (bars of E/Z, diagonal of Z, tip of >) with softened
              corners; the font has no Σ. The same path as public/favicon.svg. */}
          <svg aria-hidden="true" className="size-full" viewBox="0 0 32 32">
            <path
              d="M10.43 8.69Q10.43 8.2 10.92 8.2L21.08 8.2Q21.57 8.2 21.57 8.69L21.57 10.23Q21.57 10.72 21.08 10.72L14.26 10.72Q13.77 10.72 14.18 10.99L19.83 14.83Q20.23 15.11 20.23 15.6L20.23 16.4Q20.23 16.89 19.83 17.17L14.18 21.01Q13.77 21.28 14.26 21.28L21.08 21.28Q21.57 21.28 21.57 21.77L21.57 23.31Q21.57 23.8 21.08 23.8L10.92 23.8Q10.43 23.8 10.43 23.31L10.43 20.32Q10.43 19.83 10.83 19.56L15.67 16.28Q16.07 16 15.67 15.72L10.83 12.44Q10.43 12.17 10.43 11.68Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="sr-only whitespace-nowrap @min-[76rem]:not-sr-only">
          Конспекты ПИ ФКН <span className="font-normal text-faint">2026/27</span>
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

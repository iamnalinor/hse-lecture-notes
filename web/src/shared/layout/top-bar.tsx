import { Link, NavLink } from "react-router";

import { COURSES } from "#web/domain/courses.ts";
import { paths } from "#web/domain/paths.ts";
import { ChatToggleButton } from "#web/shared/chat/panel/toggle-button.tsx";
import { HeaderSearch } from "#web/shared/search/header-search.tsx";

import { ThemeToggle } from "./theme-toggle.tsx";

export const TopBar = () => (
  <header className="@container border-b border-rule bg-paper" data-site-header="">
    <div className="relative mx-auto flex min-h-13 max-w-[1360px] items-center gap-x-3 px-4 py-2 sm:min-h-15 sm:gap-x-4 sm:px-8 md:gap-x-7">
      <Link
        className="hit-44 relative flex items-center gap-2.5 text-subhead font-bold tracking-[0.01em] text-ink no-underline"
        to={paths.home()}
      >
        {/* As tall as the search field and buttons beside it, 40 px (tests/e2e/layout.spec.ts); the tap area is 44 px (`hit-44`). */}
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-[22%] bg-brand text-white"
          data-logo-mark=""
        >
          {/* ∞, the glyph of HSE Sans 700 itself (U+221E), 18 of 32 units wide, centred. The same path as
              public/favicon.svg and the link previews (scripts/og-images.ts). */}
          <svg aria-hidden="true" className="size-full" viewBox="0 0 32 32">
            <path
              d="M20.16 21.14Q18.03 21.14 15.99 18.6Q13.97 21.14 11.84 21.14Q9.69 21.14 8.35 19.78Q7 18.42 7 15.99Q7 13.71 8.32 12.28Q9.64 10.86 11.84 10.86Q14.02 10.86 15.99 13.4Q17.96 10.86 20.16 10.86Q22.36 10.86 23.68 12.3Q25 13.73 25 15.99Q25 18.42 23.65 19.78Q22.31 21.14 20.16 21.14ZM20.16 13.86Q19.59 13.86 18.87 14.51Q18.16 15.16 17.72 16.01Q18.21 16.87 18.9 17.5Q19.59 18.14 20.16 18.14Q20.96 18.14 21.5 17.55Q22.05 16.97 22.05 15.99Q22.05 15 21.52 14.43Q20.99 13.86 20.16 13.86ZM11.84 18.14Q12.41 18.14 13.09 17.52Q13.76 16.89 14.25 15.99Q13.79 15.16 13.1 14.51Q12.41 13.86 11.84 13.86Q11.01 13.86 10.48 14.43Q9.95 15 9.95 15.99Q9.95 16.97 10.5 17.55Q11.04 18.14 11.84 18.14Z"
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
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 max-[21rem]:flex-none md:flex-none">
        <HeaderSearch />
        <ChatToggleButton />
        <ThemeToggle />
      </div>
    </div>
  </header>
);

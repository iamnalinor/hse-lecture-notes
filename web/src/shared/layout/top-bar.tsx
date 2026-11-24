import { Link, NavLink, useNavigate } from "react-router";

import { COURSES } from "#web/domain/courses.ts";
import { paths } from "#web/domain/paths.ts";
import { ChatToggleButton } from "#web/shared/chat/chat-toggle-button.tsx";
import { HeaderSearch } from "#web/shared/search/header-search.tsx";

import { ThemeToggle } from "./theme-toggle.tsx";

const CompactCourseMenu = () => {
  const navigate = useNavigate();
  return (
    <select
      aria-label="Перейти к курсу"
      className="min-h-8 max-w-16 min-w-0 bg-transparent text-footnote text-muted min-[560px]:hidden"
      onChange={(event) => {
        void navigate(paths.course(event.target.value));
      }}
      value=""
    >
      <option disabled value="">
        Курсы
      </option>
      {COURSES.map((course) => (
        <option key={course.id} value={course.id}>
          {course.name}
        </option>
      ))}
    </select>
  );
};

export const TopBar = () => (
  <header className="border-b border-rule bg-paper">
    <div className="relative mx-auto flex min-h-13 max-w-[1360px] items-center gap-x-1 px-4 py-2 min-[380px]:gap-x-2 sm:min-h-15 sm:gap-x-4 sm:px-8 md:gap-x-7">
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
      <CompactCourseMenu />
      <nav
        aria-label="Курсы"
        className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto md:flex-none md:gap-1"
        data-course-nav=""
      >
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
      <div className="flex shrink-0 items-center justify-end gap-1 md:ml-auto md:gap-2">
        <HeaderSearch />
        <ChatToggleButton />
        <ThemeToggle place="bar" />
      </div>
    </div>
  </header>
);

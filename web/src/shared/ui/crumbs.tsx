import { Link } from "react-router";

import { paths } from "#web/domain/paths.ts";

type Props = {
  readonly course: string;
  readonly courseName: string;
  /** The page itself: «Лекция 4», «Теория». */
  readonly current: string;
};

/** Course → page crumbs above the title of a document page. */
export const Crumbs = ({ course, courseName, current }: Props) => (
  <nav
    aria-label="Навигация"
    className="flex items-center gap-2 pt-8 text-[13.5px] text-muted lg:pt-12"
  >
    <Link className="text-muted no-underline" to={paths.course(course)}>
      {courseName}
    </Link>
    <span>/</span>
    <span className="text-ink">{current}</span>
  </nav>
);

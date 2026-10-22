import type { LectureEntry, PrepEntry } from "#web/domain/schemas.ts";

import { COURSES } from "#web/domain/courses.ts";

import { CourseCard } from "./course-card.tsx";
import { SectionTitle } from "./section-title.tsx";

type Props = {
  readonly lectures: Readonly<Record<string, readonly LectureEntry[]>>;
  readonly preps: Readonly<Record<string, readonly PrepEntry[]>>;
  readonly today: string;
};

export const CoursesSection = ({ lectures, preps, today }: Props) => (
  <section className="border-t border-rule py-16" id="courses">
    <div className="mb-7">
      <SectionTitle>Курсы</SectionTitle>
    </div>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {COURSES.map((course) => (
        <CourseCard
          course={course}
          key={course.id}
          lectures={lectures[course.id] ?? []}
          preps={preps[course.id] ?? []}
          today={today}
        />
      ))}
    </div>
  </section>
);

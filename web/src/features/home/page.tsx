import { useCatalog } from "#web/api/queries.ts";
import { COURSES } from "#web/domain/courses.ts";
import { useToday } from "#web/shared/ui/today.ts";

import { CoursesSection } from "./courses-section.tsx";
import { HomeHero } from "./hero.tsx";
import { type RecentItem, recentItems, RecentLectures } from "./recent-lectures.tsx";
import { SectionTitle } from "./section-title.tsx";
import { StudyPlanSection } from "./study-plan/view.tsx";

declare const HOME_STATEMENTS: null | number;

export const Component = () => {
  const catalog = useCatalog();
  const today = useToday();

  const all: RecentItem[] = COURSES.flatMap((course) =>
    (catalog.lectures[course.id] ?? []).map((lecture) => ({ course, lecture })),
  );

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
      <HomeHero courses={COURSES.length} lectures={all.length} statements={HOME_STATEMENTS} />
      <CoursesSection lectures={catalog.lectures} preps={catalog.preps} today={today} />
      <section className="border-t border-rule py-16">
        <div className="mb-7">
          <SectionTitle>Недавние лекции</SectionTitle>
        </div>
        <RecentLectures items={recentItems(all, today)} />
      </section>
      <StudyPlanSection today={today} />
    </div>
  );
};

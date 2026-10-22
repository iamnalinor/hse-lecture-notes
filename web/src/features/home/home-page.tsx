import { useCatalog, useLabelIndex } from "#web/api/queries.ts";
import { COURSES } from "#web/domain/courses.ts";
import { labelStats } from "#web/domain/stats.ts";
import { useToday } from "#web/shared/ui/today.ts";

import { CoursesSection } from "./courses-section.tsx";
import { HomeHero } from "./home-hero.tsx";
import { type RecentItem, recentItems, RecentLectures } from "./recent-lectures.tsx";
import { SectionTitle } from "./section-title.tsx";

export const Component = () => {
  const catalog = useCatalog();
  const labels = useLabelIndex();
  const today = useToday();

  const all: RecentItem[] = COURSES.flatMap((course) =>
    (catalog.lectures[course.id] ?? []).map((lecture) => ({ course, lecture })),
  );
  const statements = COURSES.map((course) => {
    const stats = labelStats(Object.values(labels[course.id] ?? {}));
    return stats.definitions + stats.theorems;
  }).reduce((sum, count) => sum + count, 0);

  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
      <HomeHero courses={COURSES.length} lectures={all.length} statements={statements} />
      <CoursesSection lectures={catalog.lectures} preps={catalog.preps} today={today} />
      <section className="border-t border-rule py-16">
        <div className="mb-7">
          <SectionTitle>Недавние лекции</SectionTitle>
        </div>
        <RecentLectures items={recentItems(all, today)} />
      </section>
    </div>
  );
};

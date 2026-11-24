import { useQuery } from "@tanstack/react-query";

import { curriculumQuery } from "#web/api/queries.ts";
import {
  creditSums,
  currentModule,
  type Curriculum,
  groupByCategory,
  loadText,
  maxLoad,
  moduleTotals,
  moduleWeeks,
} from "#web/domain/curriculum.ts";

import { SectionTitle } from "../section-title.tsx";
import { GroupRows, HeaderRow, type PlanScale, TotalRow } from "./rows.tsx";
import { barBackground } from "./style.ts";
import { StudyPlanTable } from "./table.tsx";

const LEGEND_STEPS = [0, 0.33, 0.66, 1] as const;

const Legend = ({ max, perWeek }: { readonly max: number; readonly perWeek: boolean }) => (
  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-rule px-4 py-3 text-footnote text-muted">
    <span className="flex items-center gap-2">
      <span className="whitespace-nowrap">меньше часов</span>
      <span className="flex gap-0.5">
        {LEGEND_STEPS.map((step) => (
          <span
            className="size-4 rounded-xs border border-rule"
            key={step}
            style={{ background: barBackground("math", 0.3 + step * 0.7) }}
          />
        ))}
      </span>
      <span className="whitespace-nowrap">
        больше (до {loadText(max)} {perWeek ? "ч/нед" : "ч"})
      </span>
    </span>
  </div>
);

/** The Gantt-like chart of the first-year plan: a bar per discipline and module, shaded by contact hours. */
export const StudyPlan = ({
  curriculum,
  today,
}: {
  readonly curriculum: Curriculum;
  readonly today: string;
}) => {
  const groups = groupByCategory(curriculum);
  const totals = moduleTotals(curriculum.disciplines);
  const sums = creditSums(curriculum);
  const weeks = moduleWeeks(curriculum);
  const scale: PlanScale = {
    current: currentModule(curriculum, today),
    max: maxLoad(curriculum.disciplines, weeks),
    maxTotal: Math.max(1, ...totals),
    totals,
    weeks,
  };
  return (
    <figure
      aria-label={curriculum.title}
      className="relative overflow-hidden rounded-xl border border-rule bg-card"
    >
      <div aria-hidden="true" className="overflow-x-auto">
        <div className="min-w-152">
          <HeaderRow current={scale.current} />
          <TotalRow scale={scale} />
          {groups.map((group) => (
            <GroupRows group={group} key={group.category.id} scale={scale} />
          ))}
        </div>
      </div>
      <StudyPlanTable groups={groups} totals={totals} />
      <Legend max={scale.max} perWeek={weeks !== undefined} />
      <figcaption className="px-4 pb-3 text-center text-footnote text-muted">
        Кредиты за год: {sums.shown} по дисциплинам выше · {sums.withHidden} с учебной практикой и
        физкультурой · {sums.withEnglish} с английским (факультатив)
      </figcaption>
    </figure>
  );
};

/** The study plan at the bottom of the home page; absent from older data, then there is no section. */
export const StudyPlanSection = ({ today }: { readonly today: string }) => {
  const { data } = useQuery(curriculumQuery);
  return data === undefined ? null : (
    <section className="border-t border-rule py-10 sm:py-16" id="plan">
      <div className="mb-7">
        <SectionTitle>Учебный план 1 курса</SectionTitle>
      </div>
      <StudyPlan curriculum={data} today={today} />
    </section>
  );
};

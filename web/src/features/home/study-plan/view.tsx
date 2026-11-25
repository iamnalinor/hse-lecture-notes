import { useQuery } from "@tanstack/react-query";
import { type CSSProperties, useRef } from "react";

import { curriculumQuery } from "#web/api/queries.ts";
import {
  creditSums,
  currentModule,
  type Curriculum,
  groupByCategory,
  maxLoad,
  moduleDays,
  MODULES,
  moduleTotals,
  moduleWeeks,
  todayInModule,
} from "#web/domain/curriculum.ts";

import { SectionTitle } from "../section-title.tsx";
import { ModuleEdges, TodayMark } from "./marks.tsx";
import { GroupRows, HeaderRow, moduleTrack, type PlanScale, TotalRow } from "./rows.tsx";
import { StudyPlanTable } from "./table.tsx";

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
  const chartRef = useRef<HTMLDivElement>(null);
  const days = moduleDays(curriculum);
  const todayMark = todayInModule(curriculum, today);
  const scale: PlanScale = {
    current: currentModule(curriculum, today),
    days,
    max: maxLoad(curriculum.disciplines, weeks),
    totals,
    weeks,
  };
  // Module tracks for every grid of the chart (rows, bar labels, marks): see GRID in rows.tsx.
  const tracks: CSSProperties & Record<`--${string}`, string> = {
    "--plan-modules": MODULES.map((_, index) => moduleTrack(days, index)).join(" "),
  };
  return (
    <figure
      aria-label={curriculum.title}
      className="relative overflow-hidden rounded-xl border border-rule bg-card"
    >
      <div
        aria-hidden="true"
        className="overflow-x-auto"
        onScroll={(event) => {
          // A CSS variable, not state: the marks' clip follows the scroll without re-rendering.
          chartRef.current?.style.setProperty(
            "--plan-scroll",
            `${String(event.currentTarget.scrollLeft)}px`,
          );
        }}
      >
        <div
          className="relative isolate min-w-152 [--plan-min:5.5rem] [--plan-name:8.75rem] sm:[--plan-min:6rem] sm:[--plan-name:11.5rem]"
          ref={chartRef}
          style={tracks}
        >
          <ModuleEdges />
          <HeaderRow current={scale.current} />
          <div className="relative">
            <TodayMark today={todayMark} />
            <TodayMark ghost today={todayMark} />
            <TotalRow scale={scale} />
            {groups.map((group) => (
              <GroupRows group={group} key={group.category.id} scale={scale} />
            ))}
          </div>
        </div>
      </div>
      <StudyPlanTable groups={groups} totals={totals} />
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

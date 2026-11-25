import { plural } from "#web/domain/text.ts";

import { HeroSheet } from "./hero-sheet.tsx";

type Props = {
  readonly courses: number;
  readonly lectures: number;
  readonly statements: number;
};

export const HomeHero = ({ courses, lectures, statements }: Props) => (
  <section className="grid items-center gap-6 pt-8 pb-10 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16 lg:py-19">
    <div>
      <h1 className="mb-6 text-large leading-[1.05] font-bold tracking-tight sm:text-display">
        Конспекты лекций, <em className="text-thm not-italic">которые интересно читать</em>
      </h1>
      <p className="mb-8 max-w-140 text-body/relaxed text-ink/85 sm:text-title3/relaxed">
        Алгебра, матан, дискра и АиАЯ первого курса ПИ. На каждую лекцию есть конспект: определения
        и теоремы с номерами, доказательства, примеры и задачи с решениями. Вся теория курса собрана
        на отдельной странице.
      </p>
      <dl className="flex flex-wrap gap-x-8 gap-y-5 border-t border-rule pt-6 max-sm:hidden">
        {(
          [
            [lectures, plural(lectures, ["конспект", "конспекта", "конспектов"])],
            [statements, "определений и теорем"],
            [courses, plural(courses, ["курс", "курса", "курсов"])],
          ] as const
        ).map(([value, caption]) => (
          <div className="flex flex-col" key={caption}>
            <dt className="order-last text-footnote text-muted">{caption}</dt>
            <dd className="text-title1 font-bold tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
    <HeroSheet />
  </section>
);

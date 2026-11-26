import { plural } from "#web/domain/text.ts";

import { HeroSheet } from "./hero-sheet.tsx";
import { HomeIntroduction } from "./introduction.tsx";

type Props = {
  readonly courses: number;
  readonly lectures: number;
  readonly statements: null | number;
};

export const HomeHero = ({ courses, lectures, statements }: Props) => (
  <HomeIntroduction
    counters={
      <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-5 border-t border-rule pt-6 max-sm:hidden">
        {(
          [
            [lectures, plural(lectures, ["конспект", "конспекта", "конспектов"])],
            [statements, "определений и теорем"],
            [courses, plural(courses, ["курс", "курса", "курсов"])],
          ] as const
        ).map(([value, caption]) =>
          value === null ? null : (
            <div className="flex flex-col" key={caption}>
              <dt className="order-last text-footnote text-muted">{caption}</dt>
              <dd className="text-title1 font-bold tracking-tight">{value}</dd>
            </div>
          ),
        )}
      </dl>
    }
    example={<HeroSheet />}
  />
);

import type { ReactNode } from "react";

import { RotatingSlogan } from "./rotating-slogan.tsx";

export const HomeIntroduction = ({
  counters,
  example,
}: {
  readonly counters?: ReactNode;
  readonly example?: ReactNode;
}) => (
  <section className="grid items-center gap-6 pt-8 pb-10 sm:pt-12 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16 lg:pt-19">
    <div>
      <RotatingSlogan />
      <p className="mb-0 max-w-140 text-body/relaxed text-ink/85 sm:text-title3/relaxed">
        Алгебра, матан, дискра и АиАЯ первого курса ПИ. На каждую лекцию есть конспект: определения
        и теоремы с номерами, доказательства, примеры и задачи с решениями.
      </p>
      {counters}
    </div>
    {example}
  </section>
);

/** The same heading in the built HTML and while the router is waiting for the page or its data. */
export const HomeStart = () => (
  <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
    <HomeIntroduction />
  </div>
);

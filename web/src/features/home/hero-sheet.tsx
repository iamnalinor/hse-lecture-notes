import { Block } from "#web/shared/reader/block.tsx";

import { HomeFormula } from "./home-formula.tsx";

const NAME = {
  label: "Теорема 6.11",
  title: (
    <>
      деление с остатком в <HomeFormula name="naturals" />
    </>
  ),
};

/** A fake page with a hover card: shows what the site does before the first click. Desktop only. */
export const HeroSheet = () => (
  <div
    aria-label="Пример страницы конспекта"
    className="relative hidden pt-2 pb-30 lg:block"
    role="img"
  >
    <div className="rotate-[-0.6deg] rounded-md border border-rule bg-card p-6 text-body/normal shadow-[0_30px_60px_-30px_rgba(0,0,0,0.18)]">
      <div className="mb-4 flex justify-between gap-3 text-caption text-muted">
        <span>Дискретная математика · лекция 6</span>
        <span className="shrink-0">§ 6.2</span>
      </div>
      <Block id={undefined} kind="theorem" name={NAME} number={undefined} tag={undefined}>
        <p>
          Для любых <HomeFormula name="operands" /> с <HomeFormula name="nonzero" /> существует
          единственная пара <HomeFormula name="pair" />, для которой <HomeFormula name="division" />{" "}
          <HomeFormula name="remainder" />.
        </p>
      </Block>
      <p className="mb-0">
        <em>Доказательство.</em> Рассмотрим множество остатков и применим{" "}
        <span className="ref bg-def/10">утверждение 5.19</span>.
      </p>
    </div>
    <div className="absolute right-0 bottom-0 w-95 rotate-[0.8deg] overflow-hidden rounded-lg border border-rule bg-card shadow-[0_22px_44px_-14px_rgba(0,0,0,0.25)]">
      <div className="flex gap-2 px-4 pt-3 text-footnote text-thm">
        <b className="font-semibold">Утверждение 5.19</b>
        <span className="text-muted">принцип наименьшего числа</span>
      </div>
      <p className="m-0 px-4 py-2 text-body/normal">
        Каждое непустое множество <HomeFormula name="subset" /> имеет наименьший элемент{" "}
        <HomeFormula name="minimum" />.
      </p>
      <div className="flex justify-between border-t border-rule px-4 py-2 text-caption text-muted">
        <span>Лекция 5 · Индукция на натуральных</span>
        <b className="text-def">Перейти →</b>
      </div>
    </div>
  </div>
);

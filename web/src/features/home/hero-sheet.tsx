import { Block } from "#web/shared/reader/block.tsx";
import { TexMath } from "#web/shared/reader/tex-math.tsx";

const NAME = {
  label: "Теорема 6.11",
  title: (
    <>
      деление с остатком в <TexMath display={false} tex={String.raw`\mathbb{N}`} />
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
    <div className="rotate-[-0.6deg] rounded-md border border-rule bg-card px-6.5 pt-5.5 pb-2.5 text-[17.5px] leading-normal shadow-[0_30px_60px_-30px_rgba(60,45,20,0.25)]">
      <div className="mb-3 flex justify-between gap-3 text-xs tracking-wide text-muted">
        <span>ДИСКРЕТНАЯ МАТЕМАТИКА · ЛЕКЦИЯ 6</span>
        <span className="shrink-0">§ 6.2</span>
      </div>
      <Block id={undefined} kind="theorem" name={NAME} number={undefined} tag={undefined}>
        <p>
          Для любых <TexMath display={false} tex={String.raw`a, b \in \mathbb{N}`} /> с{" "}
          <TexMath display={false} tex={String.raw`b \neq 0`} /> существует единственная пара{" "}
          <TexMath display={false} tex="(q, r)" />, для которой{" "}
          <TexMath display={false} tex="a = bq + r," />{" "}
          <TexMath display={false} tex={String.raw`0 \le r < b`} />.
        </p>
      </Block>
      <p>
        <em>Доказательство.</em> Рассмотрим множество остатков и применим{" "}
        <span className="ref bg-def/10">утверждение 5.19</span>.
      </p>
    </div>
    <div
      className="absolute -right-4 bottom-0 w-95 rotate-[0.8deg] overflow-hidden rounded-lg border border-rule bg-card shadow-[0_22px_44px_-14px_rgba(40,30,10,0.32)]"
      role="img"
    >
      <div className="flex gap-2 border-b border-rule bg-thm-soft px-3.5 py-2 text-[13px] text-thm">
        <b>Утверждение 5.19</b>
        <span className="text-ink">принцип наименьшего числа</span>
      </div>
      <p className="m-0 px-3.5 pt-2.5 pb-1 text-[16.5px] leading-normal">
        Каждое непустое множество{" "}
        <TexMath display={false} tex={String.raw`X \subseteq \mathbb{N}`} /> имеет наименьший
        элемент <TexMath display={false} tex={String.raw`\min X`} />.
      </p>
      <div className="flex justify-between border-t border-rule px-3.5 py-2 text-xs text-muted">
        <span>Лекция 5 · Индукция на натуральных</span>
        <b className="text-def">Перейти →</b>
      </div>
    </div>
  </div>
);

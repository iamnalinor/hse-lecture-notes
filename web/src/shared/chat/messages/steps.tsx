import { type JSX, useState } from "react";

import type { ChatStep } from "#web/domain/chat/model.ts";

import { TexText } from "#web/shared/reader/tex-text.tsx";

import { ChevronIcon, ReadStepIcon, SearchStepIcon } from "../icons.tsx";
import { isMaterialLink } from "./markdown-parse.ts";
import { ChatResponseStatus } from "./response-status.tsx";
import { SourceLink } from "./source-link.tsx";

const plural = (n: number, [one, few, many]: readonly [string, string, string]): string => {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 19) {
    return many;
  }
  const last = abs % 10;
  if (last === 1) {
    return one;
  }
  if (last >= 2 && last <= 4) {
    return few;
  }
  return many;
};

const pluralSteps = (n: number): string => plural(n, ["шаг", "шага", "шагов"]);

/** `sample_problems` picks problems at random, like the variant generator on prep pages. */
const formatSampleLabel = (step: ChatStep): string => {
  if (step.state === "running") {
    return "Генерирую задачи…";
  }
  const target = step.target ?? "генератор вариантов";
  if (step.state === "error") {
    return `Не получилось сгенерировать задачи: ${target}`;
  }
  return step.count === undefined
    ? `Сгенерировал задачи: ${target}`
    : `Сгенерировал ${String(step.count)} ${plural(step.count, ["задачу", "задачи", "задач"])}: ${target}`;
};

const StepIcon = ({ step }: { readonly step: ChatStep }): JSX.Element => {
  if (step.state === "running") {
    return <span aria-hidden="true" className="ai-spin" />;
  }
  return step.kind === "search" ? <SearchStepIcon /> : <ReadStepIcon />;
};

const formatReadLabel = (step: ChatStep): string => {
  const verb = { running: "Читаю ", done: "Прочитал ", error: "Чтение не завершено · " }[
    step.state
  ];
  const target = step.target ?? "фрагмент";
  const note = step.note === undefined || step.note === "" ? "" : `, ${step.note}`;
  return `${verb}${target}${note}`;
};

const StepLabel = ({ step }: { readonly step: ChatStep }): JSX.Element => {
  if (step.kind === "search") {
    const prefix = { running: "Ищу в конспектах ", done: "Поиск ", error: "Поиск не завершен · " }[
      step.state
    ];
    return (
      <span className="ai-step-label">
        {prefix}
        <span className="ai-step-query">
          <TexText text={step.q === undefined || step.q === "" ? "" : `«${step.q}»`} />
        </span>
      </span>
    );
  }
  if (step.kind === "sample") {
    return <span className="ai-step-label">{formatSampleLabel(step)}</span>;
  }
  return step.kind === "read" ? (
    <span className="ai-step-label">
      <TexText text={formatReadLabel(step)} />
    </span>
  ) : (
    <span className="ai-step-label">
      <TexText text={step.note ?? step.target ?? "Анализирую конспект"} />
    </span>
  );
};

type StepResProps = {
  readonly onJumpToBlock: (blockId: string) => void;
  readonly step: ChatStep;
};

const ResultLink = ({
  href,
  label,
  onJumpToBlock,
}: {
  readonly href: string | undefined;
  readonly label: string;
  readonly onJumpToBlock: (id: string) => void;
}): JSX.Element => {
  if (href === undefined || !isMaterialLink(href)) {
    return <TexText text={label} />;
  }
  return (
    <SourceLink
      onFollow={() => {
        onJumpToBlock(href);
      }}
      to={href}
    >
      <TexText text={label} />
    </SourceLink>
  );
};

const StepResult = ({ onJumpToBlock, step }: StepResProps): JSX.Element | null => {
  if (step.state === "running" || step.res === undefined || step.res.length === 0) {
    return null;
  }
  const more = step.more ?? 0;
  return (
    <span className="ai-step-res">
      {step.res.map((refId, idx) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- ordered step results
        <span key={`${refId}-${idx}`}>
          {idx > 0 && ", "}
          <ResultLink href={step.links?.[idx]} label={refId} onJumpToBlock={onJumpToBlock} />
        </span>
      ))}
      {more > 0 && ` и еще ${more}`}
    </span>
  );
};

type StepsBlockProps = {
  readonly isBackgroundResponse: boolean;
  readonly isCheckingBrowser: boolean;
  readonly isRunningSteps: boolean;
  readonly isStopped?: boolean;
  readonly onJumpToBlock: (blockId: string) => void;
  readonly steps: readonly ChatStep[];
};

const StepsSummary = ({
  count,
  isBackgroundResponse,
  isCheckingBrowser,
  isRunningSteps,
  isStopped,
}: Pick<
  StepsBlockProps,
  "isBackgroundResponse" | "isCheckingBrowser" | "isRunningSteps" | "isStopped"
> & { readonly count: number }): JSX.Element => {
  if (!isRunningSteps) {
    const label = `${String(count)} ${pluralSteps(count)}`;
    return <>{isStopped === true ? label : `Подготовил ответ за ${label}`}</>;
  }
  if (isCheckingBrowser) {
    return <>Проверяю браузер…</>;
  }
  if (isBackgroundResponse) {
    return <>Отвечаю в фоне…</>;
  }
  return <ChatResponseStatus />;
};

/** Exact `.ai-steps` collapsible search/read timeline from prototype.html. */
export const ChatStepsBlock = ({
  isBackgroundResponse,
  isCheckingBrowser,
  isRunningSteps,
  isStopped = false,
  onJumpToBlock,
  steps: allSteps,
}: StepsBlockProps): JSX.Element | null => {
  const [stepsOpen, setStepsOpen] = useState<boolean>();
  const steps = allSteps
    .filter((step) => step.kind !== "note")
    .map((step) =>
      isStopped && step.state === "running" ? { ...step, state: "error" as const } : step,
    );

  if (!isRunningSteps && steps.length === 0) {
    return null;
  }

  const isOpen = isRunningSteps || (stepsOpen ?? isStopped);
  const boxClass = `ai-steps ai-fade${isOpen ? " is-open" : ""}${isRunningSteps ? " is-run" : ""}`;

  return (
    <div className="ai-steps-slot">
      <div className={boxClass}>
        <button
          aria-expanded={isOpen}
          className="ai-steps-toggle"
          disabled={isRunningSteps}
          onClick={() => {
            setStepsOpen(!isOpen);
          }}
          type="button"
        >
          {isRunningSteps && <span aria-hidden="true" className="ai-status-icon" />}
          <span className="ai-steps-sum">
            <StepsSummary
              count={steps.length}
              isBackgroundResponse={isBackgroundResponse}
              isCheckingBrowser={isCheckingBrowser}
              isRunningSteps={isRunningSteps}
              isStopped={isStopped}
            />
          </span>
          <ChevronIcon />
        </button>
        {steps.length > 0 && (
          <div className="ai-steps-body">
            <div className="ai-steps-inner">
              <ol className="ai-steplist">
                {steps.map((step, idx) => (
                  <li
                    className={
                      step.state === "running"
                        ? "ai-step ai-step-enter is-run"
                        : "ai-step ai-step-enter"
                    }
                    // eslint-disable-next-line @eslint-react/no-array-index-key -- append-only step list
                    key={`${step.kind}-${idx}`}
                  >
                    <span className="ai-step-ic">
                      <StepIcon step={step} />
                    </span>
                    <span className="ai-step-main">
                      <StepLabel step={step} />
                      <StepResult onJumpToBlock={onJumpToBlock} step={step} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import { type JSX, useState } from "react";

import type { ChatStep } from "#web/domain/chat.ts";

import { ChevronIcon, ReadStepIcon, SearchStepIcon } from "./chat-icons.tsx";
import { isMaterialLink } from "./chat-markdown-parse.ts";

const pluralSteps = (n: number): string => {
  const abs = Math.abs(n) % 100;
  if (abs >= 11 && abs <= 19) {
    return "шагов";
  }
  const last = abs % 10;
  if (last === 1) {
    return "шаг";
  }
  if (last >= 2 && last <= 4) {
    return "шага";
  }
  return "шагов";
};

const StepIcon = ({ step }: { readonly step: ChatStep }): JSX.Element => {
  if (step.state === "running") {
    return <span aria-hidden="true" className="ai-spin" />;
  }
  return step.kind === "search" ? <SearchStepIcon /> : <ReadStepIcon />;
};

const formatReadLabel = (step: ChatStep): string => {
  const verb = step.state === "running" ? "Читаю " : "Прочитал ";
  const target = step.target ?? "фрагмент";
  const note = step.note === undefined || step.note === "" ? "" : `, ${step.note}`;
  return `${verb}${target}${note}`;
};

const StepLabel = ({ step }: { readonly step: ChatStep }): JSX.Element => {
  if (step.kind === "search") {
    const prefix = step.state === "running" ? "Ищу в конспектах " : "Поиск ";
    return (
      <span className="ai-step-label">
        {prefix}
        <span className="ai-step-query">{step.q}</span>
      </span>
    );
  }
  return step.kind === "read" ? (
    <span className="ai-step-label">{formatReadLabel(step)}</span>
  ) : (
    <span className="ai-step-label">{step.note ?? step.target ?? "Анализирую конспект"}</span>
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
    return <>{label}</>;
  }
  return (
    <a
      href={href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }

        event.preventDefault();
        onJumpToBlock(href);
      }}
    >
      {label}
    </a>
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
      {more > 0 && ` и ещё ${more}`}
    </span>
  );
};

type StepsBlockProps = {
  readonly isBackgroundResponse: boolean;
  readonly isCheckingBrowser: boolean;
  readonly isRunningSteps: boolean;
  readonly onJumpToBlock: (blockId: string) => void;
  readonly steps: readonly ChatStep[];
};

/** Exact `.ai-steps` collapsible search/read timeline from prototype.html. */
export const ChatStepsBlock = ({
  isBackgroundResponse,
  isCheckingBrowser,
  isRunningSteps,
  onJumpToBlock,
  steps,
}: StepsBlockProps): JSX.Element | null => {
  const [stepsOpen, setStepsOpen] = useState(false);

  if (!isRunningSteps && steps.length === 0) {
    return null;
  }

  const isOpen = isRunningSteps || stepsOpen;
  const count = steps.length;
  const responseSummary = isBackgroundResponse ? "Готовлю ответ в фоне" : "Готовлю ответ";
  const runningSummary = isCheckingBrowser ? "Проверяем браузер" : responseSummary;
  const summary = isRunningSteps
    ? runningSummary
    : `Посмотрел конспекты: ${count} ${pluralSteps(count)}`;
  const boxClass = `ai-steps ai-fade${isOpen ? " is-open" : ""}${isRunningSteps ? " is-run" : ""}`;

  return (
    <div className="ai-steps-slot">
      <div className={boxClass}>
        <button
          aria-expanded={isOpen}
          className="ai-steps-toggle"
          disabled={isRunningSteps}
          onClick={() => {
            setStepsOpen((prev) => !prev);
          }}
          type="button"
        >
          <span className="ai-steps-sum">{summary}</span>
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

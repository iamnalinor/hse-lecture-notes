import { applyUpdate, useHasUpdate } from "./sw-registration.ts";

/** Slides in above the top bar when a new version of the site is ready. */
export const UpdateBanner = () => {
  const isReady = useHasUpdate();
  return (
    <div
      aria-hidden={!isReady}
      className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isReady ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
    >
      <div className="overflow-hidden">
        <div className="border-b border-rule bg-wash text-sm text-ink" role="status">
          <div className="mx-auto flex max-w-[1360px] items-center gap-4 px-4 py-2.5 sm:px-8">
            <span className="min-w-0 flex-1 leading-snug">
              Мы кое-что поменяли. Перезагрузите, чтобы увидеть изменения
            </span>
            <button
              className="shrink-0 cursor-pointer rounded-md bg-brand px-3.5 py-1.5 font-semibold text-white hover:opacity-90"
              onClick={applyUpdate}
              tabIndex={isReady ? 0 : -1}
              type="button"
            >
              Обновить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

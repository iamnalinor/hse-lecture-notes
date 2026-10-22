import { OfflineStatus } from "#web/shared/offline/offline-status.tsx";

const REPO = "https://github.com/iamnalinor/hse-lecture-notes";

const BUILT = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Moscow",
}).format(new Date(import.meta.env.BUILD_TIME));

export const SiteFooter = () => (
  <footer className="mt-6 border-t border-rule text-[13.5px] text-muted">
    <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-7 pb-12 sm:px-8">
      <span>Конспекты ПИ ФКН ВШЭ, 2026/27 · сборка от {BUILT}</span>
      <OfflineStatus />
      <span>
        <a className="text-muted" href={REPO}>
          Исходники на GitHub
        </a>{" "}
        ·{" "}
        <a className="text-muted" href={`${REPO}/issues/new`}>
          Нашёл ошибку?
        </a>
      </span>
    </div>
  </footer>
);

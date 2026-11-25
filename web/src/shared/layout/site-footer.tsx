import { OfflineStatus } from "#web/shared/offline/offline-status.tsx";
import { GithubIcon } from "#web/shared/ui/icons.tsx";

const REPO = "https://github.com/iamnalinor/hse-lecture-notes";

const BUILT_AT = new Date(import.meta.env.BUILD_TIME);
const BUILT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "long",
  timeZone: "Europe/Moscow",
}).format(BUILT_AT);

/** Left: the sources and when this copy was built; right: what opens without internet. */
export const SiteFooter = () => (
  <footer className="mt-6 border-t border-rule text-subhead text-muted">
    {/* Phones: two fixed rows (sources, then offline) so a changing progress line moves nothing else.
        Equal space above and below the rows; the home indicator gets its inset on top of that. */}
    <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-y-3 px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:gap-y-2 sm:px-8">
      <span className="flex flex-wrap items-center gap-x-1">
        <a
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-muted no-underline hover:bg-wash hover:text-ink"
          href={REPO}
        >
          <GithubIcon size={16} />
          GitHub
        </a>
        <span className="px-2">
          Сборка от <time dateTime={BUILT_AT.toISOString()}>{BUILT}</time>
        </span>
      </span>
      <OfflineStatus />
    </div>
  </footer>
);

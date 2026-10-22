import { Suspense } from "react";
import { Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router";

import { isDocumentPath } from "#web/domain/paths.ts";
import { BackBar } from "#web/shared/layout/back-bar.tsx";
import { SiteFooter } from "#web/shared/layout/site-footer.tsx";
import { TopBar } from "#web/shared/layout/top-bar.tsx";
import { UpdateBanner } from "#web/shared/offline/update-banner.tsx";
import { DocSkeleton, PageSkeleton } from "#web/shared/ui/page-skeleton.tsx";

const Skeleton = ({ pathname }: { readonly pathname: string }) =>
  isDocumentPath(pathname) ? <DocSkeleton /> : <PageSkeleton />;

/** The first paint, while the page code of the entry route is still loading. */
export const ShellFallback = () => (
  <div className="flex min-h-screen flex-col bg-paper text-ink">
    <TopBar />
    <main className="flex-1">
      <Skeleton pathname={useLocation().pathname} />
    </main>
    <SiteFooter />
  </div>
);

/**
The skeleton appears the moment a link is clicked: while the route code loads (`navigation`) and,
via a Suspense boundary keyed by the path, while the page's data loads — the old page never
lingers on screen.
*/
export const AppShell = () => {
  const location = useLocation();
  const navigation = useNavigation();
  const pending = navigation.location?.pathname;
  const isSwitching = pending !== undefined && pending !== location.pathname;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-ink"
        href="#content"
        onClick={(event) => {
          // A plain `#content` would be taken by the router as a path change.
          event.preventDefault();
          const content = document.querySelector<HTMLElement>("#content");
          content?.focus();
          content?.scrollIntoView();
        }}
      >
        К содержимому
      </a>
      <UpdateBanner />
      <TopBar />
      <main className="flex-1 outline-none" id="content" tabIndex={-1}>
        {isSwitching ? (
          <Skeleton pathname={pending} />
        ) : (
          <Suspense fallback={<Skeleton pathname={location.pathname} />} key={location.pathname}>
            <Outlet />
          </Suspense>
        )}
      </main>
      <SiteFooter />
      <BackBar />
      <ScrollRestoration />
    </div>
  );
};

import { Suspense, useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router";

import { isDocumentPath } from "#web/domain/paths.ts";
import { HomeStart } from "#web/features/home/introduction.tsx";
import { BackBar } from "#web/shared/layout/back-bar.tsx";
import { SiteFooter } from "#web/shared/layout/site-footer.tsx";
import { TopBar } from "#web/shared/layout/top-bar.tsx";
import { UpdateBanner } from "#web/shared/offline/update-banner.tsx";
import { useUpdateOnNavigation } from "#web/shared/offline/update-on-navigation.ts";
import { useCanonicalUrl } from "#web/shared/ui/canonical-url.ts";
import { DocSkeleton, PageSkeleton } from "#web/shared/ui/page-skeleton.tsx";

import { LazyChat } from "./lazy-chat.tsx";

const Skeleton = ({ pathname }: { readonly pathname: string }) => {
  if (pathname === "/" || pathname === import.meta.env.BASE_URL) {
    return <HomeStart />;
  }
  return isDocumentPath(pathname) ? <DocSkeleton /> : <PageSkeleton />;
};

/** The first paint, while the page code of the entry route is still loading. */
export const ShellFallback = () => (
  <div className="flex min-h-screen flex-col bg-paper text-ink">
    <TopBar />
    {/* As tall as the screen, like `AppShell`'s: the footer stays below the fold instead of where the page will be. */}
    <main className="min-h-dvh flex-1">
      <Skeleton pathname={useLocation().pathname} />
    </main>
    <SiteFooter />
  </div>
);

/**
True until the first route change. The entry page is already on screen when React takes over (the prerendered
HTML, then `ShellFallback`), so fading it in from transparent would blink the whole page once after load.
*/
const useIsEntryPage = (pathname: string): boolean => {
  const [entry] = useState(pathname);
  const [hasLeft, setHasLeft] = useState(false);
  if (!hasLeft && pathname !== entry) {
    setHasLeft(true);
  }
  return !hasLeft;
};

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
  const isEntryPage = useIsEntryPage(location.pathname);
  useCanonicalUrl(location.pathname);
  useUpdateOnNavigation();

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
      <main className="min-h-dvh flex-1 outline-none" id="content" tabIndex={-1}>
        {isSwitching ? (
          <Skeleton pathname={pending} />
        ) : (
          <Suspense fallback={<Skeleton pathname={location.pathname} />} key={location.pathname}>
            <div data-page={isEntryPage ? "entry" : ""}>
              <Outlet />
            </div>
          </Suspense>
        )}
      </main>
      <SiteFooter />
      <BackBar />
      <LazyChat />
      <ScrollRestoration />
    </div>
  );
};

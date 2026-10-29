import { useEffect } from "react";

import { pageUrl, routeOf } from "#web/domain/seo.ts";

/**
Keeps the canonical address of the open page in the head. The page shells carry their own
(`spa-fallback.ts`), but the service worker answers every navigation with the home page's shell and
in-app links do not reload it: without this a shared lecture would point to the home page.
*/
export const useCanonicalUrl = (pathname: string): void => {
  useEffect(() => {
    const url = pageUrl(routeOf(pathname));
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", url);
  }, [pathname]);
};

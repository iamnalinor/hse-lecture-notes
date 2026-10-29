import { useEffect } from "react";

import { SITE_NAME as SITE } from "#web/domain/seo.ts";

/** The tab title of the page; when the page goes away the title falls back to the site's own. */
export const useDocumentTitle = (title: string | undefined): void => {
  useEffect(() => {
    document.title = title === undefined ? SITE : `${title} — ${SITE}`;
    return () => {
      document.title = SITE;
    };
  }, [title]);
};

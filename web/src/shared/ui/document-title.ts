import { useEffect } from "react";

const SITE = "Конспекты ПИ ФКН";

/** The tab title of the page; when the page goes away the title falls back to the site's own. */
export const useDocumentTitle = (title: string | undefined): void => {
  useEffect(() => {
    document.title = title === undefined ? SITE : `${title} — ${SITE}`;
    return () => {
      document.title = SITE;
    };
  }, [title]);
};

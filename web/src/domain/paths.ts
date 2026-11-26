const withHash = (path: string, hash: string | undefined): string =>
  hash === undefined ? path : `${path}#${hash}`;

export const paths = {
  course: (course: string): string => `/${course}`,
  home: (): string => "/",
  lecture: (course: string, weekId: string, hash?: string): string =>
    withHash(`/${course}/${weekId}`, hash),
  prep: (course: string, id: string, hash?: string): string => withHash(`/${course}/${id}`, hash),
  program: (course: string, hash?: string): string => withHash(`/${course}/program`, hash),
  theory: (course: string, hash?: string): string => withHash(`/${course}/theory`, hash),
} as const;

/** File name of a document's PDF: `_` everywhere (`discrete_kr1_cheatsheet_1side.pdf`). */
export const pdfFile = (course: string, docId: string): string =>
  `${course}_${docId.replaceAll("-", "_")}.pdf`;

/** Lecture, theory, program and prep pages read a document (TOC + text); the rest are lists. */
export const isDocumentPath = (pathname: string): boolean => {
  const parts = pathname.split("/").filter((part) => part !== "");
  return parts.length === 2;
};

const trimSlashes = (pathname: string): string =>
  pathname
    .split("/")
    .filter((part) => part !== "")
    .join("/");

/** Another page, not an anchor or a trailing slash on the same one. */
export const isOtherPage = (from: string, to: string): boolean =>
  trimSlashes(from) !== trimSlashes(to);

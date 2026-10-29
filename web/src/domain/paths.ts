const withHash = (path: string, hash: string | undefined): string =>
  hash === undefined ? path : `${path}#${hash}`;

export const paths = {
  course: (course: string): string => `/${course}`,
  glossary: (course: string): string => `/${course}/glossary`,
  home: (): string => "/",
  lecture: (course: string, weekId: string, hash?: string): string =>
    withHash(`/${course}/${weekId}`, hash),
  prep: (course: string, id: string, hash?: string): string => withHash(`/${course}/${id}`, hash),
  program: (course: string, hash?: string): string => withHash(`/${course}/program`, hash),
  theory: (course: string, hash?: string): string => withHash(`/${course}/theory`, hash),
} as const;

/** Lecture, theory, program and prep pages read a document (TOC + text); the rest are lists. */
export const isDocumentPath = (pathname: string): boolean => {
  const parts = pathname.split("/").filter((part) => part !== "");
  return parts.length === 2 && parts[1] !== "glossary";
};

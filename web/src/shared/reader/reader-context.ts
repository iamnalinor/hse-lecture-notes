import { createContext, type ReactNode, useContext } from "react";

export type ReaderContextValue = {
  readonly course: string;
  /** Lecture being read; `undefined` on course-wide pages (theory, glossary). */
  readonly lecture: number | undefined;
  /** Inside a hover card references are plain links without further cards. */
  readonly nested: boolean;
  /** Renders a hover-card excerpt of the document `docId` (its figures live there). */
  readonly renderPreview: (html: string, docId: string) => ReactNode;
};

export const ReaderContext = createContext<ReaderContextValue | undefined>(undefined);

export const useReaderContext = (): ReaderContextValue => {
  const value = useContext(ReaderContext);
  if (value === undefined) {
    throw new Error("ReaderContext is missing: render notes through <FragmentView>");
  }
  return value;
};

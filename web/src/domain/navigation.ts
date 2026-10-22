import { z } from "zod";

/** Router state attached to a cross-reference jump, so the target can offer a way back. */
export const BackStateSchema = z.object({ backLabel: z.string() });

export type BackPlace = {
  /** Label of the block the link stood in: «Теорема 6.11». */
  readonly block: string | undefined;
  /** Number of the section the link stood in. */
  readonly section: string | undefined;
};

/** Where the reader jumped from: the block if there was one, else the section, else just «ссылка». */
export const backLabel = (place: BackPlace, fromLecture: number | undefined): string => {
  const where = place.block ?? (place.section === undefined ? "ссылка" : `§ ${place.section}`);
  return fromLecture === undefined ? where : `${where}, лекция ${String(fromLecture)}`;
};

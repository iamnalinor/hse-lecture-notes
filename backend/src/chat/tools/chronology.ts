import type { ToolExecutionContext } from "./types";

export type Chronology = "earlier" | "current" | "later_in_course" | "other_course" | "unspecified";

/** Where a block or document sits relative to the page the student has open. */
export function classifyChronology(
  ctx: Pick<ToolExecutionContext, "currentCourse" | "currentDocId" | "currentDocOrder">,
  blockCourse: string,
  blockDocId: string,
  blockDocOrder: number,
): Chronology {
  if (!ctx.currentDocId) return "unspecified";
  if (blockCourse !== ctx.currentCourse) return "other_course";
  if (blockDocId === ctx.currentDocId) return "current";
  if (blockDocOrder > ctx.currentDocOrder && ctx.currentDocOrder > 0) return "later_in_course";
  return "earlier";
}

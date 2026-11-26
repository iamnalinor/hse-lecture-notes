import type { ToolArgs, ToolExecutionContext } from "./types";

/** Normalizes the course names a model uses (matan, linalg, ...) to the site's course codes. */
function courseCode(value: string): string {
  const name = value.toLowerCase().trim();
  if (/^(?:матан(?:ализ)?[а-я]*|математическ[а-я]* анализ[а-я]*)$/u.test(name)) return "calculus";
  return name === "linalg" ? "algebra" : name;
}

/** The `course` argument when given and non-blank, else the page's course. */
export function courseArg(
  args: ToolArgs,
  ctx: Pick<ToolExecutionContext, "currentCourse">,
): string {
  return typeof args.course === "string" && args.course.trim()
    ? courseCode(args.course)
    : ctx.currentCourse;
}

/** A trimmed non-empty string argument, else null. */
export function optionalStringArg(args: ToolArgs, name: string): string | null {
  const value = args[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

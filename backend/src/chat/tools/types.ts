import type { TrackedD1 } from "../../db";
import type { ChatStep, Env } from "../../types";

export interface ToolExecutionContext {
  signal?: AbortSignal;
  env: Pick<Env, "VECTORIZE" | "AI">;
  db: TrackedD1;
  currentCourse: string;
  currentDocId: string;
  currentDocOrder: number;
  maxToolOutputChars: number;
  maxTotalToolOutputChars: number;
}

/** What a tool returns: JSON text for the model and the step shown to the student. */
export interface ToolResult {
  output: string;
  step: ChatStep;
}

export type ToolArgs = Record<string, unknown>;

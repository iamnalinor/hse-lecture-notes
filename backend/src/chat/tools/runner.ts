import type { ChatStep } from "../../types";
import { findToolHandler } from "./registry";
import type { ToolArgs, ToolExecutionContext, ToolResult } from "./types";

/** Cuts a tool output to `limit` characters, marking the cut. */
function truncateOutput(output: string, limit: number): string {
  const suffix = "\n...[truncated]";
  return output.length <= limit
    ? output
    : output.slice(0, Math.max(0, limit - suffix.length)) + suffix.slice(0, limit);
}

/** Arguments arrive as a JSON string; they must be an object. Null when they are not. */
function parseToolArgs(rawArgs: string): ToolArgs | null {
  try {
    const parsed: unknown = rawArgs ? JSON.parse(rawArgs) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
    return parsed as ToolArgs;
  } catch {
    return null;
  }
}

/**
 * Runs the model's tool calls for one turn: parses arguments, caches repeated calls and
 * keeps every output under the per-call and per-turn character budgets.
 */
export class AgentToolRunner {
  private readonly ctx: ToolExecutionContext;
  private readonly cache = new Map<string, { output: string; step: ChatStep }>();
  private totalOutputChars = 0;

  constructor(ctx: ToolExecutionContext) {
    this.ctx = ctx;
  }

  get isOutputBudgetExhausted(): boolean {
    return this.totalOutputChars >= this.ctx.maxTotalToolOutputChars;
  }

  async execute(
    name: string,
    rawArgs: string,
  ): Promise<{ output: string; step: ChatStep; fromCache: boolean }> {
    const limit = Math.min(
      this.ctx.maxToolOutputChars,
      this.ctx.maxTotalToolOutputChars - this.totalOutputChars,
    );
    if (limit <= 0) {
      return {
        output: "",
        step: { kind: "note", state: "error", note: "Лимит инструментов" },
        fromCache: false,
      };
    }
    const capped = (output: string): string => {
      const text = truncateOutput(output, limit);
      this.totalOutputChars += text.length;
      return text;
    };

    const args = parseToolArgs(rawArgs);
    if (!args) {
      return {
        output: capped(JSON.stringify({ error: "Invalid JSON arguments" })),
        step: { kind: "note", note: `Ошибка аргументов ${name}`, state: "error" },
        fromCache: false,
      };
    }

    const cacheKey = `${name}:${JSON.stringify(args)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { output: capped(cached.output), step: cached.step, fromCache: true };
    }

    const result = await this.run(name, args);
    this.cache.set(cacheKey, result);
    return { ...result, output: capped(result.output), fromCache: false };
  }

  private run(name: string, args: ToolArgs): Promise<ToolResult> | ToolResult {
    const handler = findToolHandler(name);
    if (handler) return handler(this.ctx, args);
    return {
      output: JSON.stringify({ error: `Unknown tool: ${name}` }),
      step: { kind: "note", note: `Неизвестный инструмент ${name}`, state: "error" },
    };
  }
}

import { describe, expect, test } from "bun:test";
import { CodexResponsesProvider } from "../src/codex-provider";
import { TrackedD1 } from "../src/db";
import { createLlmProvider } from "../src/llm-provider";
import { OpenAIResponsesProvider } from "../src/openai-provider";
import type { Env } from "../src/types";
import { SqliteD1Shim } from "./d1-shim";

describe("provider selection", () => {
  const db = new TrackedD1(new SqliteD1Shim().asD1());
  test.each([undefined, "", "codex"])("Codex default (%s)", (value) => {
    expect(createLlmProvider({ LLM_PROVIDER: value } as Env, db)).toBeInstanceOf(
      CodexResponsesProvider,
    );
  });
  test("env switches to OpenAI without Codex credentials or DB access", () => {
    expect(
      createLlmProvider(
        { LLM_PROVIDER: "openai", OPENAI_API_KEY: "key" } as Env,
        undefined as unknown as TrackedD1,
      ),
    ).toBeInstanceOf(OpenAIResponsesProvider);
  });
  test("API key alone never switches provider", () => {
    expect(createLlmProvider({ OPENAI_API_KEY: "key" } as Env, db)).toBeInstanceOf(
      CodexResponsesProvider,
    );
  });
  test("unknown provider is rejected", () => {
    expect(() => createLlmProvider({ LLM_PROVIDER: "typo" } as Env, db)).toThrow("LLM_PROVIDER");
  });
});

describe("OpenAI configuration", () => {
  test.each([undefined, "", "   "])("requires an API key (%s)", (key) => {
    expect(() => new OpenAIResponsesProvider({ OPENAI_API_KEY: key })).toThrow("OPENAI_API_KEY");
  });
  test.each([
    "ftp://gateway.example/v1",
    "invalid",
    "https://gateway.example/v1?key=secret",
    "https://gateway.example/v1#fragment",
    "https://user:password@gateway.example/v1",
  ])("rejects invalid base URL (%s)", (base) => {
    expect(
      () => new OpenAIResponsesProvider({ OPENAI_API_KEY: "test", OPENAI_BASE_URL: base }),
    ).toThrow("OPENAI_BASE_URL");
  });
  test("accepts a custom HTTP base URL for local development", () => {
    expect(
      new OpenAIResponsesProvider({
        OPENAI_API_KEY: "test",
        OPENAI_BASE_URL: "http://localhost:8080/custom/v1/",
      }),
    ).toBeInstanceOf(OpenAIResponsesProvider);
  });
});

test("OpenAI forwards strict end and parallel choice, ignores Codex proxy and hides raw errors", async () => {
  const { buildEndTurnTool } = await import("../src/end-turn");
  let body: Record<string, unknown> | undefined;
  const provider = new OpenAIResponsesProvider(
    { OPENAI_API_KEY: "fake-key", CODEX_PROXY_URL: "socks5://unreachable.invalid" } as Env,
    {
      fetchImpl: async (_url, init) => {
        body = JSON.parse(init?.body as string) as Record<string, unknown>;
        return new Response("schema end_turn arguments SECRET fake-key", { status: 400 });
      },
    },
  );
  const error = await provider
    .runRound({
      model: "m",
      effort: "low",
      instructions: "i",
      input: [],
      tools: [buildEndTurnTool()],
      toolChoice: { type: "function", name: "end_turn" },
      parallelToolCalls: true,
      maxResponseChars: 100,
      signal: new AbortController().signal,
      onDelta: () => {},
    })
    .catch((e) => e as Error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe("OpenAI API HTTP 400");
  expect(body?.tool_choice).toEqual({ type: "function", name: "end_turn" });
  expect(body?.parallel_tool_calls).toBe(true);
  expect((body?.tools as Array<{ strict: boolean }>)[0]?.strict).toBe(true);
});

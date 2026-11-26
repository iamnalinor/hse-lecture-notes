import { expect, spyOn, test } from "bun:test";
import { AgentToolRunner } from "../src/chat/tools";
import { executeAgentRun } from "../src/chat/agent-loop";
import { TrackedD1 } from "../src/db";
import { admitRunAtomic } from "../src/quotas";
import defaults from "../policy.json";
import { SqliteD1Shim } from "./d1-shim";
import type {
  CodexInputItem,
  Env,
  LlmRoundRequest,
  LlmRoundResult,
  ChatStreamFrame,
} from "../src/types";
const topic = (title = "Тема") => ({
  callId: "t" + Math.random(),
  name: "set_topic",
  arguments: JSON.stringify({ title }),
});
const suggest = (suggestion = "Объясни подробнее") => ({
  callId: "s" + Math.random(),
  name: "suggest_reply",
  arguments: JSON.stringify({ suggestion }),
});
const round = (
  text: string,
  calls: LlmRoundResult["functionCalls"] = [],
  completed = true,
): LlmRoundResult => ({
  completed,
  status: completed ? "completed" : "incomplete",
  text,
  truncated: false,
  outputItems: [
    ...(text
      ? [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }],
          } as CodexInputItem,
        ]
      : []),
    ...calls.map(
      (c) =>
        ({
          type: "function_call",
          call_id: c.callId,
          name: c.name,
          arguments: c.arguments,
        }) as CodexInputItem,
    ),
  ],
  functionCalls: calls,
  usage: { inputTokens: 10, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 5 },
});
async function fixture(
  rounds: LlmRoundResult[],
  maxRounds = 6,
  hasTitle = false,
  maxOutputChars = defaults.maxToolOutputChars,
  maxRunDurationMs = defaults.maxRunDurationMs,
  stop?: AbortController,
) {
  const shim = new SqliteD1Shim(),
    db = new TrackedD1(shim.asD1()),
    policy = {
      ...structuredClone(defaults),
      maxToolRounds: maxRounds,
      maxRunDurationMs,
      maxToolOutputChars: maxOutputChars,
      maxTotalToolOutputChars: maxOutputChars,
    };
  const env = { DB: shim.asD1(), LLM_PROVIDER: "openai" } as Env;
  const admit = await admitRunAtomic(db, policy, {
    env,
    axes: { tier: "guest", telegramId: null, browserId: "b", ipAddress: "i", fingerprint: "" },
    clientRequestId: "r",
    payloadHash: "h",
    threadId: null,
    course: "",
    docId: "",
    questionText: "q",
    quote: null,
  });
  if (admit.kind !== "admitted") throw Error(admit.kind);
  if (hasTitle) shim.sqlite.query("UPDATE chat_threads SET generated_title='Existing'").run();
  const frames: ChatStreamFrame[] = [],
    requests: LlmRoundRequest[] = [];
  await executeAgentRun({
    env,
    db,
    provider: {
      async runRound(req) {
        requests.push(req);
        const r = rounds.shift();
        if (!r) throw Error("unexpected extra request");
        if (r.text) req.onDelta(r.text);
        return r;
      },
    },
    policy,
    runId: admit.runId,
    threadId: admit.threadId,
    preparedContext: admit.preparedContext,
    generatedTitle: hasTitle ? "Existing" : admit.generatedTitle,
    contextLimited: admit.contextLimited,
    course: "",
    docId: "",
    tier: "guest",
    bucket: admit.bucket,
    route: admit.route,
    initialReserveMicros: admit.reserveMicros,
    degraded: admit.degraded,
    questionCreatedAt: admit.questionCreatedAt,
    questionText: "q",
    quote: null,
    signal: stop?.signal ?? new AbortController().signal,
    isStoppedByUser: () => Boolean(stop?.signal.aborted),
    sendFrame: (f) => frames.push(f),
  });
  const message = shim.sqlite
    .query("SELECT status,content_tex,suggestion FROM chat_messages WHERE role='assistant'")
    .get();
  return { shim, frames, requests, message };
}

test("first topic is forced, hidden and published before the visible answer", async () => {
  const r = await fixture([round("HIDDEN", [topic()]), round("Ответ")]);
  expect(r.requests[0]?.toolChoice).toEqual({ type: "function", name: "set_topic" });
  expect(r.requests[1]?.toolChoice).toBe("auto");
  expect(r.message).toMatchObject({ status: "done", content_tex: "Ответ", suggestion: null });
  expect(r.frames.findIndex((f) => f.type === "title")).toBeLessThan(
    r.frames.findIndex((f) => f.type === "delta"),
  );
  expect(JSON.stringify(r.frames)).not.toContain("HIDDEN");
  expect(JSON.stringify(r.frames)).not.toContain("set_topic");
});
test("answer without a suggestion is complete without a repair", async () => {
  const r = await fixture([round("Ответ")], 6, true);
  expect(r.requests).toHaveLength(1);
  expect(r.message).toMatchObject({ status: "done", suggestion: null });
});
test("optional suggestion follows the answer and bad suggestion never rejects it", async () => {
  for (const value of ["Объясни дальше", "**Wrong**"]) {
    const r = await fixture([round("Ответ", [suggest(value)])], 6, true);
    expect(r.requests).toHaveLength(1);
    expect(r.message).toMatchObject({
      status: "done",
      suggestion: value.includes("**") ? null : value,
    });
    expect(JSON.stringify(r.frames)).not.toContain("suggest_reply");
  }
});
test("first missing topic cannot publish answer or complete", async () => {
  const r = await fixture([round("HIDDEN")]);
  expect(r.message).toMatchObject({ status: "error", content_tex: "" });
});
test("topic change is immediate even when a later round is incomplete", async () => {
  const r = await fixture([round("", [topic("Новая тема")]), round("Часть", [], false)], 6, true);
  expect(r.frames.some((f) => f.type === "title" && f.title === "Новая тема")).toBe(true);
  expect(r.shim.sqlite.query("SELECT generated_title FROM chat_threads").get()).toEqual({
    generated_title: "Новая тема",
  });
  expect(r.message).toMatchObject({ status: "incomplete", suggestion: null });
});
test("parallel reads stay enabled and executed calls never exceed sixteen", async () => {
  const reads = Array.from({ length: 18 }, (_, n) => ({
    callId: "r" + n,
    name: "read_document",
    arguments: '{"course":"math"}',
  }));
  const r = await fixture([round("", reads), round("Ответ")], 6, true);
  expect(r.message).toMatchObject({ status: "done" });
  expect(r.requests.at(-1)?.toolChoice).toBe("none");
  expect(r.shim.sqlite.query("SELECT tool_calls FROM usage_runs").get()).toEqual({
    tool_calls: 16,
  });
});

test("missing usage is estimated separately for every round", async () => {
  const a = round("", [topic()]),
    b = round("Ответ");
  a.usage = null;
  b.usage = null;
  const r = await fixture([a, b]);
  const run = r.shim.sqlite
    .query("SELECT actual_cost_micros,is_cost_uncertain FROM usage_runs")
    .get() as { actual_cost_micros: number; is_cost_uncertain: number };
  expect(run.actual_cost_micros).toBeGreaterThanOrEqual(2000);
  expect(run.is_cost_uncertain).toBe(1);
});
test("a final plain answer succeeds when no further tools are allowed", async () => {
  const r = await fixture([round("Ответ")], 1, true);
  expect(r.requests[0]?.toolChoice).toBe("none");
  expect(r.message).toMatchObject({ status: "done" });
});
test("unknown calls are hidden, not executed, and keep the answer incomplete", async () => {
  const r = await fixture(
    [round("Ответ", [{ callId: "bad", name: "unknown_tool", arguments: "{}" }])],
    6,
    true,
  );
  expect(r.message).toMatchObject({ status: "incomplete" });
  expect(r.frames.some((f) => f.type === "step")).toBe(false);
});

test("truncated and exhausted tool outputs remain text and do not crash the run", async () => {
  const read = (callId: string) => ({
    callId,
    name: "read_document",
    arguments: '{"course":"algebra"}',
  });
  const r = await fixture(
    [round("", [read("r1"), read("r2")]), round("Ответ по материалам")],
    6,
    true,
    20,
  );
  expect(r.message).toMatchObject({ status: "done" });
  const outputs = r.requests[1]!.input.filter((i) => i.type === "function_call_output");
  expect(outputs).toHaveLength(2);
  expect(outputs[0]!.output).toContain("truncated");
  expect(outputs[1]!.output).toContain("tool_output_limit");
});

test("oversized optional suggestion is discarded while preserving a complete answer", async () => {
  const r = await fixture([round("Ответ", [suggest("x".repeat(5000))])], 6, true);
  expect(r.message).toMatchObject({ status: "done", suggestion: null, content_tex: "Ответ" });
  expect(r.requests).toHaveLength(1);
});

test("exhausted material output forces the next answer and stays out of public steps", async () => {
  const read = (callId: string) => ({
    callId,
    name: "read_document",
    arguments: '{"course":"algebra"}',
  });
  const r = await fixture(
    [round("", [read("b1"), read("b2")]), round("Ответ по найденному")],
    8,
    true,
    20,
  );
  expect(r.requests[1]?.toolChoice).toBe("none");
  expect(r.message).toMatchObject({ status: "done", content_tex: "Ответ по найденному" });
  const outputs = r.requests[1]!.input.filter((i) => i.type === "function_call_output");
  expect(outputs[1]!.output).toContain("tool_output_limit");
  expect(JSON.stringify(r.frames)).not.toContain("Лимит инструментов");
  const stored = r.shim.sqlite
    .query("SELECT steps_json FROM chat_messages WHERE role='assistant'")
    .get() as { steps_json: string };
  expect(stored.steps_json).not.toContain("Лимит инструментов");
});

test("suggestion before the answer in its own round survives until successful completion", async () => {
  const suggestion = "Помоги составить план подготовки";
  const r = await fixture([round("", [suggest(suggestion)]), round("Ответ")], 6, true);
  expect(r.message).toMatchObject({ status: "done", content_tex: "Ответ", suggestion });
  expect(r.frames.at(-1)).toMatchObject({ type: "done", suggestion });
  expect(JSON.stringify(r.frames.slice(0, -1))).not.toContain(suggestion);
  expect(JSON.stringify(r.requests[1]!.input)).not.toContain("answer_not_available");
  expect(r.requests).toHaveLength(2);
});

test("suggestion before text within the same response is accepted", async () => {
  const result = round("Ответ", [suggest()]);
  result.outputItems.reverse();
  const r = await fixture([result], 6, true);
  expect(r.message).toMatchObject({ status: "done", suggestion: "Объясни подробнее" });
  expect(r.requests).toHaveLength(1);
});

test("pending suggestion is discarded if more material is requested", async () => {
  const read = { callId: "read", name: "read_document", arguments: '{"course":"algebra"}' };
  for (const rounds of [
    [round("", [suggest()]), round("", [read]), round("Ответ")],
    [round("", [read, suggest()]), round("Ответ")],
  ]) {
    const r = await fixture(rounds, 6, true);
    expect(r.message).toMatchObject({ status: "done", suggestion: null });
  }
});

test("pending suggestion is never published without a complete answer", async () => {
  for (const result of [round("", []), round("Часть", [], false)]) {
    const r = await fixture([round("", [suggest()]), result], 6, true);
    expect(r.message).toMatchObject({ status: "incomplete", suggestion: null });
    expect(r.frames.at(-1)).toMatchObject({ type: "done", suggestion: null });
  }
});

test("malformed early suggestion does not prevent a subsequent answer", async () => {
  const r = await fixture([round("", [suggest("**Bad**")]), round("Ответ")], 6, true);
  expect(r.message).toMatchObject({ status: "done", content_tex: "Ответ", suggestion: null });
});

test("a hung tool settles once at the deadline or on explicit stop and ignores late results", async () => {
  for (const manual of [false, true]) {
    const stop = new AbortController();
    const late = Promise.withResolvers<Awaited<ReturnType<AgentToolRunner["execute"]>>>();
    const tool = spyOn(AgentToolRunner.prototype, "execute").mockImplementation(() => {
      if (manual) stop.abort("user_stop");
      return late.promise;
    });
    try {
      const state = await fixture(
        [round("Часть ответа", [{ name: "search_materials", callId: "find", arguments: "{}" }])],
        6,
        true,
        1000,
        40,
        stop,
      );
      expect(state.message).toMatchObject({
        status: manual ? "stopped" : "incomplete",
        content_tex: "Часть ответа",
      });
      const done = state.frames.filter((f) => f.type === "done");
      expect(done).toHaveLength(1);
      expect(done[0]?.steps[0]?.state).toBe("error");
      expect(
        state.shim.sqlite.query("SELECT global_reserved_micros FROM budget_reserves").get(),
      ).toEqual({ global_reserved_micros: 0 });
      const count = state.frames.length;
      late.resolve({ fromCache: false, output: "late", step: { kind: "search", state: "done" } });
      await Promise.resolve();
      expect(state.frames).toHaveLength(count);
    } finally {
      tool.mockRestore();
    }
  }
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
const storedReplay = (r: Fixture) =>
  r.shim.sqlite
    .query("SELECT agent_items_json AS json FROM chat_messages WHERE role='assistant'")
    .get() as { json: string | null };
const finalizedRun = (r: Fixture) =>
  r.shim.sqlite.query("SELECT status, reserved_cost_micros FROM usage_runs").get();

test("a normal answer keeps the continuation context", async () => {
  const r = await fixture([round("Ответ")], 6, true);
  expect(JSON.parse(storedReplay(r).json!)).toMatchObject({ complete: true });
  expect(finalizedRun(r)).toEqual({ status: "done", reserved_cost_micros: 0 });
});

test.each([
  ["ASCII", "a", 1_000_001],
  // 600k characters stay below the cap as a string length but are 1.2 MB as UTF-8.
  ["Cyrillic", "ж", 600_000],
])(
  "an oversized %s continuation is dropped while the answer is saved",
  async (_name, char, count) => {
    const text = char.repeat(count);
    const r = await fixture([round(text)], 6, true);
    expect(storedReplay(r).json).toBeNull();
    expect(r.message).toMatchObject({ status: "done", content_tex: text });
    expect(finalizedRun(r)).toEqual({ status: "done", reserved_cost_micros: 0 });
  },
);

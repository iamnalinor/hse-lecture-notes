import { expect, test } from "bun:test";
import { executeAgentRun } from "../src/agent-loop";
import { TrackedD1 } from "../src/db";
import { admitRunAtomic } from "../src/quotas";
import defaults from "../policy.json";
import { SqliteD1Shim } from "./d1-shim";
import type {
  CodexInputItem,
  Env,
  LlmRoundRequest,
  LlmRoundResult,
  ServerWsFrame,
} from "../src/types";
const end = (title: string | null = "Тема", suggestion: string | null = "Объясни подробнее") => ({
  callId: "e" + Math.random(),
  name: "end_turn",
  arguments: JSON.stringify({ title, suggestion }),
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
async function fixture(rounds: LlmRoundResult[], maxRounds = 6) {
  const shim = new SqliteD1Shim(),
    db = new TrackedD1(shim.asD1()),
    policy = { ...structuredClone(defaults), maxToolRounds: maxRounds };
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
  const frames: ServerWsFrame[] = [],
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
    generatedTitle: admit.generatedTitle,
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
    signal: new AbortController().signal,
    isStoppedByUser: () => false,
    sendFrame: (f) => frames.push(f),
  });
  const message = shim.sqlite
    .query("SELECT status,content_tex,suggestion FROM chat_messages WHERE role='assistant'")
    .get();
  return { shim, frames, requests, message };
}
test("answer then hidden end commits title and suggestion", async () => {
  const r = await fixture([round("Ответ", [end()])]);
  expect(r.message).toEqual({
    status: "done",
    content_tex: "Ответ",
    suggestion: "Объясни подробнее",
  });
  expect(r.frames.filter((f) => f.type === "step")).toHaveLength(0);
  expect(JSON.stringify(r.frames)).not.toContain("end_turn");
});
test("missing end gets one metadata-only repair without repeating text", async () => {
  const r = await fixture([round("Ответ"), round("", [end()])]);
  expect(r.requests).toHaveLength(2);
  expect(r.requests[1]?.metadataOnly).toBe(true);
  expect(r.message).toMatchObject({ status: "done", content_tex: "Ответ" });
});
test("end without answer requires fresh answer and new metadata", async () => {
  const r = await fixture([
    round("", [end("Wrong", "Wrong")]),
    round("Новый ответ", [end("Right", "Расскажи дальше")]),
  ]);
  expect(r.message).toMatchObject({
    status: "done",
    content_tex: "Новый ответ",
    suggestion: "Расскажи дальше",
  });
});
test("first null title repaired once; second failure keeps answer incomplete", async () => {
  const r = await fixture([round("Ответ", [end(null)]), round("", [end(null)])]);
  expect(r.requests).toHaveLength(2);
  expect(r.message).toMatchObject({ status: "incomplete", content_tex: "Ответ", suggestion: null });
});
test("valid final round succeeds, empty final end does not", async () => {
  expect((await fixture([round("Ответ", [end()])], 1)).message).toMatchObject({ status: "done" });
  expect((await fixture([round("", [end()])], 1)).message).toMatchObject({ status: "incomplete" });
});
test("upstream incomplete preserves paid usage and does not repair", async () => {
  const r = await fixture([round("Ответ", [], false)]);
  expect(r.requests).toHaveLength(1);
  expect(r.message).toMatchObject({ status: "incomplete", content_tex: "Ответ" });
  expect(r.shim.sqlite.query("SELECT input_tokens,output_tokens FROM usage_runs").get()).toEqual({
    input_tokens: 10,
    output_tokens: 5,
  });
});
test("mixed and unknown calls stay hidden and are never run", async () => {
  const r = await fixture([
    round("Ответ", [end(), { callId: "x", name: "evil", arguments: "{}" }]),
  ]);
  expect(r.message).toMatchObject({ status: "incomplete", suggestion: null });
  expect(r.frames.some((f) => f.type === "step")).toBe(false);
  expect(JSON.stringify(r.frames)).not.toContain("evil");
});

test("parallel batches can exceed five tools but never execute a thirteenth", async () => {
  const read = (n: number) => ({
    callId: `read${n}`,
    name: "read_document",
    arguments: '{"course":"math"}',
  });
  const r = await fixture([
    round(
      "",
      Array.from({ length: 11 }, (_, i) => read(i)),
    ),
    round("", [read(11), read(12), read(13)]),
    round("Ответ", [end()]),
  ]);
  expect(r.message).toMatchObject({ status: "done" });
  expect(r.shim.sqlite.query("SELECT tool_calls FROM usage_runs").get()).toEqual({
    tool_calls: 12,
  });
  expect(r.requests.at(-1)?.toolChoice).toEqual({ type: "function", name: "end_turn" });
  expect(
    r.requests
      .at(-1)
      ?.input.filter(
        (i) => i.type === "function_call_output" && i.output.includes("tool_call_limit"),
      ),
  ).toHaveLength(2);
  expect(r.frames.filter((f) => f.type === "step")).toHaveLength(24);
});

test("each missing-usage round is estimated, without double charging known rounds", async () => {
  const read = { callId: "read", name: "read_document", arguments: '{"course":"math"}' };
  const a = round("", [read]),
    b = round("Ответ", [end()]);
  a.usage = null;
  b.usage = null;
  const r = await fixture([a, b]);
  const run = r.shim.sqlite
    .query("SELECT actual_cost_micros,is_cost_uncertain FROM usage_runs")
    .get() as { actual_cost_micros: number; is_cost_uncertain: number };
  expect(run.is_cost_uncertain).toBe(1);
  expect(run.actual_cost_micros).toBeGreaterThanOrEqual(2000);
});

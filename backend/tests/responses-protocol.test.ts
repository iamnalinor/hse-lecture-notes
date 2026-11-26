import { expect, test } from "bun:test";
import { parseResponsesSseStream } from "../src/llm/responses-stream";
const msg = (text: string) => ({
  type: "message",
  role: "assistant",
  content: [{ type: "output_text", text }],
});
const topic = {
  type: "function_call",
  call_id: "topic1",
  name: "set_topic",
  arguments: '{"title":"Тема"}',
};
async function run(
  output: unknown[],
  extra: unknown[] = [],
  status = "completed",
  hideText = false,
) {
  const events = [
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { type: "message", role: "assistant", id: "m" },
    },
    { type: "response.output_text.delta", output_index: 0, item_id: "m", delta: "Ответ" },
    ...extra,
    {
      type: `response.${status}`,
      response: {
        id: "r",
        status,
        output,
        usage: { input_tokens: 10, output_tokens: 3, input_tokens_details: { cached_tokens: 4 } },
      },
    },
  ];
  const bytes = new TextEncoder().encode(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
  );
  const seen: string[] = [];
  const result = await parseResponsesSseStream(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    }),
    24000,
    (d) => seen.push(d),
    undefined,
    "openai",
    { enforceProtocol: true, hideText },
  );
  return { result, seen: seen.join("") };
}
test("only the first text message is the answer: later messages are cut from streaming and final text", async () => {
  const { result, seen } = await run(
    [msg("Ответ"), msg("Исправляю"), topic],
    [
      {
        type: "response.output_item.added",
        output_index: 1,
        item: { type: "message", role: "assistant", id: "m2" },
      },
      { type: "response.output_text.delta", output_index: 1, item_id: "m2", delta: "Исправляю" },
    ],
  );
  expect(seen).toBe("Ответ");
  expect(result.text).toBe("Ответ");
  expect(JSON.stringify(result.outputItems)).not.toContain("Исправляю");
  expect(result.protocolViolations).toEqual([]);
});
test("initial topic service stage hides all text without rejecting a valid call", async () => {
  const { result, seen } = await run([msg("Ответ"), topic], [], "completed", true);
  expect(result.completed).toBe(true);
  expect(result.text).toBe("");
  expect(seen).toBe("");
  expect(result.protocolViolations).toEqual([]);
});
test("text and metadata preserve order and usage", async () => {
  const { result } = await run([msg("Ответ"), topic]);
  expect(result.usage?.cachedTokens).toBe(4);
  expect(result.completed).toBe(true);
});
test("incomplete keeps usage and never reports completed", async () => {
  const { result } = await run([msg("Ответ")], [], "incomplete");
  expect(result.completed).toBe(false);
  expect(result.usage?.inputTokens).toBe(10);
});
for (const invalid of [
  { type: "function_call", name: "set_topic", arguments: "{}" },
  { ...topic, call_id: 42 },
  { type: "message", role: "assistant", content: [{ type: "unknown", text: "secret" }] },
  { type: "future_tool", text: "secret" },
])
  test("unexpected output is a protocol violation", async () => {
    expect((await run([invalid])).result.protocolViolations?.length).toBeGreaterThan(0);
  });

test("hidden service text is bounded even when it is never shown", async () => {
  const { result, seen } = await run(
    [msg("x".repeat(24001)), topic],
    [{ type: "response.output_text.delta", output_index: 0, delta: "x".repeat(24001) }],
    "completed",
    true,
  );
  expect(seen).toBe("");
  expect(result.text).toBe("");
  expect(result.truncated).toBe(true);
  expect(result.completed).toBe(false);
  expect(result.observedOutputChars).toBe(24000);
});

test("oversized optional suggestion does not invalidate the answer, streamed or terminal", async () => {
  const call = {
    ...topic,
    name: "suggest_reply",
    arguments: JSON.stringify({ suggestion: "x".repeat(5000) }),
  };
  for (const extra of [
    [],
    [
      { type: "response.output_item.added", output_index: 1, item: call },
      { type: "response.function_call_arguments.delta", output_index: 1, delta: call.arguments },
    ],
  ]) {
    const { result, seen } = await run([msg("Ответ"), call], extra);
    expect(result.completed).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.protocolViolations).toEqual([]);
    expect(seen).toBe("Ответ");
  }
});

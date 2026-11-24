import { expect, test } from "bun:test";
import { parseResponsesSseStream } from "../src/responses-stream";
const msg = (text: string) => ({
  type: "message",
  role: "assistant",
  content: [{ type: "output_text", text }],
});
const end = {
  type: "function_call",
  call_id: "end1",
  name: "end_turn",
  arguments: '{"title":"Тема","suggestion":null}',
};
async function run(output: unknown[], extra: unknown[] = [], status = "completed") {
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
    { enforceProtocol: true },
  );
  return { result, seen: seen.join("") };
}
test("text after end never reaches live delta or final text", async () => {
  const { result, seen } = await run(
    [msg("Ответ"), end, msg("SECRET")],
    [
      { type: "response.output_item.added", output_index: 1, item: end },
      { type: "response.output_text.delta", output_index: 2, delta: "SECRET" },
    ],
  );
  expect(seen).toBe("Ответ");
  expect(result.text).toBe("Ответ");
  expect(result.protocolViolations?.length).toBeGreaterThan(0);
});
test("valid text then end preserves items/order/usage", async () => {
  const { result } = await run([msg("Ответ"), end]);
  expect(result.completed).toBe(true);
  expect(result.protocolViolations).toEqual([]);
  expect(result.usage?.cachedTokens).toBe(4);
});
test("incomplete keeps usage and never reports completed", async () => {
  const { result } = await run([msg("Ответ")], [], "incomplete");
  expect(result.completed).toBe(false);
  expect(result.usage?.inputTokens).toBe(10);
});
for (const invalid of [
  { type: "function_call", name: "end_turn", arguments: "{}" },
  { ...end, call_id: 42 },
  { type: "message", role: "assistant", content: [{ type: "unknown", text: "secret" }] },
  { type: "future_tool", text: "secret" },
])
  test("unexpected output is a protocol violation", async () => {
    expect((await run([invalid])).result.protocolViolations?.length).toBeGreaterThan(0);
  });

import { expect, test } from "bun:test";
import { OpenAIResponsesProvider } from "../src/llm/openai-provider";
import type { LlmRoundRequest } from "../src/types";

// Explicit opt-in: these tests call the real configured endpoint and spend API tokens.
const live = process.env.OPENAI_LIVE_TESTS === "1" ? test : test.skip;
const provider = () =>
  new OpenAIResponsesProvider({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  });
const request = (overrides: Partial<LlmRoundRequest> = {}): LlmRoundRequest => ({
  model: process.env.OPENAI_TEST_MODEL || "gpt-6-luna",
  effort: process.env.OPENAI_TEST_EFFORT || "low",
  instructions: "Be concise. Follow the user instruction exactly.",
  input: [
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Reply with exactly: 42" }],
    },
  ],
  tools: [],
  maxResponseChars: 1000,
  signal: AbortSignal.timeout(30000),
  onDelta: () => {},
  ...overrides,
});

live(
  "OpenAI live: streams a short answer and reports usage",
  async () => {
    const deltas: string[] = [];
    const result = await provider().runRound(request({ onDelta: (delta) => deltas.push(delta) }));
    expect(result.completed).toBe(true);
    expect(result.text.trim()).toBe("42");
    expect(deltas.join("")).toBe(result.text);
    expect(result.usage?.inputTokens).toBeGreaterThan(0);
    expect(result.usage?.outputTokens).toBeGreaterThan(0);
    console.log("OpenAI live text usage", result.usage);
  },
  35000,
);

live(
  "OpenAI live: calls a tool and continues with its result",
  async () => {
    const client = provider();
    const req = request({
      instructions:
        "First call read_block with id=demo. After receiving its result reply with exactly that result, no other text.",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "What does block demo say?" }],
        },
      ],
      tools: [
        {
          type: "function",
          name: "read_block",
          description: "Read a note block by id",
          parameters: {
            type: "object",
            properties: { id: { type: "string" }, include_proof: { type: "boolean" } },
            required: ["id"],
            additionalProperties: false,
          },
        },
      ],
    });
    const first = await client.runRound(req);
    expect(first.completed).toBe(true);
    expect(first.functionCalls).toHaveLength(1);
    const call = first.functionCalls[0]!;
    expect(call.name).toBe("read_block");
    expect(JSON.parse(call.arguments).id).toBe("demo");
    const second = await client.runRound(
      request({
        instructions: req.instructions,
        input: [
          ...req.input,
          ...first.outputItems,
          { type: "function_call_output", call_id: call.callId, output: "Транспонирую" },
        ],
      }),
    );
    expect(second.completed).toBe(true);
    expect(second.text.trim()).toBe("Транспонирую");
    console.log("OpenAI live tool usage", { first: first.usage, second: second.usage });
  },
  65000,
);

live(
  "OpenAI live: forced topic then optional suggestion and encrypted replay",
  async () => {
    const { buildMetadataTools, parseTopicArguments, parseSuggestionArguments } = await import(
      "../src/chat/metadata-tools"
    );
    const { METADATA_PROMPT } = await import("../src/chat/system-prompt");
    const tools = buildMetadataTools();
    const firstReq = request({
      instructions: METADATA_PROMPT,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Почему 2+2=4? Ответь коротко." }],
        },
      ],
      tools,
      toolChoice: { type: "function", name: "set_topic" },
      hideText: true,
      parallelToolCalls: true,
    });
    const first = await provider().runRound(firstReq);
    expect(first.completed).toBe(true);
    expect(first.functionCalls).toHaveLength(1);
    expect(first.text).toBe("");
    expect(parseTopicArguments(first.functionCalls[0]!.arguments)).toBeTruthy();
    const input = [
      ...firstReq.input,
      ...first.outputItems,
      {
        type: "function_call_output" as const,
        call_id: first.functionCalls[0]!.callId,
        output: '{"ok":true,"instruction":"Тема установлена. Теперь ответь пользователю."}',
      },
    ];
    const second = await provider().runRound(
      request({ instructions: METADATA_PROMPT, input, tools, toolChoice: "auto" }),
    );
    expect(second.completed).toBe(true);
    expect(second.text.trim().length).toBeGreaterThan(0);
    expect(second.protocolViolations).toEqual([]);
    for (const c of second.functionCalls)
      if (c.name === "suggest_reply") parseSuggestionArguments(c.arguments);
    const third = await provider().runRound(
      request({
        instructions: METADATA_PROMPT,
        tools,
        toolChoice: "none",
        input: [
          ...input,
          ...second.outputItems,
          ...second.functionCalls.map((c) => ({
            type: "function_call_output" as const,
            call_id: c.callId,
            output: '{"ok":true}',
          })),
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "А 3+3? Ответь коротко." }],
          },
        ],
      }),
    );
    expect(third.completed).toBe(true);
    expect(third.text.trim().length).toBeGreaterThan(0);
    console.log("OpenAI live metadata usage", {
      model: firstReq.model,
      first: first.usage,
      second: second.usage,
      third: third.usage,
    });
  },
  95000,
);

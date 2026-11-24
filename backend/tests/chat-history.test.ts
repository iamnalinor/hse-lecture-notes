import { expect, test } from "bun:test";
import { selectHistoryWindow, prepareTurnContext } from "../src/chat/history";
import { buildSystemPrompt } from "../src/chat/tools";
import { TrackedD1 } from "../src/db";
import { SqliteD1Shim } from "./d1-shim";
import type { CodexInputItem, TurnContextSnapshot } from "../src/types";
const message = (role: "user" | "assistant", text: string): CodexInputItem => ({
  type: "message",
  role,
  content: [{ type: role === "user" ? "input_text" : "output_text", text }],
});
const current: TurnContextSnapshot = {
  version: 1,
  contextItems: [],
  userItem: message("user", "now"),
  currentDocOrder: 0,
};
test("window keeps whole recent exchanges and counts current question once", () => {
  const exchanges = Array.from({ length: 8 }, (_, i) => ({
    logicalMessages: 2,
    items: [message("user", `q${i}`), message("assistant", `a${i}`)],
  }));
  const w = selectHistoryWindow(exchanges, current, {
    maxHistoryMessages: 15,
    maxHistoryChars: 50_000,
  });
  expect(w.logicalMessages).toBe(15);
  expect(w.limitReached).toBe(true);
  expect(w.trimmed).toBe(true);
  expect(JSON.stringify(w.items)).not.toContain("q0");
  expect(w.items.at(-1)).toEqual(current.userItem);
});
test("serialization includes hidden items; oversized old exchange drops whole", () => {
  const w = selectHistoryWindow(
    [
      {
        logicalMessages: 2,
        items: [message("user", "x".repeat(2000)), message("assistant", "a")],
      },
    ],
    current,
    { maxHistoryMessages: 15, maxHistoryChars: 500 },
  );
  expect(w.items).toEqual([current.userItem]);
  expect(w.serializedChars).toBe(JSON.stringify(w.items).length);
  expect(w.limitReached).toBe(true);
});
test("exact character threshold latches low and oversized question is rejected", () => {
  const n = JSON.stringify([current.userItem]).length;
  expect(
    selectHistoryWindow([], current, {
      maxHistoryMessages: 15,
      maxHistoryChars: n,
    }).limitReached,
  ).toBe(true);
  expect(() =>
    selectHistoryWindow([], current, {
      maxHistoryMessages: 15,
      maxHistoryChars: n - 1,
    }),
  ).toThrow("context_too_large");
});
test("system instructions remain identical across navigation", async () => {
  const db = new TrackedD1(new SqliteD1Shim().asD1());
  expect((await buildSystemPrompt(db, "", "")).instructions).toBe(
    (await buildSystemPrompt(db, "math", "doc")).instructions,
  );
});
test("preparation freezes context and preserves original snapshot on retry", async () => {
  const db = new TrackedD1(new SqliteD1Shim().asD1());
  const prepared = await prepareTurnContext(db, {
    threadId: null,
    course: "math",
    docId: "d",
    questionText: "question",
    quote: null,
    createdAt: 1700000000000,
    generatedTitle: null,
    route: { provider: "openai", model: "m", effort: "low" },
    limits: { maxHistoryMessages: 15, maxHistoryChars: 50_000 },
  });
  expect(prepared.history.logicalMessages).toBe(1);
  expect(prepared.history.items.at(-1)).toEqual(prepared.snapshot.userItem);
  expect(prepared.snapshot.contextItems[0]?.type).toBe("message");
});

test("replays compatible reasoning and full tool pairs, falls back whole exchange on model change", async () => {
  const { admitRunAtomic, finalizeRunAtomic } = await import("../src/quotas");
  const { default: defaults } = await import("../policy.json");
  const shim = new SqliteD1Shim(),
    db = new TrackedD1(shim.asD1());
  const params = {
    env: { LLM_PROVIDER: "openai" },
    axes: {
      tier: "guest" as const,
      telegramId: null,
      browserId: "b",
      ipAddress: "i",
      fingerprint: "",
    },
    clientRequestId: "a",
    payloadHash: "a",
    threadId: null,
    course: "",
    docId: "",
    questionText: "q",
    quote: null,
  };
  const first = await admitRunAtomic(db, defaults, params);
  if (first.kind !== "admitted") throw Error(first.kind);
  const items: CodexInputItem[] = [
    { type: "reasoning", encrypted_content: "OPAQUE" },
    {
      type: "function_call",
      call_id: "c",
      name: "read_document",
      arguments: '{"course":"math"}',
    },
    { type: "function_call_output", call_id: "c", output: "{}" },
    message("assistant", "answer"),
  ];
  await finalizeRunAtomic(db, {
    runId: first.runId,
    finalStatus: "done",
    messageStatus: "done",
    contentTex: "answer",
    actualCostMicros: 1,
    isCostUncertain: false,
    agentItemsJson: JSON.stringify({
      version: 1,
      complete: true,
      provenance: first.preparedContext.provenance,
      items,
    }),
  });
  const args = {
    threadId: first.threadId,
    course: "",
    docId: "",
    questionText: "next",
    quote: null,
    createdAt: Date.now(),
    generatedTitle: null,
    route: {
      provider: "openai",
      model: defaults.buckets.low.model,
      effort: defaults.buckets.low.effort,
    },
    limits: defaults,
  };
  const same = await prepareTurnContext(db, args);
  expect(JSON.stringify(same.history.items)).toContain("OPAQUE");
  const changed = await prepareTurnContext(db, {
    ...args,
    route: { ...args.route, model: "another" },
  });
  expect(JSON.stringify(changed.history.items)).not.toContain("OPAQUE");
  expect(JSON.stringify(changed.history.items)).not.toContain("function_call");
  expect(JSON.stringify(changed.history.items)).toContain('"text":"answer"');
  expect(
    (
      shim.sqlite
        .query("SELECT agent_items_json FROM chat_messages WHERE id=?")
        .get(first.assistantMessageId) as { agent_items_json: string }
    ).agent_items_json,
  ).toContain("OPAQUE");
  // Even a compatible chain can exceed the SQL read bound. Preserve the small
  // visible exchange rather than loading opaque ciphertext or dropping its answer.
  shim.sqlite
    .query("UPDATE chat_messages SET agent_items_json=? WHERE id=?")
    .run(
      JSON.stringify({
        version: 1,
        complete: true,
        provenance: first.preparedContext.provenance,
        items: [{ type: "reasoning", encrypted_content: "x".repeat(60_000) }, ...items.slice(1)],
      }),
      first.assistantMessageId,
    );
  const oversizedCompatible = await prepareTurnContext(db, args);
  expect(JSON.stringify(oversizedCompatible.history.items)).toContain('"text":"answer"');
  expect(JSON.stringify(oversizedCompatible.history.items)).not.toContain("encrypted_content");
  expect(oversizedCompatible.history.serializedChars).toBeLessThan(defaults.maxHistoryChars);
  const retry = await prepareTurnContext(db, {
    ...args,
    retryAssistantMessageId: first.assistantMessageId,
    course: "changed",
    docId: "changed",
    createdAt: 0,
  });
  expect(retry.snapshot).toEqual(first.preparedContext.snapshot);
  expect(retry.history.logicalMessages).toBe(1);
});

for (const status of ["done", "stopped", "incomplete"])
  test(`oversized ${status} envelope retains bounded visible fallback`, async () => {
    const shim = new SqliteD1Shim(),
      db = new TrackedD1(shim.asD1());
    shim.sqlite.exec(
      "INSERT INTO chat_threads(id,title,browser_id,created_at,updated_at) VALUES ('t','T','b',1,1)",
    );
    const insert = shim.sqlite.query(
      "INSERT INTO chat_messages(id,thread_id,seq,role,status,content_tex,course,doc_id,created_at,updated_at,agent_items_json) VALUES (?, 't', ?, ?, 'done', ?, '', '', 1, 1, ?)",
    );
    insert.run("u", 1, "user", "old question", null);
    insert.run(
      "a",
      2,
      "assistant",
      "old answer",
      JSON.stringify({
        version: 1,
        complete: true,
        items: [{ type: "reasoning", encrypted_content: "x".repeat(60_000) }],
      }),
    );
    shim.sqlite.query("UPDATE chat_messages SET status=? WHERE id='a'").run(status);
    const result = await prepareTurnContext(db, {
      threadId: "t",
      course: "",
      docId: "",
      questionText: "new",
      quote: null,
      createdAt: 1,
      generatedTitle: null,
      route: { provider: "openai", model: "m", effort: "low" },
      limits: { maxHistoryMessages: 15, maxHistoryChars: 50_000 },
    });
    expect(result.history.logicalMessages).toBe(3);
    expect(JSON.stringify(result.history.items)).toContain("old answer");
    expect(JSON.stringify(result.history.items)).not.toContain("encrypted_content");
    expect(result.history.serializedChars).toBeLessThan(50_000);
  });

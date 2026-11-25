import { expect, test } from "bun:test";
import defaults from "../policy.json";
import { validatePolicy } from "../scripts/admin-policy";
import { parseClientFrame } from "../src/chat/client-frame";
import { readBoundedJson } from "../src/request-json";
import { sendOwnerAlert } from "../src/telegram-alerts";
import { TrackedD1 } from "../src/db";
import { SqliteD1Shim } from "./d1-shim";

test("JSON limit counts bytes across chunks, cancels oversized bodies and accepts exact UTF-8 boundary", async () => {
  const bytes = new TextEncoder().encode('{"text":"я"}');
  const makeRequest = (onCancel: () => void, close: boolean) => new Request("https://test.invalid", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        if (close) controller.close();
      },
      cancel: onCancel,
    }),
  });
  let cancelled = false;
  expect(await readBoundedJson(makeRequest(() => { cancelled = true; }, false), bytes.length - 1)).toBeNull();
  expect(cancelled).toBe(true);
  expect(await readBoundedJson(makeRequest(() => {}, true), bytes.length)).toEqual({ text: "я" });
});

test("WebSocket parser validates command and quote fields and accepts extension fields", () => {
  const send = { type: "send" as const, clientRequestId: "r", browserToken: "b", allowanceToken: "a",
    course: "", docId: "", text: "q", extension: 1 };
  expect(parseClientFrame(JSON.stringify(send))).toEqual(send);
  expect(parseClientFrame('{"type":"stop","extension":1}')).toEqual({ type: "stop" });
  for (const value of [null, [], 1, {}, { ...send, clientRequestId: "" },
    { ...send, threadId: {} }, { ...send, quote: [] }, { ...send, quote: { tex: "", label: "", blockId: 4 } }]) {
    expect(() => parseClientFrame(JSON.stringify(value))).toThrow();
  }
});

test("failed alert retries after a short lease and confirmed alerts share an atomic cooldown", async () => {
  const db = new TrackedD1(new SqliteD1Shim().asD1());
  const env = { TELEGRAM_BOT_TOKEN: "test", OWNER_TELEGRAM_ID: "1" };
  let calls = 0;
  const pending = Promise.withResolvers<Response>();
  const send = (now: number) => sendOwnerAlert(env, db, "lastWeeklyWarnAt", "warning", now, async () => {
    calls++;
    return calls === 1 ? pending.promise : Response.json({ ok: true });
  });
  const now = Date.now();
  const first = send(now);
  expect(await send(now + 1)).toBe(false);
  pending.resolve(new Response(null, { status: 503 }));
  expect(await first).toBe(false);
  expect(await send(now + 30_000)).toBe(false);
  expect(await send(now + 65_000)).toBe(true);
  expect(await send(now + 5 * 3600_000)).toBe(false);
  expect(calls).toBe(2);
});

test("policy accepts published routes and rejects invalid counters, ratios and rate cards", () => {
  expect(() => validatePolicy(defaults)).not.toThrow();
  for (const mutate of [
    (p: typeof defaults) => { p.buckets.high.model = "unknown"; },
    (p: typeof defaults) => { p.buckets.low.pricingVersion = 42; },
    (p: typeof defaults) => { p.buckets.high.limits.student = 2.5; },
    (p: typeof defaults) => { p.budgets.weeklyWarnRatio = 1.01; },
  ]) {
    const policy = structuredClone(defaults);
    mutate(policy);
    expect(() => validatePolicy(policy)).toThrow();
  }
});

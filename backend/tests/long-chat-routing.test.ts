import { expect, test, spyOn } from "bun:test";
import { handleAllowance } from "../src/auth";
import { mintBrowserToken, signHs256Jwt } from "../src/crypto";
import type { Env } from "../src/types";
import policyDefaults from "../policy.json";
import { TrackedD1 } from "../src/db";
import { admitRunAtomic, finalizeRunAtomic } from "../src/quotas";
import { SqliteD1Shim } from "./d1-shim";

test("long thread latches low with low reserve while new thread keeps high", async () => {
  const shim = new SqliteD1Shim(),
    db = new TrackedD1(shim.asD1());
  const policy = structuredClone(policyDefaults);
  policy.maxHistoryMessages = 3;
  policy.maxQuestionChars = 321;
  policy.rateLimitPerMinute = 100;
  const alertFetch = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
  const params = {
    env: { TELEGRAM_BOT_TOKEN: "test", OWNER_TELEGRAM_ID: "1" },
    axes: {
      tier: "student" as const,
      telegramId: 123,
      browserId: "b",
      ipAddress: "ip",
      fingerprint: "",
    },
    clientRequestId: "a",
    payloadHash: "a",
    threadId: null as string | null,
    course: "",
    docId: "",
    questionText: "q",
    quote: null,
    nowMs: 1700000000000,
  };
  const a = await admitRunAtomic(db, policy, params);
  if (a.kind !== "admitted") throw Error(a.kind);
  expect(a.bucket).toBe("high");
  await finalizeRunAtomic(db, {
    runId: a.runId,
    finalStatus: "done",
    messageStatus: "done",
    actualCostMicros: 1,
    isCostUncertain: false,
    contentTex: "answer",
    nowMs: params.nowMs,
  });
  // Only low fits: admission must not reject the preliminary high reserve.
  policy.budgets.weeklyGlobalUsdMicros = policy.budgets.reserveLowMicros + 10;
  shim.sqlite
    .query("UPDATE service_config SET value_json=? WHERE key='policy'")
    .run(JSON.stringify(policy));
  shim.sqlite
    .query("INSERT INTO telegram_account_tiers(telegram_id,tier,added_at) VALUES (123,'student',?)")
    .run(params.nowMs);
  const secret = "test-signing-secret";
  const browser = await mintBrowserToken(secret);
  const sessionToken = await signHs256Jwt(secret, {
    typ: "session_v2",
    tgId: 123,
    tgName: "User",
    browserId: browser.browserId,
    iat: params.nowMs / 1000,
    exp: (params.nowMs + 60000) / 1000,
  });
  const preliminary = await handleAllowance(
    { ALLOWANCE_JWT_SECRET: secret, BROWSER_TOKEN_SECRET: secret } as Env,
    db,
    new Request("https://test.invalid"),
    { sessionToken, browserToken: browser.browserToken, turnstileToken: "test" },
    { nowMs: params.nowMs, turnstileVerifier: async () => ({ ok: true }) },
  );
  expect(preliminary.body.maxQuestionChars).toBe(321);
  expect(preliminary.body.tier).toBe("student");
  expect(preliminary.body.block).toBeNull();
  const b = await admitRunAtomic(db, policy, {
    ...params,
    threadId: a.threadId,
    clientRequestId: "b",
    payloadHash: "b",
  });
  expect(b.kind).toBe("admitted");
  if (b.kind !== "admitted") return;
  expect(b.bucket).toBe("low");
  expect(b.reserveMicros).toBe(policy.budgets.reserveLowMicros);
  expect(b.contextLimited).toBe(true);
  expect(
    shim.sqlite.query("SELECT context_limited FROM chat_threads WHERE id=?").get(a.threadId),
  ).toEqual({ context_limited: 1 });
  await finalizeRunAtomic(db, {
    runId: b.runId,
    finalStatus: "done",
    messageStatus: "done",
    actualCostMicros: 1,
    isCostUncertain: false,
    nowMs: params.nowMs,
  });
  const latched = await admitRunAtomic(db, policy, {
    ...params,
    threadId: a.threadId,
    clientRequestId: "latched",
    payloadHash: "latched",
  });
  expect(latched.kind === "admitted" && latched.bucket).toBe("low");
  if (latched.kind !== "admitted") throw Error(latched.kind);
  await finalizeRunAtomic(db, {
    runId: latched.runId,
    finalStatus: "done",
    messageStatus: "done",
    actualCostMicros: 1,
    isCostUncertain: false,
    nowMs: params.nowMs,
  });
  const alerts = shim.sqlite
    .query("SELECT value_json FROM service_config WHERE key='alerts_state'")
    .get() as { value_json: string };
  expect(JSON.parse(alerts.value_json).lastWeeklyExceededAt).toBe(0);
  policy.budgets.weeklyGlobalUsdMicros = policyDefaults.budgets.weeklyGlobalUsdMicros;
  const c = await admitRunAtomic(db, policy, {
    ...params,
    clientRequestId: "c",
    payloadHash: "c",
  });
  expect(c.kind === "admitted" && c.bucket).toBe("high");
  alertFetch.mockRestore();
});

test("same-seq context mutation during admission forces preparation again", async () => {
  const { spyOn } = await import("bun:test");
  const shim = new SqliteD1Shim(),
    db = new TrackedD1(shim.asD1()),
    policy = structuredClone(policyDefaults);
  policy.rateLimitPerMinute = 100;
  const base = {
    env: {},
    axes: {
      tier: "guest" as const,
      telegramId: null,
      browserId: "b",
      ipAddress: "i",
      fingerprint: "",
    },
    clientRequestId: "a",
    payloadHash: "a",
    threadId: null as string | null,
    course: "",
    docId: "",
    questionText: "q",
    quote: null,
  };
  const first = await admitRunAtomic(db, policy, base);
  if (first.kind !== "admitted") throw Error(first.kind);
  await finalizeRunAtomic(db, {
    runId: first.runId,
    finalStatus: "done",
    messageStatus: "done",
    contentTex: "old",
    actualCostMicros: 1,
    isCostUncertain: false,
  });
  const originalBatch = db.batch.bind(db);
  let armed = false,
    changed = false;
  const originalPrepare = db.prepare.bind(db);
  spyOn(db, "prepare").mockImplementation((sql) => {
    if (sql.startsWith("INSERT INTO usage_runs")) armed = true;
    return originalPrepare(sql);
  });
  spyOn(db, "batch").mockImplementation(async <T>(stmts: D1PreparedStatement[]) => {
    if (armed && !changed) {
      changed = true;
      shim.sqlite
        .query("UPDATE chat_messages SET content_tex='new' WHERE id=?")
        .run(first.assistantMessageId);
      shim.sqlite
        .query("UPDATE chat_threads SET context_revision=context_revision+1 WHERE id=?")
        .run(first.threadId);
    }
    return originalBatch<T>(stmts);
  });
  const next = await admitRunAtomic(db, policy, {
    ...base,
    threadId: first.threadId,
    clientRequestId: "b",
    payloadHash: "b",
  });
  expect(next.kind).toBe("admitted");
  if (next.kind !== "admitted") return;
  expect(JSON.stringify(next.preparedContext.history.items)).toContain('"text":"new"');
  expect(shim.sqlite.query("SELECT COUNT(*) AS n FROM usage_runs").get()).toEqual({ n: 2 });
  policy.maxHistoryChars = 1;
  expect(
    await admitRunAtomic(db, policy, {
      ...base,
      threadId: first.threadId,
      clientRequestId: "b",
      payloadHash: "b",
    }),
  ).toMatchObject({ kind: "duplicate", runId: next.runId });
});

test("concurrency and rate denials precede history preparation while a duplicate still replays", async () => {
  const db = new TrackedD1(new SqliteD1Shim().asD1());
  const policy = structuredClone(policyDefaults);
  policy.rateLimitPerMinute = 1;
  const params = {
    env: {},
    axes: {
      tier: "guest" as const,
      telegramId: null,
      browserId: "br",
      ipAddress: "ip",
      fingerprint: "",
    },
    clientRequestId: "original",
    payloadHash: "same",
    threadId: null,
    course: "",
    docId: "",
    questionText: "original",
    quote: null,
    nowMs: 1_700_000_000_000,
  };
  const first = await admitRunAtomic(db, policy, params);
  if (first.kind !== "admitted") throw Error(first.kind);
  // Preparing even the current turn with this policy would throw ContextSizeError.
  policy.maxHistoryChars = 1;
  const next = { ...params, clientRequestId: "new", threadId: first.threadId };
  expect(await admitRunAtomic(db, policy, params)).toMatchObject({
    kind: "duplicate",
    runId: first.runId,
  });
  expect(await admitRunAtomic(db, policy, next)).toMatchObject({
    kind: "blocked",
    block: { code: "concurrent_run" },
  });
  await finalizeRunAtomic(db, {
    runId: first.runId,
    finalStatus: "done",
    messageStatus: "done",
    actualCostMicros: 0,
    isCostUncertain: false,
    nowMs: params.nowMs,
  });
  expect(await admitRunAtomic(db, policy, next)).toMatchObject({
    kind: "blocked",
    block: { code: "rate_limited" },
  });
});

test("a high-reserve denial skips replay when the low route is also unavailable", async () => {
  const db = new TrackedD1(new SqliteD1Shim().asD1());
  const policy = structuredClone(policyDefaults);
  const params = {
    env: {},
    axes: {
      tier: "student" as const,
      telegramId: 10,
      browserId: "br",
      ipAddress: "ip",
      fingerprint: "",
    },
    clientRequestId: "first",
    payloadHash: "same",
    threadId: null,
    course: "",
    docId: "",
    questionText: "question",
    quote: null,
    nowMs: 1_700_000_000_000,
  };
  const first = await admitRunAtomic(db, policy, params);
  if (first.kind !== "admitted") throw Error(first.kind);
  policy.maxHistoryChars = 1;
  policy.budgets.weeklyGlobalUsdMicros =
    policy.budgets.reserveHighMicros + policy.budgets.reserveLowMicros;
  expect(
    await admitRunAtomic(db, policy, {
      ...params,
      threadId: first.threadId,
      clientRequestId: "later",
    }),
  ).toMatchObject({ kind: "blocked" });
});

import { expect, spyOn, test } from "bun:test";
import { TrackedD1 } from "../src/db";
import { admitRunAtomic, checkpointRound, finalizeRunAtomic, readBudgetSnapshot, type AdmitRunParams } from "../src/quotas";
import initialPolicy from "../policy.json";
import { SqliteD1Shim } from "./d1-shim";

const now = 1_700_000_000_000;

function fixture(globalLimit = 20_000, guestLimit = 20_000) {
  const shim = new SqliteD1Shim();
  const db = new TrackedD1(shim.asD1());
  const policy = {
    ...structuredClone(initialPolicy),
    budgets: {
      ...initialPolicy.budgets,
      weeklyGlobalUsdMicros: globalLimit,
      dailyGuestUsdMicros: guestLimit,
    },
  };
  function admit(id: string, overrides: Partial<AdmitRunParams> = {}) {
    return admitRunAtomic(db, policy, {
      env: { TELEGRAM_BOT_TOKEN: "", OWNER_TELEGRAM_ID: "" },
      axes: { tier: "guest", telegramId: null, browserId: id, ipAddress: id, fingerprint: "" },
      clientRequestId: id, payloadHash: id, course: "course", docId: "doc",
      threadId: null, questionText: id, quote: null, nowMs: now, ...overrides,
    });
  }
  function finish(runId: string) {
    return finalizeRunAtomic(db, { runId, nowMs: now, finalStatus: "done", messageStatus: "done",
      actualCostMicros: 250, isCostUncertain: false, contentTex: "answer" });
  }
  function checkpoint(runId: string) {
    return checkpointRound(db, policy, { runId, tier: "guest", bucket: "low",
      currentReservedMicros: 5000, cumulativeActualMicros: 4000, inputTokens: 1,
      cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 2, toolCalls: 1, toolRounds: 1, nowMs: now });
  }
  return { shim, db, admit, finish, checkpoint, policy };
}

for (const limit of ["global", "guest"] as const) {
  test(`concurrent admissions reserve only the remaining ${limit} budget`, async () => {
    const { shim, db, admit } = limit === "global" ? fixture(5000) : fixture(20_000, 5000);
    const runs = await Promise.all([admit("a"), admit("b")]);
    expect(runs.filter(r => r.kind === "admitted")).toHaveLength(1);
    expect(runs.find(r => r.kind === "blocked")?.block.code).toBe(`${limit}_budget_exceeded`);
    expect((await readBudgetSnapshot(db, now)).globalReserved).toBe(5000);
    expect(shim.sqlite.query("SELECT COUNT(*) AS n FROM chat_threads").get()).toEqual({ n: 1 });
    expect(shim.sqlite.query("SELECT COUNT(*) AS n FROM chat_messages").get()).toEqual({ n: 2 });
  });

  test(`concurrent and replayed top-ups respect the ${limit} cap`, async () => {
    const { db, admit, checkpoint, finish } = limit === "global" ? fixture(11_500) : fixture(20_000, 11_500);
    const [a, b] = await Promise.all([admit("a"), admit("b")]);
    if (a.kind !== "admitted" || b.kind !== "admitted") throw Error("expected two runs");
    const checkpoints = await Promise.all([checkpoint(a.runId), checkpoint(b.runId)]);
    expect(checkpoints.map(c => c.canContinueToolRounds).sort()).toEqual([false, true]);
    const winner = checkpoints[0]!.canContinueToolRounds ? a : b;
    expect((await checkpoint(winner.runId)).updatedReservedMicros).toBe(6500);
    expect(await readBudgetSnapshot(db, now)).toMatchObject({ globalReserved: 11_500, guestReserved: 11_500 });
    await finish(winner.runId);
    expect((await checkpoint(winner.runId)).canContinueToolRounds).toBe(false);
    expect(await readBudgetSnapshot(db, now)).toMatchObject({ globalReserved: 5000, globalActual7d: 4000 });
  });
}

test("failed settlement rolls back all writes and concurrent retries charge once", async () => {
  const { db, shim, admit, finish } = fixture();
  const run = await admit("a");
  if (run.kind !== "admitted") throw Error("expected admitted");
  shim.sqlite.exec(`CREATE TRIGGER fail_release BEFORE UPDATE ON budget_reserves
    BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);
  await expect(finish(run.runId)).rejects.toThrow("injected failure");
  expect(shim.sqlite.query("SELECT status, actual_cost_micros FROM usage_runs").get())
    .toEqual({ status: "running", actual_cost_micros: 0 });
  expect(shim.sqlite.query("SELECT status, content_tex FROM chat_messages WHERE role='assistant'").get())
    .toEqual({ status: "running", content_tex: "" });
  expect(await readBudgetSnapshot(db, now)).toMatchObject({ globalReserved: 5000, globalActual7d: 0 });
  shim.sqlite.exec("DROP TRIGGER fail_release");
  expect((await Promise.all([finish(run.runId), finish(run.runId)])).sort()).toEqual([false, true]);
  expect(await readBudgetSnapshot(db, now)).toMatchObject({ globalReserved: 0, globalActual7d: 250 });
});

test("a stale retry preserves later turns and the latest answer can still be retried", async () => {
  const { admit, finish, shim } = fixture();
  const first = await admit("owner");
  if (first.kind !== "admitted") throw Error("expected first turn");
  await finish(first.runId);
  const second = await admit("owner", { clientRequestId: "second", threadId: first.threadId });
  if (second.kind !== "admitted") throw Error("expected second turn");
  await finish(second.runId);
  const messages = shim.sqlite.query("SELECT * FROM chat_messages ORDER BY seq");
  const before = messages.all();
  const retry = (id: string) => admit("owner", {
    clientRequestId: "retry", threadId: first.threadId, retryAssistantMessageId: id,
  });
  expect((await retry(first.assistantMessageId)).kind).toBe("conflict");
  expect(messages.all()).toEqual(before);
  expect(await retry(second.assistantMessageId)).toMatchObject({
    kind: "admitted", assistantMessageId: second.assistantMessageId, userMessageId: second.userMessageId,
  });
  expect(messages.all()).toHaveLength(4);
});

test("concurrent guest admissions on one IP can only occupy one active slot", async () => {
  const { admit, shim } = fixture();
  const sharedIp = (browserId: string) => admit(browserId, {
    axes: { tier: "guest", telegramId: null, browserId, ipAddress: "shared", fingerprint: "" },
  });
  const results = await Promise.all([sharedIp("first"), sharedIp("second")]);
  expect(results.filter(r => r.kind === "admitted")).toHaveLength(1);
  expect(results.find(r => r.kind === "blocked")?.block.code).toBe("concurrent_run");
  expect(shim.sqlite.query("SELECT COUNT(*) AS n FROM chat_threads").get()).toEqual({ n: 1 });
});

for (const code of ["auth_required", "rate_limited"] as const) {
  test(`admission rechecks ${code} when another browser finishes during preflight`, async () => {
    const { admit, db, finish, policy } = fixture();
    if (code === "rate_limited") policy.rateLimitPerMinute = 1;
    else policy.buckets.low.limits.guest = 1;
    const sharedIp = (id: string) => admit(id, {
      axes: { tier: "guest", telegramId: null, browserId: id, ipAddress: "shared", fingerprint: "" },
    });
    // Pause exactly at the first admission batch, after its optimistic reads.
    let admissionPrepared = false;
    let interleaved = false;
    const prepare = db.prepare.bind(db);
    spyOn(db, "prepare").mockImplementation(sql => {
      if (sql.startsWith("INSERT INTO usage_runs")) admissionPrepared = true;
      return prepare(sql);
    });
    const batch = db.batch.bind(db);
    spyOn(db, "batch").mockImplementation(async <T>(stmts: D1PreparedStatement[]) => {
      if (admissionPrepared && !interleaved) {
        interleaved = true;
        const winner = await sharedIp("winner");
        if (winner.kind !== "admitted") throw Error("expected winning browser to be admitted");
        await finish(winner.runId);
      }
      return batch<T>(stmts);
    });
    expect(await sharedIp("late")).toMatchObject({ kind: "blocked", block: { code } });
  });
}

test("admission rechecks thread ownership after a guest signs in", async () => {
  const { admit, finish, db, shim } = fixture();
  const first = await admit("owner");
  if (first.kind !== "admitted") throw Error("expected first turn");
  await finish(first.runId);
  const prepare = db.prepare.bind(db);
  spyOn(db, "prepare").mockImplementation(sql => {
    if (sql.startsWith("INSERT INTO usage_runs")) {
      shim.sqlite.query("UPDATE chat_threads SET telegram_id = 20, browser_id = NULL WHERE id = ?").run(first.threadId);
    }
    return prepare(sql);
  });
  expect(await admit("owner", { clientRequestId: "after-login", threadId: first.threadId }))
    .toMatchObject({ kind: "not_found" });
  expect(shim.sqlite.query("SELECT COUNT(*) AS n FROM chat_messages").get()).toEqual({ n: 2 });
});

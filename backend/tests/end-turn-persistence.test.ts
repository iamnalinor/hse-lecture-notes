import { expect, test } from "bun:test";
import defaults from "../policy.json";
import { TrackedD1 } from "../src/db";
import { admitRunAtomic, finalizeRunAtomic } from "../src/quotas";
import { SqliteD1Shim } from "./d1-shim";

test("metadata is atomic with settlement and only winning done publishes changes", async () => {
  const shim = new SqliteD1Shim(),
    db = new TrackedD1(shim.asD1());
  const run = await admitRunAtomic(db, defaults, {
    env: {},
    axes: { tier: "guest", telegramId: null, browserId: "b", ipAddress: "i", fingerprint: "" },
    clientRequestId: "r",
    payloadHash: "h",
    threadId: null,
    course: "",
    docId: "",
    questionText: "q",
    quote: null,
  });
  if (run.kind !== "admitted") throw Error(run.kind);
  const input = {
    runId: run.runId,
    finalStatus: "done" as const,
    messageStatus: "done" as const,
    contentTex: "answer",
    metadata: { title: "Title", suggestion: "What next?" },
    actualCostMicros: 10,
    isCostUncertain: false,
  };
  shim.sqlite.exec(
    "CREATE TRIGGER fail_settle BEFORE UPDATE ON budget_reserves BEGIN SELECT RAISE(ABORT, 'injected'); END",
  );
  await expect(finalizeRunAtomic(db, input)).rejects.toThrow("injected");
  expect(shim.sqlite.query("SELECT generated_title FROM chat_threads").get()).toEqual({
    generated_title: null,
  });
  expect(
    shim.sqlite.query("SELECT suggestion,status FROM chat_messages WHERE role='assistant'").get(),
  ).toEqual({ suggestion: null, status: "running" });
  shim.sqlite.exec("DROP TRIGGER fail_settle");
  expect(
    (
      await Promise.all([
        finalizeRunAtomic(db, input),
        finalizeRunAtomic(db, { ...input, metadata: { title: "Loser", suggestion: null } }),
      ])
    ).sort(),
  ).toEqual([false, true]);
  expect(
    shim.sqlite.query("SELECT generated_title,context_revision FROM chat_threads").get(),
  ).toEqual({ generated_title: "Title", context_revision: 2 });
  expect(
    shim.sqlite.query("SELECT suggestion FROM chat_messages WHERE role='assistant'").get(),
  ).toEqual({ suggestion: "What next?" });
});

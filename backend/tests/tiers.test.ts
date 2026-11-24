import { expect, test } from "bun:test";
import { verifyActiveSession, verifyAllowanceToken } from "../src/auth";
import { signHs256Jwt } from "../src/crypto";
import { TrackedD1 } from "../src/db";
import {
  admitRunAtomic,
  evaluateQuotasAndBudgets,
  finalizeRunAtomic,
  loadPolicy,
} from "../src/quotas";
import { SqliteD1Shim } from "./d1-shim";
const now = 1_800_000_000_000;
const secret = "test-tier-signing-secret";

test("an authenticated account without an override uses default", async () => {
  const shim = new SqliteD1Shim();
  shim.sqlite
    .query(
      "INSERT INTO user_sessions(id,telegram_id,telegram_name,browser_id,created_at,expires_at) VALUES ('s',42,'User','br',?,?)",
    )
    .run(now, now + 60000);
  const token = await signHs256Jwt(secret, {
    typ: "session",
    sid: "s",
    tgId: 42,
    tgName: "User",
    browserId: "br",
    iat: now / 1000,
    exp: (now + 60000) / 1000,
  });
  expect(
    (
      await verifyActiveSession(
        { ALLOWANCE_JWT_SECRET: secret },
        new TrackedD1(shim.asD1()),
        token,
        now,
      )
    )?.tier,
  ).toBe("default");
});

test("extended has independent configurable high and low allowances", async () => {
  const shim = new SqliteD1Shim();
  const db = new TrackedD1(shim.asD1());
  const policy = await loadPolicy(db);
  Object.assign(policy.buckets.high.limits, { extended: 2 });
  Object.assign(policy.buckets.low.limits, { extended: 3 });
  policy.rateLimitPerMinute = 100;
  const axes = {
    tier: "extended" as const,
    telegramId: 42,
    browserId: "br",
    ipAddress: "ip",
    fingerprint: "",
  };
  for (let i = 0; i < 5; i++) {
    const result = await admitRunAtomic(db, policy, {
      env: {},
      axes,
      clientRequestId: `q${i}`,
      payloadHash: `q${i}`,
      threadId: null,
      questionText: `Q${i}`,
      quote: null,
      course: "",
      docId: "",
      nowMs: now + i * 2000,
    });
    if (result.kind !== "admitted") throw new Error(`Unexpected ${result.kind}`);
    expect(result.bucket).toBe(i < 2 ? "high" : "low");
    expect(result.degraded.active).toBe(i >= 2);
    await finalizeRunAtomic(db, {
      runId: result.runId,
      nowMs: now + i * 2000 + 1,
      finalStatus: "done",
      messageStatus: "done",
      actualCostMicros: 0,
      isCostUncertain: false,
      contentTex: "Answer",
    });
  }
  const blocked = await evaluateQuotasAndBudgets(db, policy, axes, now + 12000);
  expect(blocked.allowed).toBe(false);
  expect(blocked.block?.code).toBe("tier_quota_exceeded");
  expect(shim.sqlite.query("SELECT DISTINCT tier FROM usage_runs").all()).toEqual([
    { tier: "extended" },
  ]);
});

test("manual tier changes apply to existing sessions and allowance tokens", async () => {
  const shim = new SqliteD1Shim();
  const db = new TrackedD1(shim.asD1());
  shim.sqlite
    .query(
      "INSERT INTO user_sessions(id,telegram_id,telegram_name,browser_id,created_at,expires_at) VALUES ('s',42,'User','br',?,?)",
    )
    .run(now, now + 60000);
  const token = await signHs256Jwt(secret, {
    typ: "allowance",
    sid: "s",
    tgId: 42,
    browserId: "br",
    tier: "default",
    iat: now / 1000,
    exp: (now + 60000) / 1000,
  });
  const sessionToken = await signHs256Jwt(secret, {
    typ: "session",
    sid: "s",
    tgId: 42,
    tgName: "User",
    browserId: "br",
    iat: now / 1000,
    exp: (now + 60000) / 1000,
  });
  for (const tier of ["student", "extended", "default"] as const) {
    shim.sqlite.exec("DELETE FROM telegram_account_tiers");
    if (tier !== "default")
      shim.sqlite
        .query("INSERT INTO telegram_account_tiers(telegram_id,tier,added_at) VALUES (42,?,?)")
        .run(tier, now);
    expect(
      (await verifyActiveSession({ ALLOWANCE_JWT_SECRET: secret }, db, sessionToken, now))?.tier,
    ).toBe(tier);
    expect(
      (await verifyAllowanceToken({ ALLOWANCE_JWT_SECRET: secret }, db, token, "br", now))?.tier,
    ).toBe(tier);
  }
});

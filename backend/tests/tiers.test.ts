import { expect, test } from "bun:test";
import { handleAllowance, verifyActiveSession, verifyAllowanceToken } from "../src/auth";
import { mintBrowserToken, signHs256Jwt } from "../src/crypto";
import type { Env } from "../src/types";
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

const env = { ALLOWANCE_JWT_SECRET: secret, BROWSER_TOKEN_SECRET: secret } as Env;
const sessionClaims = {
  typ: "session_v2",
  tgId: 42,
  tgName: "User",
  browserId: "br",
  iat: now / 1000,
  exp: (now + 60_000) / 1000,
};

test("sessions require a valid signature, matching browser, account claims, and unexpired token", async () => {
  const token = await signHs256Jwt(secret, sessionClaims);
  expect(await verifyActiveSession(env, token, "br", now)).toMatchObject({
    telegramId: 42,
    telegramName: "User",
  });
  expect(await verifyActiveSession(env, token, "other", now)).toBeNull();
  expect(await verifyActiveSession(env, token, "br", now + 60_000)).toBeNull();
  expect(
    await verifyActiveSession(env, await signHs256Jwt("wrong", sessionClaims), "br", now),
  ).toBeNull();
  for (const change of [
    { exp: undefined },
    { tgId: 0 },
    { tgName: null },
    { typ: "session", sid: "s" },
  ]) {
    const invalid = await signHs256Jwt(secret, { ...sessionClaims, ...change });
    expect(await verifyActiveSession(env, invalid, "br", now)).toBeNull();
  }
});

test("legacy guest allowances survive the session migration while legacy account allowances expire", async () => {
  const shim = new SqliteD1Shim();
  const db = new TrackedD1(shim.asD1());
  const guest = {
    typ: "allowance",
    tier: "guest",
    browserId: "br",
    ip: "",
    fp: "",
    exp: now / 1000 + 60,
  };
  const guestToken = await signHs256Jwt(secret, guest);
  expect(await verifyAllowanceToken(env, db, guestToken, "br", now)).toMatchObject({
    tier: "guest",
  });
  expect(await verifyAllowanceToken(env, db, guestToken, "other", now)).toBeNull();
  for (const change of [
    { sid: "s", tgId: 42, tier: "student" },
    { tgId: 42 },
    { exp: undefined },
    { maxQuestionChars: 0 },
    { maxQuestionChars: 1.5 },
    { maxQuestionChars: "100" },
    { maxQuestionChars: 50_000 },
  ]) {
    const token = await signHs256Jwt(secret, { ...guest, ...change });
    expect(await verifyAllowanceToken(env, db, token, "br", now)).toBeNull();
  }
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
  const browser = await mintBrowserToken(secret);
  const sessionToken = await signHs256Jwt(secret, {
    ...sessionClaims,
    browserId: browser.browserId,
  });
  const issueAllowance = () =>
    handleAllowance(
      env,
      db,
      new Request("https://test.invalid"),
      {
        sessionToken,
        browserToken: browser.browserToken,
        turnstileToken: "ok",
      },
      { nowMs: now, turnstileVerifier: async () => ({ ok: true }) },
    );
  const firstAllowance = await issueAllowance();
  expect(firstAllowance.body.tier).toBe("default");
  expect(firstAllowance.body.allowanceExpiresAt).toBe(now + 60_000);
  const token = String(firstAllowance.body.allowanceToken);
  expect(await verifyAllowanceToken(env, db, token, browser.browserId, now + 60_000)).toBeNull();
  expect(await verifyAllowanceToken(env, db, token, "other", now)).toBeNull();
  for (const tier of ["student", "extended", "default"] as const) {
    shim.sqlite.exec("DELETE FROM telegram_account_tiers");
    if (tier !== "default")
      shim.sqlite
        .query("INSERT INTO telegram_account_tiers(telegram_id,tier,added_at) VALUES (42,?,?)")
        .run(tier, now);
    expect((await issueAllowance()).body.tier).toBe(tier);
    expect((await verifyAllowanceToken(env, db, token, browser.browserId, now))?.tier).toBe(tier);
  }
});

test("a guest over the limit is told when the window really drops below it, not when the oldest run leaves", async () => {
  const shim = new SqliteD1Shim();
  const db = new TrackedD1(shim.asD1());
  const policy = await loadPolicy(db);
  Object.assign(policy.buckets.low.limits, { guest: 5 });
  policy.rateLimitPerMinute = 100;
  const axes = {
    tier: "guest" as const,
    telegramId: null,
    browserId: "br",
    ipAddress: "ip",
    fingerprint: "",
  };
  const hour = 3_600_000;
  for (let i = 0; i < 5; i++) {
    const at = now + i * hour;
    const result = await admitRunAtomic(db, policy, {
      env: {},
      axes,
      clientRequestId: `g${i}`,
      payloadHash: `g${i}`,
      threadId: null,
      questionText: `Q${i}`,
      quote: null,
      course: "",
      docId: "",
      nowMs: at,
    });
    if (result.kind !== "admitted") throw new Error(`Unexpected ${result.kind}`);
    await finalizeRunAtomic(db, {
      runId: result.runId,
      nowMs: at + 1,
      finalStatus: "done",
      messageStatus: "done",
      actualCostMicros: 0,
      isCostUncertain: false,
      contentTex: "Answer",
    });
  }
  // The limit drops to 3 with 5 runs in the window: two must leave before a slot is free,
  // so the third newest run (made at +2h) is the one that frees it.
  Object.assign(policy.buckets.low.limits, { guest: 3 });
  const blocked = await evaluateQuotasAndBudgets(db, policy, axes, now + 5 * hour);
  expect(blocked.block?.code).toBe("auth_required");
  expect(blocked.block?.nextAvailableAt).toBe(now + 2 * hour + 24 * hour);
  const atRelease = await evaluateQuotasAndBudgets(db, policy, axes, now + 26 * hour + 1);
  expect(atRelease.block).toBeNull();
});

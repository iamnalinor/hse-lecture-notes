// Real Worker, Durable Object, WebSocket and D1. Only outbound services are replaced.
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";

const origin = "https://site.test";
const api = "https://api.test";
const text = "Сумма равна четырем.";
const directory = await mkdtemp(join(tmpdir(), "hse-chat-workerd-"));
execFileSync("bunx", ["wrangler", "deploy", "--dry-run", "--outdir", directory], {
  env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
});

let providerCalls = 0;
let release;
const gate = new Promise(resolve => { release = resolve; });
const options = {
  modules: true, script: await readFile(join(directory, "index.js"), "utf8"), compatibilityDate: "2026-11-23",
  cf: {}, d1Databases: ["DB"], durableObjects: { CHAT_RUNNER: { className: "ChatRunner", useSQLite: true } },
  bindings: {
    ALLOWED_ORIGINS: origin, TURNSTILE_EXPECTED_HOSTNAMES: "site.test",
    TURNSTILE_SECRET_KEY: "local-turnstile", ALLOWANCE_JWT_SECRET: "local-allowance",
    BROWSER_TOKEN_SECRET: "local-browser", LLM_PROVIDER: "openai",
    OPENAI_BASE_URL: "https://provider.test/v1", OPENAI_API_KEY: "local-fixture",
  },
  outboundService: async request => {
    if (request.url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      const success = new URLSearchParams(await request.text()).get("response") === "local-challenge";
      return Response.json({ success, hostname: "site.test", action: "chat_allowance" });
    }
    assert.equal(request.url, "https://provider.test/v1/responses");
    assert.equal(request.headers.get("authorization"), "Bearer local-fixture");
    const body = await request.json();
    providerCalls++;
    await gate;
    const topic = body.tool_choice?.name === "set_topic";
    const item = topic
      ? { type: "function_call", call_id: "call-topic", name: "set_topic", arguments: JSON.stringify({ title: "Арифметика" }) }
      : { type: "message", role: "assistant", content: [{ type: "output_text", text }] };
    const event = { type: "response.completed", response: { id: "resp-local", status: "completed",
      output: [item], usage: { input_tokens: 100, output_tokens: 10 } } };
    return new Response("data: " + JSON.stringify(event) + "\n\n", { headers: { "Content-Type": "text/event-stream" } });
  },
};
const mf = new Miniflare(convertV4MiniflareOptions(options));
async function request(path, init = {}) {
  return mf.dispatchFetch(api + path, { ...init, headers: { origin, ...init.headers } });
}

async function connect(frame, stopAt) {
  const res = await request("/v1/messages", { headers: { upgrade: "websocket" } });
  assert.equal(res.status, 101);
  const socket = res.webSocket;
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Timed out waiting for " + stopAt)), 10000);
      socket.addEventListener("message", event => {
        const value = JSON.parse(event.data);
        if (value.type === stopAt || value.type === "error") {
          clearTimeout(timer);
          resolve(value);
        }
      });
      socket.accept();
      socket.send(JSON.stringify(frame));
    });
  } finally {
    socket.close(1000, "client disconnect");
  }
}

try {
  for (const clientId of [undefined, " "]) {
    if (clientId !== undefined) {
      options.bindings.TELEGRAM_CLIENT_ID = clientId;
      await mf.setOptions(convertV4MiniflareOptions(options));
    }
    const unavailable = await request("/v1/health");
    assert.equal(unavailable.status, 503);
    const failure = await unavailable.json();
    assert.equal(failure.code, "configuration_error");
    assert.match(failure.message, /TELEGRAM_CLIENT_ID/);
  }
  options.bindings.TELEGRAM_CLIENT_ID = "local-client";
  await mf.setOptions(convertV4MiniflareOptions(options));
  assert.equal((await request("/v1/health")).status, 200);
  const db = await mf.getD1Database("DB");
  for (const name of (await readdir("migrations")).filter(n => n.endsWith(".sql")).sort()) {
    const statements = unstable_splitSqlQuery(await readFile("migrations/" + name, "utf8"));
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  await db.prepare("INSERT INTO service_config (key, value_json, updated_at) VALUES ('policy', ?, ?)")
    .bind(await readFile("policy.json", "utf8"), Date.now()).run();
  const allowance = token => request("/v1/allowance", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstileToken: token }),
  });
  assert.equal((await allowance("rejected")).status, 403);
  const issued = await allowance("local-challenge");
  assert.equal(issued.status, 200);
  const { browserToken, allowanceToken } = await issued.json();
  const frame = { type: "send", course: "", docId: "", text: "Сколько будет два плюс два?", clientRequestId: "workerd-1", browserToken, allowanceToken };
  const rejected = await connect({ ...frame, allowanceToken: "invalid" }, "error");
  assert.equal(rejected.code, "allowance_expired");
  assert.equal(providerCalls, 0);

  const meta = await connect(frame, "meta");
  assert.equal(meta.type, "meta", JSON.stringify(meta));
  const owned = { headers: { "X-Browser-Token": browserToken } };
  const statusPath = "/v1/runs/" + meta.runId + "/status";
  assert.equal((await (await request(statusPath, owned)).json()).status, "running");
  release();
  let status;
  for (let attempt = 0; attempt < 100; attempt++) {
    const res = await request(statusPath, owned);
    assert.equal(res.status, 200);
    status = (await res.json()).status;
    if (status !== "running") break;
    await delay(50);
  }
  assert.equal(status, "done");
  assert.equal(providerCalls, 2);
  const history = await request("/v1/thread?threadId=" + meta.threadId, owned);
  assert.equal(history.status, 200);
  const { thread } = await history.json();
  assert.deepEqual(thread.messages.map(m => [m.role, m.contentTex]), [["user", frame.text], ["assistant", text]]);
  assert.equal(thread.messages[1].runId, meta.runId);
  assert.equal(thread.messages[1].status, "done");
  console.log("workerd chat integration passed");
} finally {
  release();
  await mf.dispose();
  await rm(directory, { recursive: true, force: true });
}

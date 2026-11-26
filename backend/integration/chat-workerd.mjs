// Real Worker, HTTP stream, Durable Object, legacy WebSocket and D1. Only outbound services are replaced.
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
let pauseProvider = null;
const modelInputs = [];
let release;
const gate = new Promise(resolve => { release = resolve; });
const options = {
  modules: true, script: await readFile(join(directory, "index.js"), "utf8"), compatibilityDate: "2026-11-23",
  cf: {}, d1Databases: ["DB"], r2Buckets: ["ARCHIVE_BUCKET"], durableObjects: { CHAT_RUNNER: { className: "ChatRunner", useSQLite: true } },
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
    modelInputs.push(JSON.stringify(body.input));
    await gate;
    if (pauseProvider !== null) await pauseProvider;
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

async function send(frame) {
  return request("/v1/messages", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(frame),
  });
}

async function connect(frame, stopAt) {
  const response = await send(frame);
  if (!response.ok) return response.json();
  assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Missing " + stopAt);
      pending += value;
      let split;
      while ((split = pending.indexOf("\n")) !== -1) {
        const event = JSON.parse(pending.slice(0, split));
        pending = pending.slice(split + 1);
        if (event.type === stopAt || event.type === "error") return event;
      }
    }
  } finally {
    await reader.cancel();
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
  const allowance = (token, browserToken) => request("/v1/allowance", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnstileToken: token, browserToken }),
  });
  assert.equal((await allowance("rejected")).status, 403);
  const issued = await allowance("local-challenge");
  assert.equal(issued.status, 200);
  const { browserToken, allowanceToken, maxQuestionChars } = await issued.json();
  const frame = { type: "send", course: "", docId: "", text: "Сколько будет два плюс два?", clientRequestId: "workerd-1", browserToken, allowanceToken };
  const legacy = await request("/v1/messages", { headers: { upgrade: "websocket" } });
  assert.equal(legacy.status, 101);
  const notice = new Promise(resolve => legacy.webSocket.addEventListener("message", ev => resolve(JSON.parse(ev.data)), { once: true }));
  legacy.webSocket.accept();
  assert.equal((await notice).code, "client_update_required");
  legacy.webSocket.close();
  const oversized = await send({ ...frame, text: "я".repeat(21_000) });
  assert.equal(oversized.status, 413);
  const malformed = await request("/v1/messages", { method: "POST", body: "{" });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "invalid_json");
  const forbidden = await request("/v1/messages", { method: "POST", headers: { origin: "https://other.test" }, body: JSON.stringify(frame) });
  assert.equal(forbidden.status, 403);
  const rejectedResponse = await send({ ...frame, allowanceToken: "invalid" });
  assert.equal(rejectedResponse.status, 401);
  const rejected = await rejectedResponse.json();
  assert.equal(rejected.type, "error");
  assert.equal(rejected.code, "allowance_expired");
  assert.equal(providerCalls, 0);

  const setQuestionLimit = limit => db.prepare(
    "UPDATE service_config SET value_json=json_set(value_json,'$.maxQuestionChars',?) WHERE key='policy'",
  ).bind(limit).run();
  await setQuestionLimit(17);
  const reduced = await (await allowance("local-challenge", browserToken)).json();
  assert.equal(reduced.maxQuestionChars, 17);
  const limitedFrame = { ...frame, allowanceToken: reduced.allowanceToken };
  const limited = await connect(limitedFrame, "error");
  assert.equal(limited.code, "question_too_long");
  assert.match(limited.message, /17/);
  assert.equal("maxQuestionChars" in limited, false);
  await setQuestionLimit(maxQuestionChars);
  assert.equal((await connect(limitedFrame, "error")).code, "question_too_long");
  const raised = await (await allowance("local-challenge", browserToken)).json();
  assert.equal(raised.maxQuestionChars, maxQuestionChars);
  await setQuestionLimit(17);
  assert.equal(providerCalls, 0);

  const quote = { label: "Конспект", tex: "Пример из исходной версии." };
  await db.prepare(`INSERT INTO course_documents (id, course, doc_kind, doc_id, title, outline_json, body_tex, content_hash, updated_at)
    VALUES ('fixture','algebra','lecture','01','Арифметика','[]',?,'fixture',1)`).bind(quote.tex).run();
  Object.assign(frame, { course: "algebra", docId: "01", quote });
  const meta = await connect({ ...frame, allowanceToken: raised.allowanceToken }, "meta");
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
  await db.prepare("UPDATE course_documents SET body_tex='Исправленный пример.' WHERE id='fixture'").run();
  const fresh = await connect({ ...frame, clientRequestId: "fresh-selection" }, "error");
  assert.equal(fresh.code, "invalid_quote");
  assert.match(fresh.message, /выдели|выбери/i);
  assert.equal(providerCalls, 2);

  await db.prepare("DELETE FROM course_documents WHERE id='fixture'").run();
  // The original POST was accepted, but its acknowledgement could have been lost.
  await setQuestionLimit(1);
  const renewed = await (await allowance("local-challenge", browserToken)).json();
  const renewedFrame = { ...frame, allowanceToken: renewed.allowanceToken };
  const recovered = await connect(renewedFrame, "done");
  assert.equal(recovered.replayed, true, JSON.stringify(recovered));
  assert.equal(recovered.runId, meta.runId);
  assert.equal((await send({ ...frame, text: frame.text + "!" })).status, 409);
  assert.equal((await connect({ ...renewedFrame, clientRequestId: "fresh-limited" }, "error")).code, "question_too_long");
  assert.equal(providerCalls, 2);
  await setQuestionLimit(maxQuestionChars);
  assert.equal((await connect(frame, "done")).runId, meta.runId);
  const retry = { ...renewedFrame, threadId: meta.threadId, retryAssistantMessageId: meta.assistantMessageId,
    clientRequestId: "stored-question", course: "other", docId: "unknown", text: "Другой вопрос",
    quote: { label: "Другое", tex: "Другая цитата" } };
  const foreign = await (await allowance("local-challenge")).json();
  const denied = await connect({ ...retry, browserToken: foreign.browserToken, allowanceToken: foreign.allowanceToken }, "error");
  assert.equal(denied.code, "thread_not_found");
  assert.equal(providerCalls, 2);
  const retried = await connect(retry, "done");
  assert.equal(retried.type, "done", JSON.stringify(retried));
  assert.equal(retried.status, "done");
  assert.match(modelInputs.at(-1), /Пример из исходной версии/);
  assert.doesNotMatch(modelInputs.at(-1), /Другая цитата|Другой вопрос|unknown/);
  // Explicit stopping is owner-only and differs from simply detaching a reader.
  const stopGate = Promise.withResolvers();
  pauseProvider = stopGate.promise;
  const stopFrame = { ...frame, course: "", docId: "", quote: null, clientRequestId: "explicit-stop" };
  const stopResponse = await send(stopFrame);
  assert.equal(stopResponse.status, 200);
  const reader = stopResponse.body.pipeThrough(new TextDecoderStream()).getReader();
  const first = await reader.read();
  const stopMeta = JSON.parse(first.value.trim());
  assert.equal(stopMeta.type, "meta");
  const replayed = await connect(stopFrame, "done");
  assert.equal(replayed.runId, stopMeta.runId);
  assert.equal(replayed.replayed, true);
  const stopPath = "/v1/runs/" + stopMeta.runId + "/stop";
  assert.equal((await request(stopPath, { method: "POST" })).status, 401);
  assert.equal((await request(stopPath, { method: "POST", headers: { "X-Browser-Token": foreign.browserToken } })).status, 403);
  assert.equal((await request(stopPath, { method: "POST", ...owned })).status, 204);
  stopGate.resolve();
  let remainder = "";
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    remainder += item.value;
  }
  assert.equal(JSON.parse(remainder.trim().split("\n").at(-1)).status, "stopped");
  assert.equal((await request(stopPath, { method: "POST", ...owned })).status, 204);
  assert.equal(await db.prepare("SELECT status FROM usage_runs WHERE id=?").bind(stopMeta.runId).first("status"), "stopped");
  pauseProvider = null;
  await db.prepare("UPDATE chat_threads SET updated_at=1 WHERE id=?").bind(meta.threadId).run();
  const worker = await mf.getWorker();
  await worker.scheduled({ cron: "0 3 * * *" });
  const bucket = await mf.getR2Bucket("ARCHIVE_BUCKET");
  const { objects } = await bucket.list();
  assert.equal(objects.length, 1);
  const archived = await bucket.get(objects[0].key);
  const record = JSON.parse(await new Response(archived.body.pipeThrough(new DecompressionStream("gzip"))).text());
  assert.equal(record.kind, "thread");
  assert.equal(record.thread.id, meta.threadId);
  assert.deepEqual(record.messages.map(message => message.content_tex), [frame.text, text]);
  assert.equal(await db.prepare("SELECT id FROM chat_threads WHERE id=?").bind(meta.threadId).first(), null);

  // One scheduled event drains both a multi-page conversation and a queue of short threads.
  await db.prepare("INSERT INTO chat_threads(id,title,browser_id,created_at,updated_at) VALUES ('test-long','Long','b',1,1)").run();
  const shortIds = Array.from({ length: 8 }, (_, n) => "test-short-" + n);
  await db.batch(shortIds.map(id => db.prepare(
    "INSERT INTO chat_threads(id,title,browser_id,created_at,updated_at) VALUES (?,'Short','b',2,2)",
  ).bind(id)));
  await db.prepare(`WITH RECURSIVE seq(n) AS (VALUES (1) UNION ALL SELECT n+1 FROM seq WHERE n<113)
    INSERT INTO chat_messages(id,thread_id,seq,role,status,content_tex,course,doc_id,created_at,updated_at)
    SELECT 'long-' || n,'test-long',n,'user','done','Message ' || n,'','',1,1 FROM seq`).run();
  await worker.scheduled({ cron: "0 3 * * *" });
  const backlog = () => db.prepare("SELECT count(*) AS n FROM chat_threads WHERE id LIKE 'test-%'").first("n");
  for (let attempt = 0; attempt < 100 && await backlog(); attempt++) await delay(100);
  assert.equal(await backlog(), 0, "one cron trigger and its alarms should drain the archive queue");
  const archivedIds = [];
  for (const { key } of (await bucket.list({ prefix: "archives/" })).objects) {
    const object = await bucket.get(key);
    const row = JSON.parse(await new Response(object.body.pipeThrough(new DecompressionStream("gzip"))).text());
    if (row.thread.id === "test-long") assert.equal(row.kind, "thread_manifest");
    archivedIds.push(row.thread.id);
  }
  assert.deepEqual(archivedIds.sort(), [meta.threadId, "test-long", ...shortIds].sort());
  // A status request for the twelfth expired run only settles that owned run.
  await db.prepare(`WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<12)
    INSERT INTO usage_runs(id,owner_key,client_request_id,payload_hash,thread_id,user_message_id,assistant_message_id,
      created_at,updated_at,expires_at,status,tier,quota_bucket,model,reasoning_effort,pricing_version,browser_id,ip_address,fingerprint)
    SELECT 'old-'||n,owner_key,'stale-'||n,payload_hash,'stale-thr-'||n,'stale-user-'||n,'stale-asst-'||n,
      1,1,n,'running',tier,quota_bucket,model,reasoning_effort,pricing_version,browser_id,ip_address,fingerprint
    FROM seq JOIN usage_runs ON id=?`).bind(meta.runId).run();
  const expired = await (await request("/v1/runs/old-12/status", owned)).json();
  assert.equal(expired.status, "error");
  assert.equal(await db.prepare("SELECT status FROM usage_runs WHERE id='old-12'").first("status"), "error");
  assert.equal(await db.prepare("SELECT count(*) AS n FROM usage_runs WHERE id LIKE 'old-%' AND status='running'").first("n"), 11);
  console.log("workerd chat integration passed");
} finally {
  release();
  await mf.dispose();
  await rm(directory, { recursive: true, force: true });
}

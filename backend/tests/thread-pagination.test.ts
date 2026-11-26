import { expect, test } from "bun:test";
import { handleGetThread } from "../src/chat/thread-route";
import { TrackedD1 } from "../src/db";
import { mintBrowserToken } from "../src/crypto";
import type { Env } from "../src/types";
import { SqliteD1Shim } from "./d1-shim";

test("the owner can read earlier messages by sequence and see the first question until a topic exists", async () => {
  const shim = new SqliteD1Shim();
  const env = {
    DB: shim.asD1(),
    ALLOWED_ORIGINS: "",
    BROWSER_TOKEN_SECRET: "test-browser",
    TELEGRAM_CLIENT_ID: "123",
    ARCHIVE_BUCKET: {},
  } as Env;
  const { browserId, browserToken } = await mintBrowserToken(env.BROWSER_TOKEN_SECRET);
  shim.sqlite
    .query(
      "INSERT INTO chat_threads (id,title,browser_id,created_at,updated_at) VALUES ('t','',?,1,1)",
    )
    .run(browserId);
  const insert = shim.sqlite.query(
    "INSERT INTO chat_messages (id,thread_id,seq,role,status,content_tex,course,doc_id,created_at,updated_at) VALUES (?,'t',?,?,'done',?,'','',1,1)",
  );
  for (let seq = 1; seq <= 54; seq++)
    insert.run(String(seq), seq, seq % 2 ? "user" : "assistant", "Сообщение " + seq);
  const read = async (cursor: string, token = browserToken) => {
    const url = new URL("https://example.test/v1/thread?threadId=t" + cursor);
    const res = await handleGetThread(
      env,
      new TrackedD1(env.DB),
      new Request(url, { headers: { "X-Browser-Token": token } }),
      url,
      null,
    );
    expect(res.status).toBe(200);
    return res.body as {
      thread: { title: string; beforeSeq: number | null; messages: { seq: number }[] } | null;
    };
  };
  const latest = (await read("")).thread!;
  expect(latest.messages[0]?.seq).toBe(5);
  expect(latest.beforeSeq).toBe(5);
  expect(latest.title).toBe("Сообщение 1");
  const older = (await read("&beforeSeq=5")).thread!;
  expect(older.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  expect(older.beforeSeq).toBeNull();
  const stranger = await mintBrowserToken(env.BROWSER_TOKEN_SECRET);
  expect((await read("&beforeSeq=5", stranger.browserToken)).thread).toBeNull();
});

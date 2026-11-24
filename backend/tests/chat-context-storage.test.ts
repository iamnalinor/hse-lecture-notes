import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SqliteD1Shim } from "./d1-shim";

test("additive migration preserves old messages and initializes context flags", () => {
  const shim = new SqliteD1Shim(false);
  shim.sqlite.exec(readFileSync(`${import.meta.dir}/../migrations/0001_init.sql`, "utf8"));
  shim.sqlite.exec(
    "INSERT INTO chat_threads (id,title,browser_id,created_at,updated_at) VALUES ('t','old','b',1,1)",
  );
  shim.sqlite.exec(
    "INSERT INTO chat_messages (id,thread_id,seq,role,status,content_tex,course,doc_id,created_at,updated_at) VALUES ('m','t',1,'user','done','original','c','d',1,1)",
  );
  shim.sqlite.exec(
    readFileSync(`${import.meta.dir}/../migrations/0002_chat_context_and_metadata.sql`, "utf8"),
  );
  expect(
    shim.sqlite
      .query("SELECT title,browser_id,context_limited,context_revision FROM chat_threads")
      .get(),
  ).toEqual({ title: "old", browser_id: "b", context_limited: 0, context_revision: 0 });
  expect(
    shim.sqlite.query("SELECT content_tex,prompt_context_json,suggestion FROM chat_messages").get(),
  ).toEqual({ content_tex: "original", prompt_context_json: null, suggestion: null });
  expect(
    shim.sqlite
      .query("PRAGMA table_info(usage_runs)")
      .all()
      .some((r: any) => r.name === "provider"),
  ).toBe(true);
});

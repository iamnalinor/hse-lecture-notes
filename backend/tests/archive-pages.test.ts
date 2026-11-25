import { expect, test } from "bun:test";
import { gunzipSync } from "node:zlib";
import { runArchiveBatch, type ArchiveStoragePort } from "../src/archiver";
import { TrackedD1 } from "../src/db";
import { SqliteD1Shim } from "./d1-shim";

function archiveFixture(count: number) {
  const shim = new SqliteD1Shim();
  shim.sqlite.query("INSERT INTO chat_threads(id,title,browser_id,created_at,updated_at) VALUES ('old','Архив','b',1,1)").run();
  const insert = shim.sqlite.query(`INSERT INTO chat_messages(id,thread_id,seq,role,status,content_tex,
    course,doc_id,agent_items_json,prompt_context_json,created_at,updated_at)
    VALUES (?,'old',?,'assistant','done',?,'course','doc',?,?,1,1)`);
  for (let seq = 1; seq <= count; seq++) insert.run(String(seq), seq, "Ответ " + seq, "items " + seq, "prompt " + seq);
  const objects = new Map<string, Uint8Array>();
  const storage: ArchiveStoragePort = {
    async putIfAbsent(key, body) {
      if (objects.has(key)) return false;
      objects.set(key, body);
      return true;
    },
    getBytes: async key => objects.get(key) ?? null,
  };
  const remaining = () => shim.sqlite.query("SELECT count(*) AS n FROM chat_messages").get() as { n: number };
  return { shim, db: new TrackedD1(shim.asD1()), objects, storage, remaining };
}

test("large archives resume verified pages across invocations and retain D1 on corruption", async () => {
  const { db, objects, storage, remaining } = archiveFixture(113);
  const read = storage.getBytes;
  storage.getBytes = async key => objects.size === 2 ? new Uint8Array([0]) : read(key);
  await expect(runArchiveBatch(db, storage)).rejects.toThrow("checksum");
  expect(remaining()).toEqual({ n: 113 });

  storage.getBytes = read;
  expect((await runArchiveBatch(db, storage)).threadsDeleted).toBe(0);
  expect(remaining()).toEqual({ n: 113 });
  for (let i = 0; i < 30 && remaining().n > 0; i++) await runArchiveBatch(db, storage);
  expect(remaining()).toEqual({ n: 0 });

  const archive = (raw: Uint8Array) => JSON.parse(gunzipSync(raw).toString().trim());
  const manifests = [...objects.values()].map(archive).filter(record => record.kind === "thread_manifest");
  expect(manifests).toHaveLength(1);
  const manifest = manifests[0];
  expect(manifest.thread.id).toBe("old");
  const pages = [manifest.messages];
  let previous = manifest.previousPart;
  while (previous) {
    const part = archive(objects.get(previous)!);
    expect(part.kind).toBe("thread_part");
    pages.unshift(part.messages);
    previous = part.previousPart;
  }
  const messages = pages.flat();
  expect(messages.map(m => m.seq)).toEqual(Array.from({ length: 113 }, (_, i) => i + 1));
  for (const m of messages) expect(m).toMatchObject({
    content_tex: "Ответ " + m.seq, agent_items_json: "items " + m.seq, prompt_context_json: "prompt " + m.seq,
  });
});

test("same-time revision changes before deletion retain a short archive's source", async () => {
  const { shim, db, storage, remaining } = archiveFixture(2);
  const read = storage.getBytes;
  storage.getBytes = async key => {
    shim.sqlite.query("UPDATE chat_threads SET context_revision=context_revision+1 WHERE id='old'").run();
    return read(key);
  };
  expect(await runArchiveBatch(db, storage)).toMatchObject({ threadsDeleted: 0, threadsSkippedRace: 1 });
  expect(remaining()).toEqual({ n: 2 });
});

test("a full batch of races without a saved checkpoint does not enqueue an alarm", async () => {
  const { shim, db, storage } = archiveFixture(1);
  const insert = shim.sqlite.query("INSERT INTO chat_threads(id,title,browser_id,created_at,updated_at) VALUES (?,'Short','b',1,1)");
  for (let n = 0; n < 5; n++) insert.run("short-" + n);
  const read = storage.getBytes;
  storage.getBytes = async key => {
    shim.sqlite.query("UPDATE chat_threads SET context_revision=context_revision+1").run();
    return read(key);
  };
  expect(await runArchiveBatch(db, storage)).toMatchObject({
    threadsFound: 6, threadsDeleted: 0, threadsSkippedRace: 6, needsContinuation: false,
  });
});

test("concurrent jobs preserve oversized individual messages in a single complete archive", async () => {
  const { shim, db, objects, storage, remaining } = archiveFixture(3);
  const replay = "Ж".repeat(150_000);
  shim.sqlite.query("UPDATE chat_messages SET agent_items_json=?").run(replay);
  const batches = await Promise.all([runArchiveBatch(db, storage), runArchiveBatch(db, storage)]);
  expect(batches.reduce((sum, entry) => sum + entry.threadsDeleted, 0)).toBe(1);
  expect(remaining()).toEqual({ n: 0 });
  const records = [...objects.values()].map(bytes => JSON.parse(gunzipSync(bytes).toString().trim()));
  const manifest = records.filter(record => record.kind === "thread_manifest");
  expect(manifest).toHaveLength(1);
  expect(records.map(record => record.messages.map((message: { seq: number }) => message.seq))).toEqual([[1], [2], [3]]);
  for (const record of records) expect(record.messages[0].agent_items_json).toBe(replay);
});

import { expect, test } from "bun:test";
import { TrackedD1 } from "../src/db";
import { AgentToolRunner } from "../src/chat/tools";
import { SqliteD1Shim } from "./d1-shim";

import {
  type Bank,
  bankHtmlToTex,
  parseSampleArgs,
  runSampleProblems,
  sampleFromBank,
} from "../src/chat/bank-tool";

const bank: Bank = {
  about: "Тренировочные варианты",
  ticket: [
    { kind: "limits", title: "Пределы", count: 1 },
    { kind: "rules", title: "Производные", count: 2 },
  ],
  questions: [
    {
      id: "l1",
      kind: "limits",
      topic: "lim",
      text: '<p>Найдите <span class="math inline">\\lim x</span>.</p>',
      answer: "<p>0</p>",
    },
    { id: "l2", kind: "limits", topic: "lim", text: "<p>Второй</p>", refs: ["prob:kr2:x"] },
    { id: "r1", kind: "rules", topic: "der", text: "<p>r1</p>" },
    { id: "r2", kind: "rules", topic: "der", text: "<p>r2</p>" },
    { id: "r3", kind: "rules", topic: "der", text: "<p>r3</p>" },
  ],
};
const args = (extra: Record<string, unknown>) => {
  const parsed = parseSampleArgs({ course: "calculus", prep_id: "kr2", ...extra });
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
};

const problemsOf = (out: ReturnType<typeof sampleFromBank>) =>
  "problems" in out ? (out.problems ?? []) : [];

test("converts bank HTML to TeX text", () => {
  expect(
    bankHtmlToTex(
      '<p>Пусть <span class="math inline">a &lt; b</span>,\nтогда</p><p><span class="math display">x^2</span></p>',
    ),
  ).toBe("Пусть $a < b$, тогда\n\n$$x^2$$");
});

test("a variant takes the ticket's count of each kind", () => {
  const out = sampleFromBank(bank, args({ mode: "variant" }), () => 0);
  expect(problemsOf(out).map((p) => p.kind)).toEqual(["limits", "rules", "rules"]);
});

test("filters by kind and topic, skips given ids, caps count", () => {
  const out = sampleFromBank(bank, args({ kind: "limits", exclude_ids: ["l1"], count: 5 }));
  expect(problemsOf(out).map((p) => p.id)).toEqual(["l2"]);
  expect(problemsOf(out)[0]?.refs).toEqual(["/calculus#prob:kr2:x"]);
  const byTopic = sampleFromBank(bank, args({ topic: "der", count: 2 }));
  expect(problemsOf(byTopic).every((p) => p.topic === "der")).toBe(true);
  expect(args({ count: 99 }).count).toBe(10);
});

test("an unknown kind lists the known ones; an unknown bank is an error", () => {
  expect(sampleFromBank(bank, args({ kind: "nope" }))).toMatchObject({
    kinds: [{ kind: "limits" }, { kind: "rules" }],
  });
  expect(parseSampleArgs({ course: "calculus", prep_id: "kr9" })).toHaveProperty("error");
});

test("reads the published bank.json and reports a failed fetch", async () => {
  const ok = (async () => new Response(JSON.stringify(bank))) as unknown as typeof fetch;
  const res = await runSampleProblems({ course: "calculus", prep_id: "kr2", count: 1 }, ok);
  expect(JSON.parse(res.output).problems).toHaveLength(1);
  const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
  const failed = await runSampleProblems({ course: "calculus", prep_id: "kr2" }, down);
  expect(failed.step.state).toBe("error");
  expect(JSON.parse(failed.output).error).toContain("HTTP 503");
});

test("a variant picks one alternative of a one_of ticket item", () => {
  const withChoice: Bank = {
    ...bank,
    ticket: [
      {
        one_of: [
          [{ kind: "limits", title: "Пределы", count: 1 }],
          [{ kind: "rules", title: "Производные", count: 2 }],
        ],
      },
    ],
  };
  const first = sampleFromBank(withChoice, args({ mode: "variant" }), () => 0);
  expect(problemsOf(first).map((p) => p.kind)).toEqual(["limits"]);
  const second = sampleFromBank(withChoice, args({ mode: "variant" }), () => 0.9);
  expect(problemsOf(second).map((p) => p.kind)).toEqual(["rules", "rules"]);
});

test("reads the sampled source from the named lecture on home and in another course", async () => {
  const shim = new SqliteD1Shim();
  const put = shim.sqlite.prepare(`
    INSERT INTO course_blocks
      (id, course, doc_kind, doc_id, doc_order, block_order, block_kind, anchor_id, title, statement_tex, content_hash, updated_at)
    VALUES (?, ?, 'lecture', ?, 1, 1, 'theorem', 'thm:shared', ?, 'proof source', 'hash', 0)`);
  put.run("block:a", "algebra", "another", "Wrong lecture");
  put.run("block:b", "algebra", "lec06", "Cramer");
  put.run("block:c", "discrete", "lec06", "Wrong course");
  const published = {
    ticket: [{ kind: "proof", title: "Proof", count: 1 }],
    questions: [
      {
        id: "q",
        kind: "proof",
        text: "Explain Cramer",
        refs: [{ id: "thm:shared", doc: "lec06" }],
      },
    ],
  };
  const sample = await runSampleProblems(
    { course: "algebra", prep_id: "kr1", count: 1 },
    (async () => Response.json(published)) as unknown as typeof fetch,
  );
  const [ref] = JSON.parse(sample.output).problems[0].refs;
  for (const course of ["", "discrete"]) {
    const runner = new AgentToolRunner({
      env: {},
      db: new TrackedD1(shim.asD1()),
      currentCourse: course,
      currentDocId: "another",
      currentDocOrder: 1,
      maxToolOutputChars: 12000,
      maxTotalToolOutputChars: 60000,
    });
    const result = await runner.execute("read_block", JSON.stringify({ id: ref }));
    expect(JSON.parse(result.output)).toMatchObject({
      course: "algebra",
      doc_id: "lec06",
      title: "Cramer",
    });
    const missing = await runner.execute(
      "read_block",
      JSON.stringify({ id: "/algebra/missing#thm:shared" }),
    );
    expect(missing.step.state).toBe("error");
  }
});

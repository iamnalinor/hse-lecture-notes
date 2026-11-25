import { expect, test } from "bun:test";

import { LlmUpstreamError } from "../src/llm/responses-stream";
import { classifyError } from "../src/public-error";
import { runErrorMessage } from "../src/chat/run-error";

test("the D1 daily limit is named, not hidden behind a generic 500 (2026-11-25)", () => {
  const err = new Error(
    "D1_ERROR: Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.",
  );
  const e = classifyError(err);
  expect(e.status).toBe(503);
  expect(e.code).toBe("storage_quota_exceeded");
  expect(e.message).toContain("лимит");
  expect(e.detail).toContain("row read limit");
});

test("other storage, search and model failures get their own codes and safe details", () => {
  expect(classifyError(new Error("D1_ERROR: database is overloaded")).code).toBe("storage_unavailable");
  expect(classifyError(new Error("VECTOR_QUERY_ERROR (code = 40006)")).code).toBe("search_unavailable");
  const upstream = classifyError(new LlmUpstreamError(429, "insufficient_quota", "secret payload body"));
  expect(upstream).toMatchObject({ status: 502, code: "upstream_error", detail: "HTTP 429 insufficient_quota" });
  expect(JSON.stringify(upstream)).not.toContain("secret payload");
  const unknown = classifyError(new TypeError("cannot read x of private-thing"));
  expect(unknown).toMatchObject({ status: 500, code: "internal_error", detail: "TypeError" });
  expect(JSON.stringify(unknown)).not.toContain("private-thing");
});

test("run errors explain the new codes", () => {
  expect(runErrorMessage("storage_quota_exceeded", false)).toContain("лимит");
  expect(runErrorMessage("search_unavailable", false)).toContain("Код: search_unavailable");
});

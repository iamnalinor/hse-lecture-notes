import { expect, test } from "bun:test";
import { runErrorMessage } from "../src/chat/run-error";
test("public failures distinguish internal errors, timeouts and interrupted streams", () => {
  expect(runErrorMessage("internal_error", false)).toContain("Внутренняя ошибка");
  expect(runErrorMessage("internal_error", false)).not.toContain("время");
  expect(runErrorMessage("run_timeout", true)).toContain("Истекло время");
  expect(runErrorMessage("upstream_eof", true)).toContain("Полученный текст сохранён");
  expect(runErrorMessage("untrusted private payload", false)).not.toContain("untrusted");
});

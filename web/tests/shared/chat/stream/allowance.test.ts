import { expect, it, vi } from "vitest";

import { TurnstileError } from "#web/api/chat/turnstile.ts";
import { fetchAllowanceOutcome } from "#web/shared/chat/stream/allowance.ts";

vi.mock("#web/api/chat/client.ts", () => ({
  ensureChatAllowance: vi.fn().mockRejectedValue(new TurnstileError("600010")),
}));

const setters = {
  setBlock: vi.fn(),
  setDegraded: vi.fn(),
  setQuestionLimit: vi.fn(),
  setTier: vi.fn(),
  setUser: vi.fn(),
};
const hooks = { getContainer: () => null, onInteractiveClose: vi.fn(), onInteractiveOpen: vi.fn() };

it("explains a failed browser check in Russian and keeps Turnstile's error code", async () => {
  const outcome = await fetchAllowanceOutcome(hooks, setters, {
    isCurrent: () => true,
    onChecked: vi.fn(),
    onChecking: vi.fn(),
    signal: new AbortController().signal,
  });
  expect(outcome.kind).toBe("error");
  const message = outcome.kind === "error" ? outcome.message : "";
  expect(message).toContain("Не удалось проверить браузер");
  expect(message).toContain("600010");
  expect(message).not.toContain("Turnstile verification error");
});

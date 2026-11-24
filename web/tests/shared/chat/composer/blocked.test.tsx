import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { BottomPlate } from "#web/shared/chat/composer/composer-plates.tsx";
import { ChatMessageView } from "#web/shared/chat/messages/message-view.tsx";
import { makeUserMsg } from "#web/shared/chat/stream/helpers.ts";

import { renderWithApp } from "../../../support/render.tsx";

vi.mock("#web/shared/chat/session/context.tsx", () => ({
  useChat: () => ({
    block: { code: "auth_required" },
    draft: "Мой вопрос",
    quote: null,
    isLoginBusy: false,
    login: vi.fn(),
  }),
}));
it("offers only Telegram login after the guest limit", () => {
  render(<BottomPlate mode="login" />);
  expect(screen.getByRole("button", { name: /Войти через Telegram/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Попробовать снова" })).not.toBeInTheDocument();
});
it("shows the rejected question with an unsent label", () => {
  renderWithApp(
    <ChatMessageView
      canRetry={false}
      message={{ ...makeUserMsg("Мой вопрос", null, { course: "", docId: "" }), status: "error" }}
      onJumpToBlock={vi.fn()}
      onRetry={vi.fn()}
    />,
  );
  expect(screen.getByText("Мой вопрос")).toBeInTheDocument();
  expect(screen.getByText("Не отправлено")).toBeInTheDocument();
});

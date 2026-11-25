import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncedTitle } from "#web/shared/ui/synced-mark.tsx";

describe("SyncedTitle", () => {
  it("keeps the tick in one nowrap element with the last word", () => {
    render(
      <SyncedTitle synced={["lecture"]} title="Предел функции: монотонность, ограниченность" />,
    );
    const tail = screen.getByTestId("title-tail");
    expect(tail).toHaveClass("whitespace-nowrap");
    expect(tail).toHaveTextContent("ограниченность");
    expect(tail.textContent).not.toContain("монотонность");
    expect(tail.querySelector("svg")).not.toBeNull();
    expect(tail).toHaveTextContent("Содержание совпадает с реальной лекцией этого года");
  });

  it("says in the tooltip what the note was synced with", () => {
    render(<SyncedTitle synced={["lecture", "seminars"]} title="Пределы" />);
    expect(screen.getByTestId("title-tail")).toHaveTextContent(
      "Содержание совпадает с реальными лекцией и семинаром этого года",
    );
  });

  it("glues the tick to a one-word title", () => {
    render(<SyncedTitle synced={["lecture"]} title="Пределы" />);
    expect(screen.getByTestId("title-tail")).toHaveTextContent("Пределы");
  });

  it("is the bare title without the mark", () => {
    render(<SyncedTitle synced={[]} title="Пределы функции" />);
    expect(screen.queryByTestId("title-tail")).toBeNull();
    expect(screen.getByText("Пределы функции")).toBeInTheDocument();
  });
});

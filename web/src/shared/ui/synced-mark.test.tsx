import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SyncedTitle } from "./synced-mark.tsx";

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
    expect(tail).toHaveTextContent("Сверено с лекцией");
  });

  it("says in the tooltip what the note was synced with", () => {
    render(<SyncedTitle synced={["lecture", "seminars"]} title="Пределы" />);
    expect(screen.getByTestId("title-tail")).toHaveTextContent("Сверено с лекцией и семинарами");
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

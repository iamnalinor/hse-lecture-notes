import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter } from "react-router";
import { expect, it } from "vitest";

import { catalogQuery, labelIndexQuery } from "#web/api/queries.ts";
import { Component } from "#web/features/home/page.tsx";

it("opens the home page from the small catalog without requesting the label index", () => {
  const client = new QueryClient();
  client.setQueryData(catalogQuery.queryKey, { lectures: {}, preps: {}, programs: [] });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Suspense fallback="Загрузка">
          <Component />
        </Suspense>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByRole("heading", { name: /Конспекты лекций/u })).toBeVisible();
  expect(client.getQueryState(labelIndexQuery.queryKey)).toBeUndefined();
});

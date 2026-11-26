import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it, vi } from "vitest";

import { AppShell } from "#web/app/app-shell.tsx";

vi.mock("#web/shared/layout/top-bar.tsx", () => ({ TopBar: () => null }));
vi.mock("#web/shared/layout/site-footer.tsx", () => ({ SiteFooter: () => null }));
vi.mock("#web/shared/layout/back-bar.tsx", () => ({ BackBar: () => null }));
vi.mock("#web/shared/offline/update-banner.tsx", () => ({ UpdateBanner: () => null }));
vi.mock("#web/app/lazy-chat.tsx", () => ({ LazyChat: () => null }));

it("does not fade in the entry page, which is already on screen, but fades in the next one", async () => {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <p>home</p> },
          { path: "/algebra", element: <p>course</p> },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(view.container.querySelector("[data-page]")).toHaveAttribute("data-page", "entry");
  await act(() => router.navigate("/algebra"));
  expect(view.container.querySelector("[data-page]")).toHaveAttribute("data-page", "");
  await act(() => router.navigate("/"));
  expect(view.container.querySelector("[data-page]")).toHaveAttribute("data-page", "");
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { didOpenUpdated } from "#web/shared/offline/sw-registration.ts";

vi.mock("#web/shared/offline/sw-registration.ts", () => ({
  didOpenUpdated: vi.fn().mockResolvedValue(false),
  useHasUpdate: () => true,
}));

const open = async (base: string) => {
  vi.stubEnv("BASE_URL", base);
  const { useUpdateOnNavigation } = await import("#web/shared/offline/update-on-navigation.ts");
  const Shell = () => {
    useUpdateOnNavigation();
    return (
      <>
        <Link to="/algebra?test=1#lecture">Курс</Link>
        <Outlet />
      </>
    );
  };
  const router = createMemoryRouter(
    [
      {
        Component: Shell,
        children: [
          { index: true, element: <p>Главная</p> },
          { path: "algebra", element: <p>Алгебра</p> },
        ],
      },
    ],
    { basename: base, initialEntries: [base] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

it.each(["/", "/pr-45/"])(
  "opens the update at its public URL under %s, preserving query and hash",
  async (base) => {
    const router = await open(base);
    await userEvent.click(screen.getByRole("link", { name: "Курс" }));
    await waitFor(() => {
      expect(didOpenUpdated).toHaveBeenCalledWith(`${base}algebra?test=1#lecture`);
    });
    await screen.findByText("Алгебра");
    vi.mocked(didOpenUpdated).mockClear();
    await router.navigate(-1);
    await screen.findByText("Главная");
    expect(didOpenUpdated).not.toHaveBeenCalled();
  },
);

it("keeps the page in the current version offline", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await open("/pr-45/");
  await userEvent.click(screen.getByRole("link", { name: "Курс" }));
  await screen.findByText("Алгебра");
  expect(didOpenUpdated).not.toHaveBeenCalled();
});

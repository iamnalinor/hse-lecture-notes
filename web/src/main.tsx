import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { registerServiceWorker } from "#web/shared/offline/sw-registration.ts";

import { createQueryClient } from "./app/query-client.ts";
import { createAppRouter } from "./app/router.tsx";
import "./styles/app.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("#root is missing in index.html");
}

const queryClient = createQueryClient();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createAppRouter(queryClient)} />
    </QueryClientProvider>
  </StrictMode>,
);

const register = async (): Promise<void> => {
  try {
    await registerServiceWorker();
  } catch {
    // No offline mode (private window, blocked storage): the site works online as before.
  }
};
globalThis.addEventListener("load", () => void register());

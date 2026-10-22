import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { macrosQuery } from "#web/api/queries.ts";
import { registerServiceWorker } from "#web/shared/offline/sw-registration.ts";

import { createQueryClient } from "./app/query-client.ts";
import { createAppRouter, preloadPages } from "./app/router.tsx";
import "./styles/app.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("#root is missing in index.html");
}

const queryClient = createQueryClient();
const PRELOAD_DELAY_MS = 1500;

/** Every formula needs the macros: start fetching before the first page asks. */
const warmUp = async (): Promise<void> => {
  try {
    await queryClient.query(macrosQuery);
  } catch {
    // The page that needs them reports the failure.
  }
};
void warmUp();

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={createAppRouter()} />
    </QueryClientProvider>
  </StrictMode>,
);

setTimeout(() => void preloadPages(), PRELOAD_DELAY_MS);

const register = async (): Promise<void> => {
  try {
    await registerServiceWorker();
  } catch {
    // No offline mode (private window, blocked storage): the site works online as before.
  }
};
globalThis.addEventListener("load", () => void register());

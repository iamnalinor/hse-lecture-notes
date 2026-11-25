import { lazy, Suspense } from "react";

import { isChatConfigured } from "#web/api/chat/http.ts";
import { useIsChatOpen } from "#web/shared/chat/open-state.ts";

const Loading = () =>
  useIsChatOpen() ? (
    <div className="fixed right-4 bottom-4 z-40 rounded-md bg-card p-3 text-ink" role="status">
      Открываю чат…
    </div>
  ) : null;
const Runtime = lazy(async () => {
  const { ChatRuntime } = await import("#web/shared/chat/runtime.tsx");
  return { default: ChatRuntime };
});
export const LazyChat = ({ general = false }: { readonly general?: boolean }) =>
  isChatConfigured() ? (
    <Suspense fallback={<Loading />}>
      <Runtime general={general} />
    </Suspense>
  ) : null;

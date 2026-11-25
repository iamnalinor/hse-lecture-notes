import { Component, lazy, type ReactNode, Suspense, useState } from "react";
import { useLocation } from "react-router";

import { isChatConfigured } from "#web/api/chat/http.ts";
import { isDocumentPath } from "#web/domain/paths.ts";
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

/** The chat is optional: a failed chunk download must not take the notes page down with it. */
class ChatBoundary extends Component<{ readonly children: ReactNode }, { failed: boolean }> {
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override state = { failed: false };
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export const LazyChat = ({ general = false }: { readonly general?: boolean }) => {
  const isOpen = useIsChatOpen();
  const { pathname } = useLocation();
  const shouldMount = isOpen || (!general && isDocumentPath(pathname));
  // Keep drafts, streams and the session alive after the first use or document visit.
  const [wasMounted, setWasMounted] = useState(shouldMount);
  if (shouldMount && !wasMounted) {
    setWasMounted(true);
  }
  return isChatConfigured() && (shouldMount || wasMounted) ? (
    <ChatBoundary>
      <Suspense fallback={<Loading />}>
        <Runtime general={general} />
      </Suspense>
    </ChatBoundary>
  ) : null;
};

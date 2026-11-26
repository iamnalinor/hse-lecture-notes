import { Component, type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router";

import { isChatConfigured } from "#web/api/chat/http.ts";
import { isDocumentPath } from "#web/domain/paths.ts";
import { useIsChatOpen } from "#web/shared/chat/open-state.ts";
import { loadChatRuntime, useChatRuntimeLoad } from "#web/shared/chat/runtime-loader.ts";

/** The chat is optional: a crash inside it must not take the notes page down with it. */
class ChatBoundary extends Component<{ readonly children: ReactNode }, { failed: boolean }> {
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override state = { failed: false };
  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
The download shows nothing itself: the toggle button shows that it is under way and what went
wrong (`toggle-button.tsx`), and the panel appears once `Runtime` is there.
*/
export const LazyChat = ({ general = false }: { readonly general?: boolean }) => {
  const isOpen = useIsChatOpen();
  const { pathname } = useLocation();
  const shouldMount = isOpen || (!general && isDocumentPath(pathname));
  // Keep drafts, streams and the session alive after the first use or document visit.
  const [wasMounted, setWasMounted] = useState(shouldMount);
  if (shouldMount && !wasMounted) {
    setWasMounted(true);
  }
  const isMounted = isChatConfigured() && (shouldMount || wasMounted);
  const load = useChatRuntimeLoad();
  useEffect(() => {
    if (isMounted) {
      loadChatRuntime();
    }
  }, [isMounted]);
  const isFailed = load.status === "failed";
  useEffect(() => {
    if (!isMounted || !isFailed) {
      return;
    }
    globalThis.addEventListener("online", loadChatRuntime);
    return () => {
      globalThis.removeEventListener("online", loadChatRuntime);
    };
  }, [isMounted, isFailed]);
  return isMounted && load.status === "ready" ? (
    <ChatBoundary>
      <load.Runtime general={general} />
    </ChatBoundary>
  ) : null;
};

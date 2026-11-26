import { Component, type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router";

import { isChatConfigured } from "#web/api/chat/http.ts";
import { isDocumentPath } from "#web/domain/paths.ts";
import { useIsChatOpen } from "#web/shared/chat/open-state.ts";
import { loadChatRuntime, useChatRuntimeLoad } from "#web/shared/chat/runtime-loader.ts";
import { ChatShell } from "#web/shared/chat/shell/chat-shell.tsx";

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

/** Starts the download once the chat is wanted, and again when the network returns after a failure. */
const useRuntimeDownload = (isWanted: boolean, isFailed: boolean): void => {
  useEffect(() => {
    if (isWanted) {
      loadChatRuntime();
    }
  }, [isWanted]);
  useEffect(() => {
    if (!isWanted || !isFailed) {
      return;
    }
    globalThis.addEventListener("online", loadChatRuntime);
    return () => {
      globalThis.removeEventListener("online", loadChatRuntime);
    };
  }, [isWanted, isFailed]);
};

const useIsChatMounted = (isOpen: boolean, isGeneral: boolean): boolean => {
  const { pathname } = useLocation();
  const shouldMount = isOpen || (!isGeneral && isDocumentPath(pathname));
  // Keep drafts, streams and the session alive after the first use or document visit.
  const [wasMounted, setWasMounted] = useState(shouldMount);
  if (shouldMount && !wasMounted) {
    setWasMounted(true);
  }
  return isChatConfigured() && (shouldMount || wasMounted);
};

/**
Until `Runtime` is there, an open chat is the shell (skeleton, or the failure with a retry); the
real panel replaces it in the same frame.
*/
export const LazyChat = ({ general = false }: { readonly general?: boolean }) => {
  const isOpen = useIsChatOpen();
  const isMounted = useIsChatMounted(isOpen, general);
  const load = useChatRuntimeLoad();
  useRuntimeDownload(isMounted, load.status === "failed");
  if (!isMounted) {
    return null;
  }
  if (load.status === "ready") {
    return (
      <ChatBoundary>
        <load.Runtime general={general} />
      </ChatBoundary>
    );
  }
  return isOpen ? <ChatShell failure={load.status === "failed" ? load.failure : null} /> : null;
};

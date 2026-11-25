import { useCallback, useRef } from "react";

import "#web/styles/chat.css";

import { ChatPanel } from "./panel/panel.tsx";
import { SelectionAskButton } from "./selection/ask-button.tsx";
import { ChatProvider } from "./session/context.tsx";

export function ChatRuntime({ general = false }: { readonly general?: boolean }) {
  const selectionOriginRef = useRef<HTMLElement | null>(null);
  const takeSelectionOrigin = useCallback(() => {
    const target = selectionOriginRef.current;
    selectionOriginRef.current = null;
    return target;
  }, []);
  return (
    <ChatProvider general={general} sharedOpen>
      <ChatPanel takeSelectionOrigin={takeSelectionOrigin} />
      {!general && (
        <SelectionAskButton
          onOpenFromSelection={(target) => {
            selectionOriginRef.current = target;
          }}
        />
      )}
    </ChatProvider>
  );
}

import { ChatPanel } from "./panel/panel.tsx";
import { SelectionAskButton } from "./selection/ask-button.tsx";
import { ChatProvider } from "./session/context.tsx";

export function ChatRuntime({ general = false }: { readonly general?: boolean }) {
  return (
    <ChatProvider general={general} sharedOpen>
      <ChatPanel />
      {!general && <SelectionAskButton />}
    </ChatProvider>
  );
}

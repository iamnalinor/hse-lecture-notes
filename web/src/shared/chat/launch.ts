import { postChatLaunch } from "./launch-store.ts";
import { setChatOpen } from "./open-state.ts";
import { loadChatRuntime } from "./runtime-loader.ts";

/** Opens the chat on a new thread with `text` in the composer, not sent (the search's «Спросить в чате»). */
export const askInNewChat = (text: string): void => {
  postChatLaunch(text);
  loadChatRuntime();
  setChatOpen(true);
};

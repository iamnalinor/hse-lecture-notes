export const CHAT_WIDTH_STORAGE_KEY = "hse_chat_width";

/** The shell (`shell/chat-shell.tsx`) restores the width too, so the panel keeps its size when the chat code arrives. */
export const restoreStoredChatWidth = (): void => {
  try {
    const stored = localStorage.getItem(CHAT_WIDTH_STORAGE_KEY);
    if (stored !== null && /^\d{3}px$/.test(stored)) {
      document.documentElement.style.setProperty("--chat-preferred-width", stored);
    }
  } catch {
    // Private browsing may block storage.
  }
};

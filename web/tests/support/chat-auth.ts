import { readStoredAuth, type StoredChatAuth } from "#web/api/chat/storage.ts";

export const seedChatAuth = (changes: Partial<StoredChatAuth>): void => {
  localStorage.setItem("hse_chat_auth", JSON.stringify({ ...readStoredAuth(), ...changes }));
};

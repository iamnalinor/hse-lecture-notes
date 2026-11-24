import { load as loadFingerprint } from "@fingerprintjs/fingerprintjs";

import { awaitWithSignal } from "./chat-abort.ts";
import { ManagedTurnstile, type TurnstileApi, type TurnstileHooks } from "./chat-turnstile.ts";

export type { TurnstileHooks } from "./chat-turnstile.ts";

type TelegramLoginSdk = {
  auth: (
    options: {
      readonly client_id: number | string;
      readonly nonce: string;
      readonly scope: readonly string[];
    },
    callback: (result: false | null | { readonly id_token?: string }) => void,
  ) => void;
};

const getWindow = (): Window & {
  Telegram?: { Login?: TelegramLoginSdk };
  turnstile?: TurnstileApi;
} => globalThis.window;

const scripts = new Map<string, Promise<void>>();

const loadExternalScript = (src: string, id: string): Promise<void> => {
  const existing = scripts.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      "error",
      () => {
        script.remove();
        scripts.delete(id);
        reject(new Error(`Failed to load ${src}`));
      },
      { once: true },
    );
    document.head.append(script);
  });
  scripts.set(id, pending);
  return pending;
};

const fpCache: { value: null | string } = { value: null };

/** Loads FingerprintJS visitorId; returns "" silently if blocked by uBlock/browser privacy. */
export const getBrowserFingerprint = async (): Promise<string> => {
  if (fpCache.value !== null) {
    return fpCache.value;
  }
  try {
    const agent = await loadFingerprint();
    const result = await agent.get();
    fpCache.value = result.visitorId;
    return result.visitorId;
  } catch {
    fpCache.value = "";
    return "";
  }
};

const turnstile: { widget: ManagedTurnstile | null; mounting: null | Promise<ManagedTurnstile> } = {
  widget: null,
  mounting: null,
};

const cancellationListeners = new Set<() => void>();

export const subscribeTurnstileCancellation = (cancel: () => void): (() => void) => {
  cancellationListeners.add(cancel);
  return () => {
    cancellationListeners.delete(cancel);
  };
};

/** Cancels the application's wait, leaving background verification and the widget alive. */
export const cancelActiveTurnstile = (): void => {
  for (const cancel of cancellationListeners) {
    cancel();
  }
  turnstile.widget?.cancel();
};

const mountTurnstile = async (
  siteKey: string,
  hooks: TurnstileHooks,
): Promise<ManagedTurnstile> => {
  if (siteKey === "") {
    throw new Error("Turnstile site key is not configured");
  }
  await loadExternalScript(
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    "hse-turnstile-script",
  );
  const api = getWindow().turnstile;
  const container = hooks.getContainer();
  if (api === undefined || container === null) {
    throw new Error("Turnstile widget unavailable");
  }
  const widget = new ManagedTurnstile(api, container, { siteKey, hooks });
  turnstile.widget = widget;
  return widget;
};

const ensureTurnstile = async (
  siteKey: string,
  hooks: TurnstileHooks,
): Promise<ManagedTurnstile> => {
  if (turnstile.widget?.isConnected === false) {
    turnstile.widget.dispose();
    turnstile.widget = null;
  }
  if (turnstile.widget !== null) {
    turnstile.widget.updateHooks(hooks);
    return turnstile.widget;
  }
  turnstile.mounting ??= mountTurnstile(siteKey, hooks);
  try {
    const widget = await turnstile.mounting;
    widget.updateHooks(hooks);
    return widget;
  } finally {
    turnstile.mounting = null;
  }
};

/** Starts background verification on first open; never requests an allowance. */
export const warmupChatWidgets = (siteKey: string, hooks: TurnstileHooks): void => {
  void getBrowserFingerprint();
  void warmupTurnstile(siteKey, hooks);
};

const warmupTurnstile = async (siteKey: string, hooks: TurnstileHooks): Promise<void> => {
  try {
    await ensureTurnstile(siteKey, hooks);
  } catch {
    // A subsequent action can retry loading the SDK after a network failure.
  }
};

export const requestTurnstileToken = async (
  siteKey: string,
  hooks: TurnstileHooks,
  signal: AbortSignal,
): Promise<string> => {
  const widget = await awaitWithSignal(ensureTurnstile(siteKey, hooks), signal);
  return await widget.request(signal);
};

/** Opens Telegram OIDC popup via `telegram-login.js` with `scope: ["profile"]` and server nonce. */
export const openTelegramLoginPopup = async (clientId: string, nonce: string): Promise<string> => {
  if (clientId === "") {
    throw new Error("Telegram client ID is not configured");
  }
  await loadExternalScript(
    "https://oauth.telegram.org/js/telegram-login.js",
    "hse-telegram-login-script",
  );
  const sdk = getWindow().Telegram?.Login;
  if (sdk === undefined) {
    throw new Error("Telegram Login SDK unavailable");
  }
  return await new Promise<string>((resolve, reject) => {
    sdk.auth({ client_id: clientId, nonce, scope: ["profile"] }, (result) => {
      if (result !== false && result !== null && typeof result.id_token === "string") {
        resolve(result.id_token);
        return;
      }
      reject(new Error("Telegram login cancelled"));
    });
  });
};

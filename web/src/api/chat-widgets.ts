import { load as loadFingerprint } from "@fingerprintjs/fingerprintjs";

type TurnstileApi = {
  execute: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      readonly action?: string;
      readonly appearance?: "always" | "execute" | "interaction-only";
      readonly "before-interactive-callback"?: () => void;
      readonly callback?: (token: string) => void;
      readonly "error-callback"?: () => void;
      readonly execution?: "execute" | "render";
      readonly "expired-callback"?: () => void;
      readonly sitekey: string;
    },
  ) => string;
};

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

const loadExternalScript = async (src: string, id: string): Promise<void> => {
  if (document.querySelector(`#${id}`) !== null) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error(`Failed to load ${src}`));
    });
    document.head.append(script);
  });
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

export type TurnstileHooks = {
  readonly getContainer: () => HTMLElement | null;
  readonly onInteractiveClose: () => void;
  readonly onInteractiveOpen: () => void;
};

const activeTurnstile: { cancel: (() => void) | null } = { cancel: null };

/** Cancels any active interactive Turnstile verification modal without marking service down. */
export const cancelActiveTurnstile = (): void => {
  activeTurnstile.cancel?.();
};

const preloadTurnstileScript = async (): Promise<void> => {
  try {
    await loadExternalScript(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      "hse-turnstile-script",
    );
  } catch {
    // will retry on send if network was offline
  }
};

/** Pre-warms FingerprintJS and Turnstile script silently when the chat panel opens. */
export const warmupChatWidgets = (): void => {
  void getBrowserFingerprint();
  void preloadTurnstileScript();
};

/**
Mounts Managed Turnstile in `execution: "execute", appearance: "interaction-only"`,
runs it once, opens the modal only if Cloudflare demands interaction, and immediately
removes the widget afterwards so it never polls in the background.
*/
export const requestTurnstileToken = async (
  siteKey: string,
  hooks: TurnstileHooks,
): Promise<string> => {
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

  return await new Promise<string>((resolve, reject) => {
    let widgetId = "";
    const cleanup = (): void => {
      activeTurnstile.cancel = null;
      hooks.onInteractiveClose();
      if (widgetId !== "") {
        try {
          api.remove(widgetId);
        } catch {
          // ignore unmount race
        }
      }
    };

    activeTurnstile.cancel = () => {
      cleanup();
      reject(new Error("Turnstile cancelled"));
    };

    widgetId = api.render(container, {
      action: "chat_allowance",
      appearance: "interaction-only",
      "before-interactive-callback": () => {
        hooks.onInteractiveOpen();
      },
      callback: (token) => {
        cleanup();
        resolve(token);
      },
      "error-callback": () => {
        cleanup();
        reject(new Error("Turnstile verification error"));
      },
      execution: "execute",
      "expired-callback": () => {
        cleanup();
        reject(new Error("Turnstile token expired"));
      },
      sitekey: siteKey,
    });
    api.execute(widgetId);
  });
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

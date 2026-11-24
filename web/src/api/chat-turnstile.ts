import { awaitWithSignal } from "./chat-abort.ts";

export type TurnstileHooks = {
  readonly getContainer: () => HTMLElement | null;
  readonly onInteractiveClose: () => void;
  readonly onInteractiveOpen: () => void;
};

export type TurnstileApi = {
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  render: (
    container: HTMLElement,
    options: {
      readonly action: string;
      readonly appearance: "interaction-only";
      readonly "before-interactive-callback": () => void;
      readonly "after-interactive-callback": () => void;
      readonly callback: (token: string) => void;
      readonly "error-callback": () => void;
      readonly execution: "render";
      readonly "expired-callback": () => void;
      readonly "timeout-callback": () => void;
      readonly "refresh-expired": "auto";
      readonly "refresh-timeout": "auto";
      readonly retry: "auto";
      readonly sitekey: string;
    },
  ) => string;
};

type TokenWaiter = {
  readonly resolve: (token: string) => void;
  readonly reject: (error: Error) => void;
};

/** One Managed widget lives independently of modal visibility and allowance requests. */
export class ManagedTurnstile {
  private readonly api: TurnstileApi;
  private hooks: TurnstileHooks;
  private readonly container: HTMLElement;
  private readonly widgetId: string;
  private token: null | { readonly value: string; readonly expiresAt: number } = null;
  private state: "error" | "ready" | "running" = "running";
  private interactive = false;
  private readonly waiters = new Set<TokenWaiter>();

  constructor(
    api: TurnstileApi,
    container: HTMLElement,
    config: { siteKey: string; hooks: TurnstileHooks },
  ) {
    this.api = api;
    this.hooks = config.hooks;
    this.container = container;
    this.widgetId = api.render(container, {
      action: "chat_allowance",
      appearance: "interaction-only",
      execution: "render",
      "refresh-expired": "auto",
      "refresh-timeout": "auto",
      retry: "auto",
      sitekey: config.siteKey,
      "before-interactive-callback": () => {
        this.state = "running";
        this.token = null;
        this.interactive = true;
        this.syncModal();
      },
      "after-interactive-callback": () => {
        this.interactive = false;
        this.syncModal();
      },
      callback: (token) => {
        this.state = "ready";
        this.token = { value: token, expiresAt: Date.now() + 290_000 };
        this.interactive = false;
        this.syncModal();
        this.deliverToken();
      },
      "expired-callback": () => {
        this.autoRefresh();
      },
      "timeout-callback": () => {
        this.autoRefresh();
      },
      "error-callback": () => {
        this.state = "error";
        this.token = null;
        this.interactive = false;
        this.cancel(new Error("Turnstile verification error"));
      },
    });
  }

  private syncModal(): void {
    if (this.interactive && this.waiters.size > 0) {
      this.hooks.onInteractiveOpen();
    } else {
      this.hooks.onInteractiveClose();
    }
  }

  private autoRefresh(): void {
    this.token = null;
    this.state = "running";
    this.interactive = false;
    this.syncModal();
  }

  private restart(): void {
    this.autoRefresh();
    try {
      this.api.reset(this.widgetId);
    } catch {
      this.state = "error";
      this.cancel(new Error("Turnstile widget unavailable"));
    }
  }

  private deliverToken(): void {
    const waiter = this.waiters.values().next().value;
    if (waiter === undefined || this.token === null) {
      return;
    }
    const { value } = this.token;
    this.waiters.delete(waiter);
    this.token = null;
    waiter.resolve(value);
    // Reserve each token once and immediately prepare the next one in the same widget.
    this.restart();
  }

  get isConnected(): boolean {
    return this.container.isConnected;
  }

  updateHooks(hooks: TurnstileHooks): void {
    this.hooks = hooks;
    this.syncModal();
  }

  /** A removed React root needs a fresh host; ordinary modal closing never disposes it. */
  dispose(): void {
    this.token = null;
    this.cancel(new Error("Turnstile host removed"));
    this.api.remove(this.widgetId);
  }

  cancel(error = new Error("Turnstile cancelled")): void {
    for (const waiter of this.waiters) {
      waiter.reject(error);
    }
    this.waiters.clear();
    this.syncModal();
  }

  async request(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    const pending = Promise.withResolvers<string>();
    const waiter = { resolve: pending.resolve, reject: pending.reject };
    this.waiters.add(waiter);
    if (this.state === "error" || (this.token !== null && this.token.expiresAt <= Date.now())) {
      this.restart();
    }
    this.syncModal();
    this.deliverToken();
    try {
      return await awaitWithSignal(pending.promise, signal);
    } finally {
      this.waiters.delete(waiter);
      this.syncModal();
    }
  }
}

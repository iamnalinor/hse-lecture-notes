const inputKind = (event: Event): string => {
  if (event instanceof KeyboardEvent) {
    const key = event.code === "" ? event.key : event.code;
    return `key:${key}`;
  }
  return event.type.replace(/(?:down|up|start|end|cancel)$/u, "");
};

const selectionKeys = new Set([
  "Shift",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "a",
]);

const isPillTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(".ai-sel-btn") !== null;

type SelectionListener = readonly [string, (event: Event) => void];
const listenToSelection = (
  listeners: readonly SelectionListener[],
  blur: () => void,
): (() => void) => {
  for (const [name, listener] of listeners) {
    document.addEventListener(name, listener, { capture: true });
  }
  window.addEventListener("blur", blur);
  return () => {
    for (const [name, listener] of listeners) {
      document.removeEventListener(name, listener, true);
    }
    window.removeEventListener("blur", blur);
  };
};

/** Selection changes can precede release, especially while dragging native touch handles. */
export const watchSelectionEnd = (onChange: () => void, onClear: () => void): (() => void) => {
  const state = {
    active: new Set<string>(),
    timer: null as null | ReturnType<typeof globalThis.setTimeout>,
  };
  const clearTimer = (): void => {
    if (state.timer !== null) {
      globalThis.clearTimeout(state.timer);
    }
    state.timer = null;
  };
  const schedule = (delay: number): void => {
    clearTimer();
    state.timer = globalThis.setTimeout(() => {
      state.timer = null;
      if (state.active.size === 0) {
        onChange();
      }
    }, delay);
  };
  const begin = (event: Event): void => {
    if (isPillTarget(event.target)) {
      return;
    }
    if (event instanceof KeyboardEvent && !selectionKeys.has(event.key)) {
      return;
    }
    state.active.add(inputKind(event));
    clearTimer();
    onClear();
  };
  const finish = (event: Event): void => {
    state.active.delete(inputKind(event));
    if (state.active.size === 0) {
      schedule(0);
    }
  };
  const cancel = (event: Event): void => {
    state.active.delete(inputKind(event));
    clearTimer();
    onClear();
  };
  const change = (): void => {
    if (globalThis.document.activeElement?.classList.contains("ai-sel-btn") === true) {
      return;
    }
    onClear();
    if (state.active.size === 0) {
      schedule(180);
    }
  };
  const listeners: readonly SelectionListener[] = [
    ["mousedown", begin],
    ["pointerdown", begin],
    ["touchstart", begin],
    ["keydown", begin],
    ["mouseup", finish],
    ["pointerup", finish],
    ["touchend", finish],
    ["keyup", finish],
    ["pointercancel", cancel],
    ["touchcancel", cancel],
    ["selectionchange", change],
    ["scroll", change],
  ];
  const blur = (): void => {
    state.active.clear();
    clearTimer();
    onClear();
  };
  const unsubscribe = listenToSelection(listeners, blur);
  return () => {
    clearTimer();
    unsubscribe();
  };
};

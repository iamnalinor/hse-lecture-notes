import {
  type CSSProperties,
  Fragment,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { shuffledRound, type Slogan, SLOGANS, toChunks, toWords } from "#web/domain/slogans.ts";

/** How long a slogan stays on screen. */
const HOLD_MS = 10_000;
/**
How long the old slogan is kept in the "off" state, and so how long its exit transition may run. In "words" mode
the new slogan enters only after the old words have left (200ms plus slack); in "fade" mode both overlap for the
whole 600ms cross-fade.
*/
const SETTLE_MS = { fade: 650, words: 220 } as const;

type Effect = keyof typeof SETTLE_MS;

type State = {
  /** The slogan that is (or, during the gap, is about to be) on screen. */
  readonly current: number;
  /** "words" only: the old slogan has left, the new one has not come in yet. */
  readonly gap: boolean;
  /** The slogan that is leaving, if any. A transition is under way while this is set. */
  readonly leaving: null | number;
  /** The shuffled rest of the round. */
  readonly queue: readonly number[];
};

type LayerState = "idle" | "off" | "on";

const TYPE = "text-large leading-[1.05] font-bold tracking-tight text-balance sm:text-display";
const NBSP = "\u{A0}";

const layerState = (index: number, { current, gap, leaving }: State): LayerState => {
  if (index === current && !gap) {
    return "on";
  }
  return index === leaving ? "off" : "idle";
};

const isReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const next = (state: State, effect: Effect): State => {
  const round = state.queue.length > 0 ? state.queue : shuffledRound(state.current, SLOGANS.length);
  const [head = 0, ...rest] = round;
  return isReducedMotion()
    ? { current: head, gap: false, leaving: null, queue: rest }
    : { current: head, gap: effect === "words", leaving: state.current, queue: rest };
};

const settle = (state: State): State => ({ ...state, gap: false, leaving: null });

const Words = ({ slogan }: { readonly slogan: Slogan }) =>
  toChunks(toWords(slogan)).map((chunk, c) => (
    <Fragment key={chunk[0]?.key}>
      {c > 0 && " "}
      <span className="whitespace-nowrap">
        {chunk.map((word, i) => (
          <Fragment key={word.key}>
            {i > 0 && NBSP}
            <span
              className={`slogan-word inline-block${word.accent ? " text-thm" : ""}`}
              style={{ "--i": word.key } as CSSProperties}
            >
              {word.text}
              {word.trail}
            </span>
          </Fragment>
        ))}
      </span>
    </Fragment>
  ));

const useIsDocumentVisible = () => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = () => {
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
    };
  }, []);
  return visible;
};

/**
The slogan on screen when the home page was left. The first load of the site shows the default one; coming back
to the home page within the session shows the one the reader saw last, not the default again.
*/
const INITIAL: State = { current: 0, gap: false, leaving: null, queue: [] };
const memory: { state: State } = { state: INITIAL };

/** Test hook: every test starts from a fresh load. */
export const forgetSloganForTests = (): void => {
  memory.state = INITIAL;
};

const after = { isDone: false };

/** Flips once, right after the first paint, and stays: the later visits to the page mount all layers at once. */
const subscribeToFirstPaint = (onChange: () => void): (() => void) => {
  const timer = setTimeout(() => {
    after.isDone = true;
    onChange();
  });
  return () => {
    clearTimeout(timer);
  };
};

/** False in the built HTML and in the first render: they hold the default slogan only. */
const useIsAfterFirstPaint = (): boolean =>
  useSyncExternalStore(
    subscribeToFirstPaint,
    () => after.isDone,
    () => false,
  );

/**
The h1 of the home page: a slogan that changes every HOLD_MS, in random order, the first one on load. The built
HTML and the first render hold the default slogan alone (what crawlers and clients without JS read); the other
layers mount after that. All slogans are persistent layers in one grid cell; the h1 keeps the height of the
tallest of them from the start (`--slogan-lines` per width in app.css, measured), so nothing below it moves when
the rest mounts. CSS transitions on `data-state` do the animation (see `.slogan-*` in app.css). Only the current
layer is exposed to assistive technology.
*/
export const RotatingSlogan = ({ effect = "words" }: { readonly effect?: Effect }) => {
  const [state, setState] = useState<State>(() => memory.state);
  const [paused, setPaused] = useState(false);
  const isVisible = useIsDocumentVisible();
  const { current, leaving } = state;
  const isAfterFirstPaint = useIsAfterFirstPaint();

  useEffect(() => {
    memory.state = settle(state);
  }, [state]);

  const advance = useCallback(() => {
    setState((s) => (s.leaving === null ? next(s, effect) : s));
  }, [effect]);

  useEffect(() => {
    if (paused || !isVisible || leaving !== null) {
      return;
    }
    const id = setTimeout(advance, HOLD_MS);
    return () => {
      clearTimeout(id);
    };
  }, [advance, current, leaving, paused, isVisible]);

  useEffect(() => {
    if (leaving === null) {
      return;
    }
    const id = setTimeout(() => {
      setState(settle);
    }, SETTLE_MS[effect]);
    return () => {
      clearTimeout(id);
    };
  }, [effect, leaving]);

  return (
    <div
      className="mb-6 cursor-pointer select-none"
      data-effect={effect}
      onClick={advance}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") {
          setPaused(true);
        }
      }}
      onPointerLeave={() => {
        setPaused(false);
      }}
    >
      <h1 className="slogan-h1 grid items-start">
        {SLOGANS.map((slogan, index) =>
          !isAfterFirstPaint && index > 0 ? null : (
            <span
              aria-hidden={index === current ? undefined : true}
              className={`slogan-layer ${TYPE}`}
              data-state={layerState(index, state)}
              key={slogan.map(([text]) => text).join("")}
            >
              <Words slogan={slogan} />
            </span>
          ),
        )}
      </h1>
    </div>
  );
};

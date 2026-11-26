import { type CSSProperties, Fragment, useCallback, useEffect, useState } from "react";

import { shuffledRound, type Slogan, SLOGANS, toChunks, toWords } from "#web/domain/slogans.ts";

/** How long a slogan stays on screen. */
const HOLD_MS = 10_000;
/** The old slogan leaves for this long (it is removed from the DOM after that). */
const LEAVE_MS = 650;

const TYPE = "text-large leading-[1.05] font-bold tracking-tight text-balance sm:text-display";
const CELL = "col-start-1 row-start-1";

type Effect = "fade" | "words";

type State = {
  /** The slogan on screen. */
  readonly current: number;
  /** The slogan that is fading out, if any. */
  readonly leaving: null | number;
  /** The shuffled rest of the round. */
  readonly queue: readonly number[];
  /** False until the first change: the first slogan is static, without an entrance animation. */
  readonly moved: boolean;
};

const NBSP = "\u{A0}";

const Words = ({ animate, slogan }: { readonly animate: boolean; readonly slogan: Slogan }) =>
  toChunks(toWords(slogan)).map((chunk, c) => (
    <Fragment key={chunk[0]?.key}>
      {c > 0 && " "}
      <span className="whitespace-nowrap">
        {chunk.map((word, i) => (
          <Fragment key={word.key}>
            {i > 0 && NBSP}
            <span
              className={`${animate ? "slogan-word " : ""}inline-block${word.accent ? " text-thm" : ""}`}
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

const next = (state: State): State => {
  const round = state.queue.length > 0 ? state.queue : shuffledRound(state.current, SLOGANS.length);
  const [head = 0, ...rest] = round;
  return { current: head, leaving: state.current, moved: true, queue: rest };
};

/**
The h1 of the home page: a slogan that changes every HOLD_MS, in random order, the first one on load. Only the
current slogan is in the heading. Under it sits an invisible copy of all slogans in one grid cell, so the block
always has the height of the longest one and the text below never jumps.
*/
export const RotatingSlogan = ({ effect = "words" }: { readonly effect?: Effect }) => {
  const [state, setState] = useState<State>({ current: 0, leaving: null, moved: false, queue: [] });
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const { current, leaving, moved } = state;

  const advance = useCallback(() => {
    setState(next);
  }, []);

  useEffect(() => {
    const onChange = () => {
      setVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
    };
  }, []);

  useEffect(() => {
    if (paused || !visible) {
      return;
    }
    const id = setTimeout(advance, HOLD_MS);
    return () => {
      clearTimeout(id);
    };
  }, [advance, current, paused, visible]);

  useEffect(() => {
    if (leaving === null) {
      return;
    }
    const id = setTimeout(() => {
      setState((s) => ({ ...s, leaving: null }));
    }, LEAVE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [leaving]);

  const slogan = SLOGANS[current] ?? [];
  const old = leaving === null ? undefined : SLOGANS[leaving];

  return (
    <div
      className="mb-6 grid cursor-pointer items-start select-none"
      data-effect={effect}
      onClick={() => {
        if (leaving === null) {
          advance();
        }
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") {
          setPaused(true);
        }
      }}
      onPointerLeave={() => {
        setPaused(false);
      }}
    >
      <h1 className={`${CELL} ${TYPE}`} data-first-slogan={moved ? undefined : true}>
        <span
          className={moved && effect === "fade" ? "slogan-fade-in block" : "block"}
          key={current}
        >
          <Words animate={moved && effect === "words"} slogan={slogan} />
        </span>
      </h1>
      {old !== undefined && (
        <div aria-hidden="true" className={`${CELL} ${TYPE} slogan-leave pointer-events-none`}>
          <Words animate={false} slogan={old} />
        </div>
      )}
      <div aria-hidden="true" className={`${CELL} invisible grid ${TYPE}`}>
        {SLOGANS.map((s) => (
          <span className={`${CELL} block`} key={s.map(([text]) => text).join("")}>
            <Words animate={false} slogan={s} />
          </span>
        ))}
      </div>
    </div>
  );
};

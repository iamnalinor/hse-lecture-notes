import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

import type { ChatMessage } from "#web/domain/chat.ts";

export const useChatAutoScroll = (
  scrollerRef: RefObject<HTMLDivElement | null>,
  content: { readonly messages: readonly ChatMessage[]; readonly isLoading: boolean },
): void => {
  const followRef = useRef(true);
  const targetRef = useRef<string | undefined>(undefined);
  const touchYRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el === null) {
      return;
    }
    const onScroll = (): void => {
      followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 4;
    };
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY < 0) {
        followRef.current = false;
      }
    };
    const onTouchStart = (event: TouchEvent): void => {
      touchYRef.current = event.touches[0]?.clientY;
    };
    const onTouchMove = (event: TouchEvent): void => {
      const y = event.touches[0]?.clientY;
      if (y !== undefined && touchYRef.current !== undefined && y > touchYRef.current) {
        followRef.current = false;
      }
      touchYRef.current = y;
    };
    // eslint-disable-next-line unicorn/prefer-observer-apis -- Follow the reader's scroll position as streamed content changes height.
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [scrollerRef]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el === null) {
      return;
    }
    const last = content.messages.at(-1);
    const target = last?.renderKey ?? last?.id;
    if (targetRef.current !== target || content.isLoading) {
      followRef.current = true;
      targetRef.current = target;
    }
    if (followRef.current) {
      el.scrollTo({ behavior: "instant", top: content.isLoading ? 0 : el.scrollHeight });
    }
  }, [content.isLoading, content.messages, scrollerRef]);
};

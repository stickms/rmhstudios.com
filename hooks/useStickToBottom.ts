/**
 * useStickToBottom — keep a scroll container pinned to its newest content,
 * including content that arrives after layout.
 *
 * The obvious version of this is three lines in an effect keyed on the message
 * count: measure how close to the bottom we are, and if it is close, scroll
 * down. It is what RMHTube's chat did, and it is wrong twice.
 *
 * **It measures too late.** An effect runs *after* React has committed the new
 * message, so "am I near the bottom?" is asked of a container that has already
 * grown. Any message taller than the threshold pushes the reader out of the
 * near-bottom band before the question is asked, so it never scrolls. Here the
 * answer is recorded on every `scroll` event, before the content changes.
 *
 * **It measures too early.** An embedded image, GIF or Tenor result has no size
 * at commit time and gets one when the network answers — hundreds of
 * milliseconds later, long after the scroll. The container grows underneath the
 * pin and the new message ends up off-screen, which is exactly the "chat
 * doesn't scroll when images or GIFs are embedded" report. A `ResizeObserver`
 * on the content is what makes late growth re-pin; nothing keyed on the message
 * list can, because the message list did not change.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface StickToBottomOptions {
  /** How close to the bottom still counts as "following along", in pixels. */
  threshold?: number;
}

export interface StickToBottom<C extends HTMLElement, I extends HTMLElement> {
  /** The scrolling element. */
  containerRef: React.RefObject<C | null>;
  /** The element that grows inside it — put this on the message list. */
  contentRef: React.RefObject<I | null>;
  /** False once the reader scrolls up: show a "jump to latest" affordance. */
  isPinned: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useStickToBottom<
  C extends HTMLElement = HTMLDivElement,
  I extends HTMLElement = HTMLDivElement,
>({ threshold = 80 }: StickToBottomOptions = {}): StickToBottom<C, I> {
  const containerRef = useRef<C | null>(null);
  const contentRef = useRef<I | null>(null);
  // The pin decision is read inside a ResizeObserver, which must not depend on
  // a render having happened; `isPinned` is only for the UI.
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;
    pinnedRef.current = true;
    setIsPinned(true);
    // `scrollTop` rather than `scrollIntoView`: the latter can scroll ancestors
    // too, and its smooth mode loses races against fast-arriving messages.
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      const pinned = distance <= threshold;
      if (pinned === pinnedRef.current) return;
      pinnedRef.current = pinned;
      setIsPinned(pinned);
    };

    container.addEventListener('scroll', measure, { passive: true });
    measure();
    return () => container.removeEventListener('scroll', measure);
  }, [threshold]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const repin = () => {
      if (!pinnedRef.current) return;
      container.scrollTop = container.scrollHeight;
    };

    // Fires for a new message AND for an image that just decoded — the second
    // is the one nothing else can see.
    const observer = new ResizeObserver(repin);
    observer.observe(content);

    // Media that arrives without changing the content box (a reserved slot
    // filled in place) still deserves a re-pin, and `load` does not bubble —
    // hence the capture phase.
    container.addEventListener('load', repin, true);

    return () => {
      observer.disconnect();
      container.removeEventListener('load', repin, true);
    };
  }, []);

  return { containerRef, contentRef, isPinned, scrollToBottom };
}

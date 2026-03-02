'use client';

import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import twemoji from '@twemoji/api';

interface TwemojiProviderProps {
  children: ReactNode;
  className?: string;
  tag?: keyof HTMLElementTagNameMap;
}

const twemojiCallback = (icon: string): string | false => {
  // ignore hookrightarrow and hookleftarrow for math formulas, as they look weird in Twemoji
  if (icon === '21aa' || icon === '21a9') {
    return false;
  }
  return `https://twemoji.maxcdn.com/v/latest/svg/${icon}.svg`;
}

const PARSE_OPTIONS = { folder: 'svg', ext: '.svg', callback: twemojiCallback } as const;

/**
 * Wraps its children and replaces native emoji characters with Twemoji SVGs
 * so emojis look identical on every platform.
 *
 * Uses a MutationObserver to automatically re-parse whenever the DOM changes
 * (navigation, async data, dynamic components, etc.).
 */
export function TwemojiProvider({ children, className, tag: Tag = 'div' }: TwemojiProviderProps) {
  const ref = useRef<HTMLElement>(null);
  const parsing = useRef(false);

  const parse = useCallback(() => {
    if (!ref.current || parsing.current) return;
    parsing.current = true;
    twemoji.parse(ref.current, PARSE_OPTIONS);
    parsing.current = false;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Initial parse
    parse();

    // Watch for any DOM mutations and re-parse
    const observer = new MutationObserver(parse);
    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [parse]);

  return (
    // @ts-expect-error -- dynamic tag element
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

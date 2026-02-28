'use client';

import { useEffect, useRef, useCallback, type ReactNode } from 'react';
import twemoji from '@twemoji/api';

interface TwemojiProviderProps {
  children: ReactNode;
  className?: string;
  tag?: keyof HTMLElementTagNameMap;
}

const PARSE_OPTIONS = { folder: 'svg', ext: '.svg' } as const;

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

    // Collect subtrees that should be skipped, then temporarily detach
    // them so twemoji.parse doesn't touch their content (e.g. KaTeX output).
    const skipped: { el: HTMLElement; placeholder: Comment }[] = [];
    ref.current.querySelectorAll<HTMLElement>('[data-no-twemoji]').forEach((el) => {
      const placeholder = document.createComment('no-twemoji');
      el.parentNode?.replaceChild(placeholder, el);
      skipped.push({ el, placeholder });
    });

    twemoji.parse(ref.current, PARSE_OPTIONS);

    // Re-attach skipped subtrees
    for (const { el, placeholder } of skipped) {
      placeholder.parentNode?.replaceChild(el, placeholder);
    }

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

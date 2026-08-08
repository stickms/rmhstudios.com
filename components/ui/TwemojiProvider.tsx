'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { ParseCallback } from '@twemoji/api';

interface TwemojiProviderProps {
 children: ReactNode;
 className?: string;
 /** Wrapper element tag. Defaults to a layout-neutral `display: contents` span. */
 tag?: keyof HTMLElementTagNameMap;
}

// Math formula arrows look wrong as Twemoji, so leave them as native glyphs.
const SKIP = new Set(['21aa', '21a9']);

// Build the asset URL from the (working) default base — the @twemoji/api v17
// package ships pointing at jsdelivr. The previous implementation hard-coded the
// long-dead twemoji.maxcdn.com host, which is why emojis silently stopped
// rendering. Returning `false` skips an icon and leaves the native glyph.
const twemojiCallback: ParseCallback = (icon, options) => {
 if (SKIP.has(icon)) return false;
 const o = options as { base: string; size: string; ext: string };
 return `${o.base}${o.size}/${icon}${o.ext}`;
};

const PARSE_OPTIONS = {
 folder: 'svg',
 ext: '.svg',
 className: 'emoji',
 callback: twemojiCallback,
 // Emoji <img>s replace inline glyphs across all rendered content (feed posts,
 // names). Marking them lazy/async keeps a feed full of emoji from firing a
 // burst of eager CDN image requests during hydration for off-screen cards.
 attributes: () => ({ loading: 'lazy', decoding: 'async' }),
} as const;

/** A node that twemoji can parse (text nodes are parsed via their parent). */
function parseTarget(node: Node): HTMLElement | null {
 if (node.nodeType === Node.ELEMENT_NODE) {
 const el = node as HTMLElement;
 // Skip the <img> replacements we just inserted to avoid needless re-walks.
 if (el.tagName === 'IMG' && el.classList.contains('emoji')) return null;
 return el;
 }
 if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
 return null;
}

/**
 * Opt-out for regions React re-renders and that manage their own emoji (form
 * mirrors, the emoji-picker widget, etc.). Rewriting an emoji text node into an
 * <img> inside such a subtree desyncs React's reconciler from the real DOM, so a
 * later update throws "Node.removeChild: The node to be removed is not a child
 * of this node". Marking the subtree with `data-no-twemoji` keeps twemoji out.
 */
function isTwemojiExempt(el: HTMLElement): boolean {
 return el.closest('[data-no-twemoji]') != null;
}

/**
 * Replaces native emoji characters with Twemoji SVGs inside its subtree so
 * emojis look identical on every platform (instead of OS-specific glyphs).
 *
 * A MutationObserver re-parses on DOM changes (navigation, async data, dynamic
 * components). To stay cheap site-wide it parses only the nodes that actually
 * changed rather than re-walking the whole tree on every mutation. The wrapper
 * defaults to `display: contents` so wrapping large regions doesn't disturb
 * layout (fl: heights, grids, etc.).
 *
 * **`@twemoji/api` is loaded in its own chunk, not imported at module scope.**
 * This provider wraps the whole `<Outlet/>` in `__root.tsx`, so a static import
 * put twemoji — 32.9 KB, back when the archived `twemoji-parser` was still a
 * second copy alongside it — into the entry chunk of every page, parsed before
 * hydration could begin. Nothing here needs it until the mount
 * effect runs, and the first thing that effect does is a full-subtree parse, so
 * whatever rendered while the chunk was in flight is picked up anyway. Native
 * glyphs (correct, just OS-styled) show for those few frames.
 */
export function TwemojiProvider({ children, className, tag: Tag = 'span' }: TwemojiProviderProps) {
 const ref = useRef<HTMLElement>(null);

 useEffect(() => {
 const el = ref.current;
 if (!el) return;

 let observer: MutationObserver | undefined;
 let cancelled = false;

 void import('@twemoji/api').then(({ default: twemoji }) => {
 // The element can unmount while the chunk is in flight.
 if (cancelled || !el.isConnected) return;

 const parse = (target: HTMLElement) => twemoji.parse(target, PARSE_OPTIONS);

 parse(el); // initial pass over existing content

 let queued = false;
 const pending = new Set<HTMLElement>();
 const flush = () => {
 queued = false;
 const targets = [...pending];
 pending.clear();
 for (const t of targets) {
 if (t.isConnected) parse(t);
 }
 };

 observer = new MutationObserver((records) => {
 for (const rec of records) {
 if (rec.type === 'characterData') {
 const t = parseTarget(rec.target);
 if (t && !isTwemojiExempt(t)) pending.add(t);
 } else {
 rec.addedNodes.forEach((n) => {
 const t = parseTarget(n);
 if (t && !isTwemojiExempt(t)) pending.add(t);
 });
 }
 }
 if (pending.size > 0 && !queued) {
 queued = true;
 requestAnimationFrame(flush);
 }
 });
 observer.observe(el, { childList: true, subtree: true, characterData: true });
 });

 // Restore the native glyph when a Twemoji asset fails to load.
 //
 // twemoji replaces the character with an <img> pointing at a CDN and sets
 // `alt` to the ORIGINAL emoji — so a failed request silently deletes content
 // from a post: the audit found a seeded emoji post rendering a ~180px blank
 // run and an orphaned em-dash at every viewport. Ad-blockers, restrictive
 // CSP and offline all produce the same result in the wild. Swapping the
 // broken <img> back to its alt text costs nothing and cannot lose a
 // character.
 //
 // Capture phase because `error` on an <img> does not bubble.
 const onAssetError = (event: Event) => {
 const target = event.target as HTMLElement | null;
 if (!target || target.tagName !== 'IMG' || !target.classList.contains('emoji')) return;
 const glyph = (target as HTMLImageElement).alt;
 if (!glyph) return;
 target.replaceWith(document.createTextNode(glyph));
 };
 el.addEventListener('error', onAssetError, true);

 return () => {
 // `observer` is undefined if the twemoji chunk hasn't resolved yet; the
 // flag stops that resolution from attaching one after teardown.
 cancelled = true;
 observer?.disconnect();
 el.removeEventListener('error', onAssetError, true);
 };
 }, []);

 const style = Tag === 'span' ? ({ display: 'contents' } as const) : undefined;

 return (
 // @ts-expect-error -- dynamic tag element
 <Tag ref={ref} className={className} style={style}>
 {children}
 </Tag>
 );
}

/**
 * Moving through posts with the keyboard (sprint 08 07): the handler and the two small registries it reads.
 *
 * `components/site/KeyboardShortcuts.tsx` owns the one keydown listener and the modes (On, Off, With Alt) and remaps; it
 * calls `runFeedNav` for the nine `feed.nav.*` bindings. Nothing here listens for keys and nothing is attached per post.
 *
 * - The current post is real DOM focus: every post root carries `data-feed-post={item.id}` and `tabIndex`, `j` and `k`
 *   focus the next or previous one inside `main`, in document order, and scroll it into view without animating (R5).
 *   The focus ring is the global one (K10); nothing else is drawn.
 * - A windowed list (`VirtualPostList`) registers itself, so a neighbour that is not mounted yet is scrolled to and
 *   focused when its row mounts: no timer and no `requestAnimationFrame`.
 * - The actions are the post's own handlers: `RMHarkActions`, `RMHarkCard`, `FeedRow` and `ContentWarningCover` register
 *   them under the post's id, so a quiet count, a block, a locked post or a signed-out prompt behaves as a click would.
 */

import { useEffect, useRef } from 'react';
import { firstInView, feedKeysOff, nextIndex, prevIndex, type FeedNavId } from '@/lib/shortcuts/feed-nav';

export type PostAction = 'open' | 'like' | 'reply' | 'repost' | 'save' | 'reveal';

/* ------------------------------------------------------------------ */
/*  Per-post actions                                                   */
/* ------------------------------------------------------------------ */

const postActions = new Map<string, Map<PostAction, () => void>>();

/** Register one action of a post; the returned function removes it (only if it is still the registered one). */
export function registerPostAction(postId: string, name: PostAction, run: () => void): () => void {
  let own = postActions.get(postId);
  if (!own) {
    own = new Map();
    postActions.set(postId, own);
  }
  own.set(name, run);
  return () => {
    const current = postActions.get(postId);
    if (!current || current.get(name) !== run) return;
    current.delete(name);
    if (current.size === 0) postActions.delete(postId);
  };
}

/**
 * Register `run` as the post's action while mounted. `run` may change every render; the latest one is called. Pass
 * `enabled: false` for a post that cannot do it (a signed-out reply is still the post's to answer, so most are on).
 */
export function usePostAction(postId: string | undefined, name: PostAction, run: () => void, enabled = true): void {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (!postId || !enabled) return;
    return registerPostAction(postId, name, () => latest.current());
  }, [postId, name, enabled]);
}

/* ------------------------------------------------------------------ */
/*  Windowed lists                                                     */
/* ------------------------------------------------------------------ */

/** What a windowed list tells the handler, so `j` at the edge of the mounted rows can reach the row beyond it. */
export interface WindowedPostList {
  contains: (el: Element) => boolean;
  /** The row index of a post element in this list, or -1. */
  indexOf: (el: Element) => number;
  count: () => number;
  /** Focus the post at row `i`, scrolling to and mounting its row first when it is not in the DOM. */
  focusIndex: (i: number) => void;
}

const windowedLists = new Set<WindowedPostList>();

export function registerWindowedList(list: WindowedPostList): () => void {
  windowedLists.add(list);
  return () => {
    windowedLists.delete(list);
  };
}

/* ------------------------------------------------------------------ */
/*  Focus                                                              */
/* ------------------------------------------------------------------ */

/** Focus a post root and bring it into view. `behavior: 'instant'` because nothing animates (R5). */
export function focusPost(el: HTMLElement): void {
  el.focus({
    preventScroll: true,
  });
  el.scrollIntoView?.({
    block: 'nearest',
    behavior: 'instant',
  });
}

function mainRoot(): ParentNode {
  return document.querySelector('main') ?? document;
}

function postsInMain(): HTMLElement[] {
  return Array.from(mainRoot().querySelectorAll<HTMLElement>('[data-feed-post]'));
}

function currentPost(): HTMLElement | null {
  const active = document.activeElement;
  const post = active instanceof Element ? active.closest<HTMLElement>('[data-feed-post]') : null;
  return post && mainRoot().contains(post) ? post : null;
}

const ACTION_OF: Partial<Record<FeedNavId, PostAction>> = {
  'feed.nav.open': 'open',
  'feed.nav.like': 'like',
  'feed.nav.reply': 'reply',
  'feed.nav.repost': 'repost',
  'feed.nav.save': 'save',
  'feed.nav.reveal': 'reveal',
};

function move(direction: 1 | -1): boolean {
  const posts = postsInMain();
  const current = currentPost();
  if (current) {
    const list = [...windowedLists].find((w) => w.contains(current));
    if (list) {
      const to = list.indexOf(current) + direction;
      if (to >= 0 && to < list.count()) {
        list.focusIndex(to);
        return true;
      }
    }
  }
  if (posts.length === 0) return false;
  const at = current ? posts.indexOf(current) : -1;
  const target =
    at < 0
      ? firstInView(
          posts.map((p) => p.getBoundingClientRect()),
          window.innerHeight,
        )
      : direction === 1
        ? nextIndex(at, posts.length)
        : prevIndex(at, posts.length);
  const el = posts[target];
  if (!el) return false;
  if (el !== document.activeElement) focusPost(el);
  return true;
}

/**
 * Run one of the nine bindings. Returns true when it did something (the dispatcher then stops the key's default),
 * false when it did nothing, so a key that has no post to act on is left alone.
 */
export function runFeedNav(id: FeedNavId, event: KeyboardEvent): boolean {
  if (feedKeysOff(event.target, document)) return false;
  if (id === 'feed.nav.next') return move(1);
  if (id === 'feed.nav.prev') return move(-1);
  const current = currentPost();
  if (!current) return false;
  if (id === 'feed.nav.leave') {
    current.blur();
    return true;
  }
  const name = ACTION_OF[id];
  const run = name ? postActions.get(current.dataset.feedPost ?? '')?.get(name) : undefined;
  if (!run) return false;
  run();
  return true;
}

/**
 * The page snapshot, and nothing else: what the liquid globe refracts (components/radial/LiquidGlobe.tsx) now that the
 * glass engine is no longer installed for site surfaces (docs/superpowers/specs/2026-11-07-css-first-jelly-design.md).
 *
 * One {@link SceneProvider} per document, refcounted: the first {@link acquireSceneFeed} builds it, the last
 * `release()` disposes it and drops the shared picture. Every picture goes to the scene store (`publishScene`), which
 * keeps the globe's clone; the provider's bitmap is closed once that clone exists.
 *
 * A picture is 100–300 ms of time-sliced main-thread work, so the triggers are deliberately few: the first acquire,
 * a route change (the caller says when), a theme change on `<html>`, a window resize and the tab becoming visible, and
 * (only while a fixed, sticky or overlay glass host holds a refracting layer) scroll REST, never scroll itself — the globe
 * and the layers re-place the picture they have by the scroll offset — and never content mutations. The
 * provider coalesces requests and holds its tier's minimum interval; `SCENE_POLICY` gives the handheld and
 * `off` tiers no budget at all, so nothing is captured there.
 */
import { APP_HIGH_CONTRAST_SELECTOR, jellyTier } from '@/lib/jelly/tiers';
import { createSceneProvider, SCENE_POLICY, type SceneProvider, type SceneShot } from './scene';
import { clearScene, publishScene } from './scene-store';

export type SceneFeedReason =
  | 'route'
  | 'theme'
  | 'resize'
  | 'visible'
  | 'activate'
  /** Scrolling just rested while a fixed, sticky or overlay refracting surface needs a picture of where the content is now. */
  | 'scroll-rest';

export interface SceneFeed {
  /** Ask for a fresh picture once things settle. `'route'` also forgets earlier failures. */
  request(reason: SceneFeedReason): void;
  /** Give back this acquirer's share; the last release disposes the provider. Idempotent. */
  release(): void;
}

interface FeedState {
  refs: number;
  provider: SceneProvider;
  teardown: () => void;
}

const feeds = new WeakMap<Document, FeedState>();

function startFeed(doc: Document): FeedState {
  const win = doc.defaultView!;
  const root = doc.documentElement;
  const off = () =>
    win.matchMedia('print').matches || !!doc.querySelector(APP_HIGH_CONTRAST_SELECTOR);
  // While the hub is open the page behind it is blurred and covered, and the picture taken BEFORE it opened is the one
  // the globe is refracting; a new one now would be of the wrong thing.
  const hubOpen = () => !!doc.querySelector('.radial-hub:not([data-phase="closed"])');

  const provider = createSceneProvider({
    doc,
    canCapture: () => !doc.hidden && !off() && !hubOpen(),
    policy: () => SCENE_POLICY[jellyTier({ doc })],
    onShot: (shot: SceneShot) => {
      void publishScene(shot.bitmap, {
        width: shot.width,
        height: shot.height,
        scrollX: shot.scrollX,
        scrollY: shot.scrollY,
        docHeight: shot.docHeight,
        origin: shot.origin,
      }).finally(() => shot.bitmap.close());
    },
  });

  const onResize = () => provider.request('resize');
  const onVisibility = () => {
    if (!doc.hidden) provider.request('visible');
  };
  const theme = new win.MutationObserver(() => provider.request('theme'));
  theme.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  win.addEventListener('resize', onResize, { passive: true });
  doc.addEventListener('visibilitychange', onVisibility);

  provider.request('activate');

  return {
    refs: 0,
    provider,
    teardown: () => {
      theme.disconnect();
      win.removeEventListener('resize', onResize);
      doc.removeEventListener('visibilitychange', onVisibility);
      provider.dispose();
      clearScene();
    },
  };
}

/** Take a share of the document's scene feed. Call `release()` when done (an effect's cleanup). */
export function acquireSceneFeed(doc: Document = document): SceneFeed {
  let state = feeds.get(doc);
  if (!state) {
    state = startFeed(doc);
    feeds.set(doc, state);
  }
  state.refs++;
  const held = state;
  let released = false;
  return {
    request(reason) {
      if (released) return;
      if (reason === 'route') held.provider.reset();
      held.provider.request(reason);
    },
    release() {
      if (released) return;
      released = true;
      if (--held.refs > 0) return;
      if (feeds.get(doc) === held) feeds.delete(doc);
      held.teardown();
    },
  };
}

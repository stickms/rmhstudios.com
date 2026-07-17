'use client';

import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { COMMAND_PALETTE_EVENT } from './command-palette-bus';

/**
 * Lazy mount boundary for the ⌘K command palette.
 *
 * The palette is mounted once, globally (in Providers), so it works on every
 * route — but it statically pulls in fuse.js plus the full games and apps
 * registries (~40 KB), none of which is needed at first paint. This wrapper keeps
 * that weight out of the initial Providers/entry chunk: it mounts the real palette
 * only once the browser goes idle after paint, or the moment the reader reaches
 * for it (⌘K / a programmatic open). A tiny always-on key/event listener bridges
 * the gap before the chunk loads.
 */
const CommandPalette = lazy(() =>
  import('./CommandPalette').then((m) => ({ default: m.CommandPalette })),
);

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function CommandPaletteMount() {
  const [active, setActive] = useState(false);
  // True when activation came from the reader (⌘K / open event) rather than the
  // idle prefetch — the freshly-mounted palette should then open on arrival.
  const openOnMount = useRef(false);

  useEffect(() => {
    if (active) return;
    const w = window as IdleWindow;

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openOnMount.current = true;
        setActive(true);
      }
    };
    const onOpen = () => {
      openOnMount.current = true;
      setActive(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);

    // Prefetch/mount on idle so the first ⌘K is instant and the palette's own
    // listeners are live by then — without competing for the hydration window.
    let idleId: number | undefined;
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(() => setActive(true), { timeout: 3000 });
    } else {
      idleId = window.setTimeout(() => setActive(true), 1500) as unknown as number;
    }

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
      if (idleId === undefined) return;
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, [active]);

  if (!active) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette initialOpen={openOnMount.current} />
    </Suspense>
  );
}

'use client';

import { useCallback, useState } from 'react';

/**
 * The nearest ancestor of the component that matches `selector`, for `DialogContent`'s `container`.
 *
 * A game scopes its palette tokens on its own root element, so a dialog portaled to `<body>` loses
 * them. Render `sentinel` (a hidden span) inside the game, mount the dialog only once `host` is set,
 * and the dialog lands in the game's own root — the nearest match to where the component renders,
 * never a document-wide class lookup (a route wrapper can carry the same class).
 */
export function useDialogHost(selector: string) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (el) setHost(el.closest<HTMLElement>(selector));
    },
    [selector],
  );
  const sentinel = <span ref={ref} hidden aria-hidden="true" />;
  return { host, sentinel };
}

import {
  useEffect,
  useRef,
} from 'react';
import { settleSoftRender } from '@/lib/low-end';

/**
 * Settle, once per page load and on every route EXCEPT a page in the site shell (games, apps, login), whether this
 * browser rasterises in software, and remember the finding (`lib/low-end.ts`, `localStorage` `rmh-soft-render`, 12 h).
 *
 * Steel B3: a site-shell page creates exactly one WebGL context, the chrome renderer's. This probe makes a second,
 * throwaway one, so it stands down wherever `.site-shell` is in the document; the only reader of its finding is the
 * games' canvas glow, which a site page does not mount. A site visit that goes on to a
 * game by client navigation settles on arrival there: `pathname` re-runs the check, and `settled` keeps it to once.
 *
 * Nothing about the site depends on the answer. It is read by the games' canvas glow (`canvasGlowEnabled`), which stays
 * off on such a browser; a direct visit to a game page still records it for the next load. It runs after the window
 * `load` event, at idle (400 ms at most), because the throwaway GL context it creates must not compete with hydration.
 */
export function useSoftRenderSettle(
  pathname?: string,
): void {
  const settled =
    useRef(
      false,
    );
  useEffect(() => {
    let cancelled = false;
    const w =
      window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          o?: {
            timeout: number;
          },
        ) => number;
        cancelIdleCallback?: (
          h: number,
        ) => void;
      };
    const idle =
      typeof w.requestIdleCallback ===
      'function';
    let handle:
      | number
      | null =
      null;
    const run =
      () => {
        if (
          cancelled ||
          settled.current
        )
          return;
        if (
          document.querySelector(
            '.site-shell',
          )
        )
          return;
        settled.current = true;
        settleSoftRender();
      };
    const schedule =
      () => {
        if (
          cancelled
        )
          return;
        handle =
          idle
            ? w.requestIdleCallback!(
                run,
                {
                  timeout: 400,
                },
              )
            : window.setTimeout(
                run,
                200,
              );
      };
    if (
      document.readyState ===
      'complete'
    )
      schedule();
    else
      window.addEventListener(
        'load',
        schedule,
        {
          once: true,
        },
      );
    return () => {
      cancelled = true;
      window.removeEventListener(
        'load',
        schedule,
      );
      if (
        handle !==
        null
      ) {
        if (
          idle
        )
          w.cancelIdleCallback?.(
            handle,
          );
        else
          window.clearTimeout(
            handle,
          );
      }
    };
  }, [
    pathname,
  ]);
}

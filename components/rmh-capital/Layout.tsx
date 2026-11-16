/**
 * RMH Capital layout shell — scopes the design system under `.rmhc-root` and
 * renders the shared nav and footer.
 *
 * Motion is CSS (rmh-capital.css). The one script is here: a single delegated
 * `pointermove` listener that tells the chrome surface under the pointer where
 * the pointer is (`--rc-mx`, -1 at its left edge to 1 at its right), so the
 * reflection on it follows. There is no frame loop: the browser delivers
 * `pointermove` at most once a frame, and the CSS eases the value. A surface
 * opts in with `data-chrome-live`.
 */
import { useRef } from 'react';
import { Outlet } from '@tanstack/react-router';
import { useChromePointer } from '@/hooks/useChromePointer';
import {
  TopNav,
  SiteFooter,
} from './shared';

export default function RmhCapitalLayout() {
  const root =
    useRef<HTMLDivElement>(
      null,
    );
  useChromePointer(
    root,
  );

  return (
    <div
      className="rmhc-root"
      ref={
        root
      }
    >
      <TopNav />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

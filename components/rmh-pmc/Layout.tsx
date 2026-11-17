/**
 * RMH PMC layout shell — scopes the design system under `.rmhp-root`, renders
 * the glass command capsule, the document gutter and the footer.
 *
 * Motion is CSS (rmh-pmc.css). The scripts are here:
 *  - `useChromePointer`: one delegated passive `pointermove` that writes
 *    `--rp-mx` on the `[data-chrome-live]` surface under the pointer, so its
 *    reflection follows. No frame loop.
 *  - `useSceneFocus` (hooks/, shared with RMH Research): one delegated
 *    `focusin` that scrolls a pinned scene to the step that received focus.
 */
import { useRef } from 'react';
import { Outlet } from '@tanstack/react-router';
import { useChromePointer } from '@/hooks/useChromePointer';
import { useSceneFocus } from '@/hooks/useSceneFocus';
import { CommandBar, Gutter, SiteFooter } from './shared';

export default function RmhPmcLayout() {
  const root = useRef<HTMLDivElement>(null);
  useChromePointer(root, '--rp-mx');
  useSceneFocus(root);
  return (
    <div className="rmhp-root" ref={root}>
      <CommandBar />
      <Gutter />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

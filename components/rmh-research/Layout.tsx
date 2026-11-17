/**
 * RMH Research layout shell — scopes the design system under `.rmhr-root` and
 * renders the top bar and the footer around the page.
 *
 * Motion is CSS (rmh-research.css). The one script is `useSceneFocus`, a
 * delegated `focusin` that scrolls a pinned scene to the step that received
 * keyboard focus, so a focused control is never an invisible one.
 */
import { useRef } from 'react';
import { Outlet } from '@tanstack/react-router';
import { useSceneFocus } from '@/hooks/useSceneFocus';
import { SiteFooter, TopBar } from './shared';

export default function RmhResearchLayout() {
  const root = useRef<HTMLDivElement>(null);
  useSceneFocus(root);
  return (
    <div className="rmhr-root" ref={root}>
      <TopBar />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

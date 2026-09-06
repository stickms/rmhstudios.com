/**
 * RMH Datacenter layout shell — scopes the design system under `.rmhdc-root`,
 * renders the top bar, the facility rail, and the footer.
 *
 * The scroll-reveal is a scroll-driven CSS animation in `rmh-datacenter.css`,
 * so unlike the first generation of these microsites there is nothing for this
 * component to observe or drive.
 */
import { Outlet } from '@tanstack/react-router';
import { Rail, SiteFooter, TopBar } from './shared';

export default function RmhDatacenterLayout() {
  return (
    <div className="rmhdc-root">
      <TopBar />
      <Rail />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
